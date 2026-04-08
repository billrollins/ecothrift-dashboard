"""Normalize raw manifest rows from B-Stock or marketplace APIs into ManifestRow field dicts."""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger(__name__)

# Top-level / nested keys we treat as envelope or already handled for unmapped-key warnings.
_STRUCTURAL_KEYS = frozenset(
    {
        '_id',
        'status',
        'groupId',
        'accountId',
        'dataBlockRow',
        'sellerLotId',
        'mobileDevice',
        'isShownToBuyer',
        'needsAuthenticityCheck',
        'serviceVersion',
        'errors',
        'originalId',
        'attributes',
        'uniqueIds',
        'customAttributes',
        'currencyCode',
        'dataBlockId',
    }
)

# Keys merged or read for product fields (exclude from "leftover" unmapped list).
_DATA_SOURCE_KEYS = frozenset(
    {
        'title',
        'description',
        'brandName',
        'brand',
        'Brand',
        'manufacturer',
        'Manufacturer',
        'fc_nm',
        'model',
        'Model',
        'model_number',
        'model_no',
        'modelNumber',
        'partNumber',
        'part_number',
        'category',
        'Category',
        'product_category',
        'department',
        'Department',
        'subCategory',
        'sku',
        'SKU',
        'vendor_sku',
        'item_number',
        'itemNumber',
        'ItemNumber',
        'item #',
        'ASIN',
        'asin',
        'tcin',
        'TCIN',
        'upc',
        'UPC',
        'ean',
        'EAN',
        'barcode',
        'quantity',
        'Quantity',
        'qty',
        'units',
        'shipped qty',
        'Shipped Qty',
        'retail_value',
        'retail',
        'msrp',
        'Retail',
        'retail_price',
        'estimated_retail',
        'unitRetail',
        'extRetail',
        'Unit Retail',
        'condition',
        'Condition',
        'grade',
        'itemCondition',
        'otherCategory',
        'notes',
        'Notes',
        'comment',
        'remarks',
        'item_title',
        'product_title',
        'itemDescription',
        'Item Description',
        'categories',
        'ids',
        'item',
        'palletId',
        'licensePlateNumber',
        'dimensions',
    }
)


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


def _manifest_retail_to_dollars(raw: Any) -> Decimal | None:
    """
    Map manifest line retail to dollars for ``ManifestRow.retail_value``.

    B-Stock order-process payloads often send **minor units (cents)** as integers or digit-only
    strings (e.g. ``6000`` → $60.00). Dollar amounts usually appear as strings with a decimal
    point (``\"49.99\"``) or as floats.

    Heuristic: values without a decimal point that parse to an integer **≥ 1000** are treated
    as cents (divide by 100). Smaller whole numbers (e.g. ``40``, ``99``) are treated as whole
    dollars so existing string forms like ``\"40\"`` stay correct. Amounts **≥ 1000** dollars
    expressed as whole dollars would be misread as cents—unlikely for typical unit retail.
    """
    if raw is None or raw == '':
        return None
    if isinstance(raw, bool):
        return None

    d = _to_decimal(raw)
    if d is None:
        return None

    q2 = Decimal('0.01')

    # Explicit decimal in string → dollars (e.g. "49.99", "100.00")
    if isinstance(raw, str):
        s = raw.replace(',', '').strip()
        if '.' in s:
            return d.quantize(q2)
        if s.isdigit() or (s.startswith('-') and s[1:].isdigit()):
            if abs(d) >= 1000:
                return (d / Decimal('100')).quantize(q2)
            return d.quantize(q2)

    # JSON float → dollars (e.g. 49.99)
    if isinstance(raw, float):
        return d.quantize(q2)

    # Integer / whole Decimal: large magnitudes are usually cents from the API
    if isinstance(raw, int):
        if abs(d) >= 1000:
            return (d / Decimal('100')).quantize(q2)
        return d.quantize(q2)

    if isinstance(raw, Decimal):
        if d == d.to_integral_value():
            if abs(d) >= 1000:
                return (d / Decimal('100')).quantize(q2)
            return d.quantize(q2)
        return d.quantize(q2)

    return d.quantize(q2)


def _first_from_ids(ids_obj: Any, *key_names: str) -> str:
    """First string from B-Stock ``attributes.ids`` list values (e.g. asin, upc, tcin)."""
    if not isinstance(ids_obj, dict):
        return ''
    for name in key_names:
        val = ids_obj.get(name)
        if isinstance(val, list) and val:
            s = _str_or_empty(val[0])
            if s:
                return s
        elif isinstance(val, str) and val.strip():
            return val.strip()
    return ''


def _model_from_item(item_obj: Any) -> str:
    """Model / part number from ``attributes.item`` object."""
    if not isinstance(item_obj, dict):
        return ''
    for key in (
        'modelNumber',
        'model',
        'Model',
        'partNumber',
        'part_number',
        'Part #',
        'part #',
    ):
        v = item_obj.get(key)
        s = _str_or_empty(v)
        if s:
            return s
    return ''


def _flatten_bstock_manifest_row(raw_row: dict[str, Any]) -> dict[str, Any]:
    """
    Merge ``attributes``, ``uniqueIds``, ``customAttributes`` into a single dict for picking.

    Keeps ``ids`` and ``item`` as nested dicts for structured extraction.
    """
    merged = dict(raw_row)
    attr = raw_row.get('attributes')
    if isinstance(attr, dict):
        for k, v in attr.items():
            if k not in merged or merged.get(k) in (None, ''):
                merged[k] = v
        desc = attr.get('description')
        if desc and not merged.get('title'):
            merged['title'] = desc

    uid = raw_row.get('uniqueIds')
    if isinstance(uid, dict):
        for key in ('itemNumber', 'tcin', 'asin'):
            val = uid.get(key)
            if val is None:
                continue
            if isinstance(val, list) and val:
                s = _str_or_empty(val[0])
            else:
                s = _str_or_empty(val)
            if s and (key not in merged or not _str_or_empty(merged.get(key))):
                merged[key] = s

    cust = raw_row.get('customAttributes')
    if isinstance(cust, dict):
        for k, v in cust.items():
            if k == 'subCategory' and isinstance(v, str) and v.strip():
                if 'subCategory' not in merged or not _str_or_empty(merged.get('subCategory')):
                    merged['subCategory'] = v.strip()
    return merged


def _category_from_row(merged: dict[str, Any], pick) -> str:
    cat = _str_or_empty(
        pick(
            'category',
            'Category',
            'product_category',
            'department',
            'Department',
            'subcategory',
            'Subcategory',
            'subCategory',
        )
    )
    if cat:
        return cat
    cats = merged.get('categories')
    if isinstance(cats, list) and cats:
        return _str_or_empty(cats[0])
    return _str_or_empty(merged.get('subCategory'))


def _maybe_log_unmapped(
    merged: dict[str, Any],
    result: dict[str, Any],
    row_id: int | None,
) -> None:
    important_empty = (
        not (result.get('brand') or '').strip()
        or not (result.get('model') or '').strip()
        or not (result.get('category') or '').strip()
        or not (result.get('sku') or '').strip()
        or not (result.get('upc') or '').strip()
        or result.get('retail_value') is None
    )
    if not important_empty or row_id is None:
        return

    leftover = [
        k
        for k in sorted(merged.keys())
        if k not in _STRUCTURAL_KEYS and k not in _DATA_SOURCE_KEYS
    ]
    if not leftover:
        return

    logger.warning(
        'ManifestRow id=%s: unmapped raw_data keys after normalization: %s',
        row_id,
        leftover,
    )


def normalize_manifest_row(raw_row: dict[str, Any], row_id: int | None = None) -> dict[str, Any]:
    """
    Map one raw manifest dict to keys aligned with ManifestRow model fields.

    B-Stock order-process manifests typically nest product fields under ``attributes``,
    identifiers under ``attributes.ids`` and ``uniqueIds``, and category under ``categories``.
    """
    if not isinstance(raw_row, dict):
        raw_row = {}
    merged = _flatten_bstock_manifest_row(raw_row)

    lower_map = {_k.lower().replace(' ', '_'): _k for _k in merged.keys() if isinstance(_k, str)}

    def pick(*names: str) -> Any:
        for n in names:
            if n in merged:
                return merged.get(n)
            lk = n.lower().replace(' ', '_')
            orig = lower_map.get(lk)
            if orig is not None:
                return merged.get(orig)
        return None

    ids_obj = merged.get('ids')
    if not isinstance(ids_obj, dict):
        attr_nested = merged.get('attributes')
        if isinstance(attr_nested, dict):
            ids_obj = attr_nested.get('ids')

    sku_from_ids_asin = _first_from_ids(ids_obj, 'asin')
    sku_from_ids_tcin = _first_from_ids(ids_obj, 'tcin')
    upc_from_ids = _first_from_ids(ids_obj, 'upc')

    title = _str_or_empty(
        pick(
            'title',
            'Title',
            'item_title',
            'description',
            'product_title',
            'itemDescription',
            'Item Description',
        )
    )
    brand = _str_or_empty(
        pick(
            'brand',
            'Brand',
            'brandName',
            'brand_name',
            'manufacturer',
            'Manufacturer',
            'fc_nm',
        )
    )
    item_obj = merged.get('item')
    model = _str_or_empty(
        pick(
            'model',
            'Model',
            'model_number',
            'model_no',
            'modelNumber',
            'partNumber',
            'part_number',
        )
    )
    if not model:
        model = _model_from_item(item_obj)

    category = _category_from_row(merged, pick)[:300]

    sku = (
        _str_or_empty(sku_from_ids_asin)
        or _str_or_empty(sku_from_ids_tcin)
        or _str_or_empty(pick('asin', 'ASIN', 'tcin', 'TCIN', 'itemNumber', 'item_number'))
        or _str_or_empty(pick('sku', 'SKU', 'vendor_sku', 'item_number', 'ItemNumber', 'item #'))
    )
    upc = _str_or_empty(upc_from_ids) or _str_or_empty(
        pick('upc', 'UPC', 'ean', 'EAN', 'barcode')
    )

    quantity = _to_int(
        pick('quantity', 'Quantity', 'qty', 'units', 'shipped qty', 'Shipped Qty')
    )

    # Prefer unit (line) retail; fall back to extended.
    retail_raw = pick(
        'unitRetail',
        'Unit Retail',
        'retail_value',
        'retail',
        'Retail',
        'msrp',
        'retail_price',
        'estimated_retail',
        'extRetail',
    )
    retail_value = _manifest_retail_to_dollars(retail_raw)

    condition = _str_or_empty(
        pick('condition', 'Condition', 'grade', 'itemCondition', 'otherCategory')
    )

    notes = _str_or_empty(pick('notes', 'Notes', 'comment', 'remarks'))
    pallet_id = _str_or_empty(pick('palletId', 'Pallet ID'))
    lpn = _str_or_empty(pick('licensePlateNumber', 'LPN', 'Lot #', 'SB #', 'ContainerID'))
    logistics_parts = []
    if pallet_id:
        logistics_parts.append(f'Pallet: {pallet_id}')
    if lpn:
        logistics_parts.append(f'LPN: {lpn}')
    if logistics_parts:
        extra = '; '.join(logistics_parts)
        notes = f'{extra}; {notes}' if notes else extra

    result = {
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

    _maybe_log_unmapped(merged, result, row_id)
    return result
