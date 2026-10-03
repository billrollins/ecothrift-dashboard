"""Guess an order's vendor from its order number (new-order form, intake_updates Phase 2).

The prefix is the order number's first segment, before the first ``-`` (``TRGET-OGG-9L2P`` → ``TRGET``).
An order number with no ``-`` uses its leading letters (``AMZ11175`` → ``AMZ``).
First choice: the vendor most earlier orders with that prefix belong to. Second: a vendor whose code is the prefix.
Only active vendors are guessed.
"""
from __future__ import annotations

import re

from django.db.models import Count

from apps.inventory.models import PurchaseOrder, Vendor

_LEADING_LETTERS = re.compile(r'^([A-Z]{2,})\d')


def order_prefix(order_number: str | None) -> str:
    text = (order_number or '').strip().upper()
    if '-' in text:
        return text.split('-', 1)[0].strip()
    m = _LEADING_LETTERS.match(text)
    return m.group(1) if m else ''


def guess_vendor(order_number: str | None) -> tuple[Vendor, str] | None:
    """Return ``(vendor, source)`` where source is ``orders`` or ``code``; None when nothing fits."""
    prefix = order_prefix(order_number)
    if len(prefix) < 2:
        return None
    orders = PurchaseOrder.objects.filter(vendor__is_active=True)
    if '-' in (order_number or ''):
        orders = orders.filter(order_number__istartswith=f'{prefix}-')
    else:
        orders = orders.filter(order_number__iregex=rf'^{prefix}[0-9]')
    top = (
        orders.order_by()
        .values('vendor_id')
        .annotate(n=Count('id'))
        .order_by('-n', 'vendor_id')
        .first()
    )
    if top:
        return Vendor.objects.get(pk=top['vendor_id']), 'orders'
    vendor = Vendor.objects.filter(is_active=True, code__iexact=prefix).order_by('id').first()
    return (vendor, 'code') if vendor else None
