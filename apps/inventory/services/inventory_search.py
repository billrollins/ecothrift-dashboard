"""
Inventory search (owner, 2026-10-02): one box, one table, one row per product, under a second.

- **What is searched:** `Product.search_text`, one lowercased line per product built from the product (title, brand,
  model, product number, UPC) and its standard (title, tag name, brand, model, category, subcategory, aliases). A
  trigram index answers "every word appears somewhere in it".
- **A SKU** (typed or scanned) goes straight to that item's product.
- **Numbers** (on shelf, price range, sold, average sold price, days to sell) are computed only for the page shown.
- **Nothing found:** the closest products by spelling are offered instead (`fuzzy`).

`rebuild_search_text` keeps the line current: a product or profile save calls it for that product; the bulk loaders
call it for their chunk; `python manage.py rebuild_product_search` redoes everything.
"""
from __future__ import annotations

import re
import time
from typing import Any

from django.db import connection
from django.db.models import (
    Avg, Case, Count, DurationField, Exists, ExpressionWrapper, F, IntegerField, Max, Min, OuterRef, Q, When,
)

from django.db.models import Value
from django.db.models.functions import StrIndex

from apps.inventory.models import Item, Product, ProductProfile

PAGE_SIZE = 50
COUNT_CAP = 2000
ITEMS_CAP = 300
ON_SHELF = 'on_shelf'

_TEXT_SQL = """
    left(lower(concat_ws(' ',
        p2.title, p2.brand, p2.model, p2.product_number, p2.identifiers->>'upc',
        pp.display_title, pp.short_name, pp.brand, pp.model_number, pp.category, pp.subcategory,
        regexp_replace(coalesce(pp.aliases::text, ''), '[\\[\\]{}":,]+', ' ', 'g')
    )), 3000)
"""


def rebuild_search_text(product_ids: list[int] | None = None) -> int:
    """Rewrite `Product.search_text` for these products (all of them when None). Returns the rows changed."""
    if product_ids is not None and not product_ids:
        return 0
    where = '' if product_ids is None else 'WHERE p2.id = ANY(%s)'
    sql = f"""
        UPDATE inventory_product p SET search_text = s.t
        FROM (
            SELECT p2.id, {_TEXT_SQL} AS t
            FROM inventory_product p2
            LEFT JOIN inventory_productprofile pp ON pp.product_id = p2.id
            {where}
        ) s
        WHERE s.id = p.id AND p.search_text IS DISTINCT FROM s.t
    """
    with connection.cursor() as cur:
        cur.execute(sql, [] if product_ids is None else [list(product_ids)])
        return cur.rowcount


def rebuild_all(batch: int = 20000, log=None) -> int:
    """Everything, in id ranges, so no product row stays locked for long."""
    changed = 0
    last = 0
    while True:
        ids = list(Product.objects.filter(pk__gt=last).order_by('pk').values_list('pk', flat=True)[:batch])
        if not ids:
            return changed
        changed += rebuild_search_text(ids)
        last = ids[-1]
        if log:
            log(f'{last:,}: {changed:,} changed')


def _words(q: str) -> list[str]:
    return [w for w in re.split(r'\s+', q.lower().strip()) if w][:8]


def _stats(ids: list[int]) -> dict[int, dict[str, Any]]:
    shelf, sold = Q(status=ON_SHELF), Q(sold_at__isnull=False)
    days = ExpressionWrapper(F('sold_at') - F('listed_at'), output_field=DurationField())
    rows = Item.objects.filter(product_id__in=ids).values('product_id').annotate(
        items=Count('id'), on_shelf=Count('id', filter=shelf),
        price_min=Min('price', filter=shelf), price_max=Max('price', filter=shelf),
        sold=Count('id', filter=sold), avg_sold=Avg('sold_for', filter=sold), last_sold_at=Max('sold_at'),
        avg_days=Avg(days, filter=sold & Q(listed_at__isnull=False, listed_at__lte=F('sold_at'))),
    )
    return {r['product_id']: r for r in rows}


def _rows(products: list[Product], matched_sku: dict[int, str] | None = None) -> list[dict[str, Any]]:
    ids = [p.pk for p in products]
    stats = _stats(ids)
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(product_id__in=ids).only(
        'product_id', 'display_title', 'short_name', 'brand', 'category', 'subcategory', 'key_specs')}
    out = []
    for p in products:
        s, pr = stats.get(p.pk, {}), profiles.get(p.pk)
        out.append({
            'product_id': p.pk,
            'product_number': p.product_number or '',
            'title': (pr.display_title if pr and pr.display_title else p.title),
            'original_title': p.title,
            'tag_name': pr.short_name if pr else '',
            'brand': (pr.brand if pr and pr.brand else p.brand) or '',
            'model': p.model or '',
            'category': pr.category if pr else '',
            'subcategory': pr.subcategory if pr else '',
            'specs': pr.key_specs if pr and isinstance(pr.key_specs, dict) else {},
            'upc': p.primary_upc,
            'items': s.get('items') or 0,
            'on_shelf': s.get('on_shelf') or 0,
            'price_min': s.get('price_min'),
            'price_max': s.get('price_max'),
            'sold': s.get('sold') or 0,
            'avg_sold': round(s['avg_sold'], 2) if s.get('avg_sold') is not None else None,
            'avg_days_to_sell': round(s['avg_days'].total_seconds() / 86400, 1) if s.get('avg_days') is not None else None,
            'last_sold_at': s.get('last_sold_at'),
            'matched_sku': (matched_sku or {}).get(p.pk, ''),
        })
    return out


def search(q: str, *, include_sold: bool = False, page: int = 1, page_size: int = PAGE_SIZE) -> dict[str, Any]:
    """One page of products for `q`. `include_sold` also shows products with nothing on the shelf."""
    started = time.perf_counter()
    q = (q or '').strip()[:200]
    page = max(1, page)
    items = Item.objects.filter(product=OuterRef('pk'))
    has_shelf = Exists(items.filter(status=ON_SHELF))

    matched_sku: dict[int, str] = {}
    first: list[Product] = []
    if q and ' ' not in q:
        hit = Item.objects.filter(sku__iexact=q).select_related('product').first()
        if hit is not None and hit.product_id:
            matched_sku[hit.product_id] = hit.sku
            first = [hit.product]

    qs = Product.objects.filter(is_active=True).annotate(has_shelf=has_shelf)
    for word in _words(q):
        qs = qs.filter(search_text__contains=word)
    qs = qs.filter(has_shelf=True) if not include_sold else qs.filter(Exists(items))
    if first:
        qs = qs.exclude(pk=first[0].pk)
    words = _words(q)
    if words:
        # The line starts with the product's title, so "ninja blender" puts the Ninja blender before an accessory
        # that only mentions Ninja at its end.
        qs = qs.annotate(pos=StrIndex('search_text', Value(words[0]))).order_by('-has_shelf', 'pos', '-pk')
    else:
        qs = qs.order_by('-pk')

    count = len(qs.values_list('pk')[:COUNT_CAP + 1]) + len(first)
    offset = (page - 1) * page_size
    take = page_size - (len(first) if page == 1 else 0)
    start = max(0, offset - len(first)) if page > 1 else 0
    products = (first if page == 1 else []) + list(qs[start:start + take])

    fuzzy = False
    if not products and q and page == 1:
        close = Product.objects.filter(is_active=True, search_text__trigram_word_similar=q)
        close = close.filter(Exists(items)) if include_sold else close.filter(has_shelf)
        products = list(close[:20])
        fuzzy, count = bool(products), len(products)

    return {
        'q': q, 'page': page, 'page_size': page_size,
        'count': min(count, COUNT_CAP), 'more': count > COUNT_CAP, 'fuzzy': fuzzy,
        'results': _rows(products, matched_sku),
        'took_ms': round((time.perf_counter() - started) * 1000),
    }


def product_items(product_id: int, *, include_sold: bool = True) -> dict[str, Any]:
    """The items of one product, on the shelf first, then newest."""
    qs = Item.objects.filter(product_id=product_id)
    if not include_sold:
        qs = qs.filter(status=ON_SHELF)
    total = qs.count()
    shelf_first = Case(When(status=ON_SHELF, then=0), default=1, output_field=IntegerField())
    rows = list(qs.order_by(shelf_first, '-checked_in_at', '-id').values(
        'id', 'sku', 'price', 'retail', 'status', 'condition', 'location', 'check_in_id', 'purchase_order_id',
        'purchase_order__order_number', 'checked_in_at', 'listed_at', 'sold_at', 'sold_for', 'label_printed_at',
    )[:ITEMS_CAP])
    for r in rows:
        r['order_number'] = r.pop('purchase_order__order_number') or ''
    return {'product_id': product_id, 'count': total, 'items': rows}
