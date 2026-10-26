"""
Sale facts saved on the item when it sells (inventory review, owner 2026-10-22).

- ``Item.sold_net``: what the store keeps per unit. ``sold_for`` (the line total per unit, Instant ThriftBucks already
  off) less the **kept** ThriftBucks the line earned, per unit. Any other sale keeps ``sold_for``.
- ``Item.thriftbucks_at_sale``: the ThriftBucks the unit collected (``collected`` / qty); 0 on a sale with no member.

The per-line truth is the Thrift+ snapshot ``CartLine.meta['thrift_plus']`` (``register._member_sale``). ThriftBucks
**spent** are a tender: they never come off the item they are spent on. A void, an undo or a moved sale clears both
fields with ``sold_for`` (``CLEARED``). ``sold_for`` itself is never changed here.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

CENT = Decimal('0.01')
ZERO = Decimal('0.00')
FIELDS = ('sold_net', 'thriftbucks_at_sale')
CLEARED = {'sold_net': None, 'thriftbucks_at_sale': None}


def _dec(value) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, '') else '0'))
    except (InvalidOperation, ValueError):
        return ZERO


def snapshot_of(line) -> dict | None:
    meta = getattr(line, 'meta', None)
    snap = meta.get('thrift_plus') if isinstance(meta, dict) else None
    return snap if isinstance(snap, dict) else None


def facts(sold_for, snap: dict | None = None, qty: int = 1) -> dict:
    """``{'sold_net', 'thriftbucks_at_sale'}`` for one unit sold at ``sold_for``, from the line's snapshot if any."""
    if sold_for is None:
        return dict(CLEARED)
    sold_for = _dec(sold_for)
    if not snap:
        return {'sold_net': sold_for, 'thriftbucks_at_sale': ZERO}
    qty = qty or 1
    kept = _dec(snap.get('kept'))
    collected = _dec(snap.get('collected'))
    return {
        'sold_net': (sold_for - kept / qty).quantize(CENT),
        'thriftbucks_at_sale': (collected / qty).quantize(CENT),
    }


def for_line(line, sold_for) -> dict:
    return facts(sold_for, snapshot_of(line), line.quantity or 1)


def apply(item, values: dict) -> list[str]:
    """Set the facts on ``item``; answers the field names for ``save(update_fields=...)``."""
    for name in FIELDS:
        setattr(item, name, values.get(name))
    return list(FIELDS)


# ── Backfill (Requests kind ``inventory.backfill_sale_facts``) ─────────────────

THRIFT_PLUS_START = '2026-10-16'
BACKFILL_CHUNK = 5000


def _unfilled():
    from apps.inventory.models import Item

    return Item.objects.filter(status='sold', sold_for__isnull=False, sold_net__isnull=True)


def member_lines():
    """Completed register lines with a Thrift+ snapshot whose item is still sold with no sale facts yet."""
    from apps.pos.models import CartLine

    return (CartLine.objects.filter(cart__status='completed', cart__completed_at__date__gte=THRIFT_PLUS_START,
                                    meta__has_key='thrift_plus', item__isnull=False, item__status='sold',
                                    item__sold_for__isnull=False, item__sold_net__isnull=True)
            .select_related('item').order_by('item_id', '-cart__completed_at'))


def backfill_counts() -> dict:
    lines = member_lines()
    return {'unfilled': _unfilled().count(), 'member_items': lines.values('item_id').distinct().count()}


def backfill_members() -> list[int]:
    """Member sales since Thrift+ began: the facts from each item's latest snapshot line. Answers the item ids."""
    from apps.inventory.models import Item

    done: list[int] = []
    seen: set[int] = set()
    for line in member_lines():
        if line.item_id in seen:
            continue
        seen.add(line.item_id)
        n = Item.objects.filter(pk=line.item_id, sold_net__isnull=True).update(**for_line(line, line.item.sold_for))
        if n:
            done.append(line.item_id)
    return done


def backfill_rest_chunk(after_id: int) -> tuple[int, int]:
    """Every other sold item with no facts: sold_net = sold_for, no ThriftBucks. One chunk by id; answers
    (rows changed, last id seen, 0 when finished)."""
    from django.db.models import F

    ids = list(_unfilled().filter(pk__gt=after_id).order_by('pk').values_list('pk', flat=True)[:BACKFILL_CHUNK])
    if not ids:
        return 0, 0
    from apps.inventory.models import Item

    n = Item.objects.filter(pk__in=ids, sold_net__isnull=True).update(sold_net=F('sold_for'), thriftbucks_at_sale=ZERO)
    return n, ids[-1]
