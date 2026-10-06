"""Two items, one tag: the one in hand is real; the old sale was its twin (owner, 2026-10-06).

When a tag the system calls **sold** turns up on the floor (at the register or in an inventory count), the
item in hand is the real one and the earlier sale was a duplicate that shared its tag. The fix keeps the tag
on the shelf exactly as it is and moves the **old sale** to a new item number:

    before:  Product 123 · ITM001 · sold            (the item is actually on the shelf)
    after:   Product 123 · ITM002 · sold            (the old sale: its register lines move here)
             Product 123 · ITM001 · on the shelf    (the tag in hand, unchanged)

Nothing is reprinted. The sale's money is untouched (same carts, same lines; only the item they point at changes).
Moved with the sale: completed register cart lines and delivery jobs. Not done automatically (a person decides,
in PR Fix-it): consignment items and items with an online listing or hold.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory

NOTE = 'Two items, one tag'


def why_not(item: Item) -> str | None:
    """None when the sale can be moved by itself; else the reason a person has to decide."""
    if item.status != 'sold':
        return 'not_sold'
    from apps.consignment.models import ConsignmentItem
    from apps.webstore.models import Reservation, WebListing

    if ConsignmentItem.objects.filter(item=item).exists():
        return 'consignment'
    if WebListing.objects.filter(item=item).exists() or Reservation.objects.filter(item=item).exists():
        return 'online'
    return None


@transaction.atomic
def move_sale_to_new_item(item: Item, user, *, where: str) -> Item:
    """Keep ``item`` (the tag in hand) and give its old sale a new item number. Returns the new, sold item."""
    from apps.pos.models import CartLine, DeliveryJobItem

    item = Item.objects.select_for_update().get(pk=item.pk)
    reason = why_not(item)
    if reason:
        raise ValueError(f'The sale cannot be moved by itself ({reason}).')
    now = timezone.now()
    twin = Item(
        sku=Item.generate_sku(),
        product=item.product,
        purchase_order=item.purchase_order,
        manifest_row=item.manifest_row,
        parent_item=item,
        price=item.price,
        retail=item.retail,
        cost=item.cost,
        source=item.source,
        status='sold',
        condition=item.condition,
        specifications=item.specifications if item.specifications is not None else {},
        notes=f'SALE_MOVED_FROM:{item.sku}',
        listed_at=item.listed_at,
        checked_in_at=item.checked_in_at,
        checked_in_by=item.checked_in_by,
        sold_at=item.sold_at,
        sold_for=item.sold_for,
    )
    # Its cost is copied; an order-wide re-cost would rewrite every other item unchanged.
    twin.save(defer_po_cost_recompute=True)
    lines = CartLine.objects.filter(item=item, cart__status='completed')
    moved_lines = lines.update(item=twin)
    DeliveryJobItem.objects.filter(source_item=item).update(source_item=twin)

    item.status = 'on_shelf'
    item.sold_at = None
    item.sold_for = None
    item.save(update_fields=['status', 'sold_at', 'sold_for', 'search_text', 'updated_at'])
    ItemHistory.objects.create(
        item=item, event_type='status_change', old_value='sold', new_value='on_shelf',
        note=f'{NOTE}: found here ({where}); its old sale moved to {twin.sku}', created_by=user,
    )
    ItemHistory.objects.create(
        item=twin, event_type='created', new_value=twin.sku,
        note=f'{NOTE}: the earlier sale of {item.sku} ({moved_lines} register line{"s" if moved_lines != 1 else ""})',
        created_by=user,
    )
    return twin
