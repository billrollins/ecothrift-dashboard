"""Customer-facing hold vocabulary - single source of truth for UI, emails, shell."""
from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.webstore.services.hours import confirmed_expiry

if TYPE_CHECKING:
    from apps.webstore.models import Reservation

STAGE_TOTAL = 4

RAIL_STAGES = (
    {'key': 'requested', 'label': 'Requested'},
    {'key': 'confirmed', 'label': 'Confirmed'},
    {'key': 'ready', 'label': 'Ready'},
    {'key': 'picked_up', 'label': 'Picked up'},
)

# Public timeline kinds only - never 'note' (staff-internal).
PUBLIC_TIMELINE_KINDS = frozenset({
    'requested',
    'verified',
    'confirmed',
    'staged',
    'reopened',
    'completed',
    'declined',
    'expired',
    'cancelled',
})

_PUBLIC_KIND_LABELS = {
    'requested': 'Request received',
    'verified': 'Email confirmed',
    'confirmed': 'Confirmed',
    'staged': 'Ready for pickup',
    'reopened': 'Hold reopened',
    'completed': 'Picked up',
    'declined': 'Released',
    'expired': 'Released',
    'cancelled': 'Released',
}


def _local(dt):
    if dt is None:
        return None
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return timezone.localtime(dt)


def _fmt_day_name(dt) -> str:
    local = _local(dt)
    if local is None:
        return ''
    return local.strftime('%A')


def _fmt_day_short(dt) -> str:
    local = _local(dt)
    if local is None:
        return ''
    # "Saturday, Aug 8" - Windows-safe (no %-d)
    day = local.strftime('%d').lstrip('0') or '0'
    return f"{local.strftime('%A, %b')} {day}"


def _fmt_day_abbrev(dt) -> str:
    """Compact day label for outcome cards - "Sat, Aug 8"."""
    local = _local(dt)
    if local is None:
        return ''
    day = local.strftime('%d').lstrip('0') or '0'
    return f"{local.strftime('%a, %b')} {day}"


def _fmt_close_time(dt) -> str:
    local = _local(dt)
    if local is None:
        return ''
    return local.strftime('%I:%M %p').lstrip('0')


def format_hold_deadline(expires_at, *, now=None) -> dict:
    """Relative deadline labels shared by API, shell, and emails.

    Returns:
        lead: human primary ("Yours until Saturday" / "42 minutes left")
        secondary: quieter absolute ("until 6 PM" / "until Saturday, Aug 8")
        kind: 'countdown' when under two hours, else 'day'
    """
    now = now or timezone.now()
    if expires_at is None:
        return {
            'lead': 'Yours until store close',
            'secondary': '',
            'kind': 'day',
        }
    remaining = expires_at - now
    if remaining.total_seconds() <= 0:
        return {
            'lead': 'Hold window ended',
            'secondary': _fmt_day_short(expires_at),
            'kind': 'day',
        }
    if remaining <= timedelta(hours=2):
        minutes = max(1, int(remaining.total_seconds() // 60))
        lead = f'{minutes} minute{"s" if minutes != 1 else ""} left'
        return {
            'lead': lead,
            'secondary': f'until {_fmt_close_time(expires_at)}',
            'kind': 'countdown',
        }
    day_name = _fmt_day_name(expires_at)
    local_now = _local(now)
    local_exp = _local(expires_at)
    if local_now and local_exp and local_now.date() == local_exp.date():
        lead = f'Yours until {_fmt_close_time(expires_at)} today'
    else:
        lead = f'Yours until {day_name}'
    return {
        'lead': lead,
        'secondary': f'until {_fmt_close_time(expires_at)} · {_fmt_day_short(expires_at)}',
        'kind': 'day',
    }


def rail_stages(reservation: 'Reservation') -> list[dict]:
    """Four named stages with done/current/upcoming for HoldRail + shell."""
    status = reservation.status
    if status == 'pending_verification':
        current = 1
    elif status in ('requested', 'confirmed'):
        current = 2
    elif status == 'ready_for_pickup':
        current = 3
    elif status == 'completed':
        current = 4
    else:
        # Released - still emit the full path as upcoming for shell consistency.
        current = 0

    timeline = public_timeline(reservation)
    stamps: dict[str, str | None] = {}
    for ev in timeline:
        stamps[ev['key']] = ev.get('at')

    out = []
    for idx, meta in enumerate(RAIL_STAGES, start=1):
        if current == 0:
            state = 'upcoming'
        elif status == 'completed':
            # Walk-up pickup: Ready is done even if never staged.
            state = 'done'
        elif idx < current:
            state = 'done'
        elif idx == current:
            state = 'current'
        else:
            state = 'upcoming'

        at = None
        if meta['key'] == 'requested':
            at = stamps.get('requested') or (
                reservation.created_at.isoformat() if reservation.created_at else None
            )
        elif meta['key'] == 'confirmed':
            at = stamps.get('verified') or stamps.get('confirmed')
        elif meta['key'] == 'ready':
            at = stamps.get('staged')
            if status == 'completed' and at is None and reservation.completed_at:
                at = reservation.completed_at.isoformat()
        elif meta['key'] == 'picked_up':
            at = stamps.get('completed') or (
                reservation.completed_at.isoformat() if reservation.completed_at else None
            )

        out.append({
            'key': meta['key'],
            'label': meta['label'],
            'state': state,
            'at': at,
        })
    return out


def customer_view(reservation: 'Reservation') -> dict:
    """Map a reservation to plain-language customer fields."""
    status = reservation.status
    reason = (getattr(reservation, 'release_reason', None) or '').strip()
    deadline = format_hold_deadline(reservation.expires_at)
    stages = rail_stages(reservation)

    base = {
        'stage_total': STAGE_TOTAL,
        'stages': stages,
        'expires_label': deadline['lead'],
        'expires_secondary': deadline['secondary'],
        'expires_kind': deadline['kind'],
        'confirmed_until_preview': None,
        'pickup_code': None,
        'staff_note_public': '',
    }

    if status == 'pending_verification':
        from apps.webstore.services.hold_confirmations import pending_confirmation_meta

        preview = confirmed_expiry()
        preview_label = _fmt_day_short(preview)
        preview_abbrev = _fmt_day_abbrev(preview)
        close_label = (
            _fmt_close_time(reservation.expires_at)
            if reservation.expires_at
            else 'store close'
        )
        meta = pending_confirmation_meta(reservation)
        return {
            **base,
            'stage': 1,
            'customer_status': (
                f'Enter the code we emailed to keep it until {preview_abbrev}.'
            ),
            'headline': f"We're holding it until {close_label} today",
            'next_step': (
                f'Enter the code we emailed to keep it until {preview_abbrev}. '
                f'Coming in today? Ask the front desk for help with an online hold.'
            ),
            'can_pickup': False,
            'tone': 'info',
            'confirmed_until_preview': preview.isoformat(),
            'confirmed_until_label': preview_abbrev,
            'provisional_label': deadline['lead'],
            'do_nothing_label': f'We release it at {close_label} today',
            'if_confirmed_label': f'We hold it until {preview_abbrev}',
            'code_expires_at': meta['code_expires_at'],
            'attempts_remaining': meta['attempts_remaining'],
            'resend_available_in': meta['resend_available_in'],
            'has_active_confirmation': meta['has_active_confirmation'],
        }

    if status in ('requested', 'confirmed'):
        # Invisible internal confirm: identical customer payload.
        code = (getattr(reservation, 'pickup_code', None) or '').strip() or None
        day = _fmt_day_short(reservation.expires_at) if reservation.expires_at else 'your hold window'
        return {
            **base,
            'stage': 2,
            'customer_status': 'Confirmed',
            'headline': f'Held for you until {day}' if reservation.expires_at else 'Held for you',
            'next_step': 'Come in any time before then and show your code at the counter.',
            'can_pickup': True,
            'tone': 'info',
            'pickup_code': code,
        }

    if status == 'ready_for_pickup':
        code = (getattr(reservation, 'pickup_code', None) or '').strip() or None
        day = _fmt_day_short(reservation.expires_at) if reservation.expires_at else 'your hold window'
        note = (getattr(reservation, 'staff_note', None) or '').strip()
        return {
            **base,
            'stage': 3,
            'customer_status': 'Ready',
            'headline': "It's bagged and waiting for you",
            'next_step': f'Pick up by {day}. Pay in store - cash or card.',
            'can_pickup': True,
            'tone': 'success',
            'pickup_code': code,
            'staff_note_public': note,
        }

    if status == 'completed':
        when = ''
        if reservation.completed_at:
            when = _fmt_day_short(reservation.completed_at)
        return {
            **base,
            'stage': 4,
            'customer_status': 'Picked up',
            'headline': (
                f'Picked up {when}. Thanks for shopping with us.'
                if when
                else 'Picked up. Thanks for shopping with us.'
            ),
            'next_step': 'This hold is complete.',
            'can_pickup': False,
            'tone': 'success',
            'pickup_code': (getattr(reservation, 'pickup_code', None) or '').strip() or None,
        }

    # Released states - Screen 4
    return {
        **base,
        'stage': 0,
        'customer_status': 'Released',
        'headline': 'This one went back on the floor',
        'next_step': reason or 'The hold ended and the item is available again.',
        'can_pickup': False,
        'tone': 'muted',
        'release_reason': reason,
    }


def public_timeline(reservation: 'Reservation') -> list[dict]:
    """Safe public timeline: whitelist kinds only, never actor or note text."""
    events = getattr(reservation, '_prefetched_objects_cache', {}).get('events')
    if events is None:
        events = reservation.events.all()
    out = []
    for ev in events:
        if ev.kind not in PUBLIC_TIMELINE_KINDS:
            continue
        out.append({
            'key': ev.kind,
            'label': _PUBLIC_KIND_LABELS.get(ev.kind, ev.kind.replace('_', ' ').title()),
            'at': ev.created_at.isoformat() if ev.created_at else None,
        })
    return out
