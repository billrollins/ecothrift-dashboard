"""The tag overlay's facts for one item (owner 2026-10-22, F6: photo overlays, not templates).

It starts from the member scanner's item card (`thriftplus.services.scanner.item_card`), so the price (with a store
sale), today's ThriftBucks and 3-day returns or AS IS match what a member sees on the floor. One change: **retail is
the tag's retail** (`inventory.services.tag_retail`, owner call F1), so a post shows a retail only when it passed
the retail check, as the printed tag does. The words on the photo (rulebook V2, V8, V10, W1, A1) are drawn in the
browser (`pages/studios/social/tagOverlay.ts`).
"""
from __future__ import annotations

from decimal import Decimal


def tag_card(item) -> dict:
    from apps.inventory.services.tag_retail import tag_retail
    from apps.thriftplus.services.scanner import item_card

    card = item_card(item)
    price = Decimal(card['price'])
    retail = tag_retail(item)
    reward = Decimal(card['reward'])
    return {
        'sku': card['sku'],
        'title': card['title'],
        'price': card['price'],
        'retail': f'{retail:.2f}' if retail is not None and retail > price else None,
        'thriftbucks': card['reward'] if reward > 0 else None,
        'returnable': card['returnable'],
        'return_note': card.get('return_note') or '',
        'age_restricted': card['age_restricted'],
        'available': card['available'],
    }


def lookup(sku: str) -> dict:
    from apps.thriftplus.services.scanner import find_item

    code = (sku or '').strip().upper()
    item = find_item(code) if code else None
    if item is None:
        return {'status': 'not_found', 'sku': code}
    return {'status': 'found', 'item': tag_card(item)}
