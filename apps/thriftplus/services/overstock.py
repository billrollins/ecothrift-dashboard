"""
The overstock list (rulebook P6, owner 2026-10-19): every product with ``group_min_units`` (10) or more units on the
floor and more than ``overstock_days`` (365) of supply, by the engine's own measure (``rewards.Pace``: floor units ÷
sales a day, as if one more sold now, over the real age of its oldest floor unit, 7 to 90 days). Products not yet
marked come first, then the biggest tag dollars. The owner marks one action per lot (back stock, bundle, dollar bin,
liquidate, donate, keep), stamped who and when; staff do the physical work. The list never changes ThriftBucks.

Flags on a row:
- **cost**: the cost is 40% of the tag or more, so the lot was bought to sell near the tag;
- **mixed**: the tags vary more than 2×, so the product may hold unlike items under one name: split it in
  Inventory before deciding.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Max, Min, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.thriftplus.models import OverstockMark
from apps.thriftplus.services.rewards import HORIZON, Pace, Rules, rules, sales_window

COST_SHARE = Decimal('0.40')
MIXED_SPREAD = Decimal('2')
ZERO = Decimal('0')
UNDECIDED = 'undecided'
ACTIONS = dict(OverstockMark.ACTION_CHOICES)
PAGE = 50


class OverstockError(Exception):
    pass


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal('0.01')))


def rows(rules_: Rules | None = None) -> list[dict]:
    """Every overstock lot right now, in the list's order."""
    from apps.inventory.models import Item, Product

    rules_ = rules_ or rules()
    today = timezone.localdate()
    now = timezone.now()
    floor = list(
        Item.objects.filter(status='on_shelf').exclude(source='consignment').values('product_id')
        .annotate(n=Count('id'), tag=Sum('price'), lo=Min('price'), hi=Max('price'), retail_sum=Sum('retail'),
                  retail_n=Count('retail'), cost_sum=Sum('cost'), cost_n=Count('cost'),
                  oldest=Min(Coalesce('listed_at', 'checked_in_at', 'created_at')),
                  newest=Max(Coalesce('listed_at', 'checked_in_at', 'created_at')))
        .filter(n__gte=rules_.group_min_units, product_id__isnull=False)
    )
    if not floor:
        return []
    pids = [r['product_id'] for r in floor]
    sold: dict[int, list] = defaultdict(list)
    for pid, sold_at in (Item.objects.filter(status='sold', product_id__in=pids, sold_at__gte=now - timedelta(days=180))
                         .values_list('product_id', 'sold_at')):
        sold[pid].append(timezone.localdate(sold_at))
    out = []
    for r in floor:
        pid = r['product_id']
        oldest = timezone.localdate(r['oldest'])
        window = sales_window(oldest, today)
        dates = sold.get(pid, [])
        pace = Pace(units=r['n'], sold_recent=sum(1 for d in dates if d >= today - timedelta(days=window)), window=window,
                    min_units=rules_.group_min_units, supply_days=rules_.supply_days)
        if pace.days_of_supply <= rules_.overstock_days:
            continue
        units = r['n']
        tag = r['tag'] or ZERO
        avg = tag / units
        cost_avg = (r['cost_sum'] / r['cost_n']) if r['cost_n'] and r['cost_sum'] is not None else None
        flags = []
        if cost_avg is not None and avg > 0 and cost_avg >= avg * COST_SHARE:
            flags.append({'key': 'cost', 'text': f'Cost is about {(cost_avg / avg * 100).quantize(Decimal("1"))}% of the tag: '
                                                 'it was bought to sell near the tag.'})
        if r['lo'] and r['lo'] > 0 and r['hi'] > r['lo'] * MIXED_SPREAD:
            flags.append({'key': 'mixed', 'text': f'Tags run ${r["lo"]:.2f} to ${r["hi"]:.2f}: it may be unlike items under '
                                                  'one name. Split it in Inventory first.'})
        out.append({
            'product_id': pid, 'units': units, 'tag_total': _money(tag), 'price_avg': _money(avg),
            'price_min': _money(r['lo'] or ZERO), 'price_max': _money(r['hi'] or ZERO),
            'retail_avg': _money(r['retail_sum'] / r['retail_n']) if r['retail_n'] and r['retail_sum'] is not None else None,
            'cost_avg': _money(cost_avg) if cost_avg is not None else None,
            'age_oldest': (today - oldest).days + 1,
            'age_newest': (today - timezone.localdate(r['newest'])).days + 1 if r['newest'] else None,
            'sold_90': sum(1 for d in dates if d > today - timedelta(days=HORIZON)), 'sold_180': len(dates),
            'per_90': str((pace.per_day * 90).quantize(Decimal('0.1'))),
            'days_of_supply': int(pace.days_of_supply.to_integral_value()),
            'flags': flags,
        })
    info = {p['pk']: p for p in Product.objects.filter(pk__in=[r['product_id'] for r in out])
            .values('pk', 'title', 'brand', 'category__name')}
    marks = {m.product_id: m for m in OverstockMark.objects.filter(product_id__in=[r['product_id'] for r in out])
             .select_related('marked_by')}
    for r in out:
        p = info.get(r['product_id'], {})
        r.update({'title': p.get('title') or f"Product {r['product_id']}", 'brand': p.get('brand') or '',
                  'category': p.get('category__name') or ''})
        m = marks.get(r['product_id'])
        r['mark'] = None if m is None else {
            'action': m.action, 'label': ACTIONS.get(m.action, m.action), 'note': m.note,
            'by': (m.marked_by.full_name or m.marked_by.email) if m.marked_by else '',
            'at': m.marked_at.isoformat(),
        }
    out.sort(key=lambda r: (r['mark'] is not None, -Decimal(r['tag_total']), -r['units'], r['product_id']))
    return out


def listing(*, show: str = UNDECIDED, q: str = '', offset: int = 0, limit: int = PAGE) -> dict:
    """The page: the lots to show (not yet marked, all, or one action), a page at a time, with the totals."""
    if show not in (UNDECIDED, 'all', *ACTIONS):
        raise OverstockError('Show undecided, all, or one action.')
    rules_ = rules()
    all_rows = rows(rules_)
    shown = all_rows
    if show == UNDECIDED:
        shown = [r for r in all_rows if r['mark'] is None]
    elif show != 'all':
        shown = [r for r in all_rows if r['mark'] and r['mark']['action'] == show]
    if q:
        ql = q.lower()
        shown = [r for r in shown if ql in r['title'].lower() or ql in r['category'].lower() or ql in r['brand'].lower()]
    by_action = defaultdict(int)
    for r in all_rows:
        by_action[r['mark']['action'] if r['mark'] else UNDECIDED] += 1
    return {
        'total': len(all_rows), 'undecided': by_action[UNDECIDED],
        'counts': {k: by_action.get(k, 0) for k in (UNDECIDED, *ACTIONS)},
        'units': sum(r['units'] for r in all_rows),
        'tag_total': _money(sum((Decimal(r['tag_total']) for r in all_rows), ZERO)),
        'settings': {'group_min_units': rules_.group_min_units, 'overstock_days': rules_.overstock_days},
        'matching': len(shown), 'rows': shown[offset:offset + limit],
    }


def mark(product_id: int, action: str, *, by, note: str = '') -> OverstockMark | None:
    """The owner's action on a lot, stamped; ``clear`` removes it."""
    from apps.inventory.models import Product

    if not Product.objects.filter(pk=product_id).exists():
        raise OverstockError('No such product.')
    if action == 'clear':
        OverstockMark.objects.filter(product_id=product_id).delete()
        return None
    if action not in ACTIONS:
        raise OverstockError('Back stock, bundle, dollar bin, liquidate, donate, keep, or clear.')
    m, _ = OverstockMark.objects.update_or_create(
        product_id=product_id,
        defaults={'action': action, 'note': (note or '')[:200], 'marked_by': by, 'marked_at': timezone.now()},
    )
    return m
