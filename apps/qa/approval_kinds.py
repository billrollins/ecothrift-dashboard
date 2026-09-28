"""
QA fixes that go through Superuser → Requests (staged by the nightly QA run, approved in production).

- ``qa.sold_from_cart`` (SHR-03): an item on the floor that is on a completed sale is marked sold
  from that sale. ``sold_at`` is the sale's completion and ``sold_for`` is its line price. Undo
  puts each item back on the floor with no sale date or price.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register

CHUNK = 200


def _latest_line(item_id: int):
    from apps.pos.models import CartLine

    return (
        CartLine.objects.filter(item_id=item_id, cart__status='completed').select_related('cart')
        .order_by('-cart__completed_at').first()
    )


def _sold_preview(params: dict) -> dict:
    from apps.inventory.models import Item

    ids = [int(i) for i in params.get('ids') or []]
    items = list(Item.objects.filter(pk__in=ids, status='on_shelf').select_related('product')[:20])
    sample = []
    for item in items:
        line = _latest_line(item.pk)
        sample.append({
            'sku': item.sku, 'title': item.product.title[:60], 'sale': line.cart_id if line else None,
            'sold_at': line.cart.completed_at.isoformat() if line and line.cart.completed_at else None,
            'sold_for': str((line.line_total / (line.quantity or 1)).quantize(Decimal('0.01'))) if line else None,
        })
    still = Item.objects.filter(pk__in=ids, status='on_shelf').count()
    return {
        'counts': {'Items on the floor and on a completed sale': still},
        'changes': [
            f'Marks {still:,} items sold, from their completed sale: the sale date, and the line price.',
            'They leave the floor counts (have, cover, Need). Undo puts them back.',
        ],
        'sample': sample,
    }


def _sold_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.inventory.models import Item

    ids = sorted(int(i) for i in request.params.get('ids') or [])
    done_ids = list(progress.state.get('changed') or [])
    start = int(progress.cursor or 0)
    for i in range(start, len(ids), CHUNK):
        with transaction.atomic():
            for item in Item.objects.select_for_update().filter(pk__in=ids[i:i + CHUNK], status='on_shelf'):
                line = _latest_line(item.pk)
                if line is None or not line.cart.completed_at:
                    continue
                item.status = 'sold'
                item.sold_at = line.cart.completed_at
                item.sold_for = (line.line_total / (line.quantity or 1)).quantize(Decimal('0.01'))
                item.save(update_fields=['status', 'sold_at', 'sold_for', 'updated_at'])
                done_ids.append(item.pk)
        progress.update(done=min(i + CHUNK, len(ids)), total=len(ids), cursor=i + CHUNK, changed=done_ids,
                        log=f'{len(done_ids):,} marked sold so far.')
    return {'marked_sold': len(done_ids), 'item_ids': done_ids}


def _sold_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.models import Item

    ids = (request.result or {}).get('item_ids') or []
    n = Item.objects.filter(pk__in=ids, status='sold').update(status='on_shelf', sold_at=None, sold_for=None)
    return {'back_on_floor': n}


register(Kind(
    kind='qa.sold_from_cart', label='QA: mark floor items sold from their completed sale',
    preview=_sold_preview, apply=_sold_apply, undo=_sold_undo,
))
