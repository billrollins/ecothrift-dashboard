"""Truck Plan and the money numbers at the top of Processing (Dash Update #81, Bill 2026-11-10).

One call gives the Processing header and the Truck Plan window the same numbers:

- **Paid** = the order's total cost (price + fees + shipping), with the three parts.
- **Target** = the Target Price total for the truck: 2 x Paid unless a superuser set another total on the order
  (``PurchaseOrder.target_price_total``, with who and when).
- **On track** = tag prices set so far (items checked in and sellable) + an estimated price for every manifest unit
  not yet processed (lines the Processing queue still shows as open; see ``units_left_by_line``). A line's own price
  is used when it has one (the price the processor sees on the row); otherwise its retail x a rate: this truck's
  price-to-retail rate so far once ``MIN_RATE_ITEMS`` items are priced, before that the Truck Plan's pricing start
  point. Units with no price, no retail or no rate are counted, never guessed. Shown against the target as
  over / under.
- **Disputes so far** = what a processor has marked: not received (manifest retail), broken (manifest retail) and
  damaged (each item's % of value lost). A finished pallet counts everything not received on it, marked or not.
  **Worth** = (disputed retail - 5% of the truck's retail) / the truck's retail x (price + fees), never below $0.
  Shipping is not in it. Bill's example: 50 missing on a 100 truck = (50 - 5) / 100 x (price + fees).
  The 5% is the same setting the Truck page uses (``truck_refund_deductible``).
- **Dispute due** = the plan's own date, else 4 business days after delivery.

The Truck Plan (``TruckPlan``, one per order) holds the pricing start point, what to watch for, who is on it, the
dispute due date and known issues. No row = "No truck plan yet"; it never blocks processing.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.inventory.models import Item, ProcessingRow, PurchaseOrder, TruckPallet, TruckPlan
from apps.inventory.services.truck_finalize import refund_settings, truck_lines

TARGET_MULTIPLE = Decimal('2')
DISPUTE_BUSINESS_DAYS = 4
# The truck's own price-to-retail rate is trusted once this many items are priced; before that the plan's start point.
MIN_RATE_ITEMS = 10
_ZERO = Decimal('0')
_CENT = Decimal('0.01')
_NOT_PRICED_STATUSES = ('intake', 'processing', 'lost', 'scrapped')
_TEXT_LIMIT = 4000


def _money(v: Decimal | None) -> str | None:
    return None if v is None else str(Decimal(v).quantize(_CENT))


def _units(v: Decimal | int) -> float:
    q = float(v)
    return round(q, 1) if abs(q - round(q)) > 0.05 else float(round(q))


def _user_name(u) -> str:
    if u is None:
        return ''
    return (getattr(u, 'full_name', '') or '').strip() or getattr(u, 'email', '') or ''


# --- the money math (pure, tested in tests/test_truck_plan.py) ---------------------------------------------------


def default_target(total_cost: Decimal | None) -> Decimal | None:
    """2 x what we paid; unknown when the cost is unknown."""
    if total_cost is None:
        return None
    return (TARGET_MULTIPLE * Decimal(total_cost)).quantize(_CENT)


def target_total(total_cost: Decimal | None, own_total: Decimal | None) -> Decimal | None:
    """The superuser's own total when there is one, else 2 x Paid."""
    return Decimal(own_total).quantize(_CENT) if own_total is not None else default_target(total_cost)


def pick_rate(*, priced_items: int, priced_sum: Decimal, retail_sum: Decimal,
              plan_start_pct: Decimal | None) -> tuple[Decimal | None, str]:
    """The price-to-retail rate for lines with no price of their own, and where it came from."""
    truck_rate = (Decimal(priced_sum) / Decimal(retail_sum)) if retail_sum and retail_sum > 0 else None
    if truck_rate is not None and priced_items >= MIN_RATE_ITEMS:
        return truck_rate, 'truck'
    if plan_start_pct is not None and plan_start_pct > 0:
        return Decimal(plan_start_pct) / Decimal(100), 'plan'
    if truck_rate is not None:
        return truck_rate, 'truck'
    return None, ''


_OPEN_ROW_STATUSES = ('pending', 'partial')


def units_left_by_line(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Units not yet processed, per line, the way the Processing queue sees a line.

    ``rows``: ProcessingRow values (``id``, ``collapse_master_id``, ``row_number``, ``queue_status``, ``quantity``,
    ``qty_dispositioned``, ``own_price``, ``unit_retail``). A line the queue shows as done (checked in or disputed)
    has nothing left, even when fewer units came than the manifest said. Lines combined in Processing are one
    group: its check-ins sit on the first line, so what is left is the group's total less the group's check-ins,
    taken from the last lines back.
    """
    rows = sorted(rows, key=lambda r: (r.get('row_number') or 0, r.get('id') or 0))
    members: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        if r.get('collapse_master_id'):
            members.setdefault(int(r['collapse_master_id']), []).append(r)
    ids = {r['id'] for r in rows}
    out = []
    for r in rows:
        if r.get('collapse_master_id') and int(r['collapse_master_id']) in ids:
            continue  # counted with its group
        if str(r.get('queue_status') or 'pending') not in _OPEN_ROW_STATUSES:
            continue
        group = [r, *members.get(int(r['id']), [])]
        left = max(0, sum(int(g['quantity'] or 0) for g in group) - sum(int(g['qty_dispositioned'] or 0) for g in group))
        for g in reversed(group):
            if left <= 0:
                break
            take = min(left, max(0, int(g['quantity'] or 0) - int(g['qty_dispositioned'] or 0)))
            if take > 0:
                out.append({'units_left': take, 'own_price': g.get('own_price'), 'unit_retail': g.get('unit_retail')})
                left -= take
    return out


def estimate_left(rows: Iterable[dict[str, Any]], rate: Decimal | None) -> dict[str, Any]:
    """Estimated tag price of the units not yet processed.

    ``rows``: ``units_left``, ``own_price`` (the line's own price, or None) and ``unit_retail`` per line.
    """
    total = _ZERO
    own_units = rate_units = unknown_units = 0
    for row in rows:
        left = int(row.get('units_left') or 0)
        if left <= 0:
            continue
        own = row.get('own_price')
        retail = row.get('unit_retail')
        if own is not None and own > 0:
            total += Decimal(own) * left
            own_units += left
        elif rate is not None and retail is not None and retail > 0:
            total += Decimal(retail) * rate * left
            rate_units += left
        else:
            unknown_units += left
    return {
        'total': total.quantize(_CENT),
        'units_own_price': own_units,
        'units_by_rate': rate_units,
        'units_no_estimate': unknown_units,
    }


def on_track_total(priced_so_far: Decimal, estimated_left: Decimal) -> Decimal:
    return (Decimal(priced_so_far) + Decimal(estimated_left)).quantize(_CENT)


def vs_target(on_track: Decimal, target: Decimal | None) -> Decimal | None:
    """Positive = over the target, negative = under."""
    return None if target is None else (Decimal(on_track) - Decimal(target)).quantize(_CENT)


def dispute_worth(*, disputed_retail: Decimal, truck_retail: Decimal | None, price: Decimal | None,
                  fees: Decimal | None, threshold: Decimal = Decimal('0.05')) -> Decimal | None:
    """(disputed retail - 5% of the truck's retail) / the truck's retail x (price + fees). Never below $0.

    Shipping is not part of it. ``None`` when the truck's retail or the price is unknown.
    """
    if truck_retail is None or truck_retail <= 0 or price is None:
        return None
    over = Decimal(disputed_retail) - threshold * Decimal(truck_retail)
    if over <= 0:
        return Decimal('0.00')
    paid = Decimal(price) + Decimal(fees or 0)
    return (over / Decimal(truck_retail) * paid).quantize(_CENT)


def add_business_days(start: date, days: int) -> date:
    out = start
    added = 0
    while added < days:
        out += timedelta(days=1)
        if out.weekday() < 5:
            added += 1
    return out


def dispute_due_date(order: PurchaseOrder, plan: TruckPlan | None) -> tuple[date | None, bool]:
    """The day the dispute is due, and whether the plan set it."""
    if plan is not None and plan.dispute_due_date:
        return plan.dispute_due_date, True
    base = order.delivered_date or order.expected_delivery
    return (add_business_days(base, DISPUTE_BUSINESS_DAYS) if base else None), False


# --- numbers for one order ----------------------------------------------------------------------------------------


def _plan_for(order: PurchaseOrder) -> TruckPlan | None:
    return TruckPlan.objects.filter(purchase_order=order).select_related('updated_by').first()


def _target_out(order: PurchaseOrder) -> dict[str, Any]:
    own = order.target_price_total
    return {
        'total': _money(target_total(order.total_cost, own)),
        'default': _money(default_target(order.total_cost)),
        'is_default': own is None,
        'multiple': float(TARGET_MULTIPLE),
        'set_by': _user_name(order.target_price_set_by) if own is not None else '',
        'set_at': order.target_price_set_at.isoformat() if own is not None and order.target_price_set_at else None,
    }


def _on_track_out(order: PurchaseOrder, plan: TruckPlan | None) -> dict[str, Any]:
    priced_qs = Item.objects.filter(purchase_order=order).exclude(status__in=_NOT_PRICED_STATUSES)
    rated = Q(price__gt=0, retail__gt=0)
    agg = priced_qs.aggregate(
        n=Count('pk'),
        priced=Sum('price'),
        rate_n=Count('pk', filter=rated),
        rate_price=Sum('price', filter=rated),
        rate_retail=Sum('retail', filter=rated),
    )
    priced_so_far = agg['priced'] or _ZERO
    rate, basis = pick_rate(
        priced_items=int(agg['rate_n'] or 0),
        priced_sum=agg['rate_price'] or _ZERO,
        retail_sum=agg['rate_retail'] or _ZERO,
        plan_start_pct=plan.pricing_start_pct if plan else None,
    )
    rows = []
    for r in ProcessingRow.objects.filter(purchase_order=order).exclude(
        row_kind=ProcessingRow.ROW_KIND_ADDED,
    ).values(
        'id', 'collapse_master_id', 'row_number', 'queue_status', 'quantity', 'qty_dispositioned',
        'shelf_price', 'final_price', 'proposed_price', 'unit_retail',
    ):
        r['own_price'] = next(
            (p for p in (r['shelf_price'], r['final_price'], r['proposed_price']) if p is not None and p > 0), None,
        )
        rows.append(r)
    left = estimate_left(units_left_by_line(rows), rate)
    total = on_track_total(priced_so_far, left['total'])
    target = target_total(order.total_cost, order.target_price_total)
    return {
        'total': _money(total),
        'priced_so_far': _money(priced_so_far),
        'priced_items': int(agg['n'] or 0),
        'estimated_left': _money(left['total']),
        'units_left': left['units_own_price'] + left['units_by_rate'] + left['units_no_estimate'],
        'units_own_price': left['units_own_price'],
        'units_by_rate': left['units_by_rate'],
        'units_no_estimate': left['units_no_estimate'],
        'rate_pct': round(float(rate) * 100, 1) if rate is not None else None,
        'rate_basis': basis,
        'vs_target': _money(vs_target(total, target)),
    }


def _pallet_key(code: str) -> str:
    return str(code or '').strip().lower()


def dispute_numbers(order: PurchaseOrder, *, as_closed: bool = False, lines: list | None = None) -> dict[str, Any]:
    """Disputed retail and what it is worth (D7), for the Processing header and for Close the truck (#88).

    One rule, one function: ``as_closed`` counts everything not received, as it will be once the truck is closed.
    A finished or finalized truck gives the same numbers either way.
    """
    if lines is None:
        lines = truck_lines(order)
    pallets = list(TruckPallet.objects.filter(purchase_order=order).values('code', 'done_at'))
    done_codes = {_pallet_key(p['code']) for p in pallets if p['done_at'] and p['code']}
    truck_done = (
        as_closed
        or bool(order.truck_finalized_at)
        or order.processing_status == 'done'
        or order.status == 'complete'
        or bool(pallets and all(p['done_at'] for p in pallets))
    )

    truck_retail = _ZERO
    lines_without_retail = 0
    sums = {k: {'units': _ZERO, 'retail': _ZERO} for k in ('not_received', 'broken', 'damaged')}
    damaged_items = 0
    for line in lines:
        ur = line['unit_retail']
        if ur is None:
            lines_without_retail += 1
        else:
            truck_retail += line['units']['manifest'] * ur
        # A finished pallet (or truck): everything not received counts. Before that, only what was marked.
        finished = truck_done or (line['pallet_code'] and _pallet_key(line['pallet_code']) in done_codes)
        parts = {
            'not_received': line['units']['missing'] if finished else line['marked_missing'],
            'broken': line['units']['broken'],
            'damaged': line['units']['disputed'],
        }
        damaged_items += line['disputed_items']
        for key, units in parts.items():
            sums[key]['units'] += units
            if ur is not None:
                sums[key]['retail'] += units * ur
    if not truck_retail and order.retail_value:
        truck_retail = order.retail_value

    threshold = refund_settings()['deductible']
    disputed_retail = sum((s['retail'] for s in sums.values()), _ZERO)
    threshold_retail = threshold * truck_retail
    worth = dispute_worth(
        disputed_retail=disputed_retail,
        truck_retail=truck_retail or None,
        price=order.purchase_cost,
        fees=order.fees,
        threshold=threshold,
    )
    items = sums['not_received']['units'] + sums['broken']['units'] + Decimal(damaged_items)
    return {
        'items': _units(items),
        'retail': _money(disputed_retail),
        'retail_pct': round(float(disputed_retail) * 100 / float(truck_retail), 1) if truck_retail else None,
        'parts': {
            'not_received': {'units': _units(sums['not_received']['units']), 'retail': _money(sums['not_received']['retail'])},
            'broken': {'units': _units(sums['broken']['units']), 'retail': _money(sums['broken']['retail'])},
            'damaged': {'units': damaged_items, 'retail': _money(sums['damaged']['retail'])},
        },
        'truck_retail': _money(truck_retail) if truck_retail else None,
        'threshold_pct': round(float(threshold) * 100, 1),
        'threshold_retail': _money(threshold_retail) if truck_retail else None,
        'over_threshold': bool(truck_retail) and disputed_retail > threshold_retail,
        'price_plus_fees': (
            _money((order.purchase_cost or _ZERO) + (order.fees or _ZERO)) if order.purchase_cost is not None else None
        ),
        'worth': _money(worth),
        'lines_without_retail': lines_without_retail,
    }


def _pct_text(v: Decimal | None) -> str | None:
    """55.00 -> '55', 52.50 -> '52.5'."""
    if v is None:
        return None
    q = Decimal(v).quantize(_CENT)
    return str(q.quantize(Decimal('1'))) if q == q.to_integral_value() else str(q.normalize())


def plan_out(plan: TruckPlan | None) -> dict[str, Any] | None:
    if plan is None:
        return None
    return {
        'pricing_start_pct': _pct_text(plan.pricing_start_pct),
        'watch_for': plan.watch_for,
        'known_issues': plan.known_issues,
        'crew': [{'id': u.pk, 'name': _user_name(u)} for u in plan.crew.all().order_by('first_name', 'last_name')],
        'dispute_due_date': plan.dispute_due_date.isoformat() if plan.dispute_due_date else None,
        'updated_by': _user_name(plan.updated_by),
        'updated_at': plan.updated_at.isoformat() if plan.updated_at else None,
    }


def truck_summary(order: PurchaseOrder, *, user=None) -> dict[str, Any]:
    """Everything the Processing header and the Truck Plan window show for one order."""
    from apps.inventory.services.truck_close import header_claim

    plan = _plan_for(order)
    due, due_from_plan = dispute_due_date(order, plan)
    disputes = dispute_numbers(order)
    return {
        'order': {
            'id': order.pk,
            'order_number': order.order_number,
            'vendor': order.vendor_name_cache or (order.vendor.name if order.vendor_id else ''),
            'description': order.description,
            'notes': order.notes,
        },
        'paid': {
            'total': _money(order.total_cost),
            'price': _money(order.purchase_cost),
            'fees': _money(order.fees),
            'shipping': _money(order.shipping_cost),
        },
        'target': _target_out(order),
        'on_track': _on_track_out(order, plan),
        'disputes': disputes,
        # Close the truck (#88): filed or not, and what is worth filing and is not filed yet.
        'claim': header_claim(order, disputes),
        'dates': {
            'delivered': order.delivered_date.isoformat() if order.delivered_date else None,
            'expected_delivery': order.expected_delivery.isoformat() if order.expected_delivery else None,
            'dispute_due': due.isoformat() if due else None,
            'dispute_due_from_plan': due_from_plan,
            'dispute_business_days': DISPUTE_BUSINESS_DAYS,
        },
        'plan': plan_out(plan),
        'can_set_target': bool(user is not None and getattr(user, 'is_superuser', False)),
    }


def staff_options() -> list[dict[str, Any]]:
    """Active staff, for "Who is on it"."""
    from apps.accounts.services.access import staff_queryset

    return [{'id': u.pk, 'name': _user_name(u)} for u in staff_queryset()]


# --- saving -------------------------------------------------------------------------------------------------------


def _decimal_or_none(raw: Any, label: str) -> Decimal | None:
    if raw is None or str(raw).strip() == '':
        return None
    try:
        return Decimal(str(raw).replace(',', '').replace('$', '').replace('%', '').strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f'{label} must be a number.') from None


def save_plan(user, order: PurchaseOrder, data: dict) -> TruckPlan:
    """Create or update the truck's plan. Only the keys sent are changed."""
    plan = TruckPlan.objects.filter(purchase_order=order).first()
    if plan is None:
        plan = TruckPlan(purchase_order=order, created_by=user)
    if 'pricing_start_pct' in data:
        pct = _decimal_or_none(data.get('pricing_start_pct'), 'Pricing start')
        if pct is not None and (pct < 0 or pct > 200):
            raise ValueError('Pricing start must be between 0 and 200 percent.')
        plan.pricing_start_pct = None if pct is None else pct.quantize(_CENT)
    if 'watch_for' in data:
        plan.watch_for = str(data.get('watch_for') or '').strip()[:_TEXT_LIMIT]
    if 'known_issues' in data:
        plan.known_issues = str(data.get('known_issues') or '').strip()[:_TEXT_LIMIT]
    if 'dispute_due_date' in data:
        raw = data.get('dispute_due_date')
        if raw is None or str(raw).strip() == '':
            plan.dispute_due_date = None
        else:
            try:
                plan.dispute_due_date = date.fromisoformat(str(raw).strip()[:10])
            except ValueError:
                raise ValueError('Dispute due date must be a date.') from None
    crew_ids = None
    if 'crew_ids' in data:
        raw_ids = data.get('crew_ids') or []
        if not isinstance(raw_ids, (list, tuple)):
            raise ValueError('Who is on it must be a list of staff.')
        try:
            crew_ids = {int(x) for x in raw_ids}
        except (TypeError, ValueError):
            raise ValueError('Who is on it must be a list of staff.') from None
        allowed = {o['id'] for o in staff_options()}
        if crew_ids - allowed:
            raise ValueError('Pick staff who work here now.')
    plan.updated_by = user
    plan.save()
    if crew_ids is not None:
        plan.crew.set(crew_ids)
    return plan


def set_target(user, order: PurchaseOrder, raw_total: Any) -> PurchaseOrder:
    """A superuser's own Target Price total for the truck; empty puts it back to 2 x Paid."""
    if not getattr(user, 'is_superuser', False):
        raise PermissionError('Only a superuser can change the target.')
    total = _decimal_or_none(raw_total, 'Target')
    if total is not None:
        if total < 0:
            raise ValueError('Target cannot be below $0.')
        if total >= Decimal('10000000000'):
            raise ValueError('Target is too large.')
        total = total.quantize(_CENT)
    # A plain update: PurchaseOrder.save() recomputes costs, which a target must never touch.
    PurchaseOrder.objects.filter(pk=order.pk).update(
        target_price_total=total,
        target_price_set_by=user if total is not None else None,
        target_price_set_at=timezone.now() if total is not None else None,
    )
    order.refresh_from_db(fields=['target_price_total', 'target_price_set_by', 'target_price_set_at'])
    return order
