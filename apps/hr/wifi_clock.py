"""Wi-Fi time clock pilot (D23, ``{master}/standards/time-clock.md``): shadow mode, Bill's phone only.

The store PC helper (``scripts/wifi_clock/helper.py``) asks ``phones/`` for the registered phones, looks for them on
the store Wi-Fi every 60 seconds, and posts "seen" / "not seen" per person to ``heartbeat/``. Nothing about any other
device ever leaves the PC. Each heartbeat runs ``observe`` for every registered phone:

- **Gone** after ``GONE_AFTER`` unseen; the leave time is the last-seen time. Shorter misses are logged as blips.
- **Would clock in** when the phone is on the Wi-Fi inside a pilot shift window (``EARLY`` before the start to the
  end), under the kiosk's clock-in rules (``kiosk_service``: shift code, gate). Logs the arrival and the shift start.
- **Would clock out** when it leaves within ``END_SLACK`` of the shift end, or later, at the last-seen time.
- **Mid-shift gap:** nothing until it is back, then "Was this a break?". Not back by the shift end: "You left at 2:10.
  Clock out at 2:10?". Both by email with Yes / No; the answer goes in the log.

Shadow mode: it writes ``WifiPilotEvent`` / ``WifiPresence`` only. Never a ``TimeEntry``, nothing in payroll. The
Wi-Fi address is personal data: it lives on ``EmployeeProfile.wifi_mac`` and is never logged.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from html import escape

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from apps.hr import kiosk_service
from apps.hr.models import WifiClockDevice, WifiPilotEvent, WifiPilotShift, WifiPresence

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 60
GONE_AFTER = timedelta(minutes=15)
BLIP_MIN = timedelta(minutes=2)  # shorter misses are noise, not logged
EARLY = timedelta(minutes=60)  # how early before the shift start an arrival counts
END_SLACK = timedelta(minutes=30)  # leaving this close to the end (or later) is the clock-out
HELPER_QUIET = timedelta(minutes=5)  # heartbeats this far apart: the helper (or the PC) was down
ANSWER_SALT = 'hr.wifi_clock.answer'
ANSWER_MAX_AGE = 60 * 60 * 24 * 14

_MAC = re.compile(r'^[0-9a-f]{2}(:[0-9a-f]{2}){5}$')


# ── Phones and the helper's token ─────────────────────────────────────────────

def normalize_mac(raw: str) -> str:
    """``AA-BB-CC-DD-EE-FF`` / ``aabb.ccdd.eeff`` → ``aa:bb:cc:dd:ee:ff``; '' when it is not a MAC."""
    hexes = re.sub(r'[^0-9a-f]', '', (raw or '').lower())
    if len(hexes) != 12:
        return ''
    mac = ':'.join(hexes[i:i + 2] for i in range(0, 12, 2))
    return mac if _MAC.match(mac) else ''


def is_randomized(mac: str) -> bool:
    """A locally administered address (2nd hex digit 2, 6, a, e): the phone's private / randomized MAC."""
    return bool(mac) and int(mac[1], 16) & 0x2 == 0x2


def masked(mac: str) -> str:
    return f'••:••:••:••:{mac[-5:]}' if mac else ''


def hash_device_token(token: str) -> str:
    return hashlib.sha256((token or '').strip().encode('utf-8')).hexdigest()


def device_for(token: str) -> WifiClockDevice | None:
    token = (token or '').strip()
    if len(token) < 32:
        return None
    digest = hash_device_token(token)
    for device in WifiClockDevice.objects.filter(is_active=True):
        if hmac.compare_digest(device.token_hash, digest):
            return device
    return None


def can_use(user) -> bool:
    """Employees only (never contractors or booth renters): active staff, same as the kiosk."""
    return bool(user.is_active and (user.role in kiosk_service.STAFF_ROLES or user.is_superuser))


def registered_phones() -> list[tuple]:
    """(user, mac) for everyone opted in: active staff with a Wi-Fi address on their profile."""
    from apps.accounts.models import EmployeeProfile

    rows = []
    for profile in EmployeeProfile.objects.exclude(wifi_mac='').select_related('user'):
        mac = normalize_mac(profile.wifi_mac)
        if mac and can_use(profile.user):
            rows.append((profile.user, mac))
    return rows


# ── Pilot schedule ────────────────────────────────────────────────────────────

@dataclass
class Window:
    start: datetime
    end: datetime
    punch_code: str

    def opens(self) -> datetime:
        return self.start - EARLY


def windows_on(user, day: date, tz) -> list[Window]:
    out = []
    for row in WifiPilotShift.objects.filter(employee=user, weekday=day.weekday()):
        start = timezone.make_aware(datetime.combine(day, row.start), tz)
        end = timezone.make_aware(datetime.combine(day, row.end), tz)
        if end <= start:
            end += timedelta(days=1)
        out.append(Window(start, end, row.punch_code))
    return sorted(out, key=lambda w: w.start)


def window_at(user, moment: datetime) -> Window | None:
    local, _, tz = kiosk_service.local_now(moment)
    for window in windows_on(user, local.date(), tz):
        if window.opens() <= moment <= window.end:
            return window
    return None


# ── The shadow logic ──────────────────────────────────────────────────────────

def _event(user, kind: str, at: datetime, **fields) -> WifiPilotEvent:
    meta = fields.pop('meta', None) or {}
    return WifiPilotEvent.objects.create(employee=user, kind=kind, at=at, meta=meta, **fields)


def _kiosk_rules(user, window: Window, now: datetime) -> dict:
    """What the kiosk would have said about this clock-in. Shadow mode only notes it."""
    notes = {}
    code = window.punch_code
    if not code:
        notes['shift_code'] = 'missing'
    elif code not in kiosk_service.active_punch_codes():
        notes['shift_code'] = f'{code} is not an active shift'
    punch = kiosk_service.open_punch_for(user)
    if punch and not kiosk_service.is_stale(punch, now):
        notes['manual_punch_at'] = punch.clock_in.isoformat()  # a manual punch always wins
    gate = [item['kind'] for item in kiosk_service.build_gate(user, punch, now=now)]
    if gate:
        notes['kiosk_would_ask'] = gate
    return notes


def observe(user, seen: bool, *, now: datetime | None = None, helper_gap: bool = False) -> list[WifiPilotEvent]:
    """One check for one phone. Returns the events it logged (emails already sent)."""
    now = now or timezone.now()
    made: list[WifiPilotEvent] = []
    with transaction.atomic():
        p, _ = WifiPresence.objects.select_for_update().get_or_create(employee=user)
        local, _, _ = kiosk_service.local_now(now)
        today = local.date()

        if p.shift_day and p.shift_day != today:
            if p.shadow_in_at and not p.shadow_out_at and p.present:
                made.append(_event(user, WifiPilotEvent.KIND_NEVER_LEFT, now, arrived_at=p.arrived_at))
            p.shift_day = None
            p.shadow_in_at = p.shadow_out_at = p.gap_start = None
            p.asked_left = False

        if seen:
            if not p.present:
                if p.gap_start and not p.asked_left:
                    made.append(_event(
                        user, WifiPilotEvent.KIND_BREAK, now, gap_start=p.gap_start, gap_end=now,
                        meta={'minutes': round((now - p.gap_start).total_seconds() / 60)},
                    ))
                p.gap_start = None
                p.present = True
                p.arrived_at = now
                made.append(_event(user, WifiPilotEvent.KIND_ARRIVE, now))
            elif p.unseen_since and p.last_seen_at and now - p.last_seen_at >= BLIP_MIN:
                made.append(_event(
                    user, WifiPilotEvent.KIND_BLIP, p.last_seen_at, gap_start=p.last_seen_at, gap_end=now,
                    meta={'minutes': round((now - p.last_seen_at).total_seconds() / 60), 'helper_gap': helper_gap},
                ))
            p.unseen_since = None
            p.last_seen_at = now

            if not p.shadow_in_at:
                window = window_at(user, now)
                if window:
                    at = max(now, window.opens())
                    made.append(_event(
                        user, WifiPilotEvent.KIND_CLOCK_IN, at, arrived_at=p.arrived_at,
                        shift_start=window.start, shift_end=window.end,
                        meta={'shift': window.punch_code, **_kiosk_rules(user, window, now)},
                    ))
                    p.shadow_in_at = at
                    p.shift_day = today
        else:
            if p.present:
                p.unseen_since = p.unseen_since or now
                if p.last_seen_at is None or now - p.last_seen_at >= GONE_AFTER:
                    left = p.last_seen_at or now
                    p.present = False
                    p.unseen_since = None
                    made.append(_event(user, WifiPilotEvent.KIND_LEAVE, left, arrived_at=p.arrived_at,
                                       meta={'helper_gap': helper_gap} if helper_gap else None))
                    if p.shadow_in_at and not p.shadow_out_at:
                        window = window_at(user, p.shadow_in_at)
                        if window and left >= window.end - END_SLACK:
                            made.append(_event(
                                user, WifiPilotEvent.KIND_CLOCK_OUT, left, arrived_at=p.arrived_at,
                                shift_start=window.start, shift_end=window.end,
                            ))
                            p.shadow_out_at = left
                        else:
                            p.gap_start = left
            if p.gap_start and not p.asked_left and p.shadow_in_at:
                window = window_at(user, p.shadow_in_at)
                if window is None or now >= window.end:
                    made.append(_event(
                        user, WifiPilotEvent.KIND_LEFT, p.gap_start, gap_start=p.gap_start,
                        shift_start=window.start if window else None, shift_end=window.end if window else None,
                    ))
                    p.asked_left = True
                    p.shadow_out_at = p.gap_start
        p.save()
    for event in made:
        send_event_email(event)
    return made


def heartbeat(device: WifiClockDevice, seen: dict, *, now: datetime | None = None, lan: str | None = None) -> int:
    """``seen``: {user id: bool} from the helper. Ids that are not registered phones are ignored, never stored."""
    now = now or timezone.now()
    helper_gap = bool(device.last_heartbeat_at and now - device.last_heartbeat_at > HELPER_QUIET)
    if helper_gap:
        WifiPilotEvent.objects.create(
            kind=WifiPilotEvent.KIND_HELPER_GAP, at=device.last_heartbeat_at, gap_start=device.last_heartbeat_at,
            gap_end=now, meta={'device': device.name},
        )
    device.last_heartbeat_at = now
    fields = ['last_heartbeat_at']
    if lan is not None:
        device.lan_address = clean_lan(lan)
        fields.append('lan_address')
    device.save(update_fields=fields)
    wanted = {}
    for key, value in (seen or {}).items():
        try:
            wanted[int(key)] = value is True
        except (TypeError, ValueError):
            continue
    done = 0
    for user, _mac in registered_phones():
        if user.pk in wanted:
            observe(user, wanted[user.pk], now=now, helper_gap=helper_gap)
            done += 1
    return done


# ── Emails (D20) and answers ──────────────────────────────────────────────────

def _t(moment: datetime | None) -> str:
    if moment is None:
        return '?'
    local, _, _ = kiosk_service.local_now(moment)
    return f'{local.hour % 12 or 12}:{local.minute:02d}'


def answer_token(event: WifiPilotEvent, answer: str) -> str:
    return signing.dumps({'e': event.pk, 'a': answer}, salt=ANSWER_SALT, compress=True)


def read_answer_token(token: str) -> tuple[int, str] | None:
    try:
        data = signing.loads(token, salt=ANSWER_SALT, max_age=ANSWER_MAX_AGE)
    except signing.BadSignature:
        return None
    if not isinstance(data, dict) or data.get('a') not in (WifiPilotEvent.ANSWER_YES, WifiPilotEvent.ANSWER_NO):
        return None
    try:
        return int(data['e']), data['a']
    except (KeyError, TypeError, ValueError):
        return None


def answer_link(event: WifiPilotEvent, answer: str) -> str:
    host = (getattr(settings, 'STAFF_DASHBOARD_HOST', '') or 'dash.ecothrift.us').strip()
    scheme = 'http' if host.startswith(('localhost', '127.0.0.1')) else 'https'
    return f'{scheme}://{host}/api/hr/wifi-clock/answer/{answer_token(event, answer)}/'


SHADOW_LINE = 'Wi-Fi clock pilot, shadow mode: nothing was punched and payroll is not touched.'


def compose(event: WifiPilotEvent) -> tuple[str, list[str], bool] | None:
    """(subject, body lines, asks yes/no) for an event that emails, else None."""
    kind = event.kind
    if kind == WifiPilotEvent.KIND_CLOCK_IN:
        lines = [f'Your phone joined the store Wi-Fi at {_t(event.arrived_at)}. Your pilot shift starts at '
                 f'{_t(event.shift_start)}.']
        if event.meta.get('manual_punch_at'):
            lines.append('You were already clocked in by hand; a manual punch always wins.')
        if event.meta.get('kiosk_would_ask'):
            lines.append('The kiosk would have asked you something first (' + ', '.join(event.meta['kiosk_would_ask'])
                         + ').')
        return f'Would have clocked you in at {_t(event.at)}', lines, False
    if kind == WifiPilotEvent.KIND_CLOCK_OUT:
        return (f'Would have clocked you out at {_t(event.at)}',
                [f'Your phone was last seen on the store Wi-Fi at {_t(event.at)}. Your pilot shift ends at '
                 f'{_t(event.shift_end)}.'], False)
    if kind == WifiPilotEvent.KIND_BREAK:
        span = f'{_t(event.gap_start)} to {_t(event.gap_end)}'
        return f'You were off the Wi-Fi {span}. Was this a break?', [f'You were off the Wi-Fi {span}. Was this a break?'], True
    if kind == WifiPilotEvent.KIND_LEFT:
        when = _t(event.gap_start)
        return f'You left at {when}. Clock out at {when}?', [f'You left at {when}. Clock out at {when}?'], True
    return None


def _html(lines: list[str], buttons: list[tuple[str, str]]) -> str:
    paras = ''.join(f'<p style="margin:0 0 12px">{escape(line)}</p>' for line in lines)
    btns = ''.join(
        f'<a href="{escape(url)}" style="display:inline-block;margin:0 12px 12px 0;padding:12px 28px;'
        f'border-radius:8px;background:#2e7d32;color:#fff;text-decoration:none;font-weight:600">{escape(label)}</a>'
        for label, url in buttons
    )
    return (f'<div style="font-family:Arial,sans-serif;font-size:16px;color:#222">{paras}{btns}'
            f'<p style="margin:12px 0 0;color:#777;font-size:13px">{escape(SHADOW_LINE)}</p></div>')


def send_event_email(event: WifiPilotEvent) -> bool:
    """Email the person about one event. Never raises; stamps ``emailed_at`` when it went out."""
    built = compose(event)
    if built is None or event.employee is None or not event.employee.email:
        return False
    subject, lines, asks = built
    buttons = [('Yes', answer_link(event, 'yes')), ('No', answer_link(event, 'no'))] if asks else []
    text = '\n\n'.join(lines + [f'{label}: {url}' for label, url in buttons] + [SHADOW_LINE])
    try:
        message = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL,
                                         to=[event.employee.email])
        message.attach_alternative(_html(lines, buttons), 'text/html')
        sent = bool(message.send(fail_silently=True))
    except Exception:
        logger.exception('Wi-Fi clock pilot email failed (event %s)', event.pk)
        return False
    if sent:
        event.emailed_at = timezone.now()
        event.save(update_fields=['emailed_at'])
    return sent


def record_answer(event: WifiPilotEvent, answer: str, *, now: datetime | None = None) -> WifiPilotEvent:
    """Yes / No on a break or left question. A changed answer keeps the earlier one in meta."""
    now = now or timezone.now()
    if event.answer and event.answer != answer:
        history = list(event.meta.get('earlier_answers') or [])
        history.append({'answer': event.answer, 'at': event.answered_at.isoformat() if event.answered_at else ''})
        event.meta = {**event.meta, 'earlier_answers': history}
    event.answer = answer
    event.answered_at = now
    event.save(update_fields=['answer', 'answered_at', 'meta'])
    return event


# ── Turn on from the phone (owner 2026-11-04) ─────────────────────────────────
# A web page can't read its phone's Wi-Fi address, and Dash only sees the store's one public IP. So the installed
# Thrift+ Staff app sends the phone to the helper on the store Wi-Fi with a one-time code; the helper reads that one
# phone's address from the PC's neighbour table (the phone just connected, so it is there) and claims the code.

JOIN_SALT = 'hr.wifi_clock.join'
JOIN_MAX_AGE = 300
HELPER_FRESH = timedelta(minutes=3)
_LAN = re.compile(r'^(10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$')


def clean_lan(raw) -> str:
    """Only a private IPv4 address and port (where phones reach the helper), else ''."""
    text = str(raw or '').strip()
    if not _LAN.match(text):
        return ''
    import ipaddress
    try:
        return text if ipaddress.ip_address(text.rsplit(':', 1)[0]).is_private else ''
    except ValueError:
        return ''


def is_eligible(user) -> bool:
    """The pilot (D23 § 3): only people with a pilot schedule can turn it on."""
    return can_use(user) and hasattr(user, 'employee') and WifiPilotShift.objects.filter(employee=user).exists()


def ready_helper(now: datetime | None = None) -> WifiClockDevice | None:
    now = now or timezone.now()
    return (WifiClockDevice.objects.filter(is_active=True, last_heartbeat_at__gte=now - HELPER_FRESH)
            .exclude(lan_address='').order_by('-last_heartbeat_at').first())


def status_for(user) -> dict:
    eligible = is_eligible(user)
    return {
        'eligible': eligible,
        'on': bool(eligible and normalize_mac(user.employee.wifi_mac)),
        'helper_ready': bool(eligible and ready_helper()),
    }


def start_join(user) -> str:
    """The helper's join address with a one-time code for this person."""
    import secrets
    device = ready_helper()
    if device is None:
        raise ValueError('The store PC is not answering right now. Try again in a minute.')
    code = signing.dumps({'u': user.pk, 'n': secrets.token_hex(8)}, salt=JOIN_SALT, compress=True)
    return f'http://{device.lan_address}/join?code={code}'


def claim(code: str, mac: str) -> object:
    """The helper found the phone behind a join code. Puts its address on that person's profile; returns the user."""
    from django.core.cache import cache
    from apps.accounts.models import User
    try:
        data = signing.loads(code or '', salt=JOIN_SALT, max_age=JOIN_MAX_AGE)
    except signing.BadSignature as exc:
        raise ValueError('That link is old. Tap the button in the app again.') from exc
    mac = normalize_mac(mac)
    if not mac:
        raise ValueError('The store PC could not see this phone. Check it is on the store Wi-Fi.')
    if not cache.add(f'wifi_clock_join:{data.get("n")}', 1, JOIN_MAX_AGE + 60):
        raise ValueError('That link was already used. Tap the button in the app again.')
    user = User.objects.filter(pk=data.get('u')).first()
    if user is None or not is_eligible(user):
        raise ValueError('Auto clock-in is not open for you yet.')
    profile = user.employee
    profile.wifi_mac = mac
    profile.save(update_fields=['wifi_mac'])
    return user


def turn_off(user) -> None:
    if hasattr(user, 'employee') and user.employee.wifi_mac:
        user.employee.wifi_mac = ''
        user.employee.save(update_fields=['wifi_mac'])
