"""The Inventories list and each inventory's order estimates (inventory_effort Phase 6, owner 2026-10-06).

- **Stages:** In progress, then Done. Only one is in progress at a time; a manager starts it (a scan never does).
- **The list:** each inventory's key numbers. A done inventory keeps them (``summary_cache``, set when it is ended)
  so the list stays fast; what still moves after it is done (open PR Fix-it problems, shrink estimates) is live.
- **Order estimates:** per order, what it would make if what the count found sells: sold so far plus X% of the
  tag price of the found items still unsold, and (a toggle) the not-found items the owner estimated as back stock.
  Found items that sold since the count are already in "sold", so they are not counted twice.
"""
from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any

from django.db.models import Q

from apps.inventory.models import Item, PurchaseOrder
from apps.inventory.services.purchase_order_financials import sold_by_po

from ..models import InventoryCount, Issue, Run, Section, ShrinkMark
from .counting import days_active, person

ZERO = Decimal('0')


def _m(v) -> str:
    return str((v or ZERO).quantize(Decimal('0.01')))


def stage(count: InventoryCount) -> str:
    return 'in_progress' if count.status == InventoryCount.STATUS_OPEN else 'done'


def core_numbers(count: InventoryCount) -> dict[str, Any]:
    """The numbers that stop moving when an inventory is done."""
    from .report import summary

    s = summary(count)
    done = set(
        count.runs.filter(section_complete=True).exclude(status=Run.STATUS_BAD).values_list('section_id', flat=True)
    )
    return {
        'counted': s['counted'], 'not_found': s['not_found'], 'expected': s['expected'],
        'coverage_pct': s['coverage_pct'], 'hours': s['hours'], 'scans': s['scans'],
        'sessions': s['runs'] - s['bad_runs'], 'people': [p['name'] for p in s['by_person'] if p['items'] or p['hours']],
        'sections_done': len(done),
        'sections_total': Section.objects.filter(Q(is_active=True) | Q(pk__in=done)).count(),
        'days_active': days_active(count),
    }


def list_row(count: InventoryCount, *, fresh: bool = False) -> dict[str, Any]:
    """One row of the Inventories list. ``fresh`` recomputes even a done inventory's numbers."""
    core = None if fresh or count.status == InventoryCount.STATUS_OPEN else count.summary_cache
    if core is None:
        core = core_numbers(count)
        if count.status == InventoryCount.STATUS_CLOSED and not fresh:
            InventoryCount.objects.filter(pk=count.pk).update(summary_cache=core)
    marks = Counter(ShrinkMark.objects.filter(count=count).values_list('outcome', flat=True))
    return {
        **core,
        'id': count.pk, 'name': count.name, 'day': count.day, 'stage': stage(count), 'status': count.status,
        'started_at': count.started_at, 'started_by': person(count.started_by) if count.started_by_id else '',
        'closed_at': count.closed_at, 'closed_by': person(count.closed_by) if count.closed_by_id else '',
        'to_fix': count.issues.filter(
            action__in=[Issue.ACTION_PR_CART, Issue.ACTION_RELOCATE], fixed_at__isnull=True,
        ).count(),
        'estimated': sum(marks.values()),
        'back_stock': marks.get(ShrinkMark.OUTCOME_BACK_STOCK, 0),
    }


def inventories(limit: int = 50) -> list[dict]:
    """Every real inventory (the first version's day-less trials are left out), newest first.
    ``latest`` marks the one PR Fix-it and the shrink estimates still work on after it is done."""
    qs = list(
        InventoryCount.objects.filter(day__isnull=False).select_related('started_by', 'closed_by')
        .order_by('-started_at', '-pk')[:limit]
    )
    rows = [list_row(c) for c in qs]
    for i, row in enumerate(rows):
        row['latest'] = i == 0
    return rows


def order_estimates(count: InventoryCount) -> dict[str, Any]:
    """Per order: cost, sold so far, the found items still unsold ($ at tag price), and the not-found items
    estimated as back stock (still unsold). The page applies the X% and the back-stock toggle."""
    from .report import counted_ok_ids

    found = counted_ok_ids(count)
    back = set(
        ShrinkMark.objects.filter(count=count, outcome=ShrinkMark.OUTCOME_BACK_STOCK).values_list('item_id', flat=True)
    )
    per_po: dict[int, dict[str, Any]] = {}

    def add(ids, side):
        rows = (
            Item.objects.filter(pk__in=list(ids), purchase_order__isnull=False)
            .values_list('purchase_order_id', 'status', 'price', 'retail')
        )
        for po_id, status, price, retail in rows:
            g = per_po.setdefault(po_id, {
                'found': {'n': 0, 'price': ZERO, 'retail': ZERO}, 'found_sold': 0,
                'back_stock': {'n': 0, 'price': ZERO, 'retail': ZERO},
            })
            if status == 'sold':
                if side == 'found':
                    g['found_sold'] += 1
                continue
            t = g[side]
            t['n'] += 1
            t['price'] += price or ZERO
            t['retail'] += retail or ZERO

    add(found, 'found')
    add(back - found, 'back_stock')
    no_order = Item.objects.filter(pk__in=list(found), purchase_order__isnull=True).exclude(status='sold')
    no_order_n = no_order.count()
    no_order_price = sum((p or ZERO for p in no_order.values_list('price', flat=True)), ZERO)

    ids = list(per_po)
    sold = sold_by_po(ids)
    orders = {
        o['id']: o for o in PurchaseOrder.objects.filter(pk__in=ids).values(
            'id', 'order_number', 'vendor__code', 'vendor__name', 'ordered_date', 'delivered_date', 'status',
            'total_cost',
        )
    }
    out = []
    for po_id, g in per_po.items():
        o = orders.get(po_id)
        if o is None:
            continue
        out.append({
            'id': po_id, 'order_number': o['order_number'], 'vendor': o['vendor__code'] or o['vendor__name'] or '',
            'ordered_date': o['ordered_date'], 'delivered_date': o['delivered_date'], 'status': o['status'],
            'cost': _m(o['total_cost']), 'sold': _m(sold.get(po_id, ZERO)),
            'found': {k: (_m(v) if k != 'n' else v) for k, v in g['found'].items()},
            'found_sold_since': g['found_sold'],
            'back_stock': {k: (_m(v) if k != 'n' else v) for k, v in g['back_stock'].items()},
        })
    out.sort(key=lambda r: -Decimal(r['found']['price']))
    return {
        'count': {'id': count.pk, 'name': count.name, 'stage': stage(count)},
        'orders': out,
        'no_order': {'n': no_order_n, 'price': _m(no_order_price)},
        'back_stock_marked': len(back - found),
    }
