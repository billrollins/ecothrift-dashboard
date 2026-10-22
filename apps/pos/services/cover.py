"""Cover (Bill, 2026-10-21, digest point 3): someone stepping in at a register for a few minutes, logged to them.

- **Start:** the person stepping in taps Cover and types their own register PIN once (``register_pin.check_pin``, any
  active staff). The register says "Covered by ..." and every sale finished meanwhile is theirs (``Cart.cashier`` is
  the person covering, ``Cart.cover`` the cover), so missing money narrows to a person and the sales.
- **End:** Back plus the drawer's own cashier's PIN; or 10 minutes with no sale activity (checked whenever the drawer
  is used, so nothing runs in the background); or the drawer changing hands or closing. Someone else tapping Cover
  takes it over (the first one ends as "replaced").
- A wrong PIN counts toward the register's PIN lockout like any other.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.services import register_pin
from apps.accounts.services.register_pin import PinError

IDLE_MINUTES = 10


def _idle_until(cover):
    return cover.last_activity_at + timedelta(minutes=IDLE_MINUTES)


def active_cover(drawer):
    """The drawer's cover now, or None. A cover idle past 10 minutes is ended here (as of when it went idle)."""
    from apps.pos.models import DrawerCover

    cover = (DrawerCover.objects.select_related('user', 'cashier')
             .filter(drawer_id=drawer.pk, ended_at__isnull=True).first())
    if cover is None:
        return None
    if timezone.now() >= _idle_until(cover):
        DrawerCover.objects.filter(pk=cover.pk, ended_at__isnull=True).update(
            ended_at=_idle_until(cover), ended_how=DrawerCover.END_IDLE)
        return None
    return cover


def peek(drawer) -> dict | None:
    """For the drawer's payload: who covers and until when, without writing anything."""
    covers = getattr(drawer, '_open_covers', None)
    if covers is None:
        covers = [c for c in drawer.covers.all() if c.ended_at is None]
    cover = covers[0] if covers else None
    if cover is None or timezone.now() >= _idle_until(cover):
        return None
    return {
        'id': cover.pk,
        'user': cover.user_id,
        'user_name': cover.user.full_name,
        'cashier': cover.cashier_id,
        'cashier_name': cover.cashier.full_name,
        'started_at': cover.started_at,
        'idle_ends_at': _idle_until(cover),
    }


def touch(cover) -> None:
    """Sale activity under a cover keeps it going."""
    from apps.pos.models import DrawerCover

    if cover is not None:
        DrawerCover.objects.filter(pk=cover.pk).update(last_activity_at=timezone.now())


def end_all(drawer, how: str) -> None:
    """The drawer changed hands or closed: any cover on it ends."""
    from apps.pos.models import DrawerCover

    DrawerCover.objects.filter(drawer_id=drawer.pk, ended_at__isnull=True).update(
        ended_at=timezone.now(), ended_how=how)


def start(drawer, pin: str, *, request):
    """Someone types their PIN to cover. Answers the cover; raises ``PinError`` (a wrong PIN, or their own drawer)."""
    from apps.pos.models import DrawerCover

    device = register_pin.device_key(request, drawer.register)
    person = register_pin.check_pin(pin, device=device, min_role='Employee')
    if drawer.current_cashier_id is None or person.pk == drawer.current_cashier_id:
        raise PinError('OWN_DRAWER', 'This is your own drawer: no cover needed.', http=400)
    with transaction.atomic():
        current = active_cover(drawer)
        if current is not None and current.user_id == person.pk:
            touch(current)
            current.refresh_from_db()
            return current
        if current is not None:
            DrawerCover.objects.filter(pk=current.pk).update(ended_at=timezone.now(),
                                                            ended_how=DrawerCover.END_REPLACED)
        return DrawerCover.objects.create(drawer=drawer, user=person, cashier_id=drawer.current_cashier_id)


def back(drawer, pin: str, *, request):
    """The drawer's own cashier types their PIN: the cover ends. Raises ``PinError``; ``NOT_COVERED`` when none."""
    from apps.pos.models import DrawerCover

    cover = active_cover(drawer)
    if cover is None:
        raise PinError('NOT_COVERED', 'Nobody is covering this register.', http=400)
    device = register_pin.device_key(request, drawer.register)
    person = register_pin.check_pin(pin, device=device, min_role='Employee')
    if person.pk != cover.cashier_id:
        # Someone's PIN, but not this drawer's cashier's: a wrong try like any other.
        register_pin.count_wrong(device)
    DrawerCover.objects.filter(pk=cover.pk, ended_at__isnull=True).update(
        ended_at=timezone.now(), ended_how=DrawerCover.END_BACK)
    return cover
