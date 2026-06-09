"""
Denormalized search blob for Item Processor workspace (``ProcessingRow.search_string``).

Lowercased, whitespace-collapsed string used with ``search_string__contains`` (query tokens also lowercased).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Mapping


def _append_json_values_only(obj: Any, parts: list[str]) -> None:
    """Recurse dict/list JSON; emit only primitive leaf values as trimmed strings."""

    if obj is None:
        return
    if isinstance(obj, dict):
        for v in obj.values():
            _append_json_values_only(v, parts)
    elif isinstance(obj, list):
        for v in obj:
            _append_json_values_only(v, parts)
    elif isinstance(obj, bool):
        parts.append('true' if obj else 'false')
    elif isinstance(obj, (int, float, Decimal)):
        parts.append(str(obj))
    elif isinstance(obj, str):
        t = obj.strip()
        if t:
            parts.append(t)


def _normalize_search_blob(text: str) -> str:
    return ' '.join(text.lower().split())


def build_processing_row_search_string(row: Any) -> str:
    """
    Compose ``ProcessingRow.search_string`` from bookmark columns and JSON blobs.

    We intentionally omit ``ai_reasoning`` — long, noisy, low value for shelf search —
    documented here so omission is deliberate, not an oversight.

    Accepts a ``ProcessingRow`` instance or a mapping-like object with the same keys.
    """

    def g(name: str) -> Any:
        if isinstance(row, Mapping):
            return row.get(name)
        return getattr(row, name)

    rn = int(g('row_number') or 0)
    parts: list[str] = [str(rn), f'row{rn}']

    for fname in (
        'title',
        'brand',
        'model',
        'category',
        'condition',
        'description',
        'notes',
        'pricing_notes',
        'list_sku',
    ):
        v = g(fname)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            parts.append(s)

    for json_field in ('identifiers', 'taxonomy', 'specifications', 'tracking'):
        _append_json_values_only(g(json_field), parts)

    stags = g('search_tags')
    _append_json_values_only(stags, parts)

    return _normalize_search_blob(' '.join(parts))


def augment_processing_row_search_string(
    base: str,
    *,
    product: Any | None = None,
    items: list[Any] | None = None,
) -> str:
    """Append linked Product identity and checked-in Item SKUs for workspace search."""

    parts: list[str] = []
    if product is not None:
        for attr in ('product_number', 'upc', 'model', 'title', 'brand'):
            val = getattr(product, attr, None) if not isinstance(product, Mapping) else product.get(attr)
            text = str(val or '').strip()
            if text:
                parts.append(text)
    for item in items or []:
        sku = getattr(item, 'sku', None) if not isinstance(item, Mapping) else item.get('sku')
        text = str(sku or '').strip()
        if text:
            parts.append(text)
    if not parts:
        return base
    return _normalize_search_blob(f'{base} {" ".join(parts)}')


def assign_search_strings_for_instances(
    rows: list[Any],
    *,
    products_by_id: dict[int, Any] | None = None,
    items_by_manifest_row: dict[int, list[Any]] | None = None,
) -> None:
    """Set ``search_string`` on each in-memory instance from current field values."""

    products_by_id = products_by_id or {}
    items_by_manifest_row = items_by_manifest_row or {}
    for r in rows:
        base = build_processing_row_search_string(r)
        mr_id = getattr(r, 'manifest_row_id', None) if not isinstance(r, Mapping) else r.get('manifest_row_id')
        prod = products_by_id.get(getattr(r, 'matched_product_id', None) or 0)
        if prod is None and getattr(r, 'matched_product_id', None):
            prod = products_by_id.get(int(r.matched_product_id))
        items = items_by_manifest_row.get(int(mr_id)) if mr_id else []
        r.search_string = augment_processing_row_search_string(base, product=prod, items=items)
