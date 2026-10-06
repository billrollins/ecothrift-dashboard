"""Potential shrink: the items an inventory expected and did not find, and what each one really is
(inventory_effort Phase 3, owner 2026-10-06).

- **The list** = expected (``counting.expected_ids``) minus counted. An item scanned later, or claimed in PR Fix-it,
  leaves it by itself.
- **Marks** (``ShrinkMark``): back stock, owner took, sold as generic, or shrink (stolen / broken / scrap). One per
  item per inventory; a bulk action shares a ``batch`` so it can be undone in one go. Items change only at close.
- **Groups**: by order, product, vendor (both Targets as one) or category, each with not found / expected, so an
  order or vendor that is mostly missing (often: all in back stock) stands out and can be marked in one action.
- **Category** is the product standard's (``ProductProfile.category``) when it is a real one, else the product's own.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Case, CharField, DecimalField, ExpressionWrapper, F, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.models import Item

from ..models import CountScan, InventoryCount, ShrinkMark
from .counting import BadRequest, counted_ids, expected_ids

OUTCOMES = dict(ShrinkMark.OUTCOME_CHOICES)
REAL_CATEGORIES = tuple(n for n in TAXONOMY_V1_CATEGORY_NAMES if n != MIXED_LOTS_UNCATEGORIZED)
# Vendors that are one in the owner's eyes (Request #11 merges TGT into TRGET; until then they group together).
VENDOR_ALIASES = {'TGT': 'TRGET'}
AGES = [  # (key, label, max days on the shelf)
    ('1w', 'Under 1 week', 7), ('1m', '1 week to 1 month', 31), ('2m', '1 to 2 months', 62), ('3m', '2 to 3 months', 92),
    ('6m', '3 to 6 months', 183), ('1y', '6 months to 1 year', 366), ('old', 'Over 1 year', None),
]
PRICE_BANDS = [('u5', 'Under $5', 0, 5), ('5', '$5 to $10', 5, 10), ('10', '$10 to $25', 10, 25),
               ('25', '$25 to $50', 25, 50), ('50', '$50 to $100', 50, 100), ('100', '$100 and up', 100, None)]
SORTS = {
    'sku': 'sku', 'title': 'title', 'order': 'order_number', 'vendor': 'vendor_key', 'category': 'category_name',
    'price': 'price', 'retail': 'retail', 'checked_in': 'age_from', 'outcome': 'outcome',
}
GROUPS = ('order', 'product', 'vendor', 'category')
MAX_PAGE = 200
NONE = '__none__'


def missing_ids(count: InventoryCount) -> set[int]:
    seen = counted_ids(count)
    return expected_ids(count, seen) - seen


def _vendor_key():
    whens = [When(purchase_order__vendor__code=old, then=Value(new)) for old, new in VENDOR_ALIASES.items()]
    return Coalesce(Case(*whens, default=F('purchase_order__vendor__code'), output_field=CharField()), Value(''))


def _category():
    return Coalesce(
        Case(When(product__profile__category__in=REAL_CATEGORIES, then=F('product__profile__category')),
             default=F('product__category__name'), output_field=CharField()),
        Value(''),
    )


def annotated(count: InventoryCount, ids):
    mark = ShrinkMark.objects.filter(count=count, item=OuterRef('pk'))
    return (
        Item.objects.filter(pk__in=list(ids))
        .annotate(
            title=F('product__title'),
            order_number=Coalesce(F('purchase_order__order_number'), Value('')),
            vendor_key=_vendor_key(),
            category_name=_category(),
            subcategory_name=Coalesce(F('product__profile__subcategory'), Value('')),
            age_from=Coalesce(F('checked_in_at'), F('listed_at'), F('created_at')),
            pct_value=Case(
                When(retail__gt=0, then=ExpressionWrapper(F('price') * 100 / F('retail'), output_field=DecimalField())),
                default=None, output_field=DecimalField(),
            ),
            outcome=Subquery(mark.values('outcome')[:1]),
            mark_note=Subquery(mark.values('note')[:1]),
        )
    )


def _filtered(qs, p: dict[str, Any]):
    q = str(p.get('q') or '').strip()
    for w in q.split()[:6]:
        qs = qs.filter(Q(sku__icontains=w) | Q(product__title__icontains=w) | Q(purchase_order__order_number__icontains=w))
    outcome = str(p.get('outcome') or 'open')
    if outcome == 'open':
        qs = qs.filter(outcome__isnull=True)
    elif outcome == 'marked':
        qs = qs.filter(outcome__isnull=False)
    elif outcome in OUTCOMES:
        qs = qs.filter(outcome=outcome)
    # '__none__' asks for the items with no vendor / order / category.
    for key, field in (('vendor', 'vendor_key'), ('order', 'order_number'), ('category', 'category_name'),
                       ('subcategory', 'subcategory_name')):
        if p.get(key):
            value = str(p[key])
            qs = qs.filter(**{field: '' if value == NONE else value})
    if p.get('product'):
        qs = qs.filter(product_id=int(p['product']))
    age = str(p.get('age') or '')
    keys = [a[0] for a in AGES]
    if age in keys:
        now = timezone.now()
        i = keys.index(age)
        lo = AGES[i - 1][2] if i > 0 else 0
        hi = AGES[i][2]
        qs = qs.filter(age_from__lte=now - timedelta(days=lo))
        if hi is not None:
            qs = qs.filter(age_from__gt=now - timedelta(days=hi))
    pct = str(p.get('pct') or '')
    if pct == 'none':
        qs = qs.filter(pct_value__isnull=True)
    elif pct:
        from .report import PCT_BUCKETS

        bucket = next((b for b in PCT_BUCKETS if b[0] == pct), None)
        if bucket:
            qs = qs.filter(pct_value__gte=bucket[2])
            if bucket[3] is not None:
                qs = qs.filter(pct_value__lt=bucket[3])
    band = next((b for b in PRICE_BANDS if b[0] == str(p.get('price_band') or '')), None)
    if band:
        qs = qs.filter(price__gte=band[2])
        if band[3] is not None:
            qs = qs.filter(price__lt=band[3])
    return qs


def _money(v) -> str:
    return str((v or Decimal('0')).quantize(Decimal('0.01')))


def _totals(rows) -> dict:
    """``rows`` = (outcome, price, retail). Open and each outcome: items, $ price, $ retail."""
    out = {k: {'n': 0, 'price': Decimal('0'), 'retail': Decimal('0')} for k in ['open', *OUTCOMES]}
    for outcome, price, retail in rows:
        t = out[outcome or 'open']
        t['n'] += 1
        t['price'] += price or 0
        t['retail'] += retail or 0
    return {k: {'n': v['n'], 'price': _money(v['price']), 'retail': _money(v['retail'])} for k, v in out.items()}


def _last_seen(count: InventoryCount, item_ids: list[int]) -> dict[int, str]:
    """The last time each item was counted in any earlier inventory."""
    rows = (
        CountScan.objects.filter(item_id__in=item_ids, result=CountScan.RESULT_OK, removed_at__isnull=True)
        .exclude(count=count).order_by('item_id', '-scanned_at').distinct('item_id').values_list('item_id', 'scanned_at')
    )
    return {i: t.isoformat() for i, t in rows}


def worklist(count: InventoryCount, params: dict[str, Any]) -> dict:
    """``scope``: ``missing`` (default: the not-found list) or ``counted`` (the report's items; ``person`` narrows
    them to who counted them)."""
    if str(params.get('scope') or 'missing') == 'counted':
        from .report import counted_ok_ids, person_item_ids

        ids = counted_ok_ids(count)
        if params.get('person'):
            ids &= person_item_ids(count, params['person'])
        params = {**params, 'outcome': params.get('outcome') or 'all'}
    else:
        ids = missing_ids(count)
    base = annotated(count, ids)
    totals = _totals(base.values_list('outcome', 'price', 'retail'))
    qs = _filtered(base, params)
    sort = str(params.get('sort') or '-price')
    field = SORTS.get(sort.lstrip('-'), 'price')
    qs = qs.order_by(F(field).desc(nulls_last=True) if sort.startswith('-') else F(field).asc(nulls_last=True), 'pk')
    page_size = max(1, min(int(params.get('page_size') or 50), MAX_PAGE))
    page = max(1, int(params.get('page') or 1))
    agg = _totals(qs.values_list('outcome', 'price', 'retail'))
    n = sum(v['n'] for v in agg.values())
    rows = list(qs.values(
        'pk', 'sku', 'title', 'order_number', 'vendor_key', 'category_name', 'subcategory_name', 'price', 'retail',
        'age_from', 'outcome', 'mark_note', 'product_id', 'location',
    )[(page - 1) * page_size: page * page_size])
    seen = _last_seen(count, [r['pk'] for r in rows])
    return {
        'count': {'id': count.pk, 'name': count.name, 'status': count.status},
        'totals': totals,
        'filtered': {'n': n, 'price': _money(sum(Decimal(v['price']) for v in agg.values())),
                     'retail': _money(sum(Decimal(v['retail']) for v in agg.values()))},
        'page': page, 'page_size': page_size, 'pages': max(1, -(-n // page_size)),
        'rows': [{
            'id': r['pk'], 'sku': r['sku'], 'title': r['title'], 'order': r['order_number'], 'vendor': r['vendor_key'],
            'category': r['category_name'], 'subcategory': r['subcategory_name'], 'price': _money(r['price']),
            'retail': _money(r['retail']) if r['retail'] is not None else None,
            'checked_in': r['age_from'].isoformat() if r['age_from'] else None, 'outcome': r['outcome'] or '',
            'note': r['mark_note'] or '', 'product_id': r['product_id'], 'location': r['location'],
            'last_seen': seen.get(r['pk']),
        } for r in rows],
        'outcomes': [{'key': k, 'label': v} for k, v in OUTCOMES.items()],
        'ages': [{'key': k, 'label': lab} for k, lab, _ in AGES],
        'price_bands': [{'key': k, 'label': lab} for k, lab, _, _ in PRICE_BANDS],
    }


def groups(count: InventoryCount, by: str) -> list[dict]:
    """Expected items grouped by order, product, vendor or category: not found / expected, $, outcomes.
    Biggest first (the most items not found), so a load that is mostly in back stock is at the top."""
    if by not in GROUPS:
        raise BadRequest(f'Group by one of {", ".join(GROUPS)}.')
    seen = counted_ids(count)
    expected = expected_ids(count, seen)
    missing = expected - seen
    key_field, label_field = {
        'order': ('order_number', 'order_number'), 'product': ('product_id', 'title'),
        'vendor': ('vendor_key', 'vendor_key'), 'category': ('category_name', 'category_name'),
    }[by]
    out: dict[Any, dict] = defaultdict(lambda: {
        'expected': 0, 'missing': 0, 'open': 0, 'price': Decimal('0'), 'retail': Decimal('0'),
        'open_price': Decimal('0'), 'outcomes': defaultdict(int), 'label': '',
    })
    fields = ['pk', key_field, 'price', 'retail', 'outcome'] + ([label_field] if label_field != key_field else [])
    for row in annotated(count, expected).values_list(*fields):
        pk, key, price, retail, outcome = row[:5]
        label = row[5] if len(row) > 5 else key
        g = out[key]
        g['label'] = label or ''
        g['expected'] += 1
        if pk in missing:
            g['missing'] += 1
            g['price'] += price or 0
            g['retail'] += retail or 0
            if outcome:
                g['outcomes'][outcome] += 1
            else:
                g['open'] += 1
                g['open_price'] += price or 0
    result = []
    for key, g in out.items():
        if not g['missing']:
            continue
        result.append({
            'key': key if key is not None else '', 'label': g['label'] or '(none)',
            'expected': g['expected'], 'missing': g['missing'], 'open': g['open'],
            'missing_pct': round(100 * g['missing'] / g['expected'], 1) if g['expected'] else 0,
            'price': _money(g['price']), 'retail': _money(g['retail']), 'open_price': _money(g['open_price']),
            'outcomes': dict(g['outcomes']),
        })
    result.sort(key=lambda r: (-r['missing'], -r['missing_pct']))
    return result


def _target_ids(count: InventoryCount, body: dict[str, Any]) -> list[int]:
    """Which items an action is for: listed ids, everything in a filter, or one group's open items."""
    ids = missing_ids(count)
    if body.get('item_ids'):
        wanted = {int(i) for i in body['item_ids']}
        return sorted(wanted & ids)
    if isinstance(body.get('filter'), dict):
        return list(_filtered(annotated(count, ids), body['filter']).values_list('pk', flat=True))
    group = body.get('group')
    if isinstance(group, dict) and group.get('by') in GROUPS:
        field = {'order': 'order_number', 'product': 'product_id', 'vendor': 'vendor_key', 'category': 'category_name'}[group['by']]
        key = group.get('key')
        key = int(key) if field == 'product_id' and key not in (None, '') else (key or '')
        qs = annotated(count, ids).filter(outcome__isnull=True, **{field: key})
        return list(qs.values_list('pk', flat=True))
    raise BadRequest('Say which items: item_ids, a filter or a group.')


@transaction.atomic
def mark(count: InventoryCount, *, user, body: dict[str, Any]) -> dict:
    outcome = str(body.get('outcome') or '')
    if outcome not in OUTCOMES:
        raise BadRequest('Pick what it is: back stock, owner took, sold as generic, or shrink.')
    ids = _target_ids(count, body)
    if not ids:
        return {'marked': 0, 'batch': ''}
    batch = uuid.uuid4().hex
    note = str(body.get('note') or '')[:300]
    ShrinkMark.objects.filter(count=count, item_id__in=ids).delete()
    ShrinkMark.objects.bulk_create([
        ShrinkMark(count=count, item_id=i, outcome=outcome, note=note, batch=batch, marked_by=user) for i in ids
    ], batch_size=1000)
    return {'marked': len(ids), 'batch': batch, 'outcome': outcome}


@transaction.atomic
def unmark(count: InventoryCount, *, body: dict[str, Any]) -> dict:
    qs = ShrinkMark.objects.filter(count=count)
    if body.get('batch'):
        qs = qs.filter(batch=str(body['batch']))
    elif body.get('item_ids'):
        qs = qs.filter(item_id__in=[int(i) for i in body['item_ids']])
    else:
        raise BadRequest('Say which marks to undo: a batch or item_ids.')
    n, _ = qs.delete()
    return {'unmarked': n}
