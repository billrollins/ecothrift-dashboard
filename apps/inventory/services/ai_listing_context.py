"""
Retrieve compact store listing examples for AI suggest-item prompts.

Merges similar sold comps (reuse narrowing similar to price_estimator) with
recent on-shelf / intake items for breadth.
"""

from __future__ import annotations

from typing import Any

from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Coalesce

from apps.inventory.models import Item
from apps.inventory.product_identity import identifier_value


def _annotate_listing_category(qs):
    """``Item`` has no ``category`` column — coalesce manifest row + product."""

    return qs.select_related('product', 'manifest_row').annotate(
        listing_category=Coalesce(
            F('manifest_row__category'),
            F('product__category'),
            Value(''),
            output_field=CharField(),
        )
    )


def _narrow_by_category_name(qs, category_name: str | None):
    if not category_name:
        return qs
    first = (category_name.split() or [''])[0]
    if not first:
        return qs
    return qs.filter(
        Q(manifest_row__category__icontains=first) | Q(product__category__icontains=first),
    )


def _truncate(s: str, max_len: int) -> str:
    s = (s or '').strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + '…'


def retrieve_listing_examples_for_prompt(
    title: str,
    brand: str | None = None,
    category_name: str | None = None,
    condition: str | None = None,
    *,
    max_examples: int = 8,
    title_max: int = 200,
) -> tuple[list[dict[str, Any]], int]:
    """
    Returns (store_examples, count_after_merge) for prompt injection.
    """
    sold_qs = (
        Item.objects.filter(status='sold')
        .exclude(sold_for__isnull=True)
        .exclude(sold_for=0)
    )

    sold_qs = _narrow_by_category_name(sold_qs, category_name)

    if brand and brand.strip():
        bq = sold_qs.filter(product__brand__icontains=brand.strip())
        if bq.count() >= 2:
            sold_qs = bq

    if condition and condition != 'unknown':
        cq = sold_qs.filter(condition=condition)
        if cq.count() >= 1:
            sold_qs = cq

    sold_rows = list(
        _annotate_listing_category(sold_qs)
        .select_related('product')
        .order_by('-sold_at')
        .values(
            'sku',
            'product__title',
            'product__brand',
            'listing_category',
            'condition',
            'sold_for',
            'sold_at',
            'product__model',
            'product__identifiers',
        )[:5]
    )

    recent_qs = Item.objects.filter(status__in=('on_shelf', 'intake', 'processing')).order_by(
        '-created_at',
    )
    recent_rows = list(
        _annotate_listing_category(recent_qs)
        .select_related('product')
        .values(
            'sku',
            'product__title',
            'product__brand',
            'listing_category',
            'condition',
            'created_at',
            'product__model',
            'product__identifiers',
        )[:3]
    )

    seen: set[str] = set()
    merged: list[dict[str, Any]] = []

    for row in sold_rows + recent_rows:
        sku = row.get('sku') or ''
        if sku in seen:
            continue
        seen.add(sku)
        ex: dict[str, Any] = {
            'kind': 'sold' if 'sold_for' in row else 'recent',
            'title': _truncate(row.get('product__title') or '', title_max),
            'brand': _truncate(str(row.get('product__brand') or ''), 80),
            'category': _truncate(str(row.get('listing_category') or ''), 80),
            'condition': row.get('condition') or 'unknown',
        }
        model = _truncate(str(row.get('product__model') or ''), 80)
        upc = _truncate(identifier_value(row.get('product__identifiers'), 'upc'), 32)
        if model:
            ex['model'] = model
        if upc:
            ex['upc'] = upc
        if row.get('sold_for') is not None:
            ex['sold_for'] = str(row['sold_for'])
        merged.append(ex)
        if len(merged) >= max_examples:
            break

    return merged, len(merged)
