"""
Misfit items (owner, 2026-10-22): things we sell that came from no real purchase order, added from Find item >
Add item.

Check-ins, their restoration jobs and Processing all hang off a purchase order, so a Misfit item lives on the year's
**Misfit order** (`MISFIT-<year>`, vendor MIS "The Island of Misfit Items", made on first use, no cost). Its items
carry `Item.source = 'misfit'`, with who checked them in and when. Find item's Misfit filter also counts the older
catch-alls `MISFIT-V1-2024` and `MISFIT-V2-2025` (orphans from the V1 and V2 eras, source `purchased`) and PR
Fix-it's quick adds (an untagged find on the floor: source `misc`, no purchase order; Mainline, 2026-10-22).
"""
from __future__ import annotations

from datetime import date

from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import PurchaseOrder, Vendor

PREFIX = 'MISFIT'
VENDOR_CODE = 'MIS'


def is_misfit_order(order: PurchaseOrder | None) -> bool:
    return bool(order is not None and str(order.order_number or '').upper().startswith(PREFIX))


def misfit_order(today: date | None = None) -> PurchaseOrder:
    """This year's Misfit order, made the first time it is needed."""
    year = (today or timezone.localdate()).year
    vendor, _ = Vendor.objects.get_or_create(
        code=VENDOR_CODE,
        defaults={'name': 'The Island of Misfit Items', 'vendor_type': 'other', 'is_active': True},
    )
    order, _ = PurchaseOrder.objects.get_or_create(
        order_number=f'{PREFIX}-{year}',
        defaults={
            'vendor': vendor,
            'status': 'complete',
            'ordered_date': date(year, 1, 1),
            'purchase_cost': 0,
            'shipping_cost': 0,
            'fees': 0,
            'retail_value': 0,
            'condition': 'mixed',
            'description': f'Misfit items added in {year}: no purchase order (Find item > Add item).',
            'notes': 'Made by Add item. Items here have no real purchase and no cost.',
        },
    )
    return order


def misfit_items_q(prefix: str = '') -> Q:
    """Items that are Misfits: source misfit, on any Misfit order (the older catch-alls), or a PR Fix-it quick add
    (source misc with no purchase order). `prefix` is the lookup path to the item (for example 'items__')."""
    order_ids = list(
        PurchaseOrder.objects.filter(order_number__istartswith=PREFIX).values_list('pk', flat=True)
    )
    return (
        Q(**{f'{prefix}source': 'misfit'})
        | Q(**{f'{prefix}purchase_order_id__in': order_ids})
        | Q(**{f'{prefix}source': 'misc', f'{prefix}purchase_order__isnull': True})
    )


def is_misfit_item(source: str, order_number: str | None) -> bool:
    """The same rule for one item already read (Find item's items list)."""
    order = str(order_number or '')
    return source == 'misfit' or order.upper().startswith(PREFIX) or (source == 'misc' and not order)
