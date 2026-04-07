"""Normalize raw manifest rows from B-Stock or marketplace APIs into ManifestRow field dicts."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


def _str_or_empty(v: Any) -> str:
    if v is None:
        return ''
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _to_int(v: Any) -> int | None:
    if v is None or v == '':
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(str(v)))
        except (TypeError, ValueError):
            return None


def _to_decimal(v: Any) -> Decimal | None:
    if v is None or v == '':
        return None
    if isinstance(v, Decimal):
        return v
    try:
        s = str(v).replace(',', '').strip()
        if not s:
            return None
        return Decimal(s)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _flatten_manifest_attributes(raw_row: dict[str, Any]) -> dict[str, Any]:
    """Merge top-level keys with order-process ``attributes`` sub-object when present."""
    merged = dict(raw_row)
    attr = raw_row.get('attributes')
    if isinstance(attr, dict):
        for k, v in attr.items():
            if k not in merged or merged.get(k) in (None, ''):
                merged[k] = v
        desc = attr.get('description')
        if desc and not merged.get('title'):
            merged['title'] = desc
    return merged


def normalize_manifest_row(raw_row: dict[str, Any]) -> dict[str, Any]:
    """
    Map one raw manifest dict to keys aligned with ManifestRow model fields.

    Handles common column name variants. Extend with marketplace-specific
    branches as new formats appear.
    """
    if not isinstance(raw_row, dict):
        raw_row = {}
    raw_row = _flatten_manifest_attributes(raw_row)

    lower_map = {_k.lower().replace(' ', '_'): _k for _k in raw_row.keys() if isinstance(_k, str)}

    def pick(*names: str) -> Any:
        for n in names:
            if n in raw_row:
                return raw_row.get(n)
            lk = n.lower().replace(' ', '_')
            orig = lower_map.get(lk)
            if orig is not None:
                return raw_row.get(orig)
        return None

    title = _str_or_empty(
        pick('title', 'Title', 'item_title', 'description', 'product_title')
    )
    brand = _str_or_empty(pick('brand', 'Brand', 'manufacturer'))
    model = _str_or_empty(pick('model', 'Model', 'model_number', 'model_no'))
    category = _str_or_empty(
        pick('category', 'Category', 'product_category', 'department')
    )
    sku = _str_or_empty(pick('sku', 'SKU', 'vendor_sku', 'item_number'))
    upc = _str_or_empty(pick('upc', 'UPC', 'ean', 'barcode'))
    quantity = _to_int(pick('quantity', 'Quantity', 'qty', 'units'))
    retail_value = _to_decimal(
        pick(
            'retail_value',
            'retail',
            'msrp',
            'Retail',
            'retail_price',
            'estimated_retail',
        )
    )
    condition = _str_or_empty(pick('condition', 'Condition', 'grade'))
    notes = _str_or_empty(pick('notes', 'Notes', 'comment', 'remarks'))

    return {
        'title': title[:500] if title else '',
        'brand': brand[:300] if brand else '',
        'model': model[:300] if model else '',
        'category': category[:300] if category else '',
        'sku': sku[:200] if sku else '',
        'upc': upc[:64] if upc else '',
        'quantity': quantity,
        'retail_value': retail_value,
        'condition': condition[:200] if condition else '',
        'notes': notes,
    }
