"""Who cannot sign in, in plain words (Dash Update #121, Bill 2026-11-13).

Ray was locked out twice (11-12 6:05, 11-13 9:35) and Bill did not know where he went. This lists active staff who are
locked out now, were locked out today, or have no password, each with one sentence of what happened and when, so the
owner (Users → Employees, Cannot sign in) and managers (HR → Requests) can help with one tap: Unlock (owner) and Send
a reset link (email, or a link to text).

A lockout lives in the cache (``lockout.py``, the database cache, so every dyno sees it), keyed by what was typed: the
username or the email. Both are checked and both are cleared.
"""
from __future__ import annotations

from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import AccountEvent
from apps.accounts.services import lockout
from apps.accounts.services.stats import NO_PASSWORD, STAFF_ROLE_NAMES

User = get_user_model()


def _names(user) -> list[str]:
    return [n for n in {(user.username or '').strip().lower(), (user.email or '').strip().lower()} if n]


def is_locked_now(user) -> bool:
    return any(lockout.is_locked(name, None) for name in _names(user))


def clear_lock(user) -> None:
    """Forget the wrong tries on the username and the email (a new password, or the owner's Unlock)."""
    for name in _names(user):
        lockout.clear(name)


def unlock(user, *, actor=None) -> bool:
    """Clear the wrong-try count on the username and the email, and on the address the last lockout came from.
    True when something was locked."""
    was = is_locked_now(user)
    clear_lock(user)
    last = user.account_events.filter(kind=AccountEvent.KIND_LOCKED).values_list('detail', flat=True).first() or ''
    if last.startswith('from ') and last[5:] and last[5:] != 'unknown address':
        lockout.clear_address(last[5:])
    AccountEvent.log(user, AccountEvent.KIND_UNLOCKED, actor=actor, detail='' if was else 'was not locked')
    return was


def _clock(at: datetime) -> str:
    return timezone.localtime(at).strftime('%I:%M %p').lstrip('0').lower()


def _day_start() -> datetime:
    today = timezone.localdate()
    return timezone.make_aware(datetime.combine(today, time.min))


def _first(name: str) -> str:
    return (name or '').split(' ')[0] or 'They'


def _story(user, events: list[AccountEvent], locked_now: bool) -> tuple[str, list[str]]:
    """(headline, follow-up sentences) for one person, from today's account events (oldest first)."""
    locks = [e for e in events if e.kind == AccountEvent.KIND_LOCKED]
    first = _first(user.first_name)
    if not locks:
        return f'{first} has no password yet, so cannot sign in. Send a reset link.', []
    last_lock = locks[-1]
    times = ' and '.join(_clock(e.at) for e in locks[-3:])
    head = (f'Locked out at {times} today after {lockout.MAX_PER_NAME} wrong passwords.' if len(locks) == 1
            else f'Locked out {len(locks)} times today ({times}), each after {lockout.MAX_PER_NAME} wrong passwords.')
    after: list[str] = []
    for e in events:
        if e.at < last_lock.at:
            continue
        by = e.actor.first_name if e.actor_id and e.actor_id != user.pk else ''
        if e.kind == AccountEvent.KIND_LINK:
            after.append(f'{by or "Someone"} made a set-password link at {_clock(e.at)}.')
        elif e.kind == AccountEvent.KIND_RESET_SENT:
            after.append(f'{by or "Someone"} sent a reset link at {_clock(e.at)}.')
        elif e.kind == AccountEvent.KIND_PASSWORD_SET:
            after.append(f'{first} set a new password at {_clock(e.at)}.')
        elif e.kind == AccountEvent.KIND_PASSWORD_CHANGED:
            after.append(f'{first} changed the password at {_clock(e.at)}.')
        elif e.kind == AccountEvent.KIND_UNLOCKED and e.detail != 'was not locked':
            after.append(f'Unlocked by {by or "the owner"} at {_clock(e.at)}.')
    if user.last_login and user.last_login > last_lock.at:
        after.append(f'Signed in again at {_clock(user.last_login)}.')
    elif locked_now:
        after.append('Still locked. It lifts by itself 15 minutes after the last wrong try, or tap Unlock.')
    return head, after


def trouble_rows() -> list[dict]:
    """Active staff who are locked out now, were locked out today, or have no password. Locked now first."""
    since = _day_start()
    staff = (User.objects.filter(is_active=True, groups__name__in=STAFF_ROLE_NAMES).distinct()
             .select_related('employee'))
    locked_today = set(AccountEvent.objects.filter(kind=AccountEvent.KIND_LOCKED, at__gte=since)
                       .values_list('user_id', flat=True))
    candidates = list(staff.filter(Q(pk__in=locked_today) | NO_PASSWORD))
    # A lock can outlive midnight by 15 minutes; check the cache for everyone else only when cheap (staff is small).
    others = [u for u in staff.exclude(pk__in=[c.pk for c in candidates])]
    candidates += [u for u in others if is_locked_now(u)]

    events_by_user: dict[int, list[AccountEvent]] = {}
    for e in (AccountEvent.objects.filter(user__in=candidates, at__gte=since).select_related('actor').order_by('at')):
        events_by_user.setdefault(e.user_id, []).append(e)

    rows = []
    for user in candidates:
        events = events_by_user.get(user.pk, [])
        locked_now = is_locked_now(user)
        locks = [e for e in events if e.kind == AccountEvent.KIND_LOCKED]
        no_password = not user.has_usable_password() or not user.password
        if locked_now:
            state = 'locked'
        elif no_password:
            state = 'no_password'
        else:
            state = 'was_locked'
        head, after = _story(user, events, locked_now)
        if no_password and locks:
            after.append('There is no password on this account yet.')
        profile = getattr(user, 'employee', None)
        rows.append({
            'user_id': user.pk,
            'name': user.full_name,
            'first_name': user.first_name,
            'role': user.role or '',
            'employee_number': getattr(profile, 'employee_number', '') or '',
            'is_owner': bool(user.is_superuser),
            'has_email': bool((user.email or '').strip()),
            'phone': user.phone or '',
            'state': state,
            'locked_now': locked_now,
            'locked_at': locks[-1].at if locks else None,
            'locks_today': len(locks),
            'headline': head,
            'after': after,
            'summary': ' '.join([head, *after]),
        })
    order = {'locked': 0, 'was_locked': 1, 'no_password': 2}
    rows.sort(key=lambda r: (order[r['state']], -(r['locked_at'].timestamp() if r['locked_at'] else 0), r['name']))
    return rows


def locked_out_today_count() -> int:
    """For the Users stats strip: active staff locked out today (or right now)."""
    return sum(1 for r in trouble_rows() if r['state'] in ('locked', 'was_locked'))
