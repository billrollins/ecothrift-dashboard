"""Received (owner, 2026-10-28): staff tick order lines off as they arrive, partial packs allowed.

A line's `received_qty` is the packs in so far (0 to the packs ordered). Every change is kept as a `SupplyReceipt`
(who, when, by how much), so a correction shows too. Only lines the owner ticked Ordered can be received.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from ..models import SupplyOrderLine, SupplyReceipt

# How far back the Receive page looks for lines still on their way.
OPEN_WEEKS = 8


class ReceiveError(ValueError):
    pass


def set_received(line: SupplyOrderLine, qty, *, user) -> SupplyOrderLine:
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        raise ReceiveError('Packs in must be a whole number.') from None
    if line.ordered_at is None:
        raise ReceiveError('This line is not ordered yet.')
    if qty < 0 or qty > line.packs:
        raise ReceiveError(f'Packs in must be 0 to {line.packs}.')
    with transaction.atomic():
        line = SupplyOrderLine.objects.select_for_update().get(pk=line.pk)
        change = qty - line.received_qty
        if change == 0:
            return line
        line.received_qty = qty
        line.received_at = timezone.now() if qty else None
        line.received_by = user if qty else None
        line.save(update_fields=['received_qty', 'received_at', 'received_by'])
        SupplyReceipt.objects.create(line=line, change=change, received_qty=qty, by=user)
    return line


def receive_status(line: SupplyOrderLine) -> str:
    if line.received_qty >= line.packs:
        return 'in'
    return 'partial' if line.received_qty else 'waiting'


def open_lines(now=None):
    """Ordered lines not all in yet, from the last few orders."""
    now = now or timezone.now()
    since = timezone.localdate(now) - timedelta(weeks=OPEN_WEEKS)
    lines = (
        SupplyOrderLine.objects.filter(ordered_at__isnull=False, order__week_start__gte=since)
        .select_related('order', 'received_by')
        .order_by('vendor', 'list_name', 'name')
    )
    return [ln for ln in lines if ln.received_qty < ln.packs]
