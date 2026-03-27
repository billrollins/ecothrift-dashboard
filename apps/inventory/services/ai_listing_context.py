"""
Retrieve compact store listing examples for AI suggest-item prompts.

Merges similar sold comps (reuse narrowing similar to price_estimator) with
recent on-shelf / intake items for breadth.
"""

from __future__ import annotations

from typing import Any

from apps.inventory.models import Item


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

    if category_name:
        first = (category_name.split() or [''])[0]
        if first:
            sold_qs = sold_qs.filter(category__icontains=first)

    if brand and brand.strip():
        bq = sold_qs.filter(brand__icontains=brand.strip())
        if bq.count() >= 2:
            sold_qs = bq

    if condition and condition != 'unknown':
        cq = sold_qs.filter(condition=condition)
        if cq.count() >= 1:
            sold_qs = cq

    sold_rows = list(
        sold_qs.order_by('-sold_at').values(
            'sku', 'title', 'brand', 'category', 'condition', 'sold_for', 'sold_at',
        )[:5]
    )

    recent_qs = Item.objects.filter(status__in=('on_shelf', 'intake', 'processing')).order_by(
        '-created_at',
    )
    recent_rows = list(
        recent_qs.values('sku', 'title', 'brand', 'category', 'condition', 'created_at')[:3]
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
            'title': _truncate(row.get('title') or '', title_max),
            'brand': _truncate(str(row.get('brand') or ''), 80),
            'category': _truncate(str(row.get('category') or ''), 80),
            'condition': row.get('condition') or 'unknown',
        }
        if row.get('sold_for') is not None:
            ex['sold_for'] = str(row['sold_for'])
        merged.append(ex)
        if len(merged) >= max_examples:
            break

    return merged, len(merged)
