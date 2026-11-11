"""Close the truck (Dash Update #88): one guided step that finishes what the Truck page, the B-Stock dispute record
and ``finalize_truck`` already do. Nothing here is a second dispute system.

The step, for one order:

1. **What did not come, what came broken or damaged, what was added**, each with retail
   (``truck_finalize.truck_lines``, the Truck page's own lines).
2. **The claim** by the header's rule (D7): ``truck_plan.dispute_numbers(order, as_closed=True)``. One rule in one
   function; on a finished truck it is the very number the Processing header shows.
3. **A claim list to copy** into B-Stock (``bstock_disputes.affected_lines``: line, units, retail, reason, total), and
   the link to the public dispute page once a claim record exists.
4. **Filed on / amount asked**, later **amount back / the date**. They are kept on the truck's ``BStockDispute``
   (``amount_asked``, ``refund_received_on`` are new; status, snapshot and ``filed_at`` are the existing ones).
   Dash never files anything on B-Stock itself.
5. **Finalize** = the existing ``finalize_truck``. It stamps the order and freezes totals; it never deletes or
   changes an item.

``unfiled_claims`` is the count-down: trucks delivered lately whose claim so far is worth more than $0 and is not
filed, with the day the dispute is due.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.inventory.models import BStockDispute, Item, PurchaseOrder, TruckPallet
from apps.inventory.services import bstock_disputes
from apps.inventory.services.truck_finalize import truck_lines
from apps.inventory.services.truck_plan import _plan_for, dispute_due_date, dispute_numbers

_CENT = Decimal('0.01')
_ZERO = Decimal('0')
# The count-down looks at trucks delivered this recently; older ones are on the Truck page, not nagged about.
UNFILED_LOOKBACK_DAYS = 30
_REASONS = {
    bstock_disputes.ISSUE_MISSING: 'Not received',
    bstock_disputes.ISSUE_BROKEN: 'Broken',
    bstock_disputes.ISSUE_DISPUTED: 'Damaged',
}


def _money(v: Decimal | None) -> str | None:
    return None if v is None else str(Decimal(v).quantize(_CENT))


def _decimal(raw: Any, label: str) -> Decimal | None:
    if raw is None or str(raw).strip() == '':
        return None
    try:
        value = Decimal(str(raw).replace(',', '').replace('$', '').strip()).quantize(_CENT)
    except (InvalidOperation, ValueError):
        raise ValueError(f'{label} must be a number.') from None
    if value < 0:
        raise ValueError(f'{label} cannot be below $0.')
    return value


def _day(raw: Any, label: str) -> date | None:
    if raw is None or str(raw).strip() == '':
        return None
    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        raise ValueError(f'{label} must be a date.') from None


def business_days_left(due: date, today: date) -> int:
    """Weekdays from today to the due day; negative once it has passed."""
    if due == today:
        return 0
    start, end, sign = (today, due, 1) if due > today else (due, today, -1)
    n = 0
    cursor = start
    while cursor < end:
        cursor += timedelta(days=1)
        if cursor.weekday() < 5:
            n += 1
    return sign * n


def claim_record(order: PurchaseOrder) -> BStockDispute | None:
    """The truck's claim: its newest B-Stock dispute record."""
    return BStockDispute.objects.filter(purchase_order=order).order_by('-created_at', '-pk').first()


def _record_out(record: BStockDispute | None) -> dict[str, Any]:
    filed = bool(record and record.status != BStockDispute.STATUS_DRAFT and record.filed_at)
    return {
        'id': record.pk if record else None,
        'filed': filed,
        'filed_on': timezone.localtime(record.filed_at).date().isoformat() if filed else None,
        'amount_asked': _money(record.amount_asked) if filed else None,
        'bstock_dispute_id': record.bstock_dispute_id if record else '',
        'answered': bool(filed and record.refund_received is not None),
        'amount_back': _money(record.refund_received) if filed else None,
        'back_on': record.refund_received_on.isoformat() if filed and record.refund_received_on else None,
        'status': record.status if record else '',
        'status_label': record.get_status_display() if record else '',
    }


def claim_state(order: PurchaseOrder, numbers: dict[str, Any], record: BStockDispute | None) -> str:
    """nothing (no claim worth filing) | to_file | filed (waiting for the money) | answered."""
    out = _record_out(record)
    if out['answered']:
        return 'answered'
    if out['filed']:
        return 'filed'
    worth = Decimal(numbers['worth']) if numbers.get('worth') else _ZERO
    return 'to_file' if worth > 0 else 'nothing'


def header_claim(order: PurchaseOrder, numbers: dict[str, Any]) -> dict[str, Any]:
    """The few claim facts the Processing header shows beside its dispute numbers (``numbers`` = the header's own)."""
    record = claim_record(order)
    out = _record_out(record)
    worth = Decimal(numbers['worth']) if numbers.get('worth') else _ZERO
    return {
        'filed': out['filed'],
        'filed_on': out['filed_on'],
        'amount_asked': out['amount_asked'],
        'amount_back': out['amount_back'],
        'finalized_at': order.truck_finalized_at.isoformat() if order.truck_finalized_at else None,
        # What is worth filing and is not filed yet (the count-down's number); None when there is nothing to nag about.
        'not_filed': _money(worth) if worth > 0 and not out['filed'] and not order.truck_finalized_at else None,
    }


def claim_lines(order: PurchaseOrder, record: BStockDispute | None) -> list[dict[str, Any]]:
    """The claim list: live until filed, then the lines frozen at filing."""
    if record is not None and record.status != BStockDispute.STATUS_DRAFT and record.snapshot.get('lines') is not None:
        lines = record.snapshot['lines']
    else:
        lines = bstock_disputes.affected_lines(order)
    return [
        {
            'row_number': line['row_number'],
            'title': line['title'],
            'reason': _REASONS.get(line['issue'], line['issue']),
            'units': line['units'],
            'unit_retail': line['unit_retail'],
            'total_retail': line['total_retail'],
            'upc': line.get('upc') or '',
            'pallet_id': line.get('pallet_id') or '',
            'lpn': line.get('lpn') or '',
        }
        for line in lines
    ]


def copy_text(order: PurchaseOrder, lines: list[dict[str, Any]], numbers: dict[str, Any]) -> str:
    """The claim as plain text, ready to paste into B-Stock. Columns nobody filled (UPC, pallet) are left out."""
    def dollars(v) -> str:
        return f'${Decimal(v):,.2f}' if v else ''

    def units(v) -> str:
        return f'{Decimal(str(v)).normalize():f}'

    extra = [(name, key) for name, key in (('UPC', 'upc'), ('Pallet', 'pallet_id')) if any(line[key] for line in lines)]
    out = [f'Order {order.order_number}: items not received or damaged', '']
    out.append('\t'.join(['Line', 'Item', 'Units', 'Retail each', 'Retail total', 'Reason'] + [name for name, _key in extra]))
    for line in lines:
        out.append('\t'.join([
            str(line['row_number']), line['title'], units(line['units']),
            dollars(line['unit_retail']), dollars(line['total_retail']), line['reason'],
        ] + [line[key] for _name, key in extra]))
    total_units = sum(Decimal(str(line['units'])) for line in lines)
    total_retail = sum((Decimal(line['total_retail']) for line in lines if line['total_retail']), _ZERO)
    out += ['', f'Total: {units(total_units)} units, {dollars(total_retail) or "$0.00"} manifest retail']
    if numbers.get('truck_retail') and numbers.get('retail_pct') is not None:
        out.append(f"That is {numbers['retail_pct']}% of the truck's {dollars(numbers['truck_retail'])} manifest retail.")
    if numbers.get('worth') and Decimal(numbers['worth']) > 0:
        out.append(f"Amount asked: {dollars(numbers['worth'])}")
    return '\n'.join(out)


def still_working(order: PurchaseOrder) -> dict[str, int]:
    """What is still open on the truck: items waiting and pallets not marked done. All zero = the work is finished."""
    pallets = TruckPallet.objects.filter(purchase_order=order)
    total = pallets.count()
    return {
        'pending_items': Item.objects.filter(purchase_order=order, status__in=('intake', 'processing')).count(),
        'pallets_open': total - pallets.filter(done_at__isnull=False).count(),
        'pallets_total': total,
    }


def _warnings(order: PurchaseOrder, state: str, late: bool = False) -> list[str]:
    """Worth knowing before closing; none of them blocks it."""
    out = []
    pending = Item.objects.filter(purchase_order=order, status__in=('intake', 'processing')).count()
    if pending:
        out.append(f'{pending} items are still in intake or processing.')
    pallets = TruckPallet.objects.filter(purchase_order=order)
    total, done = pallets.count(), pallets.filter(done_at__isnull=False).count()
    if total and done < total:
        out.append(f'{total - done} of {total} pallets are not marked done. Everything not checked in counts as not received.')
    if order.purchase_cost is None:
        out.append('The price is not on the order, so the dispute cannot be worked out.')
    if state == 'to_file' and late:
        out.append('Dispute day passed and it was not filed. Closing without it is the normal step.')
    elif state == 'to_file':
        out.append('The dispute is not filed yet. A truck can be closed without filing, but the money is then not asked for.')
    return out


def close_payload(order: PurchaseOrder, *, link_for=None) -> dict[str, Any]:
    """Everything the Close the truck step shows."""
    lines = truck_lines(order)
    numbers = dispute_numbers(order, as_closed=True, lines=lines)
    record = claim_record(order)
    state = claim_state(order, numbers, record)
    added = Item.objects.filter(purchase_order=order, manifest_row__isnull=True).exclude(
        status__in=('intake', 'processing', 'lost'),
    ).aggregate(n=Count('pk'), retail=Sum('retail'))
    plan = _plan_for(order)
    due, _from_plan = dispute_due_date(order, plan)
    today = timezone.localdate()
    c_lines = claim_lines(order, record)
    rec = _record_out(record)
    return {
        'order': {
            'id': order.pk,
            'order_number': order.order_number,
            'vendor': order.vendor_name_cache or (order.vendor.name if order.vendor_id else ''),
            'description': order.description,
            'delivered': order.delivered_date.isoformat() if order.delivered_date else None,
        },
        'numbers': numbers,
        'added': {'units': int(added['n'] or 0), 'retail': _money(added['retail'] or _ZERO)},
        'state': state,
        # What the top of Processing shows before the truck is closed: only what is marked so far.
        'so_far_worth': dispute_numbers(order, lines=lines)['worth'],
        'working': still_working(order),
        'claim': rec,
        'lines': c_lines,
        'copy_text': copy_text(order, c_lines, numbers) if c_lines else '',
        'public_url': link_for(record) if (record is not None and link_for) else None,
        'due': {
            'date': due.isoformat() if due else None,
            'days_left': business_days_left(due, today) if due else None,
        },
        'finalized': {
            'at': order.truck_finalized_at.isoformat() if order.truck_finalized_at else None,
            'by': (order.truck_finalized_by.full_name or order.truck_finalized_by.email)
            if order.truck_finalized_by_id else '',
        },
        'warnings': [] if order.truck_finalized_at else _warnings(
            order, state, late=bool(due and business_days_left(due, today) < 0),
        ),
    }


# --- recording what happened on B-Stock ---------------------------------------------------------------------------


def record_filed(user, order: PurchaseOrder, data: dict) -> BStockDispute:
    """The claim was filed on B-Stock (by a person, there): keep the day, the amount asked and B-Stock's id.

    Filing freezes the claim lines (the existing ``update_dispute`` rule). No amount given = the claim by D7.
    """
    filed_on = _day(data.get('filed_on'), 'Filed on') or timezone.localdate()
    if filed_on > timezone.localdate():
        raise ValueError('Filed on cannot be in the future.')
    asked = _decimal(data.get('amount_asked'), 'Amount asked')
    with transaction.atomic():
        record = claim_record(order)
        if record is None or record.status in BStockDispute.CLOSED_STATUSES:
            record = bstock_disputes.create_dispute(user, order)
        if asked is None:
            worth = dispute_numbers(order, as_closed=True)['worth']
            asked = Decimal(worth) if worth else None
        patch: dict[str, Any] = {}
        if record.status == BStockDispute.STATUS_DRAFT:
            patch['status'] = BStockDispute.STATUS_FILED
        if 'bstock_dispute_id' in data:
            patch['bstock_dispute_id'] = data.get('bstock_dispute_id')
        if patch:
            bstock_disputes.update_dispute(record, patch)
        record.filed_at = timezone.make_aware(datetime.combine(filed_on, time(12, 0)))
        record.amount_asked = asked
        record.save(update_fields=['filed_at', 'amount_asked', 'updated_at'])
    return record


def record_not_filed(order: PurchaseOrder) -> BStockDispute | None:
    """Undo "filed": the claim is a draft again and its lines are live."""
    record = claim_record(order)
    if record is None or record.status == BStockDispute.STATUS_DRAFT:
        return record
    bstock_disputes.update_dispute(record, {'status': BStockDispute.STATUS_DRAFT, 'refund_received': None})
    record.amount_asked = None
    record.refund_received_on = None
    record.save(update_fields=['amount_asked', 'refund_received_on', 'updated_at'])
    return record


def record_money_back(order: PurchaseOrder, data: dict) -> BStockDispute:
    """B-Stock answered: how much came back and when. $0 = denied; less than asked = partly refunded."""
    record = claim_record(order)
    if record is None or record.status == BStockDispute.STATUS_DRAFT or not record.filed_at:
        raise ValueError('Record the day the dispute was filed first.')
    back = _decimal(data.get('amount_back'), 'Amount back')
    if back is None:
        # Cleared: the claim is waiting for an answer again.
        bstock_disputes.update_dispute(record, {'status': BStockDispute.STATUS_FILED, 'refund_received': None})
        record.refund_received_on = None
        record.save(update_fields=['refund_received_on', 'updated_at'])
        return record
    back_on = _day(data.get('back_on'), 'Date') or timezone.localdate()
    if back_on > timezone.localdate():
        raise ValueError('The date cannot be in the future.')
    if back == 0:
        status = BStockDispute.STATUS_DENIED
    elif record.amount_asked is not None and back < record.amount_asked:
        status = BStockDispute.STATUS_PARTIAL
    else:
        status = BStockDispute.STATUS_REFUNDED
    bstock_disputes.update_dispute(record, {'status': status, 'refund_received': str(back)})
    record.refund_received_on = back_on
    record.save(update_fields=['refund_received_on', 'updated_at'])
    return record


# --- the count-down -------------------------------------------------------------------------------------------------


def unfiled_claims(today: date | None = None) -> list[dict[str, Any]]:
    """Trucks delivered lately with a claim worth filing (above $0 so far, by D7) that is not filed, soonest due first."""
    today = today or timezone.localdate()
    since = today - timedelta(days=UNFILED_LOOKBACK_DAYS)
    filed_ids = set(
        BStockDispute.objects.exclude(status=BStockDispute.STATUS_DRAFT).values_list('purchase_order_id', flat=True),
    )
    out = []
    orders = (
        PurchaseOrder.objects.filter(delivered_date__gte=since, truck_finalized_at__isnull=True)
        .exclude(status='cancelled').exclude(pk__in=filed_ids).select_related('vendor')
    )
    for order in orders:
        numbers = dispute_numbers(order)
        worth = Decimal(numbers['worth']) if numbers.get('worth') else _ZERO
        if worth <= 0:
            continue
        due, _from_plan = dispute_due_date(order, _plan_for(order))
        out.append({
            'order_id': order.pk,
            'order_number': order.order_number,
            'vendor': order.vendor_name_cache or (order.vendor.name if order.vendor_id else ''),
            'worth': _money(worth),
            'due': due.isoformat() if due else None,
            'days_left': business_days_left(due, today) if due else None,
            'missed': bool(due and business_days_left(due, today) < 0),
        })
    out.sort(key=lambda r: (r['days_left'] is None, r['days_left'] if r['days_left'] is not None else 0))
    return out
