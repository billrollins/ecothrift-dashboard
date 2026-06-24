"""
Item Processor workspace payload (design: item-processor_v1_design.md §4.1).

The **list** path is built only from ``ProcessingRow`` ``values()`` for pricing (``shelf_price``),
without joining Items for queue ``price``. Detail merges Items for units while row-level ``price``
stays **bookmark** ``shelf_price``. Canonical rows load on demand via ``build_processing_row_detail``.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any, Iterable

from django.db.models import Count, Q, Sum

from apps.inventory.models import Item, ItemCheckIn, ManifestRow, ProcessingDataBuild, ProcessingRow, PurchaseOrder, Product
from apps.inventory.product_identity import merge_identifiers, product_upc
from apps.inventory.services.processing_search_string import (
    assign_search_strings_for_instances,
    augment_processing_row_search_string,
    build_processing_row_search_string,
)

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
    if not any_disputed:
        any_disputed = any(
            i.status == 'on_shelf' and (i.dispute_type or i.dispute_pct_loss)
            for i in items
        )
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


def distinct_product_count_for_items(items: list[Item]) -> int:
    """Distinct non-null product_id on dispositioned items only."""
    return len({
        i.product_id for i in items if dispositioned_item(i) and i.product_id is not None
    })


def primary_product_id_for_items(items: list[Item]) -> int | None:
    """Product with the most dispositioned units; tie-break lowest product_id."""
    counts: dict[int, int] = defaultdict(int)
    for i in items:
        if dispositioned_item(i) and i.product_id is not None:
            counts[i.product_id] += 1
    if not counts:
        return None
    max_count = max(counts.values())
    return min(pid for pid, c in counts.items() if c == max_count)


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
    if order.finalized_at is None:
        return None
    return order.finalized_at.isoformat()


def _serialize_item(it: Item) -> dict[str, Any]:
    prod = getattr(it, 'product', None)
    return {
        'id': it.id,
        'sku': it.sku,
        'condition': it.condition,
        'condition_label': condition_db_to_ui(it.condition),
        'price': _money(it.price) or '0.00',
        'retail': _money(it.retail),
        'dispatch': location_to_dispatch(it.location),
        'disposition': item_disposition_ui(it.status),
        'notes': it.notes or '',
        'status': it.status,
        'location': it.location or '',
        'product': it.product_id,
        'product_number': prod.product_number if prod else None,
        'product_title': prod.title if prod else None,
        'product_brand': (prod.brand if prod else '') or '',
        'product_model': (prod.model if prod else '') or '',
        'manifest_row': it.manifest_row_id,
        'created_at': it.created_at.isoformat() if it.created_at else None,
        'checked_in_at': it.checked_in_at.isoformat() if it.checked_in_at else None,
        'label_printed_at': it.label_printed_at.isoformat() if it.label_printed_at else None,
        'label_printed': it.label_printed_at is not None,
        'dispute_type': it.dispute_type or None,
        'dispute_pct_loss': it.dispute_pct_loss,
        'dispute_description': it.dispute_description or '',
    }


def _serialize_product(prod: Product | None) -> dict[str, Any] | None:
    if prod is None:
        return None
    specs = prod.specifications or {}
    return {
        'id': prod.id,
        'product_number': prod.product_number,
        'title': prod.title,
        'brand': prod.brand or '',
        'model': prod.model or '',
        'specs': specs if isinstance(specs, dict) else {},
        'identifiers': prod.identifiers or {},
        'tags': prod.tags or [],
        'taxonomy': '',
        'category': prod.category.name if prod.category_id else '',
        'upc': product_upc(prod),
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


def _workspace_price_from_bookmark_row(rw: dict[str, Any]) -> str | None:
    """Workspace queue/detail shelf datapoint from bookmark columns only (no Item join).

    Prefer ``shelf_price``. Fall back to ``final_price`` once for legacy rows missing shelf_price.
    """
    sp = rw.get('shelf_price')
    if sp is not None:
        return _money(sp)
    fp = rw.get('final_price')
    if fp is not None:
        return _money(fp)
    return None


def push_shelf_price_to_bookmark(
    order: PurchaseOrder | int,
    manifest_row_id: int | None,
    price: Decimal | None,
    *,
    processing_row_id: int | None = None,
    item_id: int | None = None,
) -> None:
    """Persist workspace-canonical shelf price on ``ProcessingRow`` before aligning ``Item.price``.

    P9 split families: several rows can share one manifest line, so the target row must be
    pinned — by ``processing_row_id`` when the caller knows it, by ``item_id`` (resolved via
    the row that claims the item) for item-level edits, else the family ROOT.
    """
    if manifest_row_id is None or price is None:
        return
    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    if processing_row_id is not None:
        pr = ProcessingRow.objects.filter(purchase_order_id=oid, pk=int(processing_row_id)).first()
    else:
        rows = list(ProcessingRow.objects.filter(purchase_order_id=oid, manifest_row_id=int(manifest_row_id)))
        pr = rows[0] if len(rows) == 1 else None
        if pr is None and rows:
            if item_id is not None:
                for r in rows:
                    if int(item_id) in set(_processing_row_item_ids(r)):
                        pr = r
                        break
            if pr is None:
                pr = next((r for r in rows if r.split_parent_id is None), rows[0])
    if pr is None:
        return
    pr.shelf_price = price
    pr.final_price = price
    pr.save(update_fields=['shelf_price', 'final_price'])


# Narrow columns loaded for GET processing-workspace / workspace_patch rows (heavy JSON omitted).
_WORKSPACE_SEGMENTS_F = frozenset({
    'all', 'open', 'pending', 'partial', 'checked_in', 'done', 'disputed', 'disputes', 'unmanifested',
})


def _workspace_segment_filter_q(token: str) -> Q | None:
    """Map one UI segment token to a queryset Q (OR-combined by caller)."""
    t = (token or '').strip().lower()
    if t in ('open', 'pending'):
        return Q(queue_status='pending')
    if t == 'partial':
        return Q(queue_status='partial')
    if t in ('checked_in', 'done'):
        return Q(queue_status='checked_in')
    if t in ('disputed', 'disputes'):
        return Q(queue_status='disputed')
    if t == 'unmanifested':
        return Q(row_kind=ProcessingRow.ROW_KIND_ADDED)
    return None


def _parse_workspace_segments(*, segments: str | None, segment: str) -> list[str] | None:
    """Active segment tokens, or None when showing all rows (no status facet filter)."""
    raw = (segments or '').strip()
    if raw:
        parts = [p.strip().lower() for p in raw.split(',') if p.strip()]
        if parts:
            return parts
    seg = (segment or 'all').strip().lower()
    if seg not in _WORKSPACE_SEGMENTS_F:
        seg = 'all'
    if seg == 'all':
        return None
    # Legacy single-segment API: "open" meant not fully checked in.
    if seg == 'open':
        return ['open', 'partial', 'disputed']
    return [seg]


def _apply_workspace_segment_filters(qs, *, segments: str | None, segment: str):
    active = _parse_workspace_segments(segments=segments, segment=segment)
    if not active:
        return qs
    combined = Q()
    matched = False
    for tok in active:
        sub = _workspace_segment_filter_q(tok)
        if sub is not None:
            combined |= sub
            matched = True
    if matched:
        qs = qs.filter(combined)
    return qs


# Digit-only tokens with more than this many characters are treated as identifiers
# (UPC, item #, etc.) and matched against ``search_string``, not ``row_number``.
_MAX_ROW_NUMBER_TOKEN_DIGITS = 3


def _workspace_tokens_q(words: list[str]) -> Q:
    """AND-of-ORs aligned with frontend ``matchesProcessingSearch`` token rules.

    Workspace rows store lowercased ``search_string``; tokens are lowercased and matched with
    ``contains`` (not ``icontains``) per token. ``rowNNN`` tokens match ``row_number`` only.
    Short digit-only tokens (≤3 digits) match ``row_number`` when they are the sole search
    token; with other tokens they match ``search_string`` so specs like ``28 oz`` work.
    Longer digit-only tokens always match ``search_string`` (UPC / item-number partials).
    """
    cleaned = [(raw or '').strip() for raw in words]
    cleaned = [w for w in cleaned if w]
    multi_token = len(cleaned) > 1

    q = Q()
    for w in cleaned:
        w_norm = ' '.join(w.lower().split())
        wl = w_norm
        if wl.startswith('row') and len(wl) > 3 and wl[3:].isdigit():
            sub = Q(row_number=int(wl[3:]))
        elif w_norm.isdigit():
            if len(w_norm) <= _MAX_ROW_NUMBER_TOKEN_DIGITS and not multi_token:
                try:
                    sub = Q(row_number=int(w_norm))
                except ValueError:
                    sub = Q(search_string__contains=w_norm)
            else:
                sub = Q(search_string__contains=w_norm)
        else:
            sub = Q(search_string__contains=w_norm)
        q &= sub
    return q


def _apply_workspace_list_filters(
    qs,
    *,
    segment: str,
    segments: str | None = None,
    product_id: int | None,
    search: str,
    hide_checked_in: bool,
):
    sq = (search or '').strip()
    qs = _apply_workspace_segment_filters(qs, segments=segments, segment=segment)
    if product_id is not None:
        qs = qs.filter(matched_product_id=product_id)
    if not sq and hide_checked_in:
        qs = qs.exclude(queue_status='checked_in')
    if sq:
        words = [w for w in sq.lower().split() if w]
        if words:
            qs = qs.filter(_workspace_tokens_q(words))
    return qs


def _processing_row_item_ids(row: ProcessingRow | dict[str, Any]) -> list[int]:
    raw = row.item_ids if hasattr(row, 'item_ids') else row.get('item_ids')
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _item_check_in_item_id_map(row_ids: Iterable[int]) -> dict[int, set[int]]:
    """Map processing_row pk → union of its ItemCheckIn item ids via Item.check_in FK."""
    out: dict[int, set[int]] = defaultdict(set)
    rid_list = list(row_ids)
    if not rid_list:
        return out
    for row_id, item_pk in Item.objects.filter(
        check_in__processing_row_id__in=rid_list,
    ).values_list('check_in__processing_row_id', 'pk'):
        if row_id:
            out[int(row_id)].add(int(item_pk))
    return out


def split_family_attribution(
    oid: int,
    manifest_row_ids: Iterable[int],
) -> dict[int, dict[str, Any]]:
    """P9 split families: per-row Item attribution for manifest lines with >1 ProcessingRow.

    Items are claimed by the row whose check-in batches created them; anything unclaimed
    (legacy build items, pre-split history) belongs to the family ROOT (split_parent null).
    Lines with a single row are omitted — callers keep the all-line-items fast path.

    Returns {manifest_row_id: {'claimed': {row_pk: set(item_ids)}, 'root_pk': int}}.
    """
    mids = [int(x) for x in manifest_row_ids if x]
    if not mids:
        return {}
    rows = list(
        ProcessingRow.objects.filter(purchase_order_id=oid, manifest_row_id__in=mids)
        .values_list('id', 'manifest_row_id', 'split_parent_id'),
    )
    by_mr: dict[int, list[tuple[int, int | None]]] = defaultdict(list)
    for rid, mid, parent_id in rows:
        by_mr[int(mid)].append((int(rid), parent_id))
    multi = {mid: members for mid, members in by_mr.items() if len(members) > 1}
    if not multi:
        return {}
    all_row_ids = [rid for members in multi.values() for rid, _parent in members]
    batch_map = _item_check_in_item_id_map(all_row_ids)
    out: dict[int, dict[str, Any]] = {}
    for mid, members in multi.items():
        root_pk = next((rid for rid, parent in members if parent is None), members[0][0])
        out[mid] = {
            'claimed': {rid: batch_map.get(rid, set()) for rid, _parent in members},
            'root_pk': root_pk,
        }
    return out


def _items_for_family_row(row_pk: int, fam: dict[str, Any], line_items: list[Item]) -> list[Item]:
    """Slice one row's Items out of its manifest line's items per family attribution."""
    own = fam['claimed'].get(row_pk, set())
    if row_pk == fam['root_pk']:
        claimed_elsewhere: set[int] = set()
        for rid, ids in fam['claimed'].items():
            if rid != row_pk:
                claimed_elsewhere |= ids
        return [it for it in line_items if it.id in own or it.id not in claimed_elsewhere]
    return [it for it in line_items if it.id in own]


def attributed_items_for_processing_row(row: ProcessingRow) -> list[Item]:
    """Items belonging to THIS row — family-aware when the manifest line is split (P9)."""
    if row.manifest_row_id is None:
        if row.row_kind == ProcessingRow.ROW_KIND_ADDED:
            batch_map = _item_check_in_item_id_map([row.pk])
            item_pks = sorted(batch_map.get(row.pk, set()))
            if item_pks:
                return list(Item.objects.filter(pk__in=item_pks).order_by('id'))
        item_pks = _processing_row_item_ids(row)
        if not item_pks:
            return []
        return list(Item.objects.filter(pk__in=item_pks).order_by('id'))
    line_items = list(Item.objects.filter(manifest_row_id=row.manifest_row_id).order_by('id'))
    fam = split_family_attribution(row.purchase_order_id, [row.manifest_row_id]).get(row.manifest_row_id)
    if fam is None:
        return line_items
    return _items_for_family_row(row.pk, fam, line_items)


PROCESSING_WORKSPACE_ROW_VALUE_FIELDS = (
    'id',
    'row_kind',
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
    'identifiers',
    'search_tags',
    'search_string',
    'queue_status',
    'qty_dispositioned',
    'distinct_product_count',
    'pending_item_count',
    'has_on_shelf_unit',
    'list_dispatch',
    'list_sku',
    'shelf_price',
    'item_ids',
    'product_links',
    'collapse_master_id',
    'split_parent_id',
    'split_seq',
)


def collapse_rollups_for_order(order: PurchaseOrder | int) -> dict[int, dict[str, Any]]:
    """Map master row pk → combined group rollup (P7 collapse).

    {'memberRowNumbers': [...], 'memberRowIds': [...], 'totalQty', 'totalDispositioned'}
    Totals include the master itself.
    """
    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    rollups: dict[int, dict[str, Any]] = {}
    members = (
        ProcessingRow.objects.filter(purchase_order_id=oid, collapse_master_id__isnull=False)
        .values_list('collapse_master_id', 'id', 'row_number', 'quantity', 'qty_dispositioned')
        .order_by('row_number')
    )
    for master_id, member_id, row_number, qty, disp in members:
        entry = rollups.setdefault(int(master_id), {
            'memberRowNumbers': [],
            'memberRowIds': [],
            'totalQty': 0,
            'totalDispositioned': 0,
        })
        entry['memberRowNumbers'].append(int(row_number))
        entry['memberRowIds'].append(int(member_id))
        entry['totalQty'] += int(qty or 0)
        entry['totalDispositioned'] += int(disp or 0)
    if rollups:
        masters = ProcessingRow.objects.filter(pk__in=rollups.keys()).values_list(
            'id', 'quantity', 'qty_dispositioned',
        )
        for pk, qty, disp in masters:
            rollups[int(pk)]['totalQty'] += int(qty or 0)
            rollups[int(pk)]['totalDispositioned'] += int(disp or 0)
    return rollups


def _field_from_row_source(src: Any, field: str) -> str:
    if src is None:
        return ''
    if isinstance(src, dict):
        val = src.get(field)
    else:
        val = getattr(src, field, None)
    return str(val or '').strip()


def _specs_from_row_source(src: Any) -> dict[str, Any]:
    if src is None:
        return {}
    if isinstance(src, dict):
        val = src.get('specifications')
    else:
        val = getattr(src, 'specifications', None)
    return val if isinstance(val, dict) else {}


def _upc_from_row_source(src: Any) -> str:
    if src is None:
        return ''
    if isinstance(src, dict):
        ids = src.get('identifiers')
    else:
        ids = getattr(src, 'identifiers', None)
    if not isinstance(ids, dict):
        return ''
    return str(ids.get('upc') or '').strip()


def _first_nonempty_str(*values: Any) -> str:
    for val in values:
        text = str(val or '').strip()
        if text:
            return text
    return ''


def standardized_identity_from_bookmark_row(rw: dict[str, Any]) -> dict[str, Any]:
    """Bookmark-only row fields from finalize — not product-coalesced."""
    ids = rw.get('identifiers')
    return {
        'title': str(rw.get('title') or '').strip(),
        'brand': str(rw.get('brand') or '').strip(),
        'model': str(rw.get('model') or '').strip(),
        'category': str(rw.get('category') or '').strip(),
        'identifiers': ids if isinstance(ids, dict) else {},
    }


def coalesce_processing_row_identity(
    row: Any,
    product: Product | None = None,
    *,
    manifest_row: ManifestRow | None = None,
) -> dict[str, Any]:
    """Product-wins identity for display only — never writes back to DB."""

    def tier(field: str) -> str:
        return _first_nonempty_str(
            _field_from_row_source(product, field) if product else '',
            _field_from_row_source(row, field),
            _field_from_row_source(manifest_row, field) if manifest_row else '',
        )

    title = tier('title')

    specs = _specs_from_row_source(product) if product else {}
    if not specs:
        specs = _specs_from_row_source(row)
    if not specs and manifest_row is not None:
        specs = _specs_from_row_source(manifest_row)

    upc = _first_nonempty_str(
        product_upc(product) if product else '',
        _upc_from_row_source(row),
        _upc_from_row_source(manifest_row) if manifest_row else '',
    )
    identifiers = merge_identifiers(
        getattr(product, 'identifiers', None) if product else None,
        _field_from_row_source(row, 'identifiers'),
        _field_from_row_source(manifest_row, 'identifiers') if manifest_row else None,
        {'upc': upc} if upc else {},
    )

    return {
        'title': title,
        'brand': tier('brand'),
        'model': tier('model'),
        'category': tier('category'),
        'specifications': specs,
        'identifiers': identifiers,
    }


def _minimal_list_product(prod: Product) -> dict[str, Any]:
    return {
        'id': prod.id,
        'product_number': prod.product_number or '',
        'title': prod.title or '',
        'brand': prod.brand or '',
        'identifiers': prod.identifiers or {},
        'upc': product_upc(prod),
    }


def _same_product_peers_for_order(order: PurchaseOrder | int) -> dict[int, list[int]]:
    """Map processing_row pk → peer row_numbers sharing the same matched_product_id."""
    from collections import defaultdict

    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    by_product: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for row_id, product_id, row_number in (
        ProcessingRow.objects.filter(
            purchase_order_id=oid,
            matched_product_id__isnull=False,
        ).values_list('id', 'matched_product_id', 'row_number')
    ):
        by_product[int(product_id)].append((int(row_id), int(row_number)))

    peers_by_row_id: dict[int, list[int]] = {}
    for entries in by_product.values():
        if len(entries) < 2:
            continue
        for row_id, _row_number in entries:
            others = sorted(rn for rid, rn in entries if rid != row_id)[:10]
            peers_by_row_id[row_id] = others
    return peers_by_row_id


def _manifest_evidence(mr: ManifestRow) -> dict[str, Any]:
    return {
        'title': mr.title or '',
        'brand': mr.brand or '',
        'quantity': int(mr.quantity or 1),
        'unit_retail': _money(mr.unit_retail),
    }


def _manifest_row_category(mr: ManifestRow | None) -> str:
    if mr is None:
        return ''
    flat = str(getattr(mr, 'category', '') or '').strip()
    if flat:
        return flat
    tax = mr.taxonomy if isinstance(mr.taxonomy, dict) else {}
    return str(tax.get('category') or tax.get('path') or '').strip()


def _manifest_row_taxonomy_tooltip(mr: ManifestRow | None) -> str:
    """Vendor manifest taxonomy path for row-detail category hover."""
    if mr is None:
        return ''
    tax = mr.taxonomy if isinstance(mr.taxonomy, dict) else {}
    path = str(tax.get('path') or '').strip()
    if path:
        return path
    parts: list[str] = []
    for key in ('department', 'category', 'subcategory', 'commodity'):
        val = str(tax.get(key) or '').strip()
        if val and (not parts or val != parts[-1]):
            parts.append(val)
    flat = str(getattr(mr, 'category', '') or '').strip()
    if flat and flat not in parts:
        parts.append(flat)
    elif flat and not parts:
        parts = [flat]
    return ' > '.join(parts)


def _prep_category_ai_tooltip(prep: Any | None) -> str:
    if prep is None:
        return ''
    ai_tax = prep.ai_taxonomy if isinstance(getattr(prep, 'ai_taxonomy', None), dict) else {}
    path = str(ai_tax.get('path') or ai_tax.get('category') or '').strip()
    if path:
        return path
    return str(getattr(prep, 'ai_category', '') or '').strip()


def _prep_category_final_tooltip(prep: Any | None) -> str:
    if prep is None:
        return ''
    final_tax = prep.final_taxonomy if isinstance(getattr(prep, 'final_taxonomy', None), dict) else {}
    path = str(final_tax.get('path') or final_tax.get('category') or '').strip()
    if path:
        return path
    return str(getattr(prep, 'final_category', '') or '').strip()


def _prep_final_field(prep: Any | None, field: str) -> str:
    if prep is None:
        return ''
    return str(getattr(prep, field, None) or '').strip()


def _unit_retail_ai_tooltip(mr: ManifestRow | None, prep: Any | None) -> str:
    """AI/preprocessing context for unit retail hover (no separate ai_unit_retail field)."""
    if prep is None:
        return ''
    hints: list[str] = []
    prep_retail = _money(getattr(prep, 'unit_retail', None))
    mr_retail = _money(mr.unit_retail if mr else None)
    if prep_retail and prep_retail != (mr_retail or ''):
        hints.append(prep_retail)
    status = prep.ai_status if isinstance(getattr(prep, 'ai_status', None), dict) else {}
    pricing = status.get('pricing') if isinstance(status.get('pricing'), dict) else {}
    if pricing.get('retail_suspect'):
        reason = str(pricing.get('retail_suspect_reason') or pricing.get('reason') or '').strip()
        if reason:
            hints.append(reason)
    return '; '.join(hints)


def _processing_row_layer_sources(
    mr: ManifestRow | None,
    prep: Any | None,
    *,
    bookmark: ProcessingRow | None = None,
) -> dict[str, dict[str, str]]:
    """Manifest vs AI source values for row-detail field hovers."""

    def layer(manifest_val: Any, ai_val: Any, final_val: Any = '') -> dict[str, str]:
        return {
            'manifest': str(manifest_val or '').strip(),
            'ai': str(ai_val or '').strip(),
            'final': str(final_val or '').strip(),
        }

    def price_layer() -> dict[str, str]:
        # ManifestRow has no shelf price — only unit_retail (see unitRetail layer).
        # proposed_price / final_price are PreprocessingRow staging fields.
        return {
            'manifest': '',
            'ai': _money(getattr(prep, 'proposed_price', None) if prep else None) or '',
            'final': _money(getattr(prep, 'final_price', None) if prep else None) or '',
        }

    manifest_model = _first_nonempty_str(
        mr.model if mr else '',
        getattr(prep, 'standard_model', '') if prep else '',
    )

    prep_unit_retail = _money(getattr(prep, 'unit_retail', None) if prep else None)
    if not prep_unit_retail and bookmark is not None:
        prep_unit_retail = _money(getattr(bookmark, 'unit_retail', None))

    return {
        'title': layer(
            mr.title if mr else '',
            getattr(prep, 'ai_title', '') if prep else '',
            _prep_final_field(prep, 'final_title'),
        ),
        'brand': layer(
            mr.brand if mr else '',
            getattr(prep, 'ai_brand', '') if prep else '',
            _prep_final_field(prep, 'final_brand'),
        ),
        'model': layer(
            manifest_model,
            getattr(prep, 'ai_model', '') if prep else '',
            _prep_final_field(prep, 'final_model'),
        ),
        'category': layer(
            _manifest_row_taxonomy_tooltip(mr),
            _prep_category_ai_tooltip(prep),
            _prep_category_final_tooltip(prep),
        ),
        'unitRetail': layer(
            _money(mr.unit_retail if mr else None) or '',
            _unit_retail_ai_tooltip(mr, prep),
            prep_unit_retail or '',
        ),
        'price': price_layer(),
    }


def _serialize_product_links(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, val in raw.items():
        if not str(key).strip().isdigit():
            continue
        if val is None:
            out[str(int(key))] = {'role': None, 'checkIns': 1, 'manifestUnits': 1}
            continue
        if not isinstance(val, dict):
            continue
        role = str(val.get('role') or '').strip().lower()
        if role not in ('set', 'part'):
            role = None
        try:
            check_ins = max(1, int(val.get('check_ins') or val.get('checkIns') or 1))
            manifest_units = max(1, int(val.get('manifest_units') or val.get('manifestUnits') or 1))
        except (TypeError, ValueError):
            check_ins, manifest_units = 1, 1
        out[str(int(key))] = {
            'role': role,
            'checkIns': check_ins,
            'manifestUnits': manifest_units,
        }
    return out


def _default_product_link_entry() -> dict[str, Any]:
    return {'role': None, 'checkIns': 1, 'manifestUnits': 1}


def effective_product_links(row: ProcessingRow | dict[str, Any]) -> dict[str, Any]:
    """Attached products for a row: explicit product_links plus legacy matched_product."""
    raw_links = row.product_links if isinstance(row, ProcessingRow) else row.get('product_links')
    links = _serialize_product_links(raw_links)
    matched_id = row.matched_product_id if isinstance(row, ProcessingRow) else row.get('matched_product_id')
    if matched_id:
        key = str(int(matched_id))
        links.setdefault(key, _default_product_link_entry())
    return links


def attach_product_link(row: ProcessingRow, product_id: int) -> dict[str, Any]:
    """Merge one catalog product into the row's attached-product list (does not replace others)."""
    links = effective_product_links(row)
    key = str(int(product_id))
    links.setdefault(key, _default_product_link_entry())
    return links


def scale_row_amount_for_product_link(
    amount: Decimal | None,
    product_id: int | None,
    row: ProcessingRow,
) -> Decimal | None:
    """Per-item amount from row defaults using set/part accounting (manifestUnits / checkIns)."""
    if amount is None or product_id is None:
        return amount
    link = effective_product_links(row).get(str(int(product_id)), _default_product_link_entry())
    check_ins = max(1, int(link.get('checkIns') or 1))
    manifest_units = max(1, int(link.get('manifestUnits') or 1))
    return (amount * Decimal(manifest_units)) / Decimal(check_ins)


def effective_row_unit_retail(row: ProcessingRow) -> Decimal | None:
    if row.unit_retail is not None:
        return row.unit_retail
    mr = getattr(row, 'manifest_row', None)
    if mr is not None and mr.unit_retail is not None:
        return mr.unit_retail
    return None


def effective_row_shelf_price(row: ProcessingRow) -> Decimal | None:
    for val in (row.shelf_price, row.final_price, row.proposed_price):
        if val is not None:
            return val
    return None


def _processing_row_item_count_for_product(row: ProcessingRow, product_id: int) -> int:
    qs = Item.objects.filter(product_id=int(product_id), purchase_order_id=row.purchase_order_id)
    if row.manifest_row_id:
        qs = qs.filter(manifest_row_id=row.manifest_row_id)
    elif row.row_kind == ProcessingRow.ROW_KIND_ADDED:
        check_in_ids = ItemCheckIn.objects.filter(processing_row_id=row.pk).values_list('pk', flat=True)
        qs = qs.filter(check_in_id__in=list(check_in_ids))
    else:
        return 0
    return qs.count()


def _qty_by_product_for_items(items: Iterable[Item]) -> dict[int, int]:
    out: dict[int, int] = defaultdict(int)
    for item in items:
        if item.product_id:
            out[int(item.product_id)] += 1
    return dict(out)


def merge_product_links_for_rows(*rows: ProcessingRow) -> dict[str, Any]:
    """Union attached-product links from multiple processing rows (collapse groups)."""
    merged: dict[str, Any] = {}
    for row in rows:
        for key, val in effective_product_links(row).items():
            merged.setdefault(key, val)
    return merged


def build_attached_products_payload(
    row: ProcessingRow,
    items: Iterable[Item],
    *,
    product_links: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Hydrate attached catalog products for row detail (linked + checked-in)."""
    links = product_links if product_links is not None else effective_product_links(row)
    qty_by_pid = _qty_by_product_for_items(items)
    ordered_ids: list[int] = []
    seen: set[int] = set()
    for key in links:
        pid = int(key)
        if pid not in seen:
            ordered_ids.append(pid)
            seen.add(pid)
    for pid in qty_by_pid:
        if pid not in seen:
            ordered_ids.append(pid)
            seen.add(pid)
    if not ordered_ids:
        return []
    products = {
        p.id: p
        for p in Product.objects.filter(pk__in=ordered_ids).select_related('category')
    }
    out: list[dict[str, Any]] = []
    for pid in ordered_ids:
        prod = products.get(pid)
        if prod is None:
            continue
        ser = _serialize_product(prod)
        if ser is None:
            continue
        out.append({**ser, 'checkedInQty': int(qty_by_pid.get(pid, 0))})
    return out


def _workspace_row_core_fields(
    rw: dict[str, Any],
    dup_hint: list[int],
    *,
    product: Product | None = None,
    manifest_row: ManifestRow | None = None,
    same_product_peer_row_numbers: list[int] | None = None,
) -> dict[str, Any]:
    """Shared queue-row fields from a ``values()`` dict (snake_case keys)."""
    rn = int(rw['row_number'])
    mid = rw.get('manifest_row_id')
    row_kind = str(rw.get('row_kind') or ProcessingRow.ROW_KIND_MANIFEST)
    is_added = row_kind == ProcessingRow.ROW_KIND_ADDED
    is_manifest_backed = bool(mid) or is_added

    try:
        q_int = int(rw.get('quantity') or 1)
    except (TypeError, ValueError):
        q_int = 1
    item_id_count = len(_processing_row_item_ids(rw))
    qty_target = q_int if q_int > 0 else max(1, item_id_count if is_manifest_backed else 1)
    identity = coalesce_processing_row_identity(rw, product, manifest_row=manifest_row)
    std = standardized_identity_from_bookmark_row(rw)
    display_title = std['title']
    identifiers_out = std.get('identifiers') or {}
    if identifiers_out.get('upc'):
        identifiers_out = {'upc': identifiers_out['upc']}
    else:
        identifiers_out = {}

    list_price = _workspace_price_from_bookmark_row(rw)
    cond_ui = condition_db_to_ui(str(rw.get('condition') or ''))

    ls_raw = rw.get('list_sku')
    sku_val = str(ls_raw).strip() if ls_raw not in (None, '') else None

    return {
        'processing_row_id': rw['id'],
        'rowKind': row_kind,
        'manifest_row_id': mid,
        'rowNum': rn,
        'collapseMasterId': rw.get('collapse_master_id'),
        'splitParentId': rw.get('split_parent_id'),
        'splitSeq': rw.get('split_seq'),
        'productId': rw.get('matched_product_id'),
        'title': display_title,
        'brand': std['brand'],
        'category': std['category'],
        'qty': qty_target,
        'qtyDispositioned': int(rw['qty_dispositioned'] or 0) if is_manifest_backed else 0,
        'distinctProductCount': int(rw.get('distinct_product_count') or 0),
        'sameProductRowNumbers': list(same_product_peer_row_numbers or []),
        'pendingItemCount': int(rw['pending_item_count'] or 0) if is_manifest_backed else qty_target,
        'hasOnShelfUnit': bool(rw.get('has_on_shelf_unit')) if is_manifest_backed else False,
        'unitRetail': _money(rw.get('unit_retail')),
        'identifiers': identifiers_out,
        'status': str(rw.get('queue_status') or 'pending') if is_manifest_backed else 'pending',
        'likelyDuplicateOf': dup_hint,
        'condition': cond_ui,
        'price': list_price,
        'dispatch': str(rw.get('list_dispatch') or 'on_shelf') or 'on_shelf',
        'sku': sku_val if sku_val else None,
        '_search_string': str(rw.get('search_string') or ''),
        '_model': std['model'] or identity['model'],
        '_search_tags': rw.get('search_tags'),
        'standardizedIdentity': std,
    }


def serialize_processing_workspace_list_row_values(
    rw: dict[str, Any],
    dup_hint: list[int],
    *,
    product: Product | None = None,
    same_product_peer_row_numbers: list[int] | None = None,
) -> dict[str, Any]:
    """Slim list payload — queue table columns + UPC/SKU scan only."""
    core = _workspace_row_core_fields(
        rw,
        dup_hint,
        product=product,
        same_product_peer_row_numbers=same_product_peer_row_numbers,
    )
    out = {k: v for k, v in core.items() if not k.startswith('_')}
    out['product'] = _minimal_list_product(product) if product else None
    return out


def serialize_processing_workspace_row_values(
    rw: dict[str, Any],
    dup_hint: list[int],
    *,
    product: Product | None = None,
    manifest_row: ManifestRow | None = None,
) -> dict[str, Any]:
    """Full row JSON for detail endpoint and hydrated mutations.

    ``identifiers`` is reduced to ``upc`` only for search/size.
    ``price`` comes from bookmark ``shelf_price`` (and legacy ``final_price`` fallback only).
    """
    core = _workspace_row_core_fields(rw, dup_hint, product=product, manifest_row=manifest_row)
    stags = core.pop('_search_tags')
    if isinstance(stags, list):
        tags_str = ','.join(str(x) for x in stags)
    else:
        tags_str = str(stags or '')

    search_string = core.pop('_search_string')
    model = core.pop('_model')
    identity = coalesce_processing_row_identity(rw, product, manifest_row=manifest_row)

    return {
        **core,
        'product': _serialize_product(product) if product else None,
        'model': model,
        'specs': identity['specifications'],
        'tags': tags_str,
        'taxonomy': '',
        'manifestNotes': '',
        'tracking': {},
        'items': [],
        'searchString': search_string,
        'productLinks': effective_product_links(rw),
    }


def _attach_split_parent_row_numbers(rows_payload: list[dict[str, Any]]) -> None:
    """Resolve ``splitParentRowNumber`` so clients can label sub rows ``#12.1`` (one query)."""
    parent_ids = {int(r['splitParentId']) for r in rows_payload if r.get('splitParentId')}
    if not parent_ids:
        return
    rn_by_pk = dict(
        ProcessingRow.objects.filter(pk__in=parent_ids).values_list('id', 'row_number'),
    )
    for r in rows_payload:
        pid = r.get('splitParentId')
        if pid and int(pid) in rn_by_pk:
            r['splitParentRowNumber'] = int(rn_by_pk[int(pid)])


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
    if mr_ids:
        for it in Item.objects.filter(manifest_row_id__in=mr_ids).order_by('id'):
            items_by_mr[it.manifest_row_id].append(it)
    # P9 split families: siblings share a manifest line — attribute its items per row.
    split_attr = split_family_attribution(oid, mr_ids)

    product_ids = {p.matched_product_id for p in prs if p.matched_product_id}
    products_by_id: dict[int, Product] = {}
    if product_ids:
        products_by_id = {p.id: p for p in Product.objects.filter(pk__in=product_ids)}

    added_row_ids = [p.pk for p in prs if p.row_kind == ProcessingRow.ROW_KIND_ADDED]
    check_in_item_map = _item_check_in_item_id_map(added_row_ids)
    added_item_pks: set[int] = set()
    for pr in prs:
        if pr.row_kind == ProcessingRow.ROW_KIND_ADDED:
            added_item_pks.update(check_in_item_map.get(pr.pk, set()))
            added_item_pks.update(_processing_row_item_ids(pr))
    items_by_pk: dict[int, Item] = {}
    if added_item_pks:
        items_by_pk = {i.id: i for i in Item.objects.filter(pk__in=added_item_pks).select_related('product')}

    for pr in prs:
        if pr.row_kind == ProcessingRow.ROW_KIND_ADDED:
            item_pks = sorted(check_in_item_map.get(pr.pk, set())) or _processing_row_item_ids(pr)
            items = [items_by_pk[i] for i in item_pks if i in items_by_pk]
            pr.item_ids = [i.id for i in items]
            if items and items[0].product_id and not pr.matched_product_id:
                pr.matched_product_id = items[0].product_id
            pr.queue_status = derive_row_queue_status(items) if items else 'pending'
            pr.qty_dispositioned = row_qty_dispositioned(items) if items else 0
            pr.distinct_product_count = distinct_product_count_for_items(items)
            primary_pid = primary_product_id_for_items(items)
            if primary_pid is not None:
                pr.matched_product_id = primary_pid
            pr.pending_item_count = sum(1 for i in items if i.status in ('intake', 'processing'))
            pr.has_on_shelf_unit = any(i.status == 'on_shelf' for i in items)
            primary = _row_primary_item(items)
            if primary:
                pr.list_dispatch = location_to_dispatch(primary.location)
                pr.list_sku = primary.sku or ''
                pr.condition = str(primary.condition or '')[:20]
                if primary.price is not None and pr.shelf_price is None:
                    pr.shelf_price = primary.price
            else:
                pr.list_dispatch = 'on_shelf'
                pr.list_sku = ''
            base = build_processing_row_search_string(pr)
            prod = products_by_id.get(pr.matched_product_id) if pr.matched_product_id else None
            if prod is None and pr.matched_product_id:
                prod = Product.objects.filter(pk=pr.matched_product_id).first()
                if prod:
                    products_by_id[prod.id] = prod
            pr.search_string = augment_processing_row_search_string(base, product=prod, items=items)
            continue

        if not pr.manifest_row_id:
            pr.queue_status = 'pending'
            pr.qty_dispositioned = 0
            pr.distinct_product_count = 0
            pr.pending_item_count = 0
            pr.has_on_shelf_unit = False
            pr.item_ids = []
            pr.list_dispatch = 'on_shelf'
            pr.list_sku = ''
            pr.shelf_price = pr.final_price if pr.final_price is not None else pr.proposed_price
            # matched_product is preserved: ProcessingRow owns its decided match
            # (product_identity_design.md §2); deliberate clears go through
            # _unlink_processing_bookmarks / explicit mutations.
            continue

        mr_id = pr.manifest_row_id
        items = items_by_mr.get(mr_id, [])
        fam = split_attr.get(mr_id)
        if fam is not None:
            items = _items_for_family_row(pr.pk, fam, items)
        ids = [i.id for i in items]
        pr.item_ids = ids
        pr.queue_status = derive_row_queue_status(items)
        pr.qty_dispositioned = row_qty_dispositioned(items)
        pr.distinct_product_count = distinct_product_count_for_items(items)
        primary_pid = primary_product_id_for_items(items)
        if primary_pid is not None:
            pr.matched_product_id = primary_pid
        elif pr.matched_product_id is None and items:
            primary = _row_primary_item(items)
            if primary is not None and primary.product_id:
                pr.matched_product_id = primary.product_id
        pr.pending_item_count = sum(1 for i in items if i.status in ('intake', 'processing'))
        pr.has_on_shelf_unit = any(i.status == 'on_shelf' for i in items)

        primary = _row_primary_item(items)
        if primary:
            pr.list_dispatch = location_to_dispatch(primary.location)
            pr.list_sku = primary.sku or ''
            pr.condition = str(primary.condition or '')[:20]
        else:
            pr.list_dispatch = 'on_shelf'
            pr.list_sku = ''
            pr.shelf_price = pr.final_price if pr.final_price is not None else pr.proposed_price

    manifest_prs = [p for p in prs if p.row_kind != ProcessingRow.ROW_KIND_ADDED]
    # Rebuild after legacy manifest/item backfill may have set matched_product_id (P3 / Session 5).
    product_ids = {p.matched_product_id for p in manifest_prs if p.matched_product_id}
    if product_ids:
        products_by_id = {p.id: p for p in Product.objects.filter(pk__in=product_ids)}
    assign_search_strings_for_instances(
        manifest_prs,
        products_by_id=products_by_id,
        items_by_manifest_row=items_by_mr,
    )

    # P7 collapse: a master row REPRESENTS its whole group while collapsed, and check-ins
    # fill the master first — so its own-items status would read 'checked_in' while group
    # units are still pending, dropping the group out of hide_checked_in / segment filters.
    # Override master queue_status from GROUP totals (qty fields stay per-row: the
    # fill-in-order allocator depends on them).
    group_member_rows = list(
        ProcessingRow.objects.filter(purchase_order_id=oid, collapse_master_id__isnull=False)
        .values_list('collapse_master_id', 'id', 'quantity', 'qty_dispositioned', 'queue_status'),
    )
    if group_member_rows:
        prs_by_pk = {p.pk: p for p in prs}
        groups: dict[int, list[tuple]] = defaultdict(list)
        for master_id, member_id, qty, disp, status in group_member_rows:
            groups[int(master_id)].append((int(member_id), qty, disp, status))
        for master_pk, members in groups.items():
            member_pks = {m[0] for m in members}
            if (
                processing_row_ids is not None
                and master_pk not in prs_by_pk
                and not (member_pks & prs_by_pk.keys())
            ):
                continue  # scoped refresh that didn't touch this group
            master = prs_by_pk.get(master_pk)
            if master is None:
                # A member was touched but the master wasn't in scope — its status
                # still depends on the group, so pull it into the update set.
                master = ProcessingRow.objects.filter(pk=master_pk).first()
                if master is None:
                    continue
                prs.append(master)
                prs_by_pk[master_pk] = master
            total_qty = int(master.quantity or 0)
            total_disp = int(master.qty_dispositioned or 0)
            statuses = [master.queue_status]
            for member_id, qty, disp, status in members:
                mem = prs_by_pk.get(member_id)
                if mem is not None:  # freshly recomputed values win over the stored row
                    qty, disp, status = mem.quantity, mem.qty_dispositioned, mem.queue_status
                total_qty += int(qty or 0)
                total_disp += int(disp or 0)
                statuses.append(status)
            if any(s == 'disputed' for s in statuses):
                master.queue_status = 'disputed'
            elif total_disp <= 0:
                master.queue_status = 'pending'
            elif total_disp < total_qty:
                master.queue_status = 'partial'
            else:
                master.queue_status = 'checked_in'

    ProcessingRow.objects.bulk_update(
        prs,
        [
            'matched_product_id',
            'queue_status',
            'qty_dispositioned',
            'distinct_product_count',
            'pending_item_count',
            'has_on_shelf_unit',
            'item_ids',
            'list_dispatch',
            'list_sku',
            'shelf_price',
            'condition',
            'search_string',
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
            if pr.matched_product_id is None and mr.matched_product_id:
                pr.matched_product_id = mr.matched_product_id
    if prs:
        ProcessingRow.objects.bulk_update(prs, ['manifest_row_id', 'matched_product_id'])


def serialize_processing_row_list(bk: ProcessingRow, dup_hint: list[int]) -> dict[str, Any]:
    """Single hydrated row (detail path fallback); aligns with slim list payloads."""
    rw = {name: getattr(bk, name) for name in PROCESSING_WORKSPACE_ROW_VALUE_FIELDS}
    return serialize_processing_workspace_row_values(rw, dup_hint)


def compute_order_processing_rollups(order: PurchaseOrder) -> dict[str, Any]:
    """Operational rollups from ProcessingRow expectations vs Item actuals."""

    linked_rows = ProcessingRow.objects.filter(purchase_order=order, manifest_row_id__isnull=False)
    qty_agg = linked_rows.aggregate(
        expected_qty=Sum('quantity'),
        dispositioned_qty=Sum('qty_dispositioned'),
    )
    expected_qty = int(qty_agg['expected_qty'] or 0)
    dispositioned_qty = int(qty_agg['dispositioned_qty'] or 0)

    item_qs = Item.objects.filter(purchase_order=order)
    item_agg = item_qs.aggregate(
        total_items=Count('pk'),
        on_shelf=Count('pk', filter=Q(status='on_shelf')),
        sold=Count('pk', filter=Q(status='sold')),
        scrapped=Count('pk', filter=Q(status='scrapped')),
        lost=Count('pk', filter=Q(status='lost')),
        pending=Count('pk', filter=Q(status__in=['intake', 'processing'])),
        unmanifested=Count('pk', filter=Q(manifest_row__isnull=True)),
        sold_value=Sum('sold_for', filter=Q(status='sold')),
        on_shelf_value=Sum('price', filter=Q(status='on_shelf')),
    )

    expected_retail = Decimal('0')
    for pr in linked_rows.only('quantity', 'unit_retail'):
        q = int(pr.quantity or 0)
        ur = pr.unit_retail or Decimal('0')
        expected_retail += Decimal(q) * ur

    remaining_qty = max(0, expected_qty - dispositioned_qty)
    overage_qty = max(0, dispositioned_qty - expected_qty)

    return {
        'expected_qty': expected_qty,
        'dispositioned_qty': dispositioned_qty,
        'remaining_qty': remaining_qty,
        'overage_qty': overage_qty,
        'expected_retail': _money(expected_retail),
        'on_shelf_qty': int(item_agg['on_shelf'] or 0),
        'sold_qty': int(item_agg['sold'] or 0),
        'scrapped_qty': int(item_agg['scrapped'] or 0),
        'lost_qty': int(item_agg['lost'] or 0),
        'pending_qty': int(item_agg['pending'] or 0),
        'total_items': int(item_agg['total_items'] or 0),
        'unmanifested_qty': int(item_agg['unmanifested'] or 0),
        'sold_value': _money(item_agg['sold_value']),
        'on_shelf_value': _money(item_agg['on_shelf_value']),
    }


def _intake_migration_flags(order: PurchaseOrder, *, row_count_total_po: int) -> dict[str, Any]:
    """Lightweight cohort hints for legacy vs new-flow orders (no data mutation)."""

    has_linked_manifest = ProcessingRow.objects.filter(
        purchase_order=order,
        manifest_row_id__isnull=False,
        row_kind=ProcessingRow.ROW_KIND_MANIFEST,
    ).exists()
    unlinked_row_count = ProcessingRow.objects.filter(
        purchase_order=order,
        manifest_row_id__isnull=True,
        row_kind=ProcessingRow.ROW_KIND_MANIFEST,
    ).count()
    terminal_items = Item.objects.filter(
        purchase_order=order,
        status__in=('sold', 'scrapped', 'lost'),
    ).exists()
    requires_legacy_build = row_count_total_po > 0 and not has_linked_manifest
    return {
        'has_linked_manifest_rows': has_linked_manifest,
        'unlinked_row_count': unlinked_row_count,
        'requires_legacy_build': requires_legacy_build,
        'has_terminal_item_history': terminal_items,
    }


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
    segments: str | None = None,
    product_id: int | None = None,
    search: str = '',
    hide_checked_in: bool = True,
) -> dict[str, Any]:
    """Assemble workspace list from ``ProcessingRow`` rows (bookmark ``shelf_price`` for ``price``).

    Pagination defaults to ``limit``=25, ``offset``=0 so large PO payloads stay bounded.
    """
    vendor = order.vendor
    # Hotfix: avoid an O(all PO rows) JSON scan on every page load. Duplicate hints are
    # noncritical and can be restored later via a cached/slice-scoped implementation.
    dup_map: dict[int, list[int]] = {}

    row_count_total_po = ProcessingRow.objects.filter(purchase_order=order).count()
    qty_agg = ProcessingRow.objects.filter(
        purchase_order=order,
        row_kind=ProcessingRow.ROW_KIND_MANIFEST,
    ).aggregate(
        sum_qty=Sum('quantity'),
        sum_disp=Sum('qty_dispositioned'),
    )
    manifest_total_qty = int(qty_agg['sum_qty'] or 0)
    manifest_disp_qty = int(qty_agg['sum_disp'] or 0)
    if manifest_total_qty == 0:
        manifest_total_qty = int(order.item_count or 0)

    safe_limit = max(1, min(int(limit), 10_000))
    safe_offset = max(0, int(offset))

    base_qs = ProcessingRow.objects.filter(purchase_order=order).order_by('row_number')
    filtered_qs = _apply_workspace_list_filters(
        base_qs,
        segment=segment,
        segments=segments,
        product_id=product_id,
        search=search,
        hide_checked_in=hide_checked_in,
    )

    row_count_filtered = filtered_qs.count()
    slice_qs = filtered_qs[safe_offset : safe_offset + safe_limit]

    raw_rows = list(slice_qs.values(*PROCESSING_WORKSPACE_ROW_VALUE_FIELDS))
    peers_by_row_id = _same_product_peers_for_order(order)
    matched_ids = {int(r['matched_product_id']) for r in raw_rows if r.get('matched_product_id')}
    products_by_id = (
        {p.id: p for p in Product.objects.filter(pk__in=matched_ids)}
        if matched_ids else {}
    )
    out_rows = [
        serialize_processing_workspace_list_row_values(
            rw,
            dup_map.get(int(rw['row_number']), []),
            product=products_by_id.get(int(rw['matched_product_id'])) if rw.get('matched_product_id') else None,
            same_product_peer_row_numbers=peers_by_row_id.get(int(rw['id'])),
        )
        for rw in raw_rows
    ]

    # P7 collapse: masters carry the combined group rollup for collapsed display.
    collapse_map = collapse_rollups_for_order(order)
    if collapse_map:
        for row_payload in out_rows:
            group = collapse_map.get(int(row_payload['processing_row_id']))
            if group:
                row_payload['collapsedGroup'] = group
    _attach_split_parent_row_numbers(out_rows)

    incomplete_build = ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).exclude(
        status=ProcessingDataBuild.STATUS_COMPLETE,
    ).exists()

    migration = _intake_migration_flags(order, row_count_total_po=row_count_total_po)
    has_linked_manifest = migration['has_linked_manifest_rows']
    bookmark_only = migration['requires_legacy_build']

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
        'rollups': compute_order_processing_rollups(order),
        'intake_migration': {
            **migration,
            'incomplete_legacy_build': incomplete_build and not has_linked_manifest,
        },
    }


def build_workspace_patch(order: PurchaseOrder, *, touched_processing_row_ids: Iterable[int]) -> dict[str, Any]:
    """Minimal delta for mutations (progress + touched list rows only)."""
    touched = sorted(set(int(x) for x in touched_processing_row_ids))
    # Hotfix: do not rescan every row for duplicate hints when only a small patch changed.
    dup_map: dict[int, list[int]] = {}

    raw_touched = list(
        ProcessingRow.objects.filter(pk__in=touched, purchase_order=order).values(*PROCESSING_WORKSPACE_ROW_VALUE_FIELDS),
    )
    peers_by_row_id = _same_product_peers_for_order(order)
    matched_ids = {int(r['matched_product_id']) for r in raw_touched if r.get('matched_product_id')}
    products_by_id = (
        {p.id: p for p in Product.objects.filter(pk__in=matched_ids)}
        if matched_ids else {}
    )
    collapse_map = collapse_rollups_for_order(order)
    rows_out = [
        serialize_processing_workspace_list_row_values(
            rw,
            dup_map.get(int(rw['row_number']), []),
            product=products_by_id.get(int(rw['matched_product_id'])) if rw.get('matched_product_id') else None,
            same_product_peer_row_numbers=peers_by_row_id.get(int(rw['id'])),
        )
        for rw in sorted(raw_touched, key=lambda z: z['row_number'])
    ]
    if collapse_map:
        for row_payload in rows_out:
            group = collapse_map.get(int(row_payload['processing_row_id']))
            if group:
                row_payload['collapsedGroup'] = group
    _attach_split_parent_row_numbers(rows_out)
    qty_agg = ProcessingRow.objects.filter(
        purchase_order=order,
        row_kind=ProcessingRow.ROW_KIND_MANIFEST,
    ).aggregate(
        sum_disp=Sum('qty_dispositioned'),
    )
    return {
        'progress': workspace_progress_aggregate(order),
        'rollups': compute_order_processing_rollups(order),
        'manifest_qty_dispositioned_total': int(qty_agg['sum_disp'] or 0),
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
                'title': (prod.title if prod else '') or it.sku,
                'price': _money(it.price) or '0.00',
                'brand': (prod.brand if prod else '') or '',
                'product_number': prod.product_number if prod else None,
            },
        )
    return out


def _serialize_item_check_ins(row: ProcessingRow, items_by_id: dict[int, Item]) -> list[dict[str, Any]]:
    check_ins = list(
        ItemCheckIn.objects.filter(processing_row=row)
        .select_related('product', 'created_by')
        .order_by('-created_at', '-id'),
    )
    out: list[dict[str, Any]] = []
    for check_in in check_ins:
        check_in_items = list(check_in.items.order_by('pk'))
        batch_items = [items_by_id[i.id] for i in check_in_items if i.id in items_by_id]
        if not batch_items:
            batch_items = check_in_items
        prod = check_in.product
        disputed_count = sum(
            1
            for it in batch_items
            if it.status in ('scrapped', 'lost') or it.dispute_type or it.dispute_pct_loss
        )
        out.append(
            {
                'id': check_in.id,
                'quantity': check_in.quantity,
                'items': [_serialize_item(i) for i in batch_items],
                'product': _serialize_product(prod),
                'created_at': check_in.created_at.isoformat() if check_in.created_at else None,
                'created_by': check_in.created_by_id,
                'defaults': check_in.defaults_snapshot if isinstance(check_in.defaults_snapshot, dict) else {},
                'dispute_count': disputed_count,
            },
        )
    return out


def build_processing_row_detail(order: PurchaseOrder, *, processing_row_id: int) -> dict[str, Any]:
    """Precision load: one ProcessingRow + its ManifestRow + Items + Product.

    Does **not** scan all PO bookmarks for UPC duplicate hints (that was O(n) per click and
    dominated latency on large orders). The list payload already carries ``likelyDuplicateOf``;
    we omit it here so the client merge keeps the list row's value.
    """
    bk = (
        ProcessingRow.objects.filter(pk=processing_row_id, purchase_order_id=order.pk)
        .select_related('matched_product')
        .first()
    )
    if bk is None:
        raise LookupError('processing_row_not_found')

    rw_vals = {name: getattr(bk, name) for name in PROCESSING_WORKSPACE_ROW_VALUE_FIELDS}
    base = serialize_processing_workspace_row_values(rw_vals, [], product=bk.matched_product)

    if bk.row_kind == ProcessingRow.ROW_KIND_ADDED:
        items = attributed_items_for_processing_row(bk)
        items_by_id = {i.id: i for i in items}
        prod = bk.matched_product
        if prod is None and items:
            prod = items[0].product
        identity = coalesce_processing_row_identity(bk, prod)
        std = standardized_identity_from_bookmark_row(rw_vals)
        qty_target = max(1, int(bk.quantity or 1), len(items))
        primary = _row_primary_item(items)
        row_price = _workspace_price_from_bookmark_row(rw_vals)
        qty_disp = row_qty_dispositioned(items)
        stags = bk.search_tags
        tags_str = ','.join(str(x) for x in stags) if isinstance(stags, list) else str(stags or '')
        row_full = {
            **base,
            'manifest_row_id': None,
            'productId': prod.id if prod else None,
            'product': _serialize_product(prod),
            'title': std['title'],
            'brand': std['brand'],
            'model': std['model'],
            'specs': identity['specifications'],
            'tags': tags_str,
            'taxonomy': str((bk.taxonomy or {}).get('path') or (bk.taxonomy or {}).get('category') or ''),
            'category': std['category'],
            'qty': qty_target,
            'qtyDispositioned': qty_disp,
            'qtyRemaining': max(0, qty_target - qty_disp),
            'qtyOverage': max(0, qty_disp - qty_target),
            'unitRetail': _money(bk.unit_retail),
            'manifestNotes': bk.notes or '',
            'identifiers': std.get('identifiers') or (bk.identifiers if isinstance(bk.identifiers, dict) else {}),
            'tracking': bk.tracking if isinstance(bk.tracking, dict) else {},
            'items': [_serialize_item(i) for i in items],
            'itemCheckIns': _serialize_item_check_ins(bk, items_by_id),
            'status': derive_row_queue_status(items) if items else 'pending',
            'condition': condition_db_to_ui(primary.condition) if primary else base['condition'],
            'price': row_price,
            'dispatch': location_to_dispatch(primary.location) if primary else base['dispatch'],
            'sku': primary.sku if primary else None,
        }
        row_full.pop('likelyDuplicateOf', None)
        _attach_row_detail_extras(bk, row_full, items, manifest_row=None)
        return {'row': row_full}

    if not bk.manifest_row_id:
        out = {
            **base,
            'items': [],
            'itemCheckIns': [],
            'product': None,
        }
        _attach_row_detail_extras(bk, out, [], manifest_row=None)
        return {'row': out}

    mr = (
        ManifestRow.objects.filter(pk=bk.manifest_row_id, purchase_order_id=order.pk)
        .first()
    )
    if mr is None:
        out = {
            **base,
            'items': [],
            'itemCheckIns': [],
            'product': None,
        }
        _attach_row_detail_extras(bk, out, [], manifest_row=None)
        return {'row': out}

    items = list(Item.objects.filter(manifest_row_id=mr.pk).select_related('product').order_by('id'))
    fam = split_family_attribution(order.pk, [mr.pk]).get(mr.pk)
    if fam is not None:
        items = _items_for_family_row(bk.pk, fam, items)
    items_by_id = {i.id: i for i in items}
    prod = bk.matched_product
    identity = coalesce_processing_row_identity(bk, prod, manifest_row=mr)
    std = standardized_identity_from_bookmark_row(rw_vals)
    qty_target = bk.quantity if bk.quantity and bk.quantity > 0 else (
        mr.quantity if mr.quantity and mr.quantity > 0 else max(1, len(items))
    )

    primary = _row_primary_item(items)
    row_price = _workspace_price_from_bookmark_row(rw_vals)
    qty_disp = row_qty_dispositioned(items)
    qty_remaining = max(0, qty_target - qty_disp)
    qty_overage = max(0, qty_disp - qty_target)
    stags = bk.search_tags
    tags_str = ','.join(str(x) for x in stags) if isinstance(stags, list) else str(stags or '')
    row_identifiers = std.get('identifiers') or (bk.identifiers if isinstance(bk.identifiers, dict) else {})
    row_full = {
        **base,
        'manifest_row_id': mr.id,
        'rowNum': mr.row_number,
        'productId': prod.id if prod else None,
        'product': _serialize_product(prod),
        'title': std['title'],
        'brand': std['brand'],
        'model': std['model'],
        'specs': identity['specifications'],
        'tags': tags_str,
        'taxonomy': str((bk.taxonomy or {}).get('path') or (bk.taxonomy or {}).get('category') or ''),
        'category': std['category'],
        'qty': qty_target,
        'qtyDispositioned': qty_disp,
        'qtyRemaining': qty_remaining,
        'qtyOverage': qty_overage,
        'unitRetail': _money(bk.unit_retail if bk.unit_retail is not None else mr.unit_retail),
        'manifestNotes': bk.notes or '',
        'identifiers': row_identifiers,
        'tracking': bk.tracking if isinstance(bk.tracking, dict) else {},
        'items': [_serialize_item(i) for i in items],
        'itemCheckIns': _serialize_item_check_ins(bk, items_by_id),
        'status': derive_row_queue_status(items),
        'condition': condition_db_to_ui(primary.condition) if primary else base['condition'],
        'price': row_price,
        'dispatch': location_to_dispatch(primary.location) if primary else base['dispatch'],
        'sku': primary.sku if primary else None,
    }
    # P7 collapse: a master's detail covers the WHOLE group — combined rollup, every
    # member's items, and every member's check-in batches (one check-in spanning rows
    # creates one batch per member). Per-row qty fields stay own-row; the client reads
    # collapsedGroup for combined displays.
    detail_items: list[Item] = items
    member_rows = list(
        ProcessingRow.objects.filter(collapse_master_id=bk.pk)
        .order_by('row_number'),
    )
    if member_rows:
        member_mr_ids = [m.manifest_row_id for m in member_rows if m.manifest_row_id]
        member_items = list(
            Item.objects.filter(manifest_row_id__in=member_mr_ids)
            .select_related('product')
            .order_by('id'),
        ) if member_mr_ids else []
        member_items_by_mr: dict[int, list[Item]] = defaultdict(list)
        for it in member_items:
            member_items_by_mr[it.manifest_row_id].append(it)

        all_items = items + member_items
        items_by_id = {i.id: i for i in all_items}
        batches = _serialize_item_check_ins(bk, items_by_id)
        for member in member_rows:
            batches.extend(_serialize_item_check_ins(member, items_by_id))
        batches.sort(key=lambda b: (b['created_at'] or '', b['id']), reverse=True)

        group_qty = int(qty_target) + sum(int(m.quantity or 0) for m in member_rows)
        group_disp = qty_disp + sum(
            row_qty_dispositioned(member_items_by_mr.get(m.manifest_row_id, []))
            for m in member_rows
        )
        row_full['collapsedGroup'] = {
            'memberRowNumbers': [int(m.row_number) for m in member_rows],
            'memberRowIds': [m.pk for m in member_rows],
            'totalQty': group_qty,
            'totalDispositioned': group_disp,
        }
        row_full['items'] = [_serialize_item(i) for i in all_items]
        row_full['itemCheckIns'] = batches
        derived = derive_row_queue_status(all_items)
        if derived != 'disputed':
            derived = (
                'pending' if group_disp <= 0
                else 'partial' if group_disp < group_qty
                else 'checked_in'
            )
        row_full['status'] = derived
        detail_items = all_items

    _attach_split_family_payload(bk, row_full)
    _attach_row_detail_extras(
        bk,
        row_full,
        detail_items,
        manifest_row=mr,
        link_rows=member_rows if member_rows else None,
    )
    return {'row': row_full}


def _attach_row_detail_extras(
    bk: ProcessingRow,
    row_full: dict[str, Any],
    items: Iterable[Item],
    *,
    manifest_row: ManifestRow | None,
    link_rows: Iterable[ProcessingRow] | None = None,
) -> None:
    prep = None
    if bk.preprocessing_row_id:
        from apps.inventory.models import PreprocessingRow

        prep = PreprocessingRow.objects.filter(pk=bk.preprocessing_row_id).first()
    row_full['rowLayerSources'] = _processing_row_layer_sources(manifest_row, prep, bookmark=bk)
    if link_rows:
        links = merge_product_links_for_rows(bk, *link_rows)
    else:
        links = effective_product_links(bk)
    row_full['productLinks'] = links
    row_full['attachedProducts'] = build_attached_products_payload(bk, items, product_links=links)
    if manifest_row is not None and bk.matched_product_id:
        row_full['manifestEvidence'] = _manifest_evidence(manifest_row)
    row_full.pop('likelyDuplicateOf', None)


def _attach_split_family_payload(bk: ProcessingRow, row_full: dict[str, Any]) -> None:
    """P9 transforms: family map + transform history for root and sub rows alike."""
    root = bk if bk.split_parent_id is None else ProcessingRow.objects.filter(pk=bk.split_parent_id).first()
    if root is None:
        return
    children = list(
        ProcessingRow.objects.filter(split_parent=root).order_by('split_seq', 'row_number'),
    )
    transforms = list(root.transforms or [])
    if bk.split_parent_id is None and not children and not transforms:
        return
    if bk.split_parent_id is not None:
        row_full['splitParentRowNumber'] = int(root.row_number)
    row_full['transforms'] = transforms
    row_full['splitFamily'] = {
        'rootProcessingRowId': root.pk,
        'rootRowNumber': int(root.row_number),
        'children': [
            {
                'processing_row_id': c.pk,
                'rowNumber': int(c.row_number),
                'splitSeq': c.split_seq,
                'qty': int(c.quantity or 0),
                'qtyDispositioned': int(c.qty_dispositioned or 0),
            }
            for c in children
        ],
        'canRestart': bool(transforms or children),
    }
