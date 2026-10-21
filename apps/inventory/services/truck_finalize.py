"""Truck finalize (E2): one view per purchase order of manifest vs received, and what B-Stock should refund.

Per manifest line (from ``truck_pallets.manifest_line_accounting``):

- **Manifest** units and $ are the manifest's own (quantity x unit retail).
- **Unfulfilled** = units entered by hand from B-Stock / seller adjustments (``ManifestAdjustment``), before or
  after arrival, capped at the line. They come off what the truck should have held.
- **Expected** = manifest - unfulfilled. **Received** = the line's received share in manifest units.
  **Missing** = expected - received (never below 0). **Over** = received above expected.
- **Broken** = units received broken (scrapped, disputed broken, or salvage condition), in manifest units.
- **Added** = items checked in with no manifest line (units and their own retail).

All $ are at the manifest unit retail. Lines with no unit retail count in units only (flagged).

**What we can expect back** follows B-Stock's rule: the seller refunds ``truck_refund_rate`` (95%) of the sale
price (the hammer price: no fees, no shipping) for the share of manifest retail claimed (missing + broken), after
the first ``truck_refund_deductible`` (5%) of manifest retail, which is never refunded:

    refund = rate x sale price x max(0, claimed $ - deductible x manifest $) / manifest $
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.core.models import AppSetting
from apps.inventory.models import Item, ManifestAdjustment, ManifestRow, PurchaseOrder
from apps.inventory.services.truck_pallets import _user_name, manifest_line_accounting, pallet_ledger

DEFAULT_REFUND_RATE = Decimal('0.95')
DEFAULT_DEDUCTIBLE = Decimal('0.05')
_ZERO = Decimal('0')
_CENT = Decimal('0.01')
_TOTAL_KEYS = (
    'manifest', 'unfulfilled', 'expected', 'received', 'missing', 'over', 'broken',
)


def _fraction_setting(key: str, default: Decimal) -> Decimal:
    try:
        value = Decimal(str(AppSetting.objects.get(key=key).value))
    except (AppSetting.DoesNotExist, ArithmeticError, TypeError, ValueError):
        return default
    if value < 0 or value > 1:
        return default
    return value


def refund_settings() -> dict[str, Decimal]:
    return {
        'rate': _fraction_setting('truck_refund_rate', DEFAULT_REFUND_RATE),
        'deductible': _fraction_setting('truck_refund_deductible', DEFAULT_DEDUCTIBLE),
    }


def _money(v: Decimal | None) -> str | None:
    return None if v is None else str(Decimal(v).quantize(_CENT))


def _units(v: Decimal) -> float:
    q = float(v)
    return round(q, 1) if abs(q - round(q)) > 0.05 else float(round(q))


def expected_refund(*, sale_price: Decimal | None, manifest_retail: Decimal, claimed_retail: Decimal,
                    rate: Decimal, deductible: Decimal) -> dict[str, Any]:
    """B-Stock's refund for a claim (see module docstring). ``None`` amounts when the sale price is unknown."""
    kept = deductible * manifest_retail
    refundable_retail = max(_ZERO, claimed_retail - kept)
    share = (refundable_retail / manifest_retail) if manifest_retail else _ZERO
    amount = (rate * sale_price * share) if sale_price is not None else None
    return {
        'sale_price': _money(sale_price),
        'rate': float(rate),
        'deductible': float(deductible),
        'claimed_retail': _money(claimed_retail),
        'claimed_pct': round(float(claimed_retail) * 100 / float(manifest_retail), 1) if manifest_retail else None,
        'not_refunded_retail': _money(min(kept, claimed_retail)),
        'refundable_retail': _money(refundable_retail),
        'refundable_share': round(float(share) * 100, 2),
        'amount': _money(amount),
    }


def _adjusted_units(order: PurchaseOrder) -> tuple[dict[int, int], dict[int, Decimal]]:
    units: dict[int, int] = defaultdict(int)
    refunds: dict[int, Decimal] = defaultdict(lambda: _ZERO)
    for adj in ManifestAdjustment.objects.filter(purchase_order=order).values(
        'manifest_row_id', 'units', 'refund_amount',
    ):
        units[adj['manifest_row_id']] += int(adj['units'] or 0)
        if adj['refund_amount'] is not None:
            refunds[adj['manifest_row_id']] += adj['refund_amount']
    return units, refunds


def truck_lines(order: PurchaseOrder) -> list[dict[str, Any]]:
    """Every manifest line with unfulfilled / expected / received / missing / over / broken, units and $."""
    adj_units, adj_refunds = _adjusted_units(order)
    out = []
    for line in manifest_line_accounting(order):
        m_units = line['manifest_units']
        exp_proc = line['expected_units'] or 0
        unf = min(m_units, Decimal(adj_units.get(line['manifest_row_id'], 0)))
        expected = m_units - unf
        received = line['received_units']
        if line['over_units'] and exp_proc:
            # Extras above the processing quantity, back in manifest units.
            received = received + m_units * Decimal(line['over_units']) / Decimal(exp_proc)
        missing = max(_ZERO, expected - received)
        over = max(_ZERO, received - expected)
        broken = (
            min(m_units, m_units * Decimal(line['broken_units']) / Decimal(exp_proc))
            if exp_proc else Decimal(line['broken_units'])
        )
        ur = line['unit_retail']

        def dollars(u: Decimal) -> Decimal | None:
            return None if ur is None else u * ur

        out.append({
            'manifest_row_id': line['manifest_row_id'],
            'row_number': line['row_number'],
            'title': line['title'],
            'pallet_code': line['pallet_code'],
            'unit_retail': ur,
            'units': {
                'manifest': m_units, 'unfulfilled': unf, 'expected': expected, 'received': received,
                'missing': missing, 'over': over, 'broken': broken,
            },
            'retail': {
                'manifest': dollars(m_units), 'unfulfilled': dollars(unf), 'expected': dollars(expected),
                'received': dollars(received), 'missing': dollars(missing), 'over': dollars(over),
                'broken': dollars(broken),
            },
            'adjusted_refund': adj_refunds.get(line['manifest_row_id']),
        })
    return out


def _line_out(line: dict[str, Any]) -> dict[str, Any]:
    return {
        'manifest_row_id': line['manifest_row_id'],
        'row_number': line['row_number'],
        'title': line['title'],
        'pallet_code': line['pallet_code'],
        'unit_retail': _money(line['unit_retail']),
        'units': {k: _units(v) for k, v in line['units'].items()},
        'retail': {k: _money(v) for k, v in line['retail'].items()},
    }


def _has_problem(line: dict[str, Any]) -> bool:
    u = line['units']
    return any(u[k] > Decimal('0.05') for k in ('unfulfilled', 'missing', 'over', 'broken'))


def _adjustments_out(order: PurchaseOrder) -> list[dict[str, Any]]:
    out = []
    for a in ManifestAdjustment.objects.filter(purchase_order=order).select_related('manifest_row', 'created_by'):
        mr = a.manifest_row
        out.append({
            'id': a.pk,
            'manifest_row_id': mr.pk,
            'row_number': mr.row_number,
            'title': mr.title,
            'units': a.units,
            'timing': a.timing,
            'refund_amount': _money(a.refund_amount),
            'note': a.note,
            'created_by': _user_name(a.created_by),
            'created_at': a.created_at.isoformat(),
        })
    return out


def truck_report(order: PurchaseOrder, *, all_lines: bool = False) -> dict[str, Any]:
    """The truck finalize page: totals, the lines with a problem (or all), adjustments, and the expected refund."""
    lines = truck_lines(order)
    units = {k: _ZERO for k in _TOTAL_KEYS}
    retail = {k: _ZERO for k in _TOTAL_KEYS}
    lines_without_retail = 0
    adjusted_refund = _ZERO
    for line in lines:
        for k in _TOTAL_KEYS:
            units[k] += line['units'][k]
            if line['retail'][k] is not None:
                retail[k] += line['retail'][k]
        if line['unit_retail'] is None:
            lines_without_retail += 1
        if line['adjusted_refund'] is not None:
            adjusted_refund += line['adjusted_refund']

    added = Item.objects.filter(purchase_order=order, manifest_row__isnull=True).exclude(
        status__in=('intake', 'processing', 'lost'),
    ).aggregate(n=Count('pk'), retail=Sum('retail'))

    settings = refund_settings()
    refund = expected_refund(
        sale_price=order.purchase_cost,
        manifest_retail=retail['manifest'],
        claimed_retail=retail['missing'] + retail['broken'],
        rate=settings['rate'],
        deductible=settings['deductible'],
    )
    ledger = pallet_ledger(order)
    shown = [line for line in lines if all_lines or _has_problem(line)]
    finalized_by = order.truck_finalized_by
    return {
        'order': {
            'id': order.pk,
            'order_number': order.order_number,
            'vendor': order.vendor.name if order.vendor_id else '',
            'description': order.description,
            'status': order.status,
            'purchase_cost': _money(order.purchase_cost),
            'fees': _money(order.fees),
            'shipping_cost': _money(order.shipping_cost),
            'delivered_date': order.delivered_date.isoformat() if order.delivered_date else None,
            'has_manifest': ManifestRow.objects.filter(purchase_order=order).exists(),
        },
        'finalized': {
            'at': order.truck_finalized_at.isoformat() if order.truck_finalized_at else None,
            'by': _user_name(order.truck_finalized_by),
            'snapshot': order.truck_finalize_snapshot or {},
        },
        'totals': {
            'lines': len(lines),
            'lines_without_retail': lines_without_retail,
            'units': {k: _units(v) for k, v in units.items()},
            'retail': {k: _money(v) for k, v in retail.items()},
            'added_units': int(added['n'] or 0),
            'added_retail': _money(added['retail'] or _ZERO),
            'missing_pct': (
                round(float(retail['missing']) * 100 / float(retail['manifest']), 1) if retail['manifest'] else None
            ),
            'adjusted_refund': _money(adjusted_refund),
        },
        'refund': refund,
        'pallets': {
            'total': ledger['pallets_total'],
            'arrived': ledger['pallets_arrived'],
            'done': ledger['pallets_done'],
        },
        'pending_units': Item.objects.filter(purchase_order=order, status__in=('intake', 'processing')).count(),
        'adjustments': _adjustments_out(order),
        'lines': [_line_out(line) for line in shown],
        'lines_shown': 'all' if all_lines else 'problems',
    }


def add_adjustment(user, order: PurchaseOrder, data: dict) -> ManifestAdjustment:
    if order.truck_finalized_at:
        raise ValueError('This truck is finalized. Reopen it to change adjustments.')
    raw_row = data.get('manifest_row_id')
    row = None
    if raw_row not in (None, '') and str(raw_row).isdigit():
        row = ManifestRow.objects.filter(purchase_order=order, pk=int(raw_row)).first()
    elif str(data.get('row_number') or '').isdigit():
        row = ManifestRow.objects.filter(purchase_order=order, row_number=int(data['row_number'])).first()
    if row is None:
        raise ValueError('Pick a manifest line on this order.')
    try:
        units = int(data.get('units'))
    except (TypeError, ValueError):
        raise ValueError('Units must be a whole number.') from None
    already = ManifestAdjustment.objects.filter(manifest_row=row).aggregate(n=Sum('units'))['n'] or 0
    if units < 1 or units + already > max(0, row.quantity):
        raise ValueError(f'Units must be 1 to {max(0, row.quantity - already)} for line {row.row_number}.')
    timing = data.get('timing') or ManifestAdjustment.TIMING_BEFORE_ARRIVAL
    if timing not in dict(ManifestAdjustment.TIMING_CHOICES):
        raise ValueError('Timing must be before_arrival or after_arrival.')
    refund = data.get('refund_amount')
    refund_dec = None
    if refund not in (None, ''):
        try:
            refund_dec = Decimal(str(refund)).quantize(_CENT)
        except ArithmeticError:
            raise ValueError('Refund amount must be a number.') from None
        if refund_dec < 0:
            raise ValueError('Refund amount cannot be negative.')
    return ManifestAdjustment.objects.create(
        purchase_order=order,
        manifest_row=row,
        units=units,
        timing=timing,
        refund_amount=refund_dec,
        note=str(data.get('note') or '').strip(),
        created_by=user,
    )


def delete_adjustment(order: PurchaseOrder, adjustment_id: int) -> None:
    if order.truck_finalized_at:
        raise ValueError('This truck is finalized. Reopen it to change adjustments.')
    deleted, _ = ManifestAdjustment.objects.filter(purchase_order=order, pk=adjustment_id).delete()
    if not deleted:
        raise LookupError('Adjustment not found.')


def finalize_truck(user, order: PurchaseOrder) -> PurchaseOrder:
    """Mark the truck finalized and freeze its totals and expected refund."""
    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        if order.truck_finalized_at:
            raise ValueError('This truck is already finalized.')
        report = truck_report(order)
        order.truck_finalize_snapshot = {
            'totals': report['totals'],
            'refund': report['refund'],
            'pallets': report['pallets'],
            'pending_units': report['pending_units'],
        }
        order.truck_finalized_at = timezone.now()
        order.truck_finalized_by = user
        order.closeout_status = 'finalized'
        order.save(update_fields=[
            'truck_finalize_snapshot', 'truck_finalized_at', 'truck_finalized_by', 'closeout_status', 'updated_at',
        ])
    return order


def reopen_truck(order: PurchaseOrder) -> PurchaseOrder:
    order.truck_finalized_at = None
    order.truck_finalized_by = None
    order.closeout_status = 'open'
    order.save(update_fields=['truck_finalized_at', 'truck_finalized_by', 'closeout_status', 'updated_at'])
    return order
