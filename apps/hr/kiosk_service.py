"""Time kiosk: card identity, preview, boards, punch actions, clock-in gate.

Shared by the hosted `/api/hr/kiosk/*` (staff JWT host) and the public
`/api/hr/clock/*` (AllowAny) views. Every mutation is keyed on the card
token and acts as that person; `request.user` is never touched.

The card token is never stored or logged. Only `HMAC-SHA256(SECRET_KEY, token)`
lives on `EmployeeProfile.badge_token_hash`.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.hr.models import (
    Department, KioskEvent, Shift, ShiftAssignment, TimeEntry,
    TimeEntryModificationRequest,
)
from apps.hr.services.time_clock_utils import weekly_status_for_employee
from apps.hr.shifts import active_punch_codes
from apps.webstore.services.hours import close_on, get_hours_config, is_open_day

TOKEN_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
TOKEN_LENGTH = 10
GENERIC_MESSAGE = 'Card not recognized. Try again or see a manager.'
STALE_AFTER = timedelta(hours=14)
GATE_WINDOW_DAYS = 30
STAFF_ROLES = ('Employee', 'Manager', 'Admin')

# Identify throttles. Failures roll in a 10-minute window; a lock lasts 5 minutes.
FAIL_WINDOW_SECONDS = 600
LOCK_SECONDS = 300
HOSTED_FAIL_LIMIT = 20
PUBLIC_FAIL_LIMIT = 10

REASON_FORGOT_TO_CLOCK_OUT = 'forgot to clock out'


class KioskError(Exception):
    """A user-facing failure. `status` is the HTTP code the view should return."""

    def __init__(self, detail: str, status: int = 400, code: str = ''):
        super().__init__(detail)
        self.detail = detail
        self.status = status
        self.code = code


@dataclass
class KioskContext:
    route: str  # KioskEvent.ROUTE_KIOSK | KioskEvent.ROUTE_CLOCK
    host: object = None
    ip: str = ''

    @property
    def device_label(self) -> str:
        return 'Kiosk' if self.route == KioskEvent.ROUTE_KIOSK else 'Clock'


# ── Card token ────────────────────────────────────────────────────────────────

def mint_token() -> str:
    return ''.join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LENGTH))


def hash_token(token: str) -> str:
    cleaned = (token or '').strip().upper()
    return hmac.new(
        settings.SECRET_KEY.encode('utf-8'), cleaned.encode('utf-8'), hashlib.sha256,
    ).hexdigest()


def is_plausible_token(token: str) -> bool:
    cleaned = (token or '').strip().upper()
    return len(cleaned) == TOKEN_LENGTH and all(ch in TOKEN_ALPHABET for ch in cleaned)


def identify(token: str):
    """The active staff user this card belongs to, or None. Never raises."""
    if not is_plausible_token(token):
        return None
    from apps.accounts.models import EmployeeProfile
    profile = (
        EmployeeProfile.objects.filter(badge_token_hash=hash_token(token))
        .select_related('user')
        .first()
    )
    if profile is None or profile.badge_revoked_at is not None:
        return None
    user = profile.user
    if not user.is_active:
        return None
    if user.role not in STAFF_ROLES and not user.is_superuser:
        return None
    return user


# ── Throttle ──────────────────────────────────────────────────────────────────

def _fail_key(key: str) -> str:
    return f'{key}:fails'


def _lock_key(key: str) -> str:
    return f'{key}:lock'


def is_locked(key: str) -> bool:
    return bool(cache.get(_lock_key(key)))


def clear_failures(key: str) -> None:
    cache.delete(_fail_key(key))


def note_identify_failure(key: str, *, limit: int) -> bool:
    """Record one failed identify. Returns True when this failure started a lock."""
    fail_key = _fail_key(key)
    cache.add(fail_key, 0, FAIL_WINDOW_SECONDS)
    try:
        count = cache.incr(fail_key)
    except ValueError:
        cache.set(fail_key, 1, FAIL_WINDOW_SECONDS)
        count = 1
    if count >= limit:
        cache.set(_lock_key(key), True, LOCK_SECONDS)
        cache.delete(fail_key)
        return True
    return False


# ── Audit ─────────────────────────────────────────────────────────────────────

def log_event(ctx: KioskContext, action: str, *, subject=None, shift: str = '', **meta) -> KioskEvent:
    return KioskEvent.objects.create(
        route=ctx.route,
        host=ctx.host,
        subject=subject,
        action=action,
        shift=shift or '',
        ip=(ctx.ip or '')[:45],
        meta={k: v for k, v in meta.items() if v is not None},
    )


# ── Time helpers ──────────────────────────────────────────────────────────────

def local_now(now: datetime | None = None):
    cfg = get_hours_config()
    tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    moment = now or timezone.now()
    return moment.astimezone(tz), cfg, tz


def _hhmm(value) -> str:
    return value.strftime('%H:%M') if value else ''


def short_name(user) -> str:
    first = (user.first_name or '').strip()
    last = (user.last_name or '').strip()
    if first and last:
        return f'{first} {last[0]}.'
    return first or last or user.email


def open_punch_for(user) -> TimeEntry | None:
    return (
        TimeEntry.objects.filter(employee=user, clock_out__isnull=True)
        .order_by('-clock_in')
        .first()
    )


def assignments_today(user_id: int, day: date) -> list[ShiftAssignment]:
    rows = []
    for row in ShiftAssignment.objects.filter(
        employee_id=user_id, shift__is_active=True, shift__department__is_active=True,
    ).select_related('shift', 'shift__department'):
        if row.runs_on(day):
            rows.append(row)
    rows.sort(key=lambda row: (row.shift.time_in, row.shift.name))
    return rows


def clock_tiles(day: date) -> list[dict]:
    """Same shape as ShiftViewSet.clock_tiles, so /clock never calls a staff endpoint."""
    rows = Shift.objects.filter(
        is_active=True, department__is_active=True,
    ).exclude(punch_code='').select_related('department').order_by(
        'department__sort_order', 'department__name', 'time_in', 'name',
    )
    return [
        {
            'id': row.pk,
            'name': row.name,
            'department': row.department.name,
            'department_id': row.department_id,
            'department_slug': row.department.slug,
            'department_sort': row.department.sort_order,
            'punch_code': row.punch_code,
            'time_in': _hhmm(row.time_in),
            'time_out': _hhmm(row.time_out),
        }
        for row in rows
        if row.runs_on(day)
    ]


def suggested_clock_out(punch: TimeEntry, *, now: datetime | None = None) -> datetime:
    """Roster time_out on the punch's local day, else store close, else +8h. Never before clock_in."""
    now = now or timezone.now()
    _, cfg, tz = local_now(now)
    punch_day = punch.clock_in.astimezone(tz).date()
    candidates = []
    rows = assignments_today(punch.employee_id, punch_day)
    if rows:
        latest = max(row.shift.time_out for row in rows)
        candidates.append(timezone.make_aware(datetime.combine(punch_day, latest), tz))
    elif is_open_day(punch_day, cfg=cfg):
        candidates.append(close_on(punch_day, cfg=cfg, tz=tz))
    fallback = punch.clock_in + timedelta(hours=8)
    pick = next((c for c in candidates if c > punch.clock_in), fallback)
    if pick <= punch.clock_in:
        pick = punch.clock_in + timedelta(minutes=1)
    return min(pick, now) if now > punch.clock_in else pick


# ── Gate ──────────────────────────────────────────────────────────────────────

def is_stale(punch: TimeEntry | None, now: datetime) -> bool:
    return bool(punch) and (now - punch.clock_in) >= STALE_AFTER


def missed_runs_for(user, *, now: datetime) -> list:
    """Missed, owned, gate_on_miss runs with no reason yet, due within the window."""
    from apps.routines.models import RoutineRun
    return list(
        RoutineRun.objects.filter(
            assigned_to=user,
            status=RoutineRun.STATUS_MISSED,
            routine__gate_on_miss=True,
            routine__is_active=True,
            miss_reason='',
            due_at__lte=now,
            due_at__gte=now - timedelta(days=GATE_WINDOW_DAYS),
        )
        .select_related('routine')
        .order_by('due_at', 'id')
    )


def pending_nudges(user, *, now: datetime) -> list:
    from apps.routines.command_center import pending_nudges_for
    return pending_nudges_for(user, now=now)


def build_gate(user, punch: TimeEntry | None, *, now: datetime) -> list[dict]:
    gate: list[dict] = []
    if is_stale(punch, now):
        gate.append({
            'kind': 'stale_punch',
            'since': punch.clock_in,
            'suggested_clock_out': suggested_clock_out(punch, now=now),
        })
    runs = missed_runs_for(user, now=now)
    if runs:
        gate.append({
            'kind': 'missed_routines',
            'runs': [
                {
                    'id': run.pk,
                    'title': run.routine.title,
                    'due_at': run.due_at,
                    'subject': run.subject or '',
                }
                for run in runs
            ],
        })
    nudges = pending_nudges(user, now=now)
    if nudges:
        gate.append({
            'kind': 'nudge',
            'nudges': [
                {
                    'id': row.pk,
                    'message': row.message or '',
                    'routine_title': row.run.routine.title if row.run_id else '',
                    'created_at': row.created_at,
                }
                for row in nudges
            ],
        })
    return gate


# ── Preview ───────────────────────────────────────────────────────────────────

def preview(user, *, now: datetime | None = None, redacted: bool = False, ctx: KioskContext | None = None) -> dict:
    now = now or timezone.now()
    local, cfg, tz = local_now(now)
    day = local.date()
    punch = open_punch_for(user)
    tiles = clock_tiles(day)
    tile_codes = {tile['punch_code'] for tile in tiles}

    if is_stale(punch, now):
        state = 'stale'
    elif punch and punch.on_break:
        state = 'break'
    elif punch:
        state = 'in'
    else:
        state = 'out'

    rows = assignments_today(user.pk, day)
    suggested = None
    unmatched = False
    if rows:
        first = rows[0].shift
        suggested = {
            'punch_code': first.punch_code,
            'name': first.name,
            'department': first.department.name,
            'department_id': first.department_id,
            'time_in': _hhmm(first.time_in),
            'time_out': _hhmm(max(row.shift.time_out for row in rows)),
        }
        unmatched = not first.punch_code or first.punch_code not in tile_codes
        if unmatched and ctx is not None:
            log_event(ctx, 'unmatched_shift', subject=user, shift=first.punch_code, shift_name=first.name)

    late = None
    if state == 'out' and rows:
        from apps.routines.settings import LATE_AMBER_MINUTES
        start = timezone.make_aware(datetime.combine(day, rows[0].shift.time_in), tz)
        minutes = int((now - start).total_seconds() // 60)
        if minutes >= LATE_AMBER_MINUTES:
            late = {'minutes': minutes, 'shift_name': rows[0].shift.name}

    weekly = weekly_status_for_employee(user, now)
    warnings = {
        'store_closed': (not rows) and (not is_open_day(day, cfg=cfg)),
        'overtime': bool(weekly.get('is_at_limit') or weekly.get('is_over_limit')),
        'late': late,
    }

    punch_payload = None
    if punch:
        matched = Shift.objects.filter(punch_code=punch.shift).select_related('department').first() if punch.shift else None
        punch_payload = {
            'id': punch.pk,
            'clock_in': punch.clock_in,
            'shift': punch.shift or '',
            'shift_name': matched.name if matched else (punch.shift or ''),
            'on_break': bool(punch.on_break),
            'break_started_at': punch.break_started_at,
        }

    stale = None
    if state == 'stale':
        stale = {'since': punch.clock_in, 'suggested_clock_out': suggested_clock_out(punch, now=now)}

    payload = {
        'id': user.pk,
        'state': state,
        'name': short_name(user),
        'punch': punch_payload,
        'suggested_shift': suggested,
        'suggested_shift_unmatched': unmatched,
        'tiles': tiles,
        'warnings': warnings,
        'stale': stale,
        'gate': build_gate(user, punch, now=now),
        'now': now,
    }
    if not redacted:
        payload['full_name'] = user.full_name
    return payload


# ── Boards ────────────────────────────────────────────────────────────────────

OTHER_GROUP = {
    'department_id': None,
    'department_name': 'Other',
    'department_slug': 'other',
    'department_icon': 'none',
    'department_sort': 9999,
    'other': True,
}

HOSTED_RANK = {'in': 0, 'break': 1, 'expected': 2, 'late': 3, 'called_in': 4, 'left': 5}
PUBLIC_RANK = {'in': 0, 'late': 1, 'expected': 2, 'out': 3}


def _group_fields(department: Department | None) -> dict:
    if department is None or not department.is_active:
        return dict(OTHER_GROUP)
    return {
        'department_id': department.pk,
        'department_name': department.name,
        'department_slug': department.slug,
        'department_icon': department.icon or 'none',
        'department_sort': department.sort_order,
        'other': False,
    }


def build_board(*, redacted: bool, now: datetime | None = None) -> dict:
    """Who is in / on break / expected / late / called in today, grouped by hr.Department.

    Rows come from the Command Center staff builder so exclusions, one-day
    overrides, and call-ins agree with what managers see. Public rows are
    limited to people expected today and to In / Out / Expected / Late.
    """
    from apps.routines.command_center import build_staff

    now = now or timezone.now()
    local, cfg, tz = local_now(now)
    day = local.date()
    staff = build_staff(day, now=now, tz=tz, today=day)
    on_break = set(
        TimeEntry.objects.filter(date=day, clock_out__isnull=True, on_break=True)
        .values_list('employee_id', flat=True)
    )
    departments = {row.slug: row for row in Department.objects.all()}
    User = get_user_model()
    users = {u.pk: u for u in User.objects.filter(pk__in=[row['id'] for row in staff])}

    rows = []
    for row in staff:
        user = users.get(row['id'])
        if user is None:
            continue
        cc_status = row['status']
        if redacted and not row['on_roster']:
            continue
        if cc_status == 'Off':
            continue
        dept = departments.get(row.get('department_slug') or '')
        group = _group_fields(dept)

        if cc_status == 'In':
            status = 'break' if row['id'] in on_break else 'in'
        elif cc_status == 'Late':
            status = 'late'
        elif cc_status == 'Expected':
            status = 'expected'
        elif cc_status == 'Called in':
            status = 'called_in'
        elif cc_status == 'Left':
            status = 'left'
        else:
            continue

        base = {
            'id': row['id'],
            'name': short_name(user),
            'shift_name': row.get('shift_name') or '',
            'expected_time': row.get('time_in') or '',
            **group,
        }
        if redacted:
            public_status = {
                'in': 'in', 'break': 'in', 'late': 'late', 'expected': 'expected',
                'called_in': 'out', 'left': 'out',
            }[status]
            rows.append({**base, 'status': public_status})
        else:
            arrival = row.get('arrival')
            rows.append({
                **base,
                'status': status,
                'in_time': arrival.astimezone(tz).strftime('%H:%M') if arrival else '',
                'late_minutes': row.get('late_minutes'),
                'on_roster': bool(row['on_roster']),
            })

    rank = PUBLIC_RANK if redacted else HOSTED_RANK
    rows.sort(key=lambda r: (r['department_sort'], r['department_name'], rank.get(r['status'], 9), r['name']))

    seen: dict = {}
    for r in rows:
        key = r['department_slug']
        if key not in seen:
            seen[key] = {
                'id': r['department_id'], 'name': r['department_name'], 'slug': key,
                'icon': r['department_icon'], 'sort': r['department_sort'], 'other': r['other'],
            }
    groups = sorted(seen.values(), key=lambda g: (g['sort'], g['name']))

    return {
        'day': day.isoformat(),
        'generated_at': now,
        'store_open': is_open_day(day, cfg=cfg),
        'departments': groups,
        'rows': rows,
        'redacted': redacted,
    }


# ── Punch actions ─────────────────────────────────────────────────────────────

def _materialize():
    from apps.routines.schedule import materialize_routines
    materialize_routines()


def _validate_shift_code(code: str) -> str:
    code = (code or '').strip()
    if not code:
        raise KioskError('Say which shift you are working.', 400, 'shift_required')
    if code not in active_punch_codes():
        raise KioskError('Pick a shift.', 400, 'shift_invalid')
    return code


def _validate_gate_payload(user, punch, gate_payload: dict | None, *, now: datetime):
    """Return (runs_with_reasons, nudges_to_ack). Raises KioskError when anything is missing."""
    from apps.routines.models import RoutineRun
    gate_payload = gate_payload or {}
    current = build_gate(user, punch, now=now)
    kinds = {item['kind']: item for item in current}

    if 'stale_punch' in kinds:
        raise KioskError('Fix the open punch first.', 400, 'stale_punch')

    runs_out = []
    if 'missed_routines' in kinds:
        wanted = {row['id'] for row in kinds['missed_routines']['runs']}
        given = {}
        for item in gate_payload.get('missed_routines') or []:
            try:
                run_id = int(item.get('run'))
            except (TypeError, ValueError, AttributeError):
                continue
            given[run_id] = item
        missing = wanted - set(given)
        if missing:
            raise KioskError('Every missed routine needs a reason.', 400, 'missed_routines')
        valid = {code for code, _ in RoutineRun.MISS_REASON_CHOICES}
        runs = {run.pk: run for run in RoutineRun.objects.filter(pk__in=wanted)}
        for run_id in wanted:
            item = given[run_id]
            reason = str(item.get('reason') or '').strip()
            note = str(item.get('note') or '').strip()[:200]
            if reason not in valid:
                raise KioskError('Pick a reason for each missed routine.', 400, 'missed_routines')
            if reason == RoutineRun.MISS_OTHER and not note:
                raise KioskError('Say a few words about what happened.', 400, 'missed_routines')
            runs_out.append((runs[run_id], reason, note))

    nudges_out = []
    if 'nudge' in kinds:
        wanted = {row['id'] for row in kinds['nudge']['nudges']}
        given = set()
        for raw in gate_payload.get('nudge') or []:
            try:
                given.add(int(raw))
            except (TypeError, ValueError):
                continue
        if wanted - given:
            raise KioskError('Hear every nudge first.', 400, 'nudge')
        from apps.routines.models import QaNudge
        nudges_out = list(QaNudge.objects.filter(pk__in=wanted))

    return runs_out, nudges_out


def clock_in(user, *, shift: str, gate: dict | None, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    """Clear the gate and open a punch in one transaction. Nothing is saved on failure."""
    from apps.routines.command_center import ack_nudge

    now = now or timezone.now()
    code = _validate_shift_code(shift)
    with transaction.atomic():
        punch = open_punch_for(user)
        if punch and not is_stale(punch, now):
            raise KioskError('Already clocked in.', 400, 'already_in')
        runs, nudges = _validate_gate_payload(user, punch, gate, now=now)

        for run, reason, note in runs:
            run.miss_reason = reason
            run.miss_reason_note = note
            run.miss_reason_at = now
            run.miss_reason_by = user
            run.save(update_fields=['miss_reason', 'miss_reason_note', 'miss_reason_at', 'miss_reason_by'])
        if runs:
            log_event(ctx, 'gate_cleared', subject=user, kind='missed_routines', count=len(runs))

        for row in nudges:
            ack_nudge(row, kind='heard', device=ctx.device_label, now=now)
        if nudges:
            log_event(ctx, 'gate_cleared', subject=user, kind='nudge', count=len(nudges))

        entry = TimeEntry.objects.create(employee=user, clock_in=now, shift=code)
        log_event(ctx, 'clock_in', subject=user, shift=code)
    _materialize()
    return entry


def _require_open(user, *, now: datetime) -> TimeEntry:
    punch = open_punch_for(user)
    if punch is None:
        raise KioskError("You're not clocked in.", 400, 'not_in')
    return punch


def clock_out(user, *, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    if punch.on_break:
        punch.finalize_open_break(as_of=now)
    punch.clock_out = now
    punch.save()
    log_event(ctx, 'clock_out', subject=user, shift=punch.shift)
    return punch


def break_start(user, *, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    if punch.on_break:
        raise KioskError('Already on break.', 400, 'on_break')
    punch.on_break = True
    punch.break_started_at = now
    punch.save(update_fields=['on_break', 'break_started_at', 'updated_at'])
    log_event(ctx, 'break_start', subject=user, shift=punch.shift)
    return punch


def break_end(user, *, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    if not punch.on_break:
        raise KioskError('Not on break.', 400, 'not_on_break')
    punch.finalize_open_break(as_of=now)
    punch.save(update_fields=['break_minutes', 'on_break', 'break_started_at', 'updated_at'])
    log_event(ctx, 'break_end', subject=user, shift=punch.shift)
    return punch


def set_shift(user, *, shift: str, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    code = _validate_shift_code(shift)
    previous = punch.shift
    punch.shift = code
    punch.save(update_fields=['shift', 'updated_at'])
    log_event(ctx, 'set_shift', subject=user, shift=code, previous=previous)
    _materialize()
    return punch


def request_edit(user, *, kind: str, value, ctx: KioskContext, now: datetime | None = None) -> TimeEntryModificationRequest:
    """Wrong start time or forgot a break, against the open punch."""
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    if kind == 'wrong_start':
        requested = _parse_requested_start(value, punch, now)
        req = TimeEntryModificationRequest.objects.create(
            time_entry=punch, employee=user, requested_clock_in=requested,
            reason='wrong start time (kiosk)',
        )
    elif kind == 'forgot_break':
        try:
            minutes = int(value)
        except (TypeError, ValueError) as exc:
            raise KioskError('How many minutes?', 400, 'value') from exc
        if minutes <= 0 or minutes > 240:
            raise KioskError('Break minutes must be between 1 and 240.', 400, 'value')
        req = TimeEntryModificationRequest.objects.create(
            time_entry=punch, employee=user,
            requested_break_minutes=(punch.break_minutes or 0) + minutes,
            reason='forgot a break (kiosk)',
        )
    else:
        raise KioskError('Unknown request.', 400, 'kind')
    log_event(ctx, 'request_edit', subject=user, shift=punch.shift, kind=kind)
    return req


def _parse_requested_start(value, punch: TimeEntry, now: datetime) -> datetime:
    _, _, tz = local_now(now)
    raw = str(value or '').strip()
    if not raw:
        raise KioskError('What time did you start?', 400, 'value')
    parsed = None
    if len(raw) <= 5 and ':' in raw:
        try:
            hour, minute = (int(part) for part in raw.split(':', 1))
            day = punch.clock_in.astimezone(tz).date()
            parsed = timezone.make_aware(datetime.combine(day, datetime.min.time().replace(hour=hour, minute=minute)), tz)
        except ValueError:
            parsed = None
    else:
        try:
            parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, tz)
        except ValueError:
            parsed = None
    if parsed is None:
        raise KioskError('Use a time like 08:30.', 400, 'value')
    if parsed > now:
        raise KioskError('That time has not happened yet.', 400, 'value')
    return parsed


def fix_stale(user, *, ctx: KioskContext, now: datetime | None = None) -> TimeEntry:
    """Close a forgotten punch now at the suggested time and file the request for Pay."""
    now = now or timezone.now()
    punch = _require_open(user, now=now)
    if not is_stale(punch, now):
        raise KioskError('That punch is not stale.', 400, 'not_stale')
    suggested = suggested_clock_out(punch, now=now)
    with transaction.atomic():
        if punch.on_break:
            punch.finalize_open_break(as_of=suggested)
        punch.clock_out = suggested
        punch.save()
        TimeEntryModificationRequest.objects.create(
            time_entry=punch, employee=user, requested_clock_out=suggested,
            reason=REASON_FORGOT_TO_CLOCK_OUT,
        )
        log_event(ctx, 'fix_stale', subject=user, shift=punch.shift, closed_at=suggested.isoformat())
        log_event(ctx, 'gate_cleared', subject=user, kind='stale_punch', count=1)
    return punch


# ── Public route helpers ──────────────────────────────────────────────────────

def public_allowed_ips() -> list[str]:
    from apps.core.models import AppSetting
    row = AppSetting.objects.filter(key='kiosk.public_allowed_ips').first()
    if not row or not isinstance(row.value, list):
        return []
    return [str(ip).strip() for ip in row.value if str(ip).strip()]


def client_ip(request) -> str:
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    return forwarded or (request.META.get('REMOTE_ADDR') or '')
