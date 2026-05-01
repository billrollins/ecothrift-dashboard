"""
Item Processor workspace payload (design: item-processor_v1_design.md §4.1).

Maps Django Item.status / Item.location to UI disposition / dispatch until dedicated fields exist.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Count, Prefetch, Q

from apps.inventory.models import Item, ManifestRow, PurchaseOrder

# UI condition labels (mockup) ↔ Item.condition DB values
CONDITION_UI_TO_DB = {
    'New': 'new',
    'Like New': 'like_new',
    'Used Good': 'good',
    'Very Good': 'very_good',
    'Used Fair': 'fair',
    'Salvage': 'salvage',
}
CONDITION_DB_TO_UI = {v: k for k, v in CONDITION_UI_TO_DB.items()}
# DB values not in map fall back to title-case replacement
_EXTRA_CONDITION_UI = {
    'very_good': 'Very Good',
    'unknown': 'Unknown',
}


def condition_db_to_ui(db_val: str) -> str:
    if not db_val:
        return 'Unknown'
    if db_val in CONDITION_DB_TO_UI:
        return CONDITION_DB_TO_UI[db_val]
    return _EXTRA_CONDITION_UI.get(db_val, db_val.replace('_', ' ').title())


def condition_ui_to_db(ui_val: str) -> str:
    if ui_val in CONDITION_UI_TO_DB:
        return CONDITION_UI_TO_DB[ui_val]
    low = ui_val.strip().lower().replace(' ', '_')
    allowed = {c[0] for c in Item.CONDITION_CHOICES}
    if low in allowed:
        return low
    return 'unknown'


DISPATCH_VALUES = frozenset(
    {'on_shelf', 'restoration', 'back_storage', 'online_sales', 'salvage'},
)


def dispatch_to_location(dispatch: str) -> str:
    d = (dispatch or '').strip()
    return d if d in DISPATCH_VALUES else 'on_shelf'


def location_to_dispatch(location: str) -> str:
    loc = (location or '').strip()
    return loc if loc in DISPATCH_VALUES else 'on_shelf'


def item_disposition_ui(status: str) -> str:
    if status in ('intake', 'processing'):
        return 'pending'
    if status == 'on_shelf':
        return 'checked_in'
    if status == 'scrapped':
        return 'broken'
    if status == 'lost':
        return 'undelivered'
    return 'pending'


def derive_row_queue_status(items: list[Item]) -> str:
    """pending | partial | checked_in | disputed — aligns with frontend processingWorkspaceFilters."""
    if not items:
        return 'pending'
    dispositions = [item_disposition_ui(i.status) for i in items]
    any_disputed = any(d in ('broken', 'undelivered') for d in dispositions)
    if any_disputed:
        return 'disputed'
    any_pending = any(d == 'pending' for d in dispositions)
    all_pending = all(d == 'pending' for d in dispositions)
    all_checked = all(d == 'checked_in' for d in dispositions)
    if all_pending:
        return 'pending'
    if all_checked:
        return 'checked_in'
    return 'partial'


def dispositioned_item(item: Item) -> bool:
    """Counts toward progress (not still intake/processing)."""
    return item.status not in ('intake', 'processing')


def row_qty_dispositioned(items: list[Item]) -> int:
    return sum(1 for i in items if dispositioned_item(i))


def _money(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(v.quantize(Decimal('0.01')))


def _serialize_item(it: Item) -> dict[str, Any]:
    return {
        'id': it.id,
        'sku': it.sku,
        'condition': it.condition,
        'condition_label': condition_db_to_ui(it.condition),
        'price': _money(it.price) or '0.00',
        'retail': _money(it.unit_retail),
        'dispatch': location_to_dispatch(it.location),
        'disposition': item_disposition_ui(it.status),
        'notes': it.notes or '',
        'status': it.status,
        'product': it.product_id,
        'manifest_row': it.manifest_row_id,
        'checked_in_at': it.checked_in_at.isoformat() if it.checked_in_at else None,
        'dispute_type': it.dispute_type or None,
        'dispute_pct_loss': it.dispute_pct_loss,
        'dispute_description': it.dispute_description or '',
    }


def _serialize_product(prod) -> dict[str, Any] | None:
    if prod is None:
        return None
    specs = prod.specifications or {}
    tags = specs.get('tags') if isinstance(specs.get('tags'), str) else ''
    return {
        'id': prod.id,
        'product_number': prod.product_number,
        'title': prod.title,
        'brand': prod.brand or '',
        'model': prod.model or '',
        'description': prod.description or '',
        'specs': specs if isinstance(specs, dict) else {},
        'tags': tags,
        'taxonomy': '',
        'category': prod.category or '',
        'upc': prod.upc or '',
    }


def _row_primary_item(items: list[Item]) -> Item | None:
    pending = [i for i in items if i.status in ('intake', 'processing')]
    if pending:
        return pending[0]
    return items[0] if items else None


def _build_upc_dup_map(rows: list[ManifestRow]) -> dict[int, list[int]]:
    """row_number -> other row_numbers sharing same UPC (identifiers.upc)."""
    upc_to_rows: dict[str, list[int]] = {}
    for r in rows:
        upc = (r.identifiers or {}).get('upc') or ''
        upc = str(upc).strip()
        if not upc:
            continue
        upc_to_rows.setdefault(upc, []).append(r.row_number)
    dup: dict[int, list[int]] = {}
    for _upc, nums in upc_to_rows.items():
        if len(nums) < 2:
            continue
        for n in nums:
            others = [x for x in nums if x != n]
            dup[n] = sorted(others)
    return dup


def build_processing_workspace(order: PurchaseOrder) -> dict[str, Any]:
    vendor = order.vendor
    rows_qs = (
        ManifestRow.objects.filter(purchase_order=order)
        .select_related('matched_product')
        .prefetch_related(
            Prefetch(
                'items',
                queryset=Item.objects.select_related('product').order_by('id'),
            ),
        )
        .order_by('row_number')
    )
    rows_list = list(rows_qs)
    dup_map = _build_upc_dup_map(rows_list)

    agg = Item.objects.filter(purchase_order=order).exclude(status='sold').aggregate(
        total_units=Count('pk'),
        pending_units=Count('pk', filter=Q(status__in=['intake', 'processing'])),
    )
    total_units = agg['total_units'] or 0
    pending_ct = agg['pending_units'] or 0
    dispositioned_units = total_units - pending_ct

    out_rows: list[dict[str, Any]] = []
    for mr in rows_list:
        items = list(mr.items.all())
        items.sort(key=lambda x: x.id)
        primary = _row_primary_item(items)
        qty_target = mr.quantity if mr.quantity and mr.quantity > 0 else max(1, len(items))
        prod = mr.matched_product
        upc = (mr.identifiers or {}).get('upc') or ''

        row_payload = {
            'manifest_row_id': mr.id,
            'rowNum': mr.row_number,
            'productId': prod.id if prod else None,
            'product': _serialize_product(prod),
            'title': mr.title or (prod.title if prod else '') or '',
            'brand': mr.brand or (prod.brand if prod else '') or '',
            'model': mr.model or (prod.model if prod else '') or '',
            'description': mr.description or (prod.description if prod else '') or '',
            'specs': mr.specifications if isinstance(mr.specifications, dict) else {},
            'tags': ','.join(str(x) for x in mr.search_tags)
            if isinstance(mr.search_tags, list)
            else str(mr.search_tags or ''),
            'taxonomy': str((mr.taxonomy or {}).get('path') or (mr.taxonomy or {}).get('category') or ''),
            'category': mr.category or '',
            'qty': qty_target,
            'qtyDispositioned': row_qty_dispositioned(items),
            'unitRetail': _money(mr.unit_retail),
            'manifestNotes': mr.notes or '',
            'identifiers': mr.identifiers if isinstance(mr.identifiers, dict) else {},
            'tracking': mr.tracking if isinstance(mr.tracking, dict) else {},
            'items': [_serialize_item(i) for i in items],
            'status': derive_row_queue_status(items),
            'likelyDuplicateOf': dup_map.get(mr.row_number, []),
            # Queue convenience from primary pending/first item (table columns)
            'condition': condition_db_to_ui(primary.condition) if primary else 'Unknown',
            'price': _money(primary.price) if primary else None,
            'dispatch': location_to_dispatch(primary.location) if primary else 'on_shelf',
            'sku': primary.sku if primary else None,
        }
        out_rows.append(row_payload)

    order_payload = {
        'id': order.id,
        'number': order.order_number,
        'vendor': vendor.name if vendor else '',
        'vendor_code': vendor.code if vendor else '',
        'load_type': order.description or '',
        'expected_delivery': order.expected_delivery.isoformat() if order.expected_delivery else None,
        'ordered_date': order.ordered_date.isoformat() if order.ordered_date else None,
        'paid_date': order.paid_date.isoformat() if order.paid_date else None,
        'delivered_date': order.delivered_date.isoformat() if order.delivered_date else None,
        'status': order.status,
        'total_manifest_qty': sum(r['qty'] for r in out_rows) if out_rows else order.item_count,
        'total_retail': _money(order.retail_value),
    }

    return {
        'order': order_payload,
        'rows': out_rows,
        'session': {
            'items_per_hour': 0,
            'elapsed_seconds': 0,
            'session_log': [],
        },
        'progress': {
            'total_units': total_units,
            'dispositioned_units': dispositioned_units,
            'pending_units': total_units - dispositioned_units if total_units else 0,
        },
    }
