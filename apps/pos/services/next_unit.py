"""The next unit of a tag: another item of the same thing, still on the shelf.

A check-in of five makes five items with five SKUs, but a tag can end up on more than one unit (an extra
copy from Quick Reprice, a tag stuck on two of the same thing). At the register the second unit rings up
as the next unsold item of that check-in, never as the same item twice (2026-10-20).

Same unit means: same product, price, condition and source, from the same check-in (or, with none, the same
purchase order and manifest row). Held, listed online and consignment items are never picked: the cashier
did not scan them, and they have rules of their own. Items already on this sale or on another open sale are
skipped, so two registers do not pick the same one.
"""
from __future__ import annotations

from django.db.models import Exists, OuterRef

from apps.inventory.models import Item


def _group(item: Item):
    if item.check_in_id:
        return Item.objects.filter(check_in_id=item.check_in_id)
    if item.purchase_order_id:
        return Item.objects.filter(purchase_order_id=item.purchase_order_id, manifest_row_id=item.manifest_row_id)
    return None


def next_units(item: Item, cart, count: int = 1) -> list[Item]:
    """Up to ``count`` other on-shelf units of ``item``, lowest id first, none already on an open sale."""
    from apps.consignment.models import ConsignmentItem
    from apps.pos.models import CartLine
    from apps.webstore.models import Reservation, WebListing

    group = _group(item)
    if group is None or count < 1:
        return []
    taken = CartLine.objects.filter(item_id=OuterRef('pk'), cart__status__in=('open', 'suspended'))  # a set-aside sale holds its items
    return list(
        group.filter(
            product_id=item.product_id,
            price=item.price,
            condition=item.condition,
            source=item.source,
            status='on_shelf',
        )
        .exclude(pk=item.pk)
        .exclude(pk__in=CartLine.objects.filter(cart=cart, item__isnull=False).values('item_id'))
        .annotate(
            _taken=Exists(taken),
            _listed=Exists(WebListing.objects.filter(item_id=OuterRef('pk'))),
            _reserved=Exists(Reservation.objects.filter(item_id=OuterRef('pk'))),
            _consigned=Exists(ConsignmentItem.objects.filter(item_id=OuterRef('pk'))),
        )
        .filter(_taken=False, _listed=False, _reserved=False, _consigned=False)
        .select_related('product')
        .order_by('pk')[:count]
    )


def next_unit(item: Item, cart) -> Item | None:
    units = next_units(item, cart, 1)
    return units[0] if units else None
