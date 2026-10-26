"""Sold online, paid outside the register (E5): take the item out of inventory and record where it went.

Online Sales holds picked up at the register already leave inventory there (POS checkout marks the item sold, with
``sale_channel='online_pickup'``). An item sold through Facebook or another online place and paid outside the register
used to stay "on the shelf" forever (the count could only mark it "sold online"). Now staff record the sale:

- ``record_online_sale``: the item becomes ``sold`` with ``sold_at``, ``sold_for`` and ``sale_channel``
  (``facebook`` or ``online_other``), an ``ItemHistory`` "sold" line says where and who, and the item's open listing is
  marked sold. Refused for an item on an active hold (ring the hold at the register), a consignment item (its payout
  runs through the register), or one already sold, scrapped or lost.
- ``undo_online_sale``: puts it back on the shelf when it was recorded here and is not on a register sale.
- ``online_sales_list``: every online sale in the window, both kinds, with how it was paid.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory
from apps.inventory.services import sale_facts
from apps.webstore.models import Reservation, WebListing

OFF_REGISTER_CHANNELS = (Item.SALE_CHANNEL_FACEBOOK, Item.SALE_CHANNEL_ONLINE_OTHER)
_CENT = Decimal('0.01')


def _price(raw) -> Decimal:
    try:
        value = Decimal(str(raw)).quantize(_CENT)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError('Enter what it sold for.') from None
    if value < 0:
        raise ValueError('The price cannot be negative.')
    return value


def _on_register_sale(item: Item) -> bool:
    from apps.pos.models import CartLine

    return CartLine.objects.filter(item=item, cart__status='completed').exists()


def _user_name(user) -> str:
    if user is None:
        return ''
    return (getattr(user, 'full_name', '') or '').strip() or getattr(user, 'email', '') or ''


@transaction.atomic
def record_online_sale(user, *, sku: str, sold_for, channel: str, note: str = '') -> Item:
    if channel not in OFF_REGISTER_CHANNELS:
        raise ValueError('Where it sold must be Facebook or another online place.')
    item = Item.objects.select_for_update().filter(sku__iexact=(sku or '').strip()).first()
    if item is None:
        raise LookupError('No item has that tag.')
    if item.status == 'sold':
        raise ValueError(f'{item.sku} is already sold.')
    if item.status in ('scrapped', 'lost'):
        raise ValueError(f'{item.sku} is {item.status}; put it back on the shelf first.')
    if item.source == 'consignment':
        raise ValueError('Ring consignment items at the register so the consignor is paid.')
    if Reservation.objects.filter(item=item, status__in=Reservation.ACTIVE_STATUSES).exists():
        raise ValueError(f'{item.sku} is on an online hold: ring it up at the register.')
    price = _price(sold_for)

    old_status = item.status
    item.status = 'sold'
    item.sold_at = timezone.now()
    item.sold_for = price
    sale_facts.apply(item, sale_facts.facts(price))
    item.sale_channel = channel
    item.save()
    where = dict(Item.SALE_CHANNEL_CHOICES)[channel]
    ItemHistory.objects.create(
        item=item,
        event_type='sold',
        old_value=old_status,
        new_value='sold',
        note=f'Sold online: {where}, ${price}' + (f'. {note.strip()}' if note and note.strip() else ''),
        created_by=user,
    )
    for listing in WebListing.objects.select_for_update().filter(item=item).exclude(status__in=('sold', 'archived')):
        listing.on_hand = 0
        listing.reserved = 0
        listing.sync_stock_mirror()
        listing.status = 'sold'
        listing.save(update_fields=['on_hand', 'reserved', 'stock', 'status', 'updated_at'])
    return item


@transaction.atomic
def undo_online_sale(user, item_id: int) -> Item:
    item = Item.objects.select_for_update().filter(pk=item_id).first()
    if item is None:
        raise LookupError('Item not found.')
    if item.status != 'sold' or item.sale_channel not in OFF_REGISTER_CHANNELS:
        raise ValueError('Only a sale recorded as sold online can be undone here.')
    if _on_register_sale(item):
        raise ValueError('This item is on a register sale; void it at the register.')
    item.status = 'on_shelf'
    item.sold_at = None
    item.sold_for = None
    sale_facts.apply(item, sale_facts.CLEARED)
    item.sale_channel = ''
    item.save()
    ItemHistory.objects.create(
        item=item,
        event_type='status_change',
        old_value='sold',
        new_value='on_shelf',
        note='Online sale undone; back on the shelf.',
        created_by=user,
    )
    return item


def online_sales_list(days: int = 90, limit: int = 500) -> list[dict[str, Any]]:
    """Online sales in the last ``days``, newest first: what sold, for how much, where, and how it was paid."""
    since = timezone.now() - timedelta(days=max(1, days))
    items = list(
        Item.objects.filter(status='sold', sale_channel__in=Item.ONLINE_SALE_CHANNELS, sold_at__gte=since)
        .select_related('product')
        .order_by('-sold_at')[:limit],
    )
    by_item: dict[int, ItemHistory] = {}
    for h in (
        ItemHistory.objects.filter(item__in=items, event_type='sold')
        .select_related('created_by').order_by('created_at')
    ):
        by_item[h.item_id] = h
    channels = dict(Item.SALE_CHANNEL_CHOICES)
    out = []
    for it in items:
        h = by_item.get(it.pk)
        out.append({
            'item_id': it.pk,
            'sku': it.sku,
            'title': getattr(it.product, 'title', '') or '',
            'sold_at': it.sold_at.isoformat() if it.sold_at else None,
            'sold_for': str(it.sold_for) if it.sold_for is not None else None,
            'channel': it.sale_channel,
            'channel_label': channels.get(it.sale_channel, it.sale_channel),
            'paid_at_register': it.sale_channel == Item.SALE_CHANNEL_ONLINE_PICKUP,
            'recorded_by': _user_name(h.created_by) if h else '',
            'note': h.note if h else '',
            'can_undo': it.sale_channel in OFF_REGISTER_CHANNELS,
        })
    return out
