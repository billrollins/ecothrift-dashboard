"""
Item Processor mutations (print-and-check-in, bulk flows).

Keeps orchestration out of views.py. Uses Item.status/location mapping from processing_workspace.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from apps.inventory.models import (
    Item,
    ItemHistory,
    ManifestRow,
    ProcessingCheckInBatch,
    ProcessingRow,
    Product,
    ProductMergeAudit,
    PurchaseOrder,
)
from apps.inventory.serializers import ItemSerializer
from apps.inventory.services.disputes import record_processing_dispute_for_items
from apps.inventory.services.manual_item import (
    find_or_create_product_for_manual_item,
    normalize_search_tags,
)
from apps.inventory.product_identity import (
    merge_identifiers,
)
from apps.inventory.services.processing_workspace import (
    _processing_row_item_ids,
    attributed_items_for_processing_row,
    build_workspace_patch,
    condition_ui_to_db,
    dispatch_to_location,
    distinct_product_count_for_items,
    location_to_dispatch,
    primary_product_id_for_items,
    printed_items_preview,
    processing_row_ids_for_manifest_rows,
    push_shelf_price_to_bookmark,
    refresh_processing_rows_denorm,
)


# Arbitrary app-unique key for the Postgres advisory lock guarding SKU block allocation.
_SKU_ALLOC_LOCK_KEY = 728_173


def _bulk_create_checked_in_items(items: list[Item]) -> list[Item]:
    """Persist freshly-built Items in ONE INSERT instead of N ``item.save()`` calls.

    ``item.save()`` per unit was the check-in hot spot: each save ran the
    max-SKU aggregate, an individual INSERT, and a PO-WIDE cost recompute
    (quadratic). Here one contiguous SKU block is allocated under a Postgres
    advisory xact lock (two concurrent check-ins can't grab the same block),
    ``search_text`` is prebuilt from the already-loaded product/manifest
    objects, and ``bulk_create`` writes all rows at once (Postgres returns pks).

    The per-save PO cost recompute is skipped on purpose: ``compute_item_cost``
    depends only on fixed PO totals, so inserting items never changes existing
    items' costs — callers set ``cost`` on each Item before calling.
    Must run inside ``transaction.atomic()`` (the advisory lock is xact-scoped).
    """
    if not items:
        return items
    with connection.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(%s)', [_SKU_ALLOC_LOCK_KEY])
    base = Item.next_sku_number()
    for i, item in enumerate(items):
        item.sku = f'ITM{base + i:07d}'
        item.search_text = item.rebuild_search_text()
    Item.objects.bulk_create(items, batch_size=500)
    return items


class ProcessingDataRequired(ValueError):
    """Bookmark row has no linked manifest line yet (Create Processing Data not run)."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or 'Create Processing Data before running this action.')


def _as_int_ids(raw: Any) -> list[int]:
    """Normalize list-ish payload to sorted-unique ints (order preserved after dedupe)."""
    if raw is None:
        return []
    if isinstance(raw, (str, bytes)) or not hasattr(raw, '__iter__'):
        return []
    out: list[int] = []
    seen: set[int] = set()
    for x in raw:
        try:
            i = int(x)
        except (TypeError, ValueError):
            continue
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def manifest_row_ids_from_processing_rows(
    order: PurchaseOrder,
    processing_row_ids: list[int],
    *,
    require_linked: bool,
) -> list[int]:
    """Map bookmark PKs → manifest PKs; validate PO ownership."""

    if not processing_row_ids:
        return []

    rows = list(
        ProcessingRow.objects.filter(
            purchase_order=order,
            pk__in=processing_row_ids,
        ).only('pk', 'manifest_row_id'),
    )
    by_id = {r.pk: r for r in rows}
    missing_pks = [pid for pid in processing_row_ids if pid not in by_id]
    if missing_pks:
        raise ValueError('Invalid processing row ids for this order')

    mids: list[int] = []
    for pid in processing_row_ids:
        pr = by_id[pid]
        mid = pr.manifest_row_id
        if mid is None:
            if require_linked:
                raise ProcessingDataRequired()
            continue
        mids.append(mid)
    return mids


def _resolve_merge_or_bulk_manifest_ids(order: PurchaseOrder, data: dict) -> tuple[list[int], str]:
    """
    Prefer ``processing_row_ids``; legacy ``manifest_row_ids`` still accepted.
    If both are supplied, derived manifest IDs must match explicit manifest IDs.

    Returns (manifest_row_ids, source) where source is processing_rows|manifest_rows|mixed.
    """

    pr_ids = _as_int_ids(data.get('processing_row_ids') or data.get('processingRowIds'))
    mr_ids = _as_int_ids(data.get('manifest_row_ids'))

    if pr_ids and mr_ids:
        derived = manifest_row_ids_from_processing_rows(order, pr_ids, require_linked=True)
        if sorted(derived) != sorted(mr_ids):
            raise ValueError('manifest_row_ids do not match processing_row_ids')
        return derived, 'mixed'

    if pr_ids:
        return manifest_row_ids_from_processing_rows(order, pr_ids, require_linked=True), 'processing_rows'

    return mr_ids, 'manifest_rows'


def parse_decimal(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def history_event_type_for_field(field_name):
    if field_name == 'status':
        return 'status_change'
    if field_name == 'price':
        return 'price_change'
    if field_name == 'condition':
        return 'condition_change'
    if field_name == 'location':
        return 'location_change'
    return 'note'


def apply_item_updates(item, updates):
    changed = []
    for field, value in updates.items():
        old_value = getattr(item, field)
        if old_value == value:
            continue
        setattr(item, field, value)
        changed.append((field, old_value, value))
    return changed


# Owner ruling (2026-06-11): no low per-action cap — staff confirm big check-ins in the
# UI ("type PRINT N") instead of being blocked. This ceiling is a fat-finger backstop
# only; exceeding it is an explicit 400, never a silent clamp.
MAX_CHECK_IN_QUANTITY = 10_000


def _parse_check_in_quantity(raw) -> int:
    try:
        qty = int(raw if raw not in (None, '') else 1)
    except (TypeError, ValueError):
        qty = 1
    qty = max(1, qty)
    if qty > MAX_CHECK_IN_QUANTITY:
        raise ValueError(
            f'Quantity {qty:,} exceeds the {MAX_CHECK_IN_QUANTITY:,} per-action safety limit.',
        )
    return qty


def _resolve_condition_db(cond_raw) -> str:
    allowed = {c[0] for c in Item.CONDITION_CHOICES}
    if cond_raw in allowed:
        return cond_raw
    if isinstance(cond_raw, str):
        return condition_ui_to_db(cond_raw)
    return 'unknown'


def _processing_row_upc(row: ProcessingRow) -> str:
    identifiers = row.identifiers if isinstance(row.identifiers, dict) else {}
    return str(identifiers.get('upc') or identifiers.get('gtin') or '').strip()


def _latest_check_in_product_for_row(row: ProcessingRow) -> Product | None:
    """Most recent Product used when checking in this processing row."""

    batch = (
        ProcessingCheckInBatch.objects.filter(processing_row=row)
        .select_related('product')
        .order_by('-created_at', '-id')
        .first()
    )
    if batch is None or batch.product_id is None:
        return None
    return batch.product


def _implicit_check_in_product_reuse(data: dict) -> bool:
    """True when check-in would silently reuse latest batch / bookmark product."""
    product_mode = str(data.get('product_mode') or '').strip().lower()
    raw_pid = data.get('product_id') or data.get('productId')
    has_explicit_pid = raw_pid not in (None, '')
    if product_mode == 'existing' and has_explicit_pid:
        return False
    if product_mode == 'new':
        return False
    if product_mode == 'edit':
        return False
    if product_mode in ('', 'keep') and not has_explicit_pid:
        return True
    return product_mode in ('', 'keep')


def _mixed_product_row_distinct_count(row: ProcessingRow) -> int:
    """Prefer denorm column; recompute live from Items when manifest-linked.

    Uses family-aware attribution (P9): siblings sharing a manifest line never
    count each other's products as "mixed" on this row.
    """
    if row.manifest_row_id:
        items = attributed_items_for_processing_row(row)
        live = distinct_product_count_for_items(items)
        if live > 0:
            return live
    return int(row.distinct_product_count or 0)


def _normalize_identifier_key(raw: str) -> str:
    s = str(raw or '').strip().lower()
    s = re.sub(r'[\s\-]+', '_', s)
    s = re.sub(r'[^a-z0-9_]+', '', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:64]


def _normalize_identifiers_dict(raw: Any) -> dict[str, str]:
    """Normalize Processing identifiers payload to trimmed string values keyed by snake_case."""

    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, val in raw.items():
        norm_key = _normalize_identifier_key(str(key))
        if not norm_key:
            continue
        norm_val = str(val or '').strip()
        if not norm_val:
            continue
        out[norm_key] = norm_val[:256]
    return out


def _next_processing_row_number(order: PurchaseOrder) -> int:
    from django.db.models import Max

    current = (
        ProcessingRow.objects.filter(purchase_order=order).aggregate(m=Max('row_number')).get('m')
    )
    return int(current or 0) + 1


def _resolve_product_for_processing(
    data: dict,
    *,
    matched_product: Product | None,
    fallback_title: str,
    fallback_brand: str = '',
    fallback_category: str = '',
    fallback_model: str = '',
    fallback_upc: str = '',
    fallback_identifiers: dict | None = None,
    fallback_specs: dict | None = None,
    fallback_search_tags: list | None = None,
) -> Product:
    """Resolve Product for check-in or add-item based on ``product_mode``."""

    product_mode = str(data.get('product_mode') or 'edit').strip().lower()
    title = str(data.get('title') or fallback_title or '').strip()
    brand = str(data.get('brand') or fallback_brand or '').strip()
    model = str(data.get('model') or fallback_model or '').strip()
    category = str(data.get('category') or fallback_category or '').strip()
    upc = str(data.get('upc') or fallback_upc or '').strip()
    identifiers = merge_identifiers(fallback_identifiers, data.get('identifiers'), {'upc': upc} if upc else {})
    specs = data.get('specifications')
    specs = specs if isinstance(specs, dict) else (fallback_specs or {})
    search_tags = normalize_search_tags(data.get('tags') or data.get('search_tags') or fallback_search_tags)

    if product_mode == 'keep':
        if matched_product is not None:
            return matched_product
        return find_or_create_product_for_manual_item(
            title=title or fallback_title,
            brand=brand,
            category=category,
            model=model,
            upc=upc,
            identifiers=identifiers,
            specifications=specs,
            search_tags=search_tags,
            existing_product=None,
        )

    if product_mode == 'existing':
        raw_pid = data.get('product_id') or data.get('productId')
        if raw_pid in (None, ''):
            raise ValueError('product_id is required when product_mode is existing')
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError) as e:
            raise ValueError('product_id must be an integer') from e
        product = Product.objects.filter(pk=pid).first()
        if product is None:
            raise ValueError('Product not found')
        return product

    existing = None if product_mode == 'new' else matched_product
    if product_mode == 'edit':
        # Edit may name the exact product to update (e.g. a batch's product picked via
        # search) instead of relying on the row's matched hint.
        raw_pid = data.get('product_id') or data.get('productId')
        if raw_pid not in (None, '') and str(raw_pid).strip().isdigit():
            explicit = Product.objects.filter(pk=int(raw_pid)).first()
            if explicit is not None:
                existing = explicit
    return find_or_create_product_for_manual_item(
        title=title or fallback_title,
        brand=brand,
        category=category,
        model=model,
        upc=upc,
        identifiers=identifiers,
        specifications=specs,
        search_tags=search_tags,
        existing_product=existing,
        force_create=(product_mode == 'new'),
    )


def _processing_row_remaining_qty(row: ProcessingRow) -> int:
    return max(0, int(row.quantity or 0) - int(row.qty_dispositioned or 0))


def _check_in_processing_row(
    user,
    order: PurchaseOrder,
    row: ProcessingRow,
    data: dict,
    *,
    enforce_mixed_guard: bool = True,
    allow_latest_batch_prefill: bool = True,
) -> tuple[list[Item], ProcessingCheckInBatch]:
    """Check in units on a locked ProcessingRow. Caller must hold row lock inside transaction."""

    quantity = _parse_check_in_quantity(data.get('quantity'))

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or 'on_shelf'
    notes = str(data.get('notes') or '')
    title = str(data.get('title') or '').strip()
    brand = str(data.get('brand') or '').strip()
    model = str(data.get('model') or '').strip()
    category = str(data.get('category') or '').strip()
    upc = str(data.get('upc') or '').strip()
    identifiers = merge_identifiers(data.get('identifiers'), {'upc': upc} if upc else {})
    specs = data.get('specifications')
    specs = specs if isinstance(specs, dict) else {}
    payload_search_tags = normalize_search_tags(data.get('search_tags'))

    if cond_db == 'salvage':
        location = 'salvage'
    else:
        location = dispatch_to_location(dispatch)

    if row.manifest_row_id is None:
        raise ProcessingDataRequired('Finalize preprocessing with a linked manifest row before check-in.')

    search_tags = payload_search_tags or normalize_search_tags(getattr(row, 'search_tags', None))
    matched = row.matched_product if row.matched_product_id else None
    latest_batch_product = _latest_check_in_product_for_row(row) if allow_latest_batch_prefill else None

    if enforce_mixed_guard:
        distinct_count = _mixed_product_row_distinct_count(row)
        if distinct_count >= 2 and _implicit_check_in_product_reuse(data):
            raise ValueError(
                'Multiple products on this row — specify product in Detailed check-in.',
            )

    if latest_batch_product is not None:
        matched = latest_batch_product

    product_mode = str(data.get('product_mode') or '').strip().lower()
    if allow_latest_batch_prefill and product_mode in ('', 'keep') and latest_batch_product is not None:
        data = {
            **data,
            'product_mode': 'existing',
            'product_id': latest_batch_product.id,
        }
    elif product_mode == 'keep' and matched is not None:
        data = {**data, 'product_mode': 'keep'}

    product = _resolve_product_for_processing(
        data,
        matched_product=matched,
        fallback_title=title or row.title or f'Row {row.row_number}',
        fallback_brand=brand or row.brand or '',
        fallback_category=category or row.category or '',
        fallback_model=model or row.model or '',
        fallback_upc=upc or _processing_row_upc(row),
        fallback_identifiers=row.identifiers or {},
        fallback_specs=specs or row.specifications or {},
        fallback_search_tags=search_tags,
    )
    if row.matched_product_id != product.id:
        row.matched_product = product
        row.save(update_fields=['matched_product', 'updated_at'])

    item_price = price or row.shelf_price or row.final_price or row.proposed_price or Decimal('0.00')
    item_retail = retail if retail is not None else row.unit_retail
    now = timezone.now()
    unit_cost = order.compute_item_cost(item_retail)
    items = _bulk_create_checked_in_items([
        Item(
            product=product,
            purchase_order=order,
            manifest_row=row.manifest_row,
            price=item_price,
            retail=item_retail,
            cost=unit_cost,
            source='purchased',
            status='on_shelf',
            condition=cond_db,
            location=location,
            listed_at=now,
            checked_in_at=now,
            checked_in_by=user,
            specifications=specs or row.specifications or {},
            notes=notes,
        )
        for _ in range(quantity)
    ])
    histories = [
        ItemHistory(
            item=item,
            event_type='status_change',
            old_value='',
            new_value='on_shelf',
            note='Created and checked in via Item Processor row check-in',
            created_by=user,
        )
        for item in items
    ]
    if histories:
        ItemHistory.objects.bulk_create(histories)
    if item_price is not None:
        push_shelf_price_to_bookmark(order.id, row.manifest_row_id, item_price, processing_row_id=row.pk)
    batch = ProcessingCheckInBatch.objects.create(
        purchase_order=order,
        processing_row=row,
        product=product,
        quantity=len(items),
        item_ids=[item.id for item in items],
        defaults_snapshot={
            'condition': cond_db,
            'dispatch': dispatch,
            'location': location,
            'price': str(item_price) if item_price is not None else None,
            'retail': str(item_retail) if item_retail is not None else None,
            'notes': notes,
        },
        created_by=user,
    )
    return items, batch


def processing_row_check_in(user, order: PurchaseOrder, processing_row_id: int, data: dict) -> dict:
    """Create real Product/Item rows from a ProcessingRow at physical check-in time.

    P7 collapse: a check-in on a group MASTER distributes quantity across the group in
    row order — earlier rows fill first; any excess lands on the LAST row as overage.
    Followers reject direct check-in (the master owns the group).
    """

    all_items: list[Item] = []
    batches: list[ProcessingCheckInBatch] = []
    touched_ids: list[int] = []

    with transaction.atomic():
        row = (
            ProcessingRow.objects
            .select_for_update()
            .get(pk=processing_row_id, purchase_order=order)
        )
        if row.collapse_master_id:
            master_num = ProcessingRow.objects.filter(pk=row.collapse_master_id).values_list('row_number', flat=True).first()
            raise ValueError(f'Row {row.row_number} is collapsed into row {master_num} — check in on the master or uncollapse.')

        member_ids = list(
            ProcessingRow.objects.select_for_update()
            .filter(collapse_master_id=row.pk)
            .order_by('row_number')
            .values_list('pk', flat=True),
        )

        def _hydrate(pk: int) -> ProcessingRow:
            return (
                ProcessingRow.objects
                .select_related('manifest_row', 'matched_product', 'purchase_order')
                .get(pk=pk)
            )

        row = _hydrate(row.pk)

        if not member_ids:
            items, batch = _check_in_processing_row(user, order, row, data)
            all_items.extend(items)
            batches.append(batch)
            touched_ids.append(row.pk)
        else:
            group = [row] + [_hydrate(pk) for pk in member_ids]
            qty_requested = _parse_check_in_quantity(data.get('quantity'))

            # Fill earlier rows first; leftover lands on the last row as overage.
            allocations = [0] * len(group)
            left = qty_requested
            for i, member in enumerate(group):
                take = min(left, _processing_row_remaining_qty(member))
                allocations[i] = take
                left -= take
                if left == 0:
                    break
            if left > 0:
                allocations[-1] += left

            shared_product_id: int | None = None
            for member, alloc in zip(group, allocations):
                if alloc <= 0:
                    continue
                member_data = {**data, 'quantity': alloc}
                if shared_product_id is not None:
                    # One product decision for the whole group — resolved on the first fill.
                    member_data['product_mode'] = 'existing'
                    member_data['product_id'] = shared_product_id
                items, batch = _check_in_processing_row(
                    user,
                    order,
                    member,
                    member_data,
                    allow_latest_batch_prefill=shared_product_id is None,
                )
                shared_product_id = batch.product_id or shared_product_id
                all_items.extend(items)
                batches.append(batch)
                touched_ids.append(member.pk)

    refresh_processing_rows_denorm(order, processing_row_ids=touched_ids or [processing_row_id])
    return {
        'items': ItemSerializer(all_items, many=True).data,
        'created_count': len(all_items),
        'check_in_batch_id': batches[0].id if batches else None,
        'check_in_batch_ids': [b.id for b in batches],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_ids or [processing_row_id]),
        'printed_items_preview': printed_items_preview([item.id for item in all_items]),
    }


def processing_check_in_together(user, order: PurchaseOrder, data: dict) -> dict:
    """Check in multiple manifest-backed rows sharing one matched product (P5 collapse)."""

    raw_ids = data.get('processing_row_ids') or data.get('processingRowIds') or []
    if not isinstance(raw_ids, (list, tuple)):
        raise ValueError('processing_row_ids must be a list.')
    row_ids = sorted({int(x) for x in raw_ids if str(x).strip().isdigit()})
    if len(row_ids) < 2:
        raise ValueError('Select at least two rows to check in together.')

    rows_payload = data.get('rows') or []
    qty_by_row_id: dict[int, int] = {}
    if isinstance(rows_payload, (list, tuple)):
        for entry in rows_payload:
            if not isinstance(entry, dict):
                continue
            raw_rid = entry.get('processing_row_id') or entry.get('processingRowId')
            if raw_rid is None or not str(raw_rid).strip().isdigit():
                continue
            rid = int(raw_rid)
            try:
                qty = int(entry.get('quantity') or 1)
            except (TypeError, ValueError):
                qty = 1
            qty_by_row_id[rid] = _parse_check_in_quantity(qty)

    product_mode = str(data.get('product_mode') or '').strip().lower()
    if product_mode != 'existing':
        raise ValueError('product_mode must be existing for check-in together.')
    raw_pid = data.get('product_id') or data.get('productId')
    if raw_pid in (None, '') or not str(raw_pid).strip().isdigit():
        raise ValueError('product_id is required.')
    product_id = int(raw_pid)
    if Product.objects.filter(pk=product_id).first() is None:
        raise ValueError('Product not found.')

    shared_fields = {
        'product_mode': 'existing',
        'product_id': product_id,
        'condition': data.get('condition'),
        'dispatch': data.get('dispatch') or 'on_shelf',
        'price': data.get('price'),
        'retail': data.get('retail') or data.get('unit_retail'),
        'notes': data.get('notes') or '',
    }

    batch_ids: list[int] = []
    all_items: list[Item] = []
    touched_ids: list[int] = []

    with transaction.atomic():
        locked = list(
            ProcessingRow.objects.select_for_update()
            .filter(pk__in=row_ids, purchase_order=order),
        )
        if len(locked) != len(row_ids):
            raise ValueError('One or more processing rows were not found on this order.')

        locked_by_id = {int(r.id): r for r in locked}
        ordered_rows = [
            ProcessingRow.objects.select_related('manifest_row', 'matched_product', 'purchase_order')
            .get(pk=locked_by_id[rid].pk)
            for rid in row_ids
        ]

        matched_ids = {int(r.matched_product_id) for r in ordered_rows if r.matched_product_id}
        if len(matched_ids) != 1 or product_id not in matched_ids:
            raise ValueError('All selected rows must share the same matched product.')

        for row in ordered_rows:
            if row.manifest_row_id is None:
                raise ValueError('All rows must be linked to manifest lines.')
            if row.row_kind == ProcessingRow.ROW_KIND_ADDED:
                raise ValueError('Added rows cannot be checked in together in this version.')
            if _mixed_product_row_distinct_count(row) >= 2:
                raise ValueError('Rows with multiple products cannot be checked in together.')
            remaining = _processing_row_remaining_qty(row)
            if remaining <= 0:
                raise ValueError(f'Row {row.row_number} has no remaining quantity.')
            qty = qty_by_row_id.get(int(row.id), remaining)
            if qty > remaining:
                raise ValueError(
                    f'Quantity for row {row.row_number} exceeds remaining ({remaining}).',
                )
            row_data = {**shared_fields, 'quantity': qty}
            items, batch = _check_in_processing_row(
                user,
                order,
                row,
                row_data,
                enforce_mixed_guard=False,
                allow_latest_batch_prefill=False,
            )
            all_items.extend(items)
            batch_ids.append(batch.id)
            touched_ids.append(int(row.id))

    refresh_processing_rows_denorm(order, processing_row_ids=touched_ids)
    return {
        'items': ItemSerializer(all_items, many=True).data,
        'created_count': len(all_items),
        'check_in_batch_ids': batch_ids,
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_ids),
        'printed_items_preview': printed_items_preview([item.id for item in all_items]),
    }


def processing_assign_shared_product(user, order: PurchaseOrder, data: dict) -> dict:
    """Align ProcessingRow.matched_product_id across rows without manifest or Item writes (P6)."""

    raw_ids = data.get('processing_row_ids') or data.get('processingRowIds') or []
    if not isinstance(raw_ids, (list, tuple)):
        raise ValueError('processing_row_ids must be a list.')
    row_ids = sorted({int(x) for x in raw_ids if str(x).strip().isdigit()})
    if len(row_ids) < 2:
        raise ValueError('Select at least two rows to assign a shared product.')

    product_mode = str(data.get('product_mode') or '').strip().lower()
    if product_mode not in ('existing', 'new'):
        raise ValueError('product_mode must be existing or new for assign shared product.')
    if product_mode == 'existing':
        raw_pid = data.get('product_id') or data.get('productId')
        if raw_pid in (None, '') or not str(raw_pid).strip().isdigit():
            raise ValueError('product_id is required.')
        product_id = int(raw_pid)
        product = Product.objects.filter(pk=product_id).first()
        if product is None:
            raise ValueError('Product not found.')
    else:
        # Owner-approved Level-3 exception (2026-06-10): a collapse decision may create
        # the Product before check-in. Identity seeds from the payload, falling back to
        # the first selected row's bookmark fields.
        first = (
            ProcessingRow.objects.filter(pk__in=row_ids, purchase_order=order)
            .order_by('row_number')
            .first()
        )
        if first is None:
            raise ValueError('One or more processing rows were not found on this order.')
        product = _resolve_product_for_processing(
            {**data, 'product_mode': 'new'},
            matched_product=None,
            fallback_title=first.title or f'Row {first.row_number}',
            fallback_brand=first.brand or '',
            fallback_category=first.category or '',
            fallback_model=first.model or '',
            fallback_upc=_processing_row_upc(first),
            fallback_identifiers=first.identifiers or {},
            fallback_specs=first.specifications or {},
            fallback_search_tags=normalize_search_tags(getattr(first, 'search_tags', None)),
        )
        product_id = product.id

    touched_ids: list[int] = []

    with transaction.atomic():
        locked = list(
            ProcessingRow.objects.select_for_update()
            .filter(pk__in=row_ids, purchase_order=order),
        )
        if len(locked) != len(row_ids):
            raise ValueError('One or more processing rows were not found on this order.')

        for row in locked:
            if row.manifest_row_id is None:
                raise ValueError('All rows must be linked to manifest lines.')
            if row.row_kind == ProcessingRow.ROW_KIND_ADDED:
                raise ValueError('Added rows cannot use assign shared product in this version.')
            items = attributed_items_for_processing_row(row)
            if (distinct_product_count_for_items(items) or int(row.distinct_product_count or 0)) >= 2:
                raise ValueError('Rows with multiple products cannot use assign shared product.')
            # Denorm recomputes the hint from dispositioned items (primary product);
            # assigning over checked-in units of another product would silently revert.
            checked_in_pid = primary_product_id_for_items(items)
            if checked_in_pid is not None and checked_in_pid != product_id:
                raise ValueError(
                    f'Row {row.row_number} already has checked-in units of a different product — '
                    'remap that batch first.',
                )
            if row.matched_product_id != product_id:
                row.matched_product_id = product_id
                row.save(update_fields=['matched_product_id', 'updated_at'])
            touched_ids.append(int(row.id))

    refresh_processing_rows_denorm(order, processing_row_ids=touched_ids)
    return {
        'product_id': product_id,
        'rows_updated': len(touched_ids),
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_ids),
    }


def processing_collapse_rows(user, order: PurchaseOrder, data: dict) -> dict:
    """P7 collapse: group ≥2 manifest-backed rows under the first (master) row.

    Presentation + check-in distribution only — ManifestRows untouched, ProcessingRows
    never merged. All rows end up sharing one decided product: ``product_mode`` 'keep'
    (must already share), 'existing' (+product_id), or 'new' (created from master).
    """

    raw_ids = data.get('processing_row_ids') or data.get('processingRowIds') or []
    if not isinstance(raw_ids, (list, tuple)):
        raise ValueError('processing_row_ids must be a list.')
    row_ids = sorted({int(x) for x in raw_ids if str(x).strip().isdigit()})
    if len(row_ids) < 2:
        raise ValueError('Select at least two rows to collapse.')

    with transaction.atomic():
        locked = list(
            ProcessingRow.objects.select_for_update()
            .filter(pk__in=row_ids, purchase_order=order)
            .order_by('row_number'),
        )
        if len(locked) != len(row_ids):
            raise ValueError('One or more processing rows were not found on this order.')
        for row in locked:
            if row.manifest_row_id is None or row.row_kind == ProcessingRow.ROW_KIND_ADDED:
                raise ValueError('Only manifest-backed rows can be collapsed.')
            if row.split_parent_id or row.split_children.exists():
                raise ValueError(
                    f'Row {row.row_number} is part of a Break apart / Make set family — '
                    'restart the row before collapsing.',
                )
            if row.collapse_master_id and row.collapse_master_id not in row_ids:
                raise ValueError(f'Row {row.row_number} is already collapsed into another group.')
            if ProcessingRow.objects.filter(collapse_master=row).exclude(pk__in=row_ids).exists():
                raise ValueError(f'Row {row.row_number} is the master of another group — uncollapse it first.')
            if _mixed_product_row_distinct_count(row) >= 2:
                raise ValueError(f'Row {row.row_number} has multiple products checked in — cannot collapse.')

        master, *members = locked

        product_mode = str(data.get('product_mode') or 'keep').strip().lower()
        if product_mode == 'keep':
            hint_ids = {r.matched_product_id for r in locked}
            if len(hint_ids) != 1:
                raise ValueError(
                    'Rows have different product decisions — pick an existing product or create a new one.',
                )
            shared_product_id = master.matched_product_id  # may be None: "new at check-in"
        else:
            assign = processing_assign_shared_product(user, order, {**data, 'processing_row_ids': row_ids})
            shared_product_id = assign['product_id']
            for r in locked:
                r.refresh_from_db()

        master.collapse_master = None
        master.save(update_fields=['collapse_master', 'updated_at'])
        for member in members:
            member.collapse_master = master
            member.save(update_fields=['collapse_master', 'updated_at'])

    refresh_processing_rows_denorm(order, processing_row_ids=row_ids)
    return {
        'master_processing_row_id': master.pk,
        'member_processing_row_ids': [m.pk for m in members],
        'product_id': shared_product_id,
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=row_ids),
    }


def processing_uncollapse_rows(user, order: PurchaseOrder, data: dict) -> dict:
    """Dissolve a collapse group (by master id) — rows return to individual display."""

    raw = data.get('master_processing_row_id') or data.get('masterProcessingRowId')
    if raw in (None, '') or not str(raw).strip().isdigit():
        raise ValueError('master_processing_row_id is required.')
    master_id = int(raw)

    with transaction.atomic():
        master = (
            ProcessingRow.objects.select_for_update()
            .filter(pk=master_id, purchase_order=order)
            .first()
        )
        if master is None:
            raise ValueError('Master processing row not found on this order.')
        member_ids = list(
            ProcessingRow.objects.select_for_update()
            .filter(collapse_master=master)
            .values_list('pk', flat=True),
        )
        ProcessingRow.objects.filter(pk__in=member_ids).update(collapse_master=None)

    touched = [master_id, *member_ids]
    refresh_processing_rows_denorm(order, processing_row_ids=touched)
    return {
        'uncollapsed_row_ids': touched,
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched),
    }


def remap_check_in_batch_product(
    user,
    order: PurchaseOrder,
    batch_id: int,
    data: dict,
) -> dict:
    """Re-point all Items in a check-in batch to a different Product (atomic)."""

    with transaction.atomic():
        batch = (
            ProcessingCheckInBatch.objects.select_for_update()
            .filter(pk=batch_id, purchase_order=order)
            .first()
        )
        if batch is None:
            raise ValueError('Check-in batch not found for this order.')
        row = (
            ProcessingRow.objects.select_for_update()
            .get(pk=batch.processing_row_id, purchase_order=order)
        )
        matched = Product.objects.filter(pk=batch.product_id).first() if batch.product_id else None

        item_ids = [int(x) for x in (batch.item_ids or []) if str(x).strip().isdigit()]
        if not item_ids:
            raise ValueError('Batch has no items to remap.')

        items = list(
            Item.objects.select_for_update()
            .filter(pk__in=item_ids, purchase_order=order),
        )
        if len(items) != len(item_ids):
            raise ValueError('Batch items must belong to this order.')

        expected_mr = row.manifest_row_id
        for item in items:
            if expected_mr is not None and item.manifest_row_id != expected_mr:
                raise ValueError('Batch items must belong to the same manifest row.')
            if expected_mr is None and item.pk not in set(_processing_row_item_ids(row)):
                raise ValueError('Batch items must belong to this processing row.')

        product = _resolve_product_for_processing(
            data,
            matched_product=matched,
            fallback_title=row.title or f'Row {row.row_number}',
            fallback_brand=row.brand or '',
            fallback_category=row.category or '',
            fallback_model=row.model or '',
            fallback_upc=_processing_row_upc(row),
            fallback_identifiers=row.identifiers or {},
            fallback_specs=row.specifications or {},
            fallback_search_tags=normalize_search_tags(getattr(row, 'search_tags', None)),
        )

        histories: list[ItemHistory] = []
        for item in items:
            old_pid = item.product_id
            if old_pid == product.id:
                continue
            item.product = product
            item.save(update_fields=['product', 'updated_at'])
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='note',
                    old_value=str(old_pid or ''),
                    new_value=str(product.id),
                    note='Product remapped via Item Processor batch remap',
                    created_by=user,
                ),
            )

        batch.product = product
        batch.save(update_fields=['product'])

        if histories:
            ItemHistory.objects.bulk_create(histories)

    refresh_processing_rows_denorm(order, processing_row_ids=[row.pk])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk)
    return {
        'batch_id': batch.id,
        'product_id': product.id,
        'items_updated': len(items),
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[row.pk]),
    }


def processing_row_set_product_decision(
    user,
    order: PurchaseOrder,
    processing_row_id: int,
    data: dict,
) -> dict:
    """Set ProcessingRow.matched_product without creating Items (save before check-in)."""

    with transaction.atomic():
        row = (
            ProcessingRow.objects.select_for_update()
            .filter(pk=processing_row_id, purchase_order=order)
            .first()
        )
        if row is None:
            raise ProcessingRow.DoesNotExist
        if row.manifest_row_id is None:
            raise ProcessingDataRequired('Finalize preprocessing with a linked manifest row first.')

        product_mode = str(data.get('product_mode') or '').strip().lower()
        if product_mode not in ('existing', 'new', 'edit'):
            raise ValueError('product_mode must be existing, new, or edit to save a product decision.')

        title = str(data.get('title') or '').strip()
        brand = str(data.get('brand') or row.brand or '').strip()
        model = str(data.get('model') or row.model or '').strip()
        category = str(data.get('category') or row.category or '').strip()
        upc = str(data.get('upc') or _processing_row_upc(row) or '').strip()
        specs = data.get('specifications')
        specs = specs if isinstance(specs, dict) else (row.specifications or {})
        search_tags = normalize_search_tags(data.get('search_tags') or getattr(row, 'search_tags', None))
        matched = row.matched_product if row.matched_product_id else None
        if product_mode == 'edit' and matched is None:
            raise ValueError('No linked product to edit — choose New product or Search catalog.')

        product = _resolve_product_for_processing(
            {
                **data,
                'product_mode': product_mode,
                'title': title or row.title,
                'brand': brand,
                'model': model,
                'category': category,
                'upc': upc,
                'identifiers': merge_identifiers(row.identifiers, data.get('identifiers')),
                'specifications': specs,
                'search_tags': search_tags,
            },
            matched_product=matched,
            fallback_title=row.title or f'Row {row.row_number}',
            fallback_brand=row.brand or '',
            fallback_category=row.category or '',
            fallback_model=row.model or '',
            fallback_upc=_processing_row_upc(row),
            fallback_identifiers=row.identifiers or {},
            fallback_specs=row.specifications or {},
            fallback_search_tags=normalize_search_tags(getattr(row, 'search_tags', None)),
        )
        row.matched_product = product
        row.save(update_fields=['matched_product', 'updated_at'])

    refresh_processing_rows_denorm(order, processing_row_ids=[processing_row_id])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=processing_row_id)
    return {
        'product_id': product.id,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[processing_row_id]),
    }


def delete_check_in_batch(user, order: PurchaseOrder, batch_id: int) -> dict:
    """Delete one check-in batch and its Items (undo a mistaken batch).

    The batch's Product is also deleted when the item deletion leaves it fully
    orphaned (no items, rows, manifest lines, vendor refs, or other batches).
    """

    with transaction.atomic():
        batch = (
            ProcessingCheckInBatch.objects.select_for_update()
            .filter(pk=batch_id, purchase_order=order)
            .first()
        )
        if batch is None:
            raise ValueError('Check-in batch not found for this order.')
        row = (
            ProcessingRow.objects.select_for_update()
            .get(pk=batch.processing_row_id, purchase_order=order)
        )
        batch_product_id = batch.product_id

        item_ids = [int(x) for x in (batch.item_ids or []) if str(x).strip().isdigit()]
        if not item_ids:
            batch.delete()
        else:
            items = list(Item.objects.select_for_update().filter(pk__in=item_ids, purchase_order=order))
            if len(items) != len(item_ids):
                raise ValueError('Batch items must belong to this order.')
            sold = [i for i in items if i.status == 'sold' or i.sold_at]
            if sold:
                raise ValueError(
                    f'{len(sold)} item(s) in this batch are sold — delete is blocked.',
                )
            from apps.pos.models import CartLine

            if CartLine.objects.filter(item_id__in=item_ids).exists():
                raise ValueError('Items in this batch are referenced by POS carts — delete is blocked.')

            Item.objects.filter(pk__in=item_ids).delete()
            batch.delete()

        product_deleted = None
        if batch_product_id:
            from apps.inventory.services.processing_transforms import _product_safe_to_delete

            # The row's own denorm hint (recomputed from this batch) doesn't count as a
            # reference — same precedent as restart_row. PreprocessingRow decisions,
            # other rows/batches/items/manifest lines/vendor refs all keep the product.
            product = Product.objects.filter(pk=batch_product_id).first()
            if product is not None and _product_safe_to_delete(product, exclude_row_ids=[row.pk]):
                product.delete()
                product_deleted = batch_product_id

    refresh_processing_rows_denorm(order, processing_row_ids=[row.pk])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk)
    return {
        'batch_id': batch_id,
        'items_deleted': len(item_ids),
        'product_deleted': product_deleted,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[row.pk]),
    }


def update_check_in_batch(user, order: PurchaseOrder, batch_id: int, data: dict) -> dict:
    """Edit one prior check-in batch in place (owner spec 2026-06-12).

    Clicking a prior check-in EDITS that batch — it never creates a new one:
    - ``quantity`` greater than current ADDS items (bulk, same product/defaults);
      smaller DELETES the newest items (sold / POS-cart items block the shrink).
    - ``condition`` / ``dispatch`` / ``price`` / ``retail`` / ``notes`` apply to
      every remaining item in the batch.
    - ``product_mode`` existing/new re-points the batch (remap); ``edit`` updates
      the batch product's catalog fields in place.
    """

    with transaction.atomic():
        batch = (
            ProcessingCheckInBatch.objects.select_for_update()
            .filter(pk=batch_id, purchase_order=order)
            .first()
        )
        if batch is None:
            raise ValueError('Check-in batch not found for this order.')
        row = (
            ProcessingRow.objects.select_for_update()
            .get(pk=batch.processing_row_id, purchase_order=order)
        )
        row = (
            ProcessingRow.objects.select_related('manifest_row', 'matched_product')
            .get(pk=row.pk)
        )

        item_ids = [int(x) for x in (batch.item_ids or []) if str(x).strip().isdigit()]
        items = list(
            Item.objects.select_for_update()
            .filter(pk__in=item_ids, purchase_order=order)
            .order_by('pk'),
        )
        if len(items) != len(item_ids):
            raise ValueError('Batch items must belong to this order.')

        histories: list[ItemHistory] = []

        # --- Product: keep / existing / new / edit ---------------------------------
        product = Product.objects.filter(pk=batch.product_id).first() if batch.product_id else None
        product_mode = str(data.get('product_mode') or '').strip().lower()
        if product_mode in ('existing', 'new', 'edit'):
            product = _resolve_product_for_processing(
                data,
                matched_product=product,
                fallback_title=row.title or f'Row {row.row_number}',
                fallback_brand=row.brand or '',
                fallback_category=row.category or '',
                fallback_model=row.model or '',
                fallback_upc=_processing_row_upc(row),
                fallback_identifiers=row.identifiers or {},
                fallback_specs=row.specifications or {},
                fallback_search_tags=normalize_search_tags(getattr(row, 'search_tags', None)),
            )
            for item in items:
                if item.product_id == product.id:
                    continue
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type='note',
                        old_value=str(item.product_id or ''),
                        new_value=str(product.id),
                        note='Product changed via check-in batch edit',
                        created_by=user,
                    ),
                )
                item.product = product
            if batch.product_id != (product.id if product else None):
                batch.product = product

        # --- Item field updates (only keys present in the payload) -----------------
        updates: dict[str, Any] = {}
        if 'price' in data:
            p = parse_decimal(data.get('price'))
            if p is not None:
                updates['price'] = p
        if 'retail' in data or 'unit_retail' in data:
            r = parse_decimal(data.get('retail') or data.get('unit_retail'))
            if r is not None:
                updates['retail'] = r
        if 'condition' in data:
            updates['condition'] = _resolve_condition_db(data.get('condition'))
        if 'notes' in data:
            updates['notes'] = str(data.get('notes') or '')
        eff_condition = updates.get('condition', items[0].condition if items else 'good')
        dispatch = str(data.get('dispatch') or '') if 'dispatch' in data else None
        if dispatch is not None or updates.get('condition') == 'salvage':
            if eff_condition == 'salvage':
                updates['location'] = 'salvage'
            elif dispatch:
                updates['location'] = dispatch_to_location(dispatch)

        items_updated = 0
        if updates:
            editable = [i for i in items if not (i.status == 'sold' or i.sold_at)]
            for item in editable:
                changed = apply_item_updates(item, updates)
                if not changed:
                    continue
                items_updated += 1
                item.save(defer_po_cost_recompute=True)
                for field, old_value, new_value in changed:
                    histories.append(
                        ItemHistory(
                            item=item,
                            event_type=history_event_type_for_field(field),
                            old_value='' if old_value is None else str(old_value),
                            new_value='' if new_value is None else str(new_value),
                            note='Edited via check-in batch edit',
                            created_by=user,
                        ),
                    )
        elif product_mode in ('existing', 'new'):
            for item in items:
                item.save(update_fields=['product', 'updated_at'])

        # --- Quantity: add or remove items -----------------------------------------
        added_items: list[Item] = []
        removed_ids: list[int] = []
        raw_qty = data.get('quantity')
        if raw_qty not in (None, ''):
            new_qty = _parse_check_in_quantity(raw_qty)
            current = len(items)
            if new_qty > current:
                template = items[-1] if items else None
                now = timezone.now()
                price_val = updates.get('price', template.price if template else (row.shelf_price or Decimal('0.00')))
                retail_val = updates.get('retail', template.retail if template else row.unit_retail)
                cond_val = updates.get('condition', template.condition if template else 'good')
                loc_val = updates.get('location', template.location if template else 'on_shelf')
                notes_val = updates.get('notes', template.notes if template else '')
                unit_cost = order.compute_item_cost(retail_val)
                added_items = _bulk_create_checked_in_items([
                    Item(
                        product=product,
                        purchase_order=order,
                        manifest_row=row.manifest_row,
                        price=price_val,
                        retail=retail_val,
                        cost=unit_cost,
                        source='purchased',
                        status='on_shelf',
                        condition=cond_val,
                        location=loc_val,
                        listed_at=now,
                        checked_in_at=now,
                        checked_in_by=user,
                        specifications=row.specifications or {},
                        notes=notes_val,
                    )
                    for _ in range(new_qty - current)
                ])
                histories.extend(
                    ItemHistory(
                        item=item,
                        event_type='status_change',
                        old_value='',
                        new_value='on_shelf',
                        note='Added via check-in batch edit',
                        created_by=user,
                    )
                    for item in added_items
                )
                item_ids = item_ids + [i.pk for i in added_items]
            elif new_qty < current:
                to_remove = items[new_qty:]
                blocked = [i for i in to_remove if i.status == 'sold' or i.sold_at]
                if blocked:
                    raise ValueError(
                        f'{len(blocked)} item(s) that would be removed are sold — reduce quantity less or delete is blocked.',
                    )
                from apps.pos.models import CartLine

                remove_ids = [i.pk for i in to_remove]
                if CartLine.objects.filter(item_id__in=remove_ids).exists():
                    raise ValueError('Items that would be removed are referenced by POS carts.')
                Item.objects.filter(pk__in=remove_ids).delete()
                removed_ids = remove_ids
                item_ids = [pk for pk in item_ids if pk not in set(remove_ids)]

        batch.item_ids = item_ids
        batch.quantity = len(item_ids)
        snapshot = dict(batch.defaults_snapshot or {})
        for key, src in (
            ('condition', updates.get('condition')),
            ('location', updates.get('location')),
            ('price', str(updates['price']) if updates.get('price') is not None else None),
            ('retail', str(updates['retail']) if updates.get('retail') is not None else None),
            ('notes', updates.get('notes')),
        ):
            if src is not None:
                snapshot[key] = src
        if dispatch:
            snapshot['dispatch'] = dispatch
        batch.defaults_snapshot = snapshot
        batch.save()

        if histories:
            ItemHistory.objects.bulk_create(histories)
        if updates.get('price') is not None and row.manifest_row_id:
            push_shelf_price_to_bookmark(order.id, row.manifest_row_id, updates['price'], processing_row_id=row.pk)

    refresh_processing_rows_denorm(order, processing_row_ids=[row.pk])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk)
    return {
        'batch_id': batch.id,
        'items_added': len(added_items),
        'items_removed': len(removed_ids),
        'items_updated': items_updated,
        'quantity': batch.quantity,
        'product_id': batch.product_id,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[row.pk]),
        'printed_items_preview': printed_items_preview([i.pk for i in added_items]),
    }


def processing_print_and_check_in(user, item: Item, data: dict) -> dict:
    """Check in one item. Raises ValueError on bad input."""
    if item.status not in ('intake', 'processing'):
        raise ValueError('Item already dispositioned')
    if not item.purchase_order_id:
        raise ValueError('Item has no purchase order')

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or 'on_shelf'
    notes = str(data.get('notes') or '')

    if cond_db == 'salvage':
        location = 'salvage'
    else:
        location = dispatch_to_location(dispatch)

    touched_mrs: set[int] = set()
    histories: list[ItemHistory] = []
    now = timezone.now()

    with transaction.atomic():
        if price is not None and item.manifest_row_id:
            push_shelf_price_to_bookmark(
                item.purchase_order_id, item.manifest_row_id, price, item_id=item.pk,
            )

        updates = {'condition': cond_db, 'location': location, 'notes': notes}
        if price is not None:
            updates['price'] = price
        if retail is not None:
            updates['retail'] = retail

        changed = apply_item_updates(item, updates)
        old_status = item.status
        item.status = 'on_shelf'
        item.listed_at = now
        item.checked_in_at = now
        item.checked_in_by = user
        item.dispute_type = ''
        item.dispute_pct_loss = None
        item.dispute_description = ''
        item.save()

        if old_status != 'on_shelf':
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='on_shelf',
                    note='Checked in via Item Processor',
                    created_by=user,
                ),
            )
        for field, old_value, new_value in changed:
            histories.append(
                ItemHistory(
                    item=item,
                    event_type=history_event_type_for_field(field),
                    old_value='' if old_value is None else str(old_value),
                    new_value='' if new_value is None else str(new_value),
                    note=f'Processing check-in updated {field}',
                    created_by=user,
                ),
            )

        if histories:
            ItemHistory.objects.bulk_create(histories)

        if item.manifest_row_id:
            touched_mrs.add(item.manifest_row_id)

        item.refresh_from_db()

    po = PurchaseOrder.objects.get(pk=item.purchase_order_id)
    pr_ids = processing_row_ids_for_manifest_rows(po, touched_mrs)
    refresh_processing_rows_denorm(po, processing_row_ids=pr_ids)

    out = ItemSerializer(item).data
    out['checked_in'] = True
    return {
        'item': out,
        'workspace_patch': build_workspace_patch(po, touched_processing_row_ids=pr_ids),
        'printed_items_preview': printed_items_preview([item.pk]),
        'label_print_job_id': '',
    }


def processing_print_multiple(user, order: PurchaseOrder, data: dict) -> dict:
    pr_raw = data.get('processing_row_id')
    mf_raw = data.get('manifest_row_id')
    qty = int(data.get('qty') or 0)

    pr_id = None
    if pr_raw not in (None, ''):
        try:
            pr_id = int(pr_raw)
        except (TypeError, ValueError):
            pr_id = None

    mf_id = None
    if mf_raw not in (None, ''):
        try:
            mf_id = int(mf_raw)
        except (TypeError, ValueError):
            mf_id = None

    manifest_row_id: int | None = None

    if pr_id is not None and mf_id is not None:
        pr = ProcessingRow.objects.filter(pk=pr_id, purchase_order=order).first()
        if not pr:
            raise ValueError('Processing row not found')
        if pr.manifest_row_id is None:
            raise ProcessingDataRequired()
        if pr.manifest_row_id != mf_id:
            raise ValueError('processing_row_id and manifest_row_id conflict')
        manifest_row_id = mf_id
    elif pr_id is not None:
        pr = ProcessingRow.objects.filter(pk=pr_id, purchase_order=order).first()
        if not pr:
            raise ValueError('Processing row not found')
        if pr.manifest_row_id is None:
            raise ProcessingDataRequired()
        manifest_row_id = pr.manifest_row_id
    elif mf_id is not None:
        manifest_row_id = mf_id
    else:
        pass

    if manifest_row_id is None or qty < 1:
        raise ValueError('processing_row_id or manifest_row_id, and positive qty required')

    mr = ManifestRow.objects.filter(purchase_order=order, pk=manifest_row_id).first()
    if not mr:
        raise ValueError('Manifest row not found')

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or 'on_shelf'
    notes = str(data.get('notes') or '')
    if cond_db == 'salvage':
        location = 'salvage'
    else:
        location = dispatch_to_location(dispatch)

    now = timezone.now()
    histories = []
    checked = []
    with transaction.atomic():
        pending = list(
            Item.objects.select_for_update()
            .filter(manifest_row=mr, status__in=['intake', 'processing'])
            .order_by('id')[:qty],
        )
        if len(pending) < qty:
            raise ValueError(f'Only {len(pending)} pending item(s); requested {qty}')

        if price is not None:
            push_shelf_price_to_bookmark(order, manifest_row_id, price)

        for it in pending:
            updates = {'condition': cond_db, 'location': location, 'notes': notes}
            if price is not None:
                updates['price'] = price
            if retail is not None:
                updates['retail'] = retail
            changed = apply_item_updates(it, updates)
            old_status = it.status
            it.dispute_type = ''
            it.dispute_pct_loss = None
            it.dispute_description = ''
            it.status = 'on_shelf'
            it.listed_at = now
            it.checked_in_at = now
            it.checked_in_by = user
            it.save()
            checked.append(it.pk)
            if old_status != 'on_shelf':
                histories.append(
                    ItemHistory(
                        item=it,
                        event_type='status_change',
                        old_value=old_status,
                        new_value='on_shelf',
                        note='Print multiple check-in',
                        created_by=user,
                    ),
                )
            for field, old_value, new_value in changed:
                histories.append(
                    ItemHistory(
                        item=it,
                        event_type=history_event_type_for_field(field),
                        old_value='' if old_value is None else str(old_value),
                        new_value='' if new_value is None else str(new_value),
                        note='Print multiple field update',
                        created_by=user,
                    ),
                )
        if histories:
            ItemHistory.objects.bulk_create(histories)

    order.refresh_from_db()
    pr_ids = processing_row_ids_for_manifest_rows(order, [mr.pk])
    refresh_processing_rows_denorm(order, processing_row_ids=pr_ids)
    return {
        'checked_in_item_ids': checked,
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=pr_ids),
        'printed_items_preview': printed_items_preview(checked),
        'label_print_job_id': '',
    }


def processing_dispute(user, order: PurchaseOrder, data: dict) -> dict:
    scope = data.get('scope') or 'items'
    ids = data.get('ids') or []
    dtype = data.get('type')
    pct = data.get('pct_loss')
    desc = str(data.get('description') or '')

    if dtype not in ('broken', 'undelivered'):
        raise ValueError('type must be broken or undelivered')
    if dtype == 'broken':
        if pct is None:
            raise ValueError('pct_loss required for broken')
        pct_i = int(pct)
        if pct_i < 0 or pct_i > 100:
            raise ValueError('pct_loss must be 0-100')
        if not desc.strip():
            raise ValueError('description required for broken')

    target_items: list[Item] = []
    with transaction.atomic():
        if scope == 'items':
            target_items = list(
                Item.objects.select_for_update().filter(purchase_order=order, pk__in=ids),
            )
        elif scope == 'manifest_row':
            tid = ids[0] if ids else None
            if not tid:
                raise ValueError('manifest_row scope requires ids [row_id]')
            mr = ManifestRow.objects.filter(purchase_order=order, pk=tid).first()
            if not mr:
                raise ValueError('Manifest row not found')
            target_items = list(
                Item.objects.select_for_update().filter(
                    manifest_row=mr,
                    status__in=['intake', 'processing'],
                ),
            )
        elif scope == 'manifest_rows':
            rows = ManifestRow.objects.filter(purchase_order=order, pk__in=ids)
            target_items = list(
                Item.objects.select_for_update().filter(
                    manifest_row__in=rows,
                    status__in=['intake', 'processing'],
                ),
            )
        elif scope == 'processing_rows':
            prow_ids = _as_int_ids(ids or data.get('processing_row_ids'))
            if not prow_ids:
                raise ValueError('processing_rows scope requires ids or processing_row_ids')
            m_ids = manifest_row_ids_from_processing_rows(order, prow_ids, require_linked=True)
            rows = ManifestRow.objects.filter(purchase_order=order, pk__in=m_ids)
            target_items = list(
                Item.objects.select_for_update().filter(
                    manifest_row__in=rows,
                    status__in=['intake', 'processing'],
                ),
            )
        else:
            raise ValueError('Invalid scope')

        if not target_items:
            raise ValueError('No matching pending items')

        histories = []
        for it in target_items:
            old = it.status
            if dtype == 'broken':
                it.status = 'scrapped'
                it.dispute_type = 'broken'
                it.dispute_pct_loss = int(pct)
                it.dispute_description = desc
            else:
                it.status = 'lost'
                it.dispute_type = 'undelivered'
                it.dispute_pct_loss = None
                it.dispute_description = ''
            it.save()
            histories.append(
                ItemHistory(
                    item=it,
                    event_type='status_change',
                    old_value=old,
                    new_value=it.status,
                    note=f'Marked disputed ({dtype})',
                    created_by=user,
                ),
            )
        ItemHistory.objects.bulk_create(histories)

        m_ids = {it.manifest_row_id for it in target_items if it.manifest_row_id}
        pr_ids = processing_row_ids_for_manifest_rows(order, m_ids)
        refresh_processing_rows_denorm(order, processing_row_ids=pr_ids)

        pct_val = int(pct) if dtype == 'broken' and pct is not None else None
        d = record_processing_dispute_for_items(user, order, target_items, dtype, pct_val, desc)
        return {
            'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=pr_ids),
            'dispute_id': d.id,
        }


def processing_bulk_disposition(user, order: PurchaseOrder, data: dict) -> dict:
    row_ids, _src = _resolve_merge_or_bulk_manifest_ids(order, data)
    retail = parse_decimal(data.get('retail'))
    groups = data.get('groups') or []
    if not row_ids or not groups:
        raise ValueError('processing_row_ids or manifest_row_ids, and groups required')

    rows = list(ManifestRow.objects.filter(purchase_order=order, pk__in=row_ids))
    if len(rows) != len(set(row_ids)):
        raise ValueError('Invalid manifest rows')

    pending: list[Item] = []
    with transaction.atomic():
        pending = list(
            Item.objects.select_for_update()
            .filter(manifest_row__in=rows, status__in=['intake', 'processing'])
            .order_by('id'),
        )
        total_needed = sum(int(g.get('count') or 0) for g in groups)
        if total_needed != len(pending):
            raise ValueError(f'Group totals {total_needed} must equal pending {len(pending)}')

        idx = 0
        histories = []
        now = timezone.now()
        for g in groups:
            cnt = int(g.get('count') or 0)
            chunk = pending[idx : idx + cnt]
            idx += cnt
            cond_db = _resolve_condition_db(g.get('condition'))
            dispatch = g.get('dispatch') or 'on_shelf'
            disputed = g.get('disputed')
            if cond_db == 'salvage':
                location = 'salvage'
            else:
                location = dispatch_to_location(dispatch)

            price_dec = parse_decimal(g.get('price'))
            if price_dec is not None:
                for mid in {it.manifest_row_id for it in chunk if it.manifest_row_id}:
                    push_shelf_price_to_bookmark(order, mid, price_dec)

            for it in chunk:
                if retail is not None:
                    it.retail = retail
                it.condition = cond_db
                it.location = location
                if disputed and isinstance(disputed, dict) and disputed.get('type') == 'broken':
                    it.status = 'scrapped'
                    it.dispute_type = 'broken'
                    it.dispute_pct_loss = int(disputed.get('pct_loss') or 100)
                    it.dispute_description = str(disputed.get('description') or '')
                    it.listed_at = None
                    it.checked_in_at = None
                    it.checked_in_by = None
                elif disputed and isinstance(disputed, dict) and disputed.get('type') == 'undelivered':
                    it.status = 'lost'
                    it.dispute_type = 'undelivered'
                    it.dispute_pct_loss = None
                    it.dispute_description = ''
                    it.listed_at = None
                    it.checked_in_at = None
                    it.checked_in_by = None
                else:
                    if price_dec is not None:
                        it.price = price_dec
                    old = it.status
                    it.status = 'on_shelf'
                    it.listed_at = now
                    it.checked_in_at = now
                    it.checked_in_by = user
                    it.dispute_type = ''
                    it.dispute_pct_loss = None
                    it.dispute_description = ''
                    histories.append(
                        ItemHistory(
                            item=it,
                            event_type='status_change',
                            old_value=old,
                            new_value='on_shelf',
                            note='Bulk disposition check-in',
                            created_by=user,
                        ),
                    )
                it.save()

        if histories:
            ItemHistory.objects.bulk_create(histories)

    pr_ids = processing_row_ids_for_manifest_rows(order, row_ids)
    refresh_processing_rows_denorm(order, processing_row_ids=pr_ids)

    return {'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=pr_ids)}


def processing_add_item(user, order: PurchaseOrder, data: dict) -> dict:
    """Create Item(s) with no manifest line and a first-class added ProcessingRow."""

    quantity = _parse_check_in_quantity(data.get('quantity'))

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail') or data.get('retail_value'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or data.get('location') or 'on_shelf'
    notes = str(data.get('notes') or '')
    title = str(data.get('title') or '').strip()
    brand = str(data.get('brand') or '').strip()
    model = str(data.get('model') or '').strip()
    category = str(data.get('category') or '').strip()
    upc = str(data.get('upc') or '').strip()
    identifiers = merge_identifiers(data.get('identifiers'), {'upc': upc} if upc else {})
    specs = data.get('specifications')
    specs = specs if isinstance(specs, dict) else {}
    search_tags = normalize_search_tags(data.get('search_tags'))

    if cond_db == 'salvage':
        location = 'salvage'
    else:
        location = dispatch_to_location(str(dispatch))

    if not title:
        raise ValueError('title is required')

    histories: list[ItemHistory] = []
    now = timezone.now()

    with transaction.atomic():
        product = _resolve_product_for_processing(
            {**data, 'product_mode': data.get('product_mode') or 'new'},
            matched_product=None,
            fallback_title=title,
            fallback_brand=brand,
            fallback_category=category,
            fallback_model=model,
            fallback_upc=upc,
            fallback_identifiers=identifiers,
            fallback_specs=specs,
            fallback_search_tags=search_tags,
        )

        item_price = price or Decimal('0.00')
        item_retail = retail
        unit_cost = order.compute_item_cost(item_retail)
        items = _bulk_create_checked_in_items([
            Item(
                product=product,
                purchase_order=order,
                manifest_row=None,
                price=item_price,
                retail=item_retail,
                cost=unit_cost,
                source='purchased',
                status='on_shelf',
                condition=cond_db,
                location=location,
                listed_at=now,
                checked_in_at=now,
                checked_in_by=user,
                specifications=specs,
                notes=notes,
            )
            for _ in range(quantity)
        ])
        histories.extend(
            ItemHistory(
                item=item,
                event_type='status_change',
                old_value='',
                new_value='on_shelf',
                note='Added item (no manifest line) via Item Processor',
                created_by=user,
            )
            for item in items
        )

        if histories:
            ItemHistory.objects.bulk_create(histories)

        identifiers = merge_identifiers(product.identifiers, identifiers)

        pr = ProcessingRow.objects.create(
            purchase_order=order,
            row_number=_next_processing_row_number(order),
            row_kind=ProcessingRow.ROW_KIND_ADDED,
            manifest_row=None,
            matched_product=product,
            quantity=quantity,
            item_ids=[i.id for i in items],
            title=product.title or title,
            brand=product.brand or brand,
            model=product.model or model,
            category=product.category or category,
            description=str(data.get('description') or product.description or ''),
            unit_retail=item_retail,
            shelf_price=item_price,
            final_price=item_price,
            identifiers=identifiers,
            search_tags=search_tags,
            notes=notes,
            condition=cond_db,
            queue_status='checked_in',
            qty_dispositioned=len(items),
            pending_item_count=0,
            has_on_shelf_unit=True,
            list_dispatch=location_to_dispatch(location),
            list_sku=items[0].sku if items else '',
        )

    refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=pr.pk)
    return {
        'row': detail['row'],
        'items': ItemSerializer(items, many=True).data,
        'created_count': len(items),
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[pr.pk]),
        'printed_items_preview': printed_items_preview([item.id for item in items]),
    }


def processing_row_patch(user, order: PurchaseOrder, processing_row_id: int, data: dict) -> dict:
    """Edit ProcessingRow defaults before or between check-ins (does not create Items)."""

    with transaction.atomic():
        row = (
            ProcessingRow.objects
            .select_for_update()
            .filter(pk=processing_row_id, purchase_order=order)
            .first()
        )
        if row is None:
            raise ProcessingRow.DoesNotExist

        if 'title' in data:
            row.title = str(data.get('title') or '')[:300]
        if 'brand' in data:
            row.brand = str(data.get('brand') or '')[:200]
        if 'model' in data:
            row.model = str(data.get('model') or '')[:200]
        if 'category' in data:
            row.category = str(data.get('category') or '')[:200]
        if 'description' in data:
            row.description = str(data.get('description') or '')
        if 'notes' in data:
            row.notes = str(data.get('notes') or '')
        if 'condition' in data:
            row.condition = _resolve_condition_db(data.get('condition'))[:20]
        if 'search_tags' in data:
            row.search_tags = normalize_search_tags(data.get('search_tags'))
        if 'unit_retail' in data or 'retail' in data:
            row.unit_retail = parse_decimal(data.get('unit_retail') or data.get('retail'))
        if 'proposed_price' in data:
            row.proposed_price = parse_decimal(data.get('proposed_price'))
        if 'final_price' in data:
            row.final_price = parse_decimal(data.get('final_price'))
        if 'price' in data or 'shelf_price' in data:
            shelf = parse_decimal(data.get('shelf_price') or data.get('price'))
            if shelf is not None:
                row.shelf_price = shelf
        if 'identifiers' in data:
            row.identifiers = _normalize_identifiers_dict(data.get('identifiers'))
        elif 'upc' in data:
            ids = dict(row.identifiers) if isinstance(row.identifiers, dict) else {}
            upc = str(data.get('upc') or '').strip()
            if upc:
                ids['upc'] = upc[:256]
            elif 'upc' in ids:
                ids.pop('upc', None)
            row.identifiers = ids

        row.save()

    refresh_processing_rows_denorm(order, processing_row_ids=[processing_row_id])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=processing_row_id)
    return {
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[processing_row_id]),
    }


_CHECKED_IN_DISPUTE_TYPES = frozenset({
    Item.DISPUTE_TYPE_BROKEN,
    Item.DISPUTE_TYPE_MISSING_PIECES,
    Item.DISPUTE_TYPE_COSMETIC_DAMAGE,
    Item.DISPUTE_TYPE_MISSING_CRITICAL_PIECE,
    Item.DISPUTE_TYPE_BAD_CONDITION,
    Item.DISPUTE_TYPE_OTHER,
})


def _apply_checked_in_dispute_patch(updates: dict, data: dict) -> None:
    """Patch dispute fields on on-shelf items without changing status."""
    if 'disputed' not in data and 'dispute_type' not in data and 'dispute_pct_loss' not in data:
        return
    if 'disputed' in data and not data.get('disputed'):
        updates['dispute_type'] = ''
        updates['dispute_pct_loss'] = None
        updates['dispute_description'] = ''
        return
    disputed = bool(data.get('disputed', True))
    if not disputed:
        updates['dispute_type'] = ''
        updates['dispute_pct_loss'] = None
        updates['dispute_description'] = ''
        return
    dtype = str(data.get('dispute_type') or '').strip()
    if dtype not in _CHECKED_IN_DISPUTE_TYPES:
        raise ValueError('dispute_type required when disputed')
    pct_raw = data.get('dispute_pct_loss')
    if pct_raw is None or pct_raw == '':
        raise ValueError('dispute_pct_loss required when disputed')
    pct = int(pct_raw)
    if pct < 0 or pct > 100:
        raise ValueError('dispute_pct_loss must be between 0 and 100')
    updates['dispute_type'] = dtype
    updates['dispute_pct_loss'] = pct
    updates['dispute_description'] = str(data.get('dispute_description') or '').strip()


def processing_patch_item(user, item: Item, data: dict) -> dict:
    """Edit item after check-in (no auto-status change)."""
    if item.status not in ('on_shelf',):
        raise ValueError('Edit-after-check-in applies to on-shelf items')

    updates = {}
    if 'price' in data:
        p = parse_decimal(data.get('price'))
        if p is not None:
            updates['price'] = p
    if 'unit_retail' in data or 'retail' in data:
        r = parse_decimal(data.get('unit_retail') or data.get('retail'))
        if r is not None:
            updates['retail'] = r
    if 'condition' in data:
        updates['condition'] = _resolve_condition_db(data.get('condition'))
    eff_condition = updates.get('condition', item.condition)
    if 'dispatch' in data:
        if eff_condition == 'salvage':
            updates['location'] = 'salvage'
        else:
            updates['location'] = dispatch_to_location(str(data.get('dispatch') or 'on_shelf'))
    if 'notes' in data:
        updates['notes'] = str(data.get('notes') or '')
    _apply_checked_in_dispute_patch(updates, data)

    histories = []
    with transaction.atomic():
        if updates.get('price') is not None and item.manifest_row_id:
            push_shelf_price_to_bookmark(
                item.purchase_order_id, item.manifest_row_id, updates['price'], item_id=item.pk,
            )
        changed = apply_item_updates(item, updates)
        item.save()
        for field, old_value, new_value in changed:
            histories.append(
                ItemHistory(
                    item=item,
                    event_type=history_event_type_for_field(field),
                    old_value='' if old_value is None else str(old_value),
                    new_value='' if new_value is None else str(new_value),
                    note='Processing PATCH',
                    created_by=user,
                ),
            )
        if histories:
            ItemHistory.objects.bulk_create(histories)

    item.refresh_from_db()
    po = PurchaseOrder.objects.get(pk=item.purchase_order_id)
    mids = {item.manifest_row_id} if item.manifest_row_id else set()
    pr_ids = processing_row_ids_for_manifest_rows(po, mids)
    refresh_processing_rows_denorm(po, processing_row_ids=pr_ids)
    return {
        'item': ItemSerializer(item).data,
        'workspace_patch': build_workspace_patch(po, touched_processing_row_ids=pr_ids),
    }
