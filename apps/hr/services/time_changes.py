"""The time-entry change trail (owner 2026-10-21): every edit after the punch, with who, when, before and after.

Also the rule that nobody changes their own time records behind the screens: staff ask for a time change instead.
Only the owner (a superuser) may change their own.
"""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

FIELDS = ('employee_id', 'date', 'clock_in', 'clock_out', 'break_minutes', 'shift', 'status', 'notes', 'total_hours')

OWN_TIME_MESSAGE = "You can't change your own time. Ask for a time change instead."


def snapshot(entry) -> dict:
    out = {}
    for field in FIELDS:
        value = getattr(entry, field, None)
        out[field.removesuffix('_id')] = value.isoformat() if hasattr(value, 'isoformat') else (
            str(value) if value is not None and not isinstance(value, (int, str)) else value)
    out['deleted'] = bool(getattr(entry, 'deleted_at', None))
    return out


def record(entry, action: str, actor, *, before: dict | None = None, note: str = ''):
    from apps.hr.models import TimeEntryChange

    after = snapshot(entry)
    before = before or {}
    if before and action == TimeEntryChange.ACTION_EDITED and before == after:
        return None
    return TimeEntryChange.objects.create(
        entry=entry, action=action, actor=actor if getattr(actor, 'pk', None) else None,
        before=before, after=after, note=(note or '')[:300],
    )


def refuse_own(user, entries) -> None:
    """Staff can't change their own time entries (only ask). The owner can."""
    if getattr(user, 'is_superuser', False):
        return
    if any(entry.employee_id == user.pk for entry in entries):
        raise PermissionDenied(OWN_TIME_MESSAGE)


def history(entry) -> list[dict]:
    return [
        {'action': row.action, 'label': row.get_action_display(), 'at': row.at,
         'by': row.actor.full_name if row.actor_id else '', 'before': row.before, 'after': row.after,
         'note': row.note}
        for row in entry.changes.select_related('actor')
    ]
