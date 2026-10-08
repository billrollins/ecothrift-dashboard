"""The inventory report (inventory_effort Phase 4, owner 2026-10-06): what we have, who counted it, and how it breaks
down by any dimension, side by side with what was not found.

- **Counted** = items with a good ``ok`` scan (on the shelf when scanned). **Not found** = ``shrink.missing_ids``.
- **Totals:** items, $ price, $ retail, price as % of retail (weighted: sum of price over sum of retail, items with
  a retail only), coverage (counted of expected), scans, runs, hours, problems, fixed.
- **By person:** runs, bad runs, hours scanning, items (first good scan wins), $, items per hour, problems found.
- **Breakdown:** group by category, subcategory, vendor (both Targets as one), order, age on the shelf, price as %
  of retail, price band or person; each row has counted and not found (items, $ price, $ retail).
- **Price as % of retail** buckets follow the real distribution of the first full count (10-05): peaks at 25%, 35%
  and 50% (the pricing tiers), so the edges are 20 / 30 / 40 / 50 / 60. A 1% histogram is there too.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db.models import Count
from django.utils import timezone

from ..models import CountScan, InventoryCount, Issue, Run
from .counting import BadRequest, expected_ids, good_scans, person
from .shrink import AGES, PRICE_BANDS, annotated, missing_ids

PCT_BUCKETS = [  # (key, label, from %, to %)
    ('u20', 'Under 20%', 0, 20), ('20', '20 to 29%', 20, 30), ('30', '30 to 39%', 30, 40), ('40', '40 to 49%', 40, 50),
    ('50', '50 to 59%', 50, 60), ('60', '60% and up', 60, None),
]
BREAKDOWNS = ('category', 'subcategory', 'vendor', 'order', 'age', 'pct', 'price_band', 'person')
HIST_MAX = 120


def counted_ok_ids(count: InventoryCount) -> set[int]:
    return set(good_scans(count).filter(result=CountScan.RESULT_OK, item__isnull=False).values_list('item_id', flat=True))


def counted_by(count: InventoryCount) -> dict[int, int | None]:
    """Who counted each item: the person on its first good ``ok`` scan."""
    rows = (
        good_scans(count).filter(result=CountScan.RESULT_OK, item__isnull=False)
        .order_by('item_id', 'scanned_at', 'id').distinct('item_id').values_list('item_id', 'run__user_id')
    )
    return dict(rows)


def _d(v) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v or 0))


def _m(v) -> str:
    return str(_d(v).quantize(Decimal('0.01')))


def pct_key(price, retail) -> str:
    if not retail or _d(retail) <= 0:
        return 'none'
    pct = 100 * _d(price) / _d(retail)
    for key, _label, lo, hi in PCT_BUCKETS:
        if pct >= lo and (hi is None or pct < hi):
            return key
    return 'none'


def age_key(when, now) -> str:
    if when is None:
        return 'old'
    days = (now - when).days
    for key, _label, top in AGES:
        if top is None or days < top:
            return key
    return 'old'


def band_key(price) -> str:
    p = _d(price)
    for key, _label, lo, hi in PRICE_BANDS:
        if p >= lo and (hi is None or p < hi):
            return key
    return PRICE_BANDS[-1][0]


def _rows(count: InventoryCount, ids):
    return annotated(count, ids).values_list(
        'pk', 'price', 'retail', 'category_name', 'subcategory_name', 'vendor_key', 'order_number', 'age_from',
    )


# Live on every read, even from the kept report: PR Fix-it keeps working after an inventory is done.
LIVE_KEYS = ('id', 'name', 'status', 'day', 'started_at', 'closed_at', 'problems', 'fixed')


def summary(count: InventoryCount) -> dict[str, Any]:
    """The Summary tab. A done inventory keeps it in ``summary_cache['report']`` (counts stop moving at End), with
    the problems and fixed numbers read live."""
    if count.status == InventoryCount.STATUS_CLOSED:
        kept = (count.summary_cache or {}).get('report')
        if kept is None:
            kept = {k: v for k, v in _summary(count).items() if k not in LIVE_KEYS}
            InventoryCount.objects.filter(pk=count.pk).update(summary_cache={**(count.summary_cache or {}), 'report': kept})
        issues = count.issues.exclude(run__status=Run.STATUS_BAD).exclude(action=Issue.ACTION_CLEARED)
        return {
            'id': count.pk, 'name': count.name, 'status': count.status, 'day': count.day,
            'started_at': count.started_at, 'closed_at': count.closed_at,
            **kept,
            'problems': issues.count(), 'fixed': issues.filter(fixed_at__isnull=False).count(),
        }
    return _summary(count)


def _summary(count: InventoryCount) -> dict[str, Any]:
    ok = counted_ok_ids(count)
    expected = expected_ids(count)
    missing = missing_ids(count)
    price = retail = priced_with_retail = Decimal('0')
    item_price: dict[int, tuple[Decimal, Decimal]] = {}
    for pk, p, r, *_rest in _rows(count, ok):
        item_price[pk] = (_d(p), _d(r))
        price += _d(p)
        if r and _d(r) > 0:
            retail += _d(r)
            priced_with_retail += _d(p)
    m_price = m_retail = Decimal('0')
    for _pk, p, r, *_rest in _rows(count, missing):
        m_price += _d(p)
        m_retail += _d(r)

    now = timezone.now()
    runs = list(count.runs.select_related('user'))
    issues = count.issues.exclude(run__status=Run.STATUS_BAD).exclude(action=Issue.ACTION_CLEARED)
    who = counted_by(count)
    people: dict[int | None, dict] = defaultdict(lambda: {
        'name': '', 'runs': 0, 'bad_runs': 0, 'seconds': 0.0, 'items': 0, 'price': Decimal('0'), 'retail': Decimal('0'),
        'problems': 0,
    })
    for r in runs:
        p = people[r.user_id]
        p['name'] = person(r.user) or 'Someone'
        p['runs'] += 1
        if r.status == Run.STATUS_BAD:
            p['bad_runs'] += 1
            continue
        end = r.stopped_at or now
        p['seconds'] += max(0.0, (end - r.started_at).total_seconds())
    for item_id, user_id in who.items():
        pr = item_price.get(item_id)
        if pr is None:
            continue
        p = people[user_id]
        p['items'] += 1
        p['price'] += pr[0]
        p['retail'] += pr[1]
    for user_id, n in issues.values_list('created_by_id').annotate(n=Count('id')):
        people[user_id]['problems'] += n
    by_person = []
    for user_id, p in people.items():
        hours = p['seconds'] / 3600
        by_person.append({
            'user_id': user_id, 'name': p['name'] or 'Someone', 'runs': p['runs'], 'bad_runs': p['bad_runs'],
            'hours': round(hours, 2), 'items': p['items'], 'price': _m(p['price']), 'retail': _m(p['retail']),
            'items_per_hour': round(p['items'] / hours) if hours > 0 else None, 'problems': p['problems'],
        })
    by_person.sort(key=lambda x: -x['items'])
    total_seconds = sum(p['seconds'] for p in people.values())
    return {
        'id': count.pk, 'name': count.name, 'status': count.status, 'day': count.day,
        'started_at': count.started_at, 'closed_at': count.closed_at,
        'counted': {'n': len(ok), 'price': _m(price), 'retail': _m(retail),
                    'price_pct_of_retail': round(float(100 * priced_with_retail / retail), 1) if retail else None},
        'not_found': {'n': len(missing), 'price': _m(m_price), 'retail': _m(m_retail)},
        'expected': len(expected),
        'coverage_pct': round(100 * len(ok & expected) / len(expected), 1) if expected else None,
        'scans': good_scans(count).count(),
        'runs': len(runs), 'bad_runs': sum(1 for r in runs if r.status == Run.STATUS_BAD),
        'hours': round(total_seconds / 3600, 1),
        'problems': issues.count(),
        'fixed': issues.filter(fixed_at__isnull=False).count(),
        'by_person': by_person,
        'breakdowns': list(BREAKDOWNS),
        'pct_buckets': [{'key': k, 'label': lab} for k, lab, _, _ in PCT_BUCKETS] + [{'key': 'none', 'label': 'No retail'}],
    }


def breakdown(count: InventoryCount, by: str) -> list[dict]:
    """Counted and not found side by side, per group. Biggest first ($ at price, counted + not found)."""
    if by not in BREAKDOWNS:
        raise BadRequest(f'Break down by one of {", ".join(BREAKDOWNS)}.')
    now = timezone.now()
    labels = {
        'age': {k: lab for k, lab, _ in AGES},
        'pct': {**{k: lab for k, lab, _, _ in PCT_BUCKETS}, 'none': 'No retail'},
        'price_band': {k: lab for k, lab, _, _ in PRICE_BANDS},
    }
    order = {
        'age': [k for k, _, _ in AGES],
        'pct': [k for k, _, _, _ in PCT_BUCKETS] + ['none'],
        'price_band': [k for k, _, _, _ in PRICE_BANDS],
    }
    who = counted_by(count) if by == 'person' else {}
    names: dict[Any, str] = {}
    if by == 'person':
        for r in count.runs.select_related('user'):
            names[r.user_id] = person(r.user) or 'Someone'
    out: dict[Any, dict] = defaultdict(lambda: {
        'counted': {'n': 0, 'price': Decimal('0'), 'retail': Decimal('0')},
        'not_found': {'n': 0, 'price': Decimal('0'), 'retail': Decimal('0')},
    })

    def key_of(pk, price, retail, cat, sub, vendor, order_number, age_from):
        if by == 'category':
            return cat or ''
        if by == 'subcategory':
            return f'{cat} › {sub}' if sub else (f'{cat} › (none)' if cat else '')
        if by == 'vendor':
            return vendor or ''
        if by == 'order':
            return order_number or ''
        if by == 'age':
            return age_key(age_from, now)
        if by == 'pct':
            return pct_key(price, retail)
        if by == 'price_band':
            return band_key(price)
        return who.get(pk)

    sides = [('counted', counted_ok_ids(count))]
    if by != 'person':
        sides.append(('not_found', missing_ids(count)))
    for side, ids in sides:
        for row in _rows(count, ids):
            g = out[key_of(*row)][side]
            g['n'] += 1
            g['price'] += _d(row[1])
            g['retail'] += _d(row[2])

    result = []
    for key, g in out.items():
        if by in labels:
            label = labels[by].get(key, key)
        elif by == 'person':
            label = names.get(key, 'Someone')
        else:
            label = key or '(none)'
        result.append({
            'key': key if key is not None else '', 'label': label,
            'counted': {k: (_m(v) if k != 'n' else v) for k, v in g['counted'].items()},
            'not_found': {k: (_m(v) if k != 'n' else v) for k, v in g['not_found'].items()},
        })
    if by in order:
        rank = {k: i for i, k in enumerate(order[by])}
        result.sort(key=lambda r: rank.get(r['key'], 99))
    else:
        result.sort(key=lambda r: -(Decimal(r['counted']['price']) + Decimal(r['not_found']['price'])))
    return result


def histogram(count: InventoryCount) -> dict[str, Any]:
    """Price as % of retail in 1% steps (0 to 120; above folds into 120), counted and not found."""
    bins = {side: [0] * (HIST_MAX + 1) for side in ('counted', 'not_found')}
    no_retail = {'counted': 0, 'not_found': 0}
    for side, ids in (('counted', counted_ok_ids(count)), ('not_found', missing_ids(count))):
        for _pk, price, retail, *_rest in _rows(count, ids):
            if not retail or _d(retail) <= 0:
                no_retail[side] += 1
                continue
            pct = int(100 * _d(price) / _d(retail))
            bins[side][min(HIST_MAX, max(0, pct))] += 1
    return {'max': HIST_MAX, 'bins': bins, 'no_retail': no_retail}


def person_item_ids(count: InventoryCount, user_id) -> set[int]:
    return {i for i, u in counted_by(count).items() if str(u) == str(user_id)}

