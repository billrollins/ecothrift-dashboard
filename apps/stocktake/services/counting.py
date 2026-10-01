"""Start a count, record scans, and build the report."""
from __future__ import annotations

from collections import Counter
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.inventory.models import Item

from ..models import CountScan, InventoryCount

MAX_BATCH = 300


class CountClosed(Exception):
    pass


def normalize_code(raw) -> str:
    return str(raw or '').strip().upper()


def start_count(*, user, name: str = '', note: str = '') -> InventoryCount:
    ids = list(Item.objects.filter(status='on_shelf').values_list('id', flat=True))
    return InventoryCount.objects.create(
        name=name.strip() or f'Count {timezone.localdate():%Y-%m-%d}',
        note=note,
        started_by=user,
        expected_item_ids=ids,
    )


def _scan_time(value):
    parsed = parse_datetime(str(value)) if value else None
    return parsed or timezone.now()


def _payload(row: CountScan, item: Item | None = None) -> dict:
    item = item or row.item
    return {
        'client_id': row.client_id,
        'code': row.code,
        'result': row.result,
        'item_status': row.item_status,
        'title': item.product.title if item else '',
        'price': str(item.price) if item else None,
        'location': item.location if item else '',
    }


def record_scans(count: InventoryCount, scans: list[dict]) -> list[dict]:
    """Record a batch of ``{client_id, code, seq, scanned_at}``. Returns one result per input, in order.

    Safe to retry: a ``client_id`` already recorded returns its earlier result unchanged.
    """
    if count.status != InventoryCount.STATUS_OPEN:
        raise CountClosed()
    scans = scans[:MAX_BATCH]
    client_ids = [str(s.get('client_id') or '') for s in scans]
    codes = {normalize_code(s.get('code')) for s in scans} - {''}

    with transaction.atomic():
        done = {
            s.client_id: s
            for s in count.scans.filter(client_id__in=[c for c in client_ids if c]).select_related('item__product')
        }
        items = {i.sku.upper(): i for i in Item.objects.filter(sku__in=codes).select_related('product')}
        seen_items = set(
            count.scans.filter(result__in=[CountScan.RESULT_OK, CountScan.RESULT_ODD]).values_list('item_id', flat=True)
        )
        out = []
        for raw in scans:
            cid = str(raw.get('client_id') or '')
            code = normalize_code(raw.get('code'))
            if cid in done:
                out.append(_payload(done[cid]))
                continue
            item = items.get(code)
            if item is None:
                result, status = CountScan.RESULT_UNKNOWN, ''
            elif item.pk in seen_items:
                result, status = CountScan.RESULT_ALREADY, item.status
            elif item.status == 'on_shelf':
                result, status = CountScan.RESULT_OK, item.status
            else:
                result, status = CountScan.RESULT_ODD, item.status
            row = CountScan.objects.create(
                count=count,
                client_id=cid or f'srv-{timezone.now().timestamp()}-{len(out)}',
                seq=int(raw.get('seq') or 0),
                code=code[:64],
                scanned_at=_scan_time(raw.get('scanned_at')),
                result=result,
                item=item,
                item_status=status,
            )
            if item is not None and result in (CountScan.RESULT_OK, CountScan.RESULT_ODD):
                seen_items.add(item.pk)
            out.append(_payload(row, item))
        return out


def summary(count: InventoryCount) -> dict:
    by_result = Counter(count.scans.values_list('result', flat=True))
    return {
        'id': count.pk,
        'name': count.name,
        'status': count.status,
        'note': count.note,
        'started_at': count.started_at,
        'closed_at': count.closed_at,
        'expected': len(count.expected_item_ids),
        'counted': by_result[CountScan.RESULT_OK],
        'already': by_result[CountScan.RESULT_ALREADY],
        'odd': by_result[CountScan.RESULT_ODD],
        'unknown': by_result[CountScan.RESULT_UNKNOWN],
        'scans': sum(by_result.values()),
        'server_now': timezone.now(),  # so the phone's timer does not depend on its own clock
    }


def restart_count(count: InventoryCount, *, user) -> InventoryCount:
    """Throw an open count away (its scans too) and start a fresh one. For trial runs and false starts."""
    if count.status != InventoryCount.STATUS_OPEN:
        raise CountClosed()
    with transaction.atomic():
        count.delete()
        return start_count(user=user)


def close_count(count: InventoryCount) -> InventoryCount:
    if count.status == InventoryCount.STATUS_OPEN:
        count.status = InventoryCount.STATUS_CLOSED
        count.closed_at = timezone.now()
        count.save(update_fields=['status', 'closed_at'])
    return count


def report(count: InventoryCount) -> dict:
    """What was not found, what sold meanwhile, what was found but should not be on the shelf."""
    expected = set(count.expected_item_ids)
    counted_ids = set(
        count.scans.filter(result__in=[CountScan.RESULT_OK, CountScan.RESULT_ODD]).values_list('item_id', flat=True)
    )
    not_scanned = expected - counted_ids
    items = Item.objects.filter(pk__in=not_scanned).select_related('product')
    missing, sold_meanwhile = [], []
    for it in items:
        row = {
            'sku': it.sku,
            'title': it.product.title,
            'location': it.location,
            'price': str(it.price),
            'retail': str(it.retail) if it.retail is not None else None,
            'cost': str(it.cost) if it.cost is not None else None,
            'listed_at': it.listed_at,
            'status': it.status,
        }
        (missing if it.status == 'on_shelf' else sold_meanwhile).append(row)
    missing.sort(key=lambda r: (r['location'], r['sku']))
    odd = [
        {'sku': s.item.sku, 'title': s.item.product.title, 'status': s.item_status, 'location': s.item.location}
        for s in count.scans.filter(result=CountScan.RESULT_ODD).select_related('item__product')
    ]
    unknown = sorted(set(count.scans.filter(result=CountScan.RESULT_UNKNOWN).values_list('code', flat=True)))
    base = summary(count)
    base.update({
        'missing_count': len(missing),
        'missing_price_total': str(sum((Decimal(r['price']) for r in missing), Decimal('0'))),
        'missing_retail_total': str(sum((Decimal(r['retail']) for r in missing if r['retail']), Decimal('0'))),
        'missing_cost_total': str(sum((Decimal(r['cost']) for r in missing if r['cost']), Decimal('0'))),
        'shrink_pct': round(100 * len(missing) / len(expected), 2) if expected else 0,
        'missing': missing,
        'sold_meanwhile': sold_meanwhile,
        'odd_items': odd,
        'unknown_codes': unknown,
    })
    return base
