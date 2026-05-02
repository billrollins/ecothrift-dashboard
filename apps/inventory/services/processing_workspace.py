"""
Item Processor workspace payload (design: item-processor_v1_design.md §4.1).

The **list** path is built only from ``ProcessingRow`` (no full ManifestRow/Item/Product graph).
Canonical rows load on demand via ``build_processing_row_detail``.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any, Iterable

from django.db.models import Count, Q, Sum

from apps.inventory.models import Item, ManifestRow, PreprocessingOrder, ProcessingDataBuild, ProcessingRow, PurchaseOrder, Product

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


def _iso_optional(v) -> str | None:
    if v is None:
        return None
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)


def _preprocessing_finalized_iso(order: PurchaseOrder) -> str | None:
    prep = PreprocessingOrder.objects.filter(purchase_order_id=order.pk).only('finalized_at').first()
    if prep is None or prep.finalized_at is None:
        return None
    return prep.finalized_at.isoformat()


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


def _serialize_product(prod: Product | None) -> dict[str, Any] | None:
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


def _build_bookmark_dup_map_from_pairs(row_number_ident_pairs: Iterable[tuple[int, Any]]) -> dict[int, list[int]]:
    """Map row_number → other row_numbers sharing the same trimmed manifest UPC (identifiers.upc).

    Accepts iterable of (row_number, identifiers_json) pairs without hydrating ``ProcessingRow`` models.
    """
    upc_to_rows: dict[str, list[int]] = {}
    for rn, ident in row_number_ident_pairs:
        ids = ident if isinstance(ident, dict) else {}
        upc = (ids or {}).get('upc') or ''
        upc = str(upc).strip()
        if not upc:
            continue
        upc_to_rows.setdefault(upc, []).append(int(rn))
    dup: dict[int, list[int]] = {}
    for _upc, nums in upc_to_rows.items():
        if len(nums) < 2:
            continue
        for n in nums:
            dup[int(n)] = sorted([int(x) for x in nums if x != n])
    return dup


def _effective_list_price_from_values(r: dict[str, Any]) -> str | None:
    lu = r.get('list_unit_price')
    if lu is not None:
        return _money(lu)
    fp = r.get('final_price')
    if fp is not None:
        return _money(fp)
    pp = r.get('proposed_price')
    if pp is not None:
        return _money(pp)
    return None


# Narrow columns loaded for GET processing-workspace / workspace_patch rows (heavy JSON omitted).
_WORKSPACE_SEGMENTS_F = frozenset({'all', 'pending', 'partial', 'checked_in', 'disputed'})


def _workspace_tokens_q(words: list[str]) -> Q:
    """AND-of-ORs aligned with frontend ``matchesProcessingSearch`` token rules (substring)."""
    q = Q()
    for raw in words:
        w = (raw or '').strip()
        if not w:
            continue
        wl = w.lower()
        sub = (
            Q(title__icontains=w)
            | Q(brand__icontains=w)
            | Q(model__icontains=w)
            | Q(list_sku__icontains=w)
            | Q(description__icontains=w)
            | Q(category__icontains=w)
            | Q(identifiers__upc__icontains=w)
        )
        if wl.startswith('row') and wl[3:].isdigit():
            sub |= Q(row_number=int(wl[3:]))
        elif w.isdigit():
            try:
                sub |= Q(row_number=int(w))
            except ValueError:
                pass
        q &= sub
    return q


def _apply_workspace_list_filters(
    qs,
    *,
    segment: str,
    product_id: int | None,
    search: str,
    hide_checked_in: bool,
):
    sq = (search or '').strip()
    seg = (segment or 'all').strip().lower()
    if seg not in _WORKSPACE_SEGMENTS_F:
        seg = 'all'
    if seg != 'all':
        qs = qs.filter(queue_status=seg)
    if product_id is not None:
        qs = qs.filter(matched_product_id=product_id)
    if not sq and hide_checked_in:
        qs = qs.exclude(queue_status='checked_in')
    if sq:
        words = [w for w in sq.lower().split() if w]
        if words:
            qs = qs.filter(_workspace_tokens_q(words))
    return qs


PROCESSING_WORKSPACE_ROW_VALUE_FIELDS = (
    'id',
    'manifest_row_id',
    'row_number',
    'matched_product_id',
    'quantity',
    'unit_retail',
    'proposed_price',
    'final_price',
    'title',
    'brand',
    'model',
    'category',
    'condition',
    'description',
    'identifiers',
    'search_tags',
    'queue_status',
    'qty_dispositioned',
    'pending_item_count',
    'has_on_shelf_unit',
    'list_dispatch',
    'list_sku',
    'list_unit_price',
    'item_ids',
)


def serialize_processing_workspace_row_values(rw: dict[str, Any], dup_hint: list[int]) -> dict[str, Any]:
    """List-row JSON from a ``values()`` dict (snake_case keys).

    Drops fat fields (tracking, specs, notes, taxonomy) present on the model—the detail endpoint
    and mutations provide them when needed. ``identifiers`` is reduced to ``upc`` only for search/size.
    """
    rn = int(rw['row_number'])
    mid = rw.get('manifest_row_id')

    try:
        q_int = int(rw.get('quantity') or 1)
    except (TypeError, ValueError):
        q_int = 1
    qty_target = q_int if q_int > 0 else max(1, len(rw.get('item_ids') or []) if mid else 1)
    listing_title = str(rw.get('title') or '').strip()
    listing_desc = str(rw.get('description') or '').strip()
    display_title = listing_title if listing_title else listing_desc[:80]

    stags = rw.get('search_tags')
    if isinstance(stags, list):
        tags_str = ','.join(str(x) for x in stags)
    else:
        tags_str = str(stags or '')

    ids = rw.get('identifiers') if isinstance(rw.get('identifiers'), dict) else {}
    raw_upc = str((ids or {}).get('upc') or '').strip()
    identifiers_out = {'upc': raw_upc} if raw_upc else {}

    list_price = _effective_list_price_from_values(rw)
    cond_ui = condition_db_to_ui(str(rw.get('condition') or ''))

    ls_raw = rw.get('list_sku')
    sku_val = str(ls_raw).strip() if ls_raw not in (None, '') else None

    return {
        'processing_row_id': rw['id'],
        'manifest_row_id': mid,
        'rowNum': rn,
        'productId': rw.get('matched_product_id'),
        'product': None,
        'title': display_title,
        'brand': str(rw.get('brand') or ''),
        'model': str(rw.get('model') or ''),
        'description': listing_desc,
        'specs': {},
        'tags': tags_str,
        'taxonomy': '',
        'category': str(rw.get('category') or ''),
        'qty': qty_target,
        'qtyDispositioned': int(rw['qty_dispositioned'] or 0) if mid else 0,
        'pendingItemCount': int(rw['pending_item_count'] or 0) if mid else qty_target,
        'hasOnShelfUnit': bool(rw.get('has_on_shelf_unit')) if mid else False,
        'unitRetail': _money(rw.get('unit_retail')),
        'manifestNotes': '',
        'identifiers': identifiers_out,
        'tracking': {},
        'items': [],
        'status': str(rw.get('queue_status') or 'pending') if mid else 'pending',
        'likelyDuplicateOf': dup_hint,
        'condition': cond_ui,
        'price': list_price,
        'dispatch': str(rw.get('list_dispatch') or 'on_shelf') or 'on_shelf',
        'sku': sku_val if sku_val else None,
    }


def workspace_progress_aggregate(order: PurchaseOrder) -> dict[str, int]:
    agg = Item.objects.filter(purchase_order=order).exclude(status='sold').aggregate(
        total_units=Count('pk'),
        pending_units=Count('pk', filter=Q(status__in=['intake', 'processing'])),
    )
    total_units = agg['total_units'] or 0
    pending_ct = agg['pending_units'] or 0
    dispositioned_units = total_units - pending_ct
    return {
        'total_units': total_units,
        'dispositioned_units': dispositioned_units,
        'pending_units': total_units - dispositioned_units if total_units else 0,
    }


def refresh_processing_rows_denorm(
    order: PurchaseOrder | int,
    *,
    processing_row_ids: Iterable[int] | None = None,
) -> None:
    """Recompute denormalized list fields from Items (scoped queries, no full-PO materialization)."""
    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    qs = ProcessingRow.objects.filter(purchase_order_id=oid)
    if processing_row_ids is not None:
        qs = qs.filter(pk__in=list(processing_row_ids))
    prs = list(qs)
    if not prs:
        return

    mr_ids = [p.manifest_row_id for p in prs if p.manifest_row_id]
    items_by_mr: dict[int, list[Item]] = defaultdict(list)
    m_match: dict[int, int | None] = {}
    if mr_ids:
        for it in Item.objects.filter(manifest_row_id__in=mr_ids).order_by('id'):
            items_by_mr[it.manifest_row_id].append(it)
        for mr in ManifestRow.objects.filter(pk__in=mr_ids).only('pk', 'matched_product_id'):
            m_match[mr.pk] = mr.matched_product_id

    for pr in prs:
        if not pr.manifest_row_id:
            pr.queue_status = 'pending'
            pr.qty_dispositioned = 0
            pr.pending_item_count = 0
            pr.has_on_shelf_unit = False
            pr.item_ids = []
            pr.list_dispatch = 'on_shelf'
            pr.list_sku = ''
            pr.list_unit_price = None
            pr.matched_product_id = None
            continue

        mr_id = pr.manifest_row_id
        items = items_by_mr.get(mr_id, [])
        ids = [i.id for i in items]
        pr.item_ids = ids
        pr.matched_product_id = m_match.get(mr_id)
        pr.queue_status = derive_row_queue_status(items)
        pr.qty_dispositioned = row_qty_dispositioned(items)
        pr.pending_item_count = sum(1 for i in items if i.status in ('intake', 'processing'))
        pr.has_on_shelf_unit = any(i.status == 'on_shelf' for i in items)

        primary = _row_primary_item(items)
        if primary:
            pr.list_dispatch = location_to_dispatch(primary.location)
            pr.list_sku = primary.sku or ''
            pr.list_unit_price = primary.price
            pr.condition = str(primary.condition or '')[:20]
        else:
            pr.list_dispatch = 'on_shelf'
            pr.list_sku = ''
            pr.list_unit_price = pr.final_price if pr.final_price is not None else pr.proposed_price

    ProcessingRow.objects.bulk_update(
        prs,
        [
            'matched_product_id',
            'queue_status',
            'qty_dispositioned',
            'pending_item_count',
            'has_on_shelf_unit',
            'item_ids',
            'list_dispatch',
            'list_sku',
            'list_unit_price',
            'condition',
        ],
    )


def link_processing_rows_to_manifest_rows(order: PurchaseOrder) -> None:
    """After manifest bulk_create, point bookmarks at canonical rows by row_number."""
    m_rows = list(
        ManifestRow.objects.filter(purchase_order=order).only('id', 'row_number', 'matched_product_id'),
    )
    by_rn = {int(m.row_number): m for m in m_rows}
    prs = list(ProcessingRow.objects.filter(purchase_order=order))
    for pr in prs:
        mr = by_rn.get(int(pr.row_number))
        if mr:
            pr.manifest_row_id = mr.pk
            pr.matched_product_id = mr.matched_product_id
    if prs:
        ProcessingRow.objects.bulk_update(prs, ['manifest_row_id', 'matched_product_id'])


def serialize_processing_row_list(bk: ProcessingRow, dup_hint: list[int]) -> dict[str, Any]:
    """Single hydrated row (detail path fallback); aligns with slim list payloads."""
    rw = {name: getattr(bk, name) for name in PROCESSING_WORKSPACE_ROW_VALUE_FIELDS}
    return serialize_processing_workspace_row_values(rw, dup_hint)


def _order_payload(order: PurchaseOrder, vendor, total_manifest_qty: int) -> dict[str, Any]:
    return {
        'id': order.id,
        'number': order.order_number,
        'vendor': vendor.name if vendor else '',
        'vendor_code': vendor.code if vendor else '',
        'load_type': order.description or '',
        'expected_delivery': _iso_optional(order.expected_delivery),
        'ordered_date': _iso_optional(order.ordered_date),
        'paid_date': _iso_optional(order.paid_date),
        'delivered_date': _iso_optional(order.delivered_date),
        'status': order.status,
        'total_manifest_qty': total_manifest_qty,
        'total_retail': _money(order.retail_value),
    }


def build_processing_workspace(
    order: PurchaseOrder,
    *,
    limit: int = 25,
    offset: int = 0,
    segment: str = 'all',
    product_id: int | None = None,
    search: str = '',
    hide_checked_in: bool = True,
) -> dict[str, Any]:
    """Assemble list workspace from ``ProcessingRow`` only (no manifest/item graph).

    Pagination defaults to ``limit``=25, ``offset``=0 so large PO payloads stay bounded.
    """
    vendor = order.vendor
    # Hotfix: avoid an O(all PO rows) JSON scan on every page load. Duplicate hints are
    # noncritical and can be restored later via a cached/slice-scoped implementation.
    dup_map: dict[int, list[int]] = {}

    row_count_total_po = ProcessingRow.objects.filter(purchase_order=order).count()
    qty_agg = ProcessingRow.objects.filter(purchase_order=order).aggregate(
        sum_qty=Sum('quantity'),
        sum_disp=Sum('qty_dispositioned'),
    )
    manifest_total_qty = int(qty_agg['sum_qty'] or 0)
    manifest_disp_qty = int(qty_agg['sum_disp'] or 0)
    if manifest_total_qty == 0:
        manifest_total_qty = int(order.item_count or 0)

    safe_limit = max(1, min(int(limit), 500))
    safe_offset = max(0, int(offset))

    base_qs = ProcessingRow.objects.filter(purchase_order=order).order_by('row_number')
    filtered_qs = _apply_workspace_list_filters(
        base_qs,
        segment=segment,
        product_id=product_id,
        search=search,
        hide_checked_in=hide_checked_in,
    )

    row_count_filtered = filtered_qs.count()
    slice_qs = filtered_qs[safe_offset : safe_offset + safe_limit]

    raw_rows = list(slice_qs.values(*PROCESSING_WORKSPACE_ROW_VALUE_FIELDS))
    out_rows = [
        serialize_processing_workspace_row_values(rw, dup_map.get(int(rw['row_number']), [])) for rw in raw_rows
    ]

    incomplete_build = ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).exclude(
        status=ProcessingDataBuild.STATUS_COMPLETE,
    ).exists()

    bookmark_only = (
        row_count_total_po > 0
        and (
            not ProcessingRow.objects.filter(purchase_order=order, manifest_row_id__isnull=False).exists()
            or incomplete_build
        )
    )

    progress = workspace_progress_aggregate(order)
    if bookmark_only:
        total_units = manifest_total_qty
        progress = {
            'total_units': total_units,
            'dispositioned_units': 0,
            'pending_units': total_units,
        }

    return {
        'order': _order_payload(order, vendor, manifest_total_qty),
        'rows': out_rows,
        'row_count_filtered': row_count_filtered,
        'row_count_total_po': row_count_total_po,
        'manifest_qty_dispositioned_total': manifest_disp_qty,
        'workspace_limit': safe_limit,
        'workspace_offset': safe_offset,
        'session': {
            'items_per_hour': 0,
            'elapsed_seconds': 0,
            'session_log': [],
        },
        'progress': progress,
        'processingBookmarkOnly': bookmark_only,
        'preprocessing_finalized_at': _preprocessing_finalized_iso(order),
    }


def build_workspace_patch(order: PurchaseOrder, *, touched_processing_row_ids: Iterable[int]) -> dict[str, Any]:
    """Minimal delta for mutations (progress + touched list rows only)."""
    touched = sorted(set(int(x) for x in touched_processing_row_ids))
    # Hotfix: do not rescan every row for duplicate hints when only a small patch changed.
    dup_map: dict[int, list[int]] = {}

    raw_touched = list(
        ProcessingRow.objects.filter(pk__in=touched, purchase_order=order).values(*PROCESSING_WORKSPACE_ROW_VALUE_FIELDS),
    )
    rows_out = [
        serialize_processing_workspace_row_values(rw, dup_map.get(int(rw['row_number']), []))
        for rw in sorted(raw_touched, key=lambda z: z['row_number'])
    ]
    return {
        'progress': workspace_progress_aggregate(order),
        'rows': rows_out,
    }


def processing_row_ids_for_manifest_rows(order: PurchaseOrder, manifest_row_ids: Iterable[int]) -> list[int]:
    mids = list({int(x) for x in manifest_row_ids})
    return list(
        ProcessingRow.objects.filter(purchase_order=order, manifest_row_id__in=mids).values_list('pk', flat=True),
    )


def printed_items_preview(item_ids: list[int]) -> list[dict[str, Any]]:
    """Lightweight label payload for clients that no longer receive full workspace rows."""
    if not item_ids:
        return []
    items = list(
        Item.objects.filter(pk__in=item_ids).select_related('product'),
    )
    by_id = {i.id: i for i in items}
    out: list[dict[str, Any]] = []
    for iid in item_ids:
        it = by_id.get(iid)
        if not it:
            continue
        prod = it.product
        out.append(
            {
                'id': it.id,
                'sku': it.sku,
                'title': it.title or (prod.title if prod else '') or it.sku,
                'price': _money(it.price) or '0.00',
                'brand': (prod.brand if prod else '') or it.brand or '',
                'product_number': prod.product_number if prod else None,
            },
        )
    return out


def build_processing_row_detail(order: PurchaseOrder, *, processing_row_id: int) -> dict[str, Any]:
    """Precision load: one ProcessingRow + its ManifestRow + Items + Product.

    Does **not** scan all PO bookmarks for UPC duplicate hints (that was O(n) per click and
    dominated latency on large orders). The list payload already carries ``likelyDuplicateOf``;
    we omit it here so the client merge keeps the list row's value.
    """
    bk = ProcessingRow.objects.filter(pk=processing_row_id, purchase_order_id=order.pk).first()
    if bk is None:
        raise LookupError('processing_row_not_found')

    base = serialize_processing_row_list(bk, [])

    if not bk.manifest_row_id:
        out = {
            **base,
            'items': [],
            'product': None,
        }
        out.pop('likelyDuplicateOf', None)
        return {'row': out}

    mr = (
        ManifestRow.objects.filter(pk=bk.manifest_row_id, purchase_order_id=order.pk)
        .select_related('matched_product')
        .first()
    )
    if mr is None:
        out = {
            **base,
            'items': [],
            'product': None,
        }
        out.pop('likelyDuplicateOf', None)
        return {'row': out}

    items = list(Item.objects.filter(manifest_row_id=mr.pk).select_related('product').order_by('id'))
    prod = mr.matched_product
    qty_target = mr.quantity if mr.quantity and mr.quantity > 0 else max(1, len(items))

    primary = _row_primary_item(items)
    row_full = {
        **base,
        'manifest_row_id': mr.id,
        'rowNum': mr.row_number,
        'productId': prod.id if prod else None,
        'product': _serialize_product(prod),
        'title': mr.title or (prod.title if prod else '') or base['title'],
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
        'condition': condition_db_to_ui(primary.condition) if primary else base['condition'],
        'price': _money(primary.price) if primary else base['price'],
        'dispatch': location_to_dispatch(primary.location) if primary else base['dispatch'],
        'sku': primary.sku if primary else None,
    }
    row_full.pop('likelyDuplicateOf', None)
    return {'row': row_full}
