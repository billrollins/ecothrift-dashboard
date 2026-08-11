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
    ItemCheckIn,
    ItemHistory,
    ManifestRow,
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
    attach_product_link,
    attributed_items_for_processing_row,
    build_workspace_patch,
    condition_ui_to_db,
    dispatch_to_location,
    distinct_product_count_for_items,
    location_to_dispatch,
    merge_product_links_for_rows,
    primary_product_id_for_items,
    printed_items_preview,
    processing_row_ids_for_manifest_rows,
    push_shelf_price_to_bookmark,
    refresh_processing_rows_denorm,
    effective_row_shelf_price,
    effective_row_unit_retail,
    scale_row_amount_for_product_link,
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


def _sync_item_check_in_quantity(check_in: ItemCheckIn) -> None:
    """Keep denormalized quantity in sync with Item.check_in FK membership."""
    qty = check_in.items.count()
    if check_in.quantity != qty:
        check_in.quantity = qty
        check_in.save(update_fields=['quantity', 'updated_at'])


def _items_for_item_check_in(
    check_in: ItemCheckIn,
    order: PurchaseOrder,
    *,
    for_update: bool = False,
) -> list[Item]:
    qs = check_in.items.filter(purchase_order=order).order_by('pk')
    if for_update:
        qs = qs.select_for_update()
    return list(qs)


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
        ItemCheckIn.objects.filter(processing_row=row)
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
) -> tuple[list[Item], ItemCheckIn]:
    """Check in units on a locked ProcessingRow. Caller must hold row lock inside transaction."""

    quantity = _parse_check_in_quantity(data.get('quantity'))

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or 'on_shelf'
    if dispatch == 'restoration' and quantity > 1:
        raise ValueError('Restoration check-in is one item at a time. Set quantity to 1.')
    restoration_scale = ''
    restoration_grade_values: dict[str, float] = {}
    processing_handoff = None
    if dispatch == 'restoration':
        from apps.inventory.services.restoration import (
            normalize_processing_handoff,
            validate_restoration_check_in_payload,
        )

        restoration_scale, restoration_grade_values = validate_restoration_check_in_payload(data)
        if 'processing_handoff' in data:
            processing_handoff = normalize_processing_handoff(
                data.get('processing_handoff'),
                user=user,
            )
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

    is_added_row = row.row_kind == ProcessingRow.ROW_KIND_ADDED
    if row.manifest_row_id is None and not is_added_row:
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

    row_shelf = effective_row_shelf_price(row)
    if price is not None:
        item_price = price
    else:
        scaled_price = scale_row_amount_for_product_link(row_shelf, product.id, row)
        item_price = scaled_price if scaled_price is not None else Decimal('0.00')
    if retail is not None:
        item_retail = retail
    else:
        item_retail = scale_row_amount_for_product_link(effective_row_unit_retail(row), product.id, row)
    now = timezone.now()
    unit_cost = order.compute_item_cost(item_retail)
    manifest_row = row.manifest_row if not is_added_row else None
    check_in_origin = (
        ItemCheckIn.ORIGIN_PRODUCT_AD_HOC if is_added_row else ItemCheckIn.ORIGIN_PROCESSING
    )
    defaults_snapshot = {
        'condition': cond_db,
        'dispatch': dispatch,
        'location': location,
        'price': str(item_price) if item_price is not None else None,
        'retail': str(item_retail) if item_retail is not None else None,
        'notes': notes,
        'specifications': specs or row.specifications or {},
    }
    if dispatch == 'restoration':
        from apps.inventory.services.restoration import merge_restoration_into_defaults_snapshot

        defaults_snapshot = merge_restoration_into_defaults_snapshot(
            defaults_snapshot,
            restoration_scale,
            restoration_grade_values,
            processing_handoff,
        )
    batch = ItemCheckIn.objects.create(
        purchase_order=order,
        processing_row=row,
        manifest_row=manifest_row,
        product=product,
        origin=check_in_origin,
        quantity=0,
        defaults_snapshot=defaults_snapshot,
        created_by=user,
    )
    items = _bulk_create_checked_in_items([
        Item(
            product=product,
            purchase_order=order,
            manifest_row=manifest_row,
            check_in=batch,
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
    _sync_item_check_in_quantity(batch)
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
    if item_price is not None and row.manifest_row_id is not None:
        push_shelf_price_to_bookmark(order.id, row.manifest_row_id, item_price, processing_row_id=row.pk)
    if dispatch == 'restoration':
        from apps.inventory.services.restoration import create_restoration_job_from_check_in

        create_restoration_job_from_check_in(
            batch,
            scale=restoration_scale,
            grade_values=restoration_grade_values,
            user=user,
        )
    return items, batch


def processing_row_check_in(user, order: PurchaseOrder, processing_row_id: int, data: dict) -> dict:
    """Create real Product/Item rows from a ProcessingRow at physical check-in time.

    P7 collapse: a check-in on a group MASTER distributes quantity across the group in
    row order — earlier rows fill first; any excess lands on the LAST row as overage.
    Followers reject direct check-in (the master owns the group).
    """

    all_items: list[Item] = []
    batches: list[ItemCheckIn] = []
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
    from apps.inventory.services.restoration import restoration_job_id_for_check_in

    first_batch_id = batches[0].id if batches else None
    return {
        'items': ItemSerializer(all_items, many=True).data,
        'created_count': len(all_items),
        'item_check_in_id': first_batch_id,
        'item_check_in_ids': [b.id for b in batches],
        'restoration_job_id': restoration_job_id_for_check_in(first_batch_id),
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

    check_in_ids: list[int] = []
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
            check_in_ids.append(batch.id)
            touched_ids.append(int(row.id))

    refresh_processing_rows_denorm(order, processing_row_ids=touched_ids)
    return {
        'items': ItemSerializer(all_items, many=True).data,
        'created_count': len(all_items),
        'item_check_in_ids': check_in_ids,
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
    never merged. All attached products and prior check-ins from every row stay linked;
    row details come from the master (earliest row). Optional ``product_mode``
    'existing' (+product_id) or 'new' still forces one shared product on every row.
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

        master, *members = locked

        product_mode = str(data.get('product_mode') or 'keep').strip().lower()
        if product_mode in ('existing', 'new'):
            assign = processing_assign_shared_product(user, order, {**data, 'processing_row_ids': row_ids})
            shared_product_id = assign['product_id']
            for r in locked:
                r.refresh_from_db()
        else:
            shared_product_id = master.matched_product_id
            master.product_links = merge_product_links_for_rows(*locked)

        master.collapse_master = None
        master_update_fields = ['collapse_master', 'updated_at']
        if product_mode not in ('existing', 'new'):
            master_update_fields.append('product_links')
        master.save(update_fields=master_update_fields)
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


def remap_item_check_in_product(
    user,
    order: PurchaseOrder,
    item_check_in_id: int,
    data: dict,
) -> dict:
    """Re-point all Items in an ItemCheckIn to a different Product (atomic)."""

    with transaction.atomic():
        check_in = (
            ItemCheckIn.objects.select_for_update()
            .filter(pk=item_check_in_id, purchase_order=order)
            .first()
        )
        if check_in is None:
            raise ValueError('Item check-in not found for this order.')
        row = None
        if check_in.processing_row_id:
            row = (
                ProcessingRow.objects.select_for_update()
                .get(pk=check_in.processing_row_id, purchase_order=order)
            )
        matched = Product.objects.filter(pk=check_in.product_id).first() if check_in.product_id else None

        items = _items_for_item_check_in(check_in, order, for_update=True)
        if not items:
            raise ValueError('Check-in has no items to remap.')

        expected_mr = check_in.manifest_row_id or (row.manifest_row_id if row else None)
        for item in items:
            if expected_mr is not None and item.manifest_row_id != expected_mr:
                raise ValueError('Check-in items must belong to the same manifest row.')
            if row is not None and expected_mr is None and item.pk not in set(_processing_row_item_ids(row)):
                raise ValueError('Check-in items must belong to this processing row.')

        fallback_title = (row.title if row else None) or (items[0].product.title if items and items[0].product_id else f'Check-in {check_in.pk}')
        fallback_brand = (row.brand if row else '') or (items[0].product.brand if items and items[0].product_id else '')
        fallback_category = (row.category if row else '') or ''
        fallback_model = (row.model if row else '') or (items[0].product.model if items and items[0].product_id else '')
        fallback_upc = _processing_row_upc(row) if row else ''
        fallback_identifiers = (row.identifiers if row else {}) or {}
        fallback_specs = (row.specifications if row else {}) or (items[0].specifications if items else {})
        fallback_search_tags = normalize_search_tags(getattr(row, 'search_tags', None) if row else None)

        product = _resolve_product_for_processing(
            data,
            matched_product=matched,
            fallback_title=fallback_title,
            fallback_brand=fallback_brand,
            fallback_category=fallback_category,
            fallback_model=fallback_model,
            fallback_upc=fallback_upc,
            fallback_identifiers=fallback_identifiers,
            fallback_specs=fallback_specs,
            fallback_search_tags=fallback_search_tags,
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
                    note='Product remapped via Item Processor check-in remap',
                    created_by=user,
                ),
            )

        check_in.product = product
        check_in.save(update_fields=['product'])

        if histories:
            ItemHistory.objects.bulk_create(histories)

    touched_row_ids = [row.pk] if row is not None else []
    if touched_row_ids:
        refresh_processing_rows_denorm(order, processing_row_ids=touched_row_ids)
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk) if row is not None else {'row': None}
    return {
        'item_check_in_id': check_in.id,
        'product_id': product.id,
        'items_updated': len(items),
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_row_ids),
    }


def remap_single_item_product(user, item: Item, data: dict) -> dict:
    """Re-point one Item to a different Product (check-in correction for a single unit)."""

    if item.status == 'sold' or item.sold_at:
        raise ValueError('Sold items cannot be remapped.')
    if item.status in ('scrapped', 'lost'):
        raise ValueError('Terminal items cannot be remapped.')

    with transaction.atomic():
        Item.objects.select_for_update().filter(pk=item.pk).first()
        item = Item.objects.select_related(
            'product', 'product__category', 'purchase_order', 'manifest_row',
        ).get(pk=item.pk)
        check_in = None
        row = None
        if item.check_in_id:
            ItemCheckIn.objects.select_for_update().filter(pk=item.check_in_id).first()
            check_in = ItemCheckIn.objects.select_related('processing_row').get(
                pk=item.check_in_id,
                purchase_order_id=item.purchase_order_id,
            )
            row = check_in.processing_row
        matched = item.product

        fallback_title = (
            (item.product.title if item.product_id else '')
            or (row.title if row else '')
            or (item.manifest_row.title if item.manifest_row_id else '')
            or f'Item {item.sku}'
        )
        fallback_brand = (
            (item.product.brand if item.product_id else '')
            or (row.brand if row else '')
            or ''
        )
        fallback_category = (
            (item.product.category.name if item.product_id and item.product.category_id else '')
            or (row.category if row else '')
            or ''
        )
        fallback_model = (
            (item.product.model if item.product_id else '')
            or (row.model if row else '')
            or ''
        )
        fallback_upc = _processing_row_upc(row) if row else ''
        fallback_identifiers = (row.identifiers if row else {}) or {}
        fallback_specs = item.specifications or (row.specifications if row else {}) or {}
        fallback_search_tags = normalize_search_tags(getattr(row, 'search_tags', None) if row else None)

        product = _resolve_product_for_processing(
            data,
            matched_product=matched,
            fallback_title=fallback_title,
            fallback_brand=fallback_brand,
            fallback_category=fallback_category,
            fallback_model=fallback_model,
            fallback_upc=fallback_upc,
            fallback_identifiers=fallback_identifiers,
            fallback_specs=fallback_specs,
            fallback_search_tags=fallback_search_tags,
        )

        old_pid = item.product_id
        changed = old_pid != product.id
        if changed:
            item.product = product
            item.save(update_fields=['product', 'search_text', 'updated_at'])
            ItemHistory.objects.create(
                item=item,
                event_type='note',
                old_value=str(old_pid or ''),
                new_value=str(product.id),
                note='Product corrected via item edit (check-in correction)',
                created_by=user,
            )

        if check_in is not None:
            siblings = _items_for_item_check_in(check_in, item.purchase_order, for_update=True)
            product_ids = {s.product_id for s in siblings if s.product_id}
            if len(product_ids) == 1:
                shared_pid = next(iter(product_ids))
                if check_in.product_id != shared_pid:
                    check_in.product_id = shared_pid
                    check_in.save(update_fields=['product', 'updated_at'])

    touched_row_ids: list[int] = []
    po = item.purchase_order
    if check_in is not None and check_in.processing_row_id:
        touched_row_ids = [int(check_in.processing_row_id)]
    elif item.manifest_row_id and po is not None:
        touched_row_ids = processing_row_ids_for_manifest_rows(po, {item.manifest_row_id})

    if po is not None and touched_row_ids:
        refresh_processing_rows_denorm(po, processing_row_ids=touched_row_ids)

    item.refresh_from_db()
    workspace_patch = (
        build_workspace_patch(po, touched_processing_row_ids=touched_row_ids)
        if po is not None and touched_row_ids
        else None
    )
    return {
        'item_id': item.id,
        'product_id': product.id,
        'changed': changed,
        'item_check_in_id': check_in.id if check_in else None,
        'item': ItemSerializer(item).data,
        'workspace_patch': workspace_patch,
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
        if row.manifest_row_id is None and row.row_kind != ProcessingRow.ROW_KIND_ADDED:
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
        row.product_links = attach_product_link(row, product.id)
        row.save(update_fields=['matched_product', 'product_links', 'updated_at'])

    refresh_processing_rows_denorm(order, processing_row_ids=[processing_row_id])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=processing_row_id)
    return {
        'product_id': product.id,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[processing_row_id]),
    }


def processing_delete_added_row(user, order: PurchaseOrder, processing_row_id: int) -> dict:
    """Delete an unmanifested queue line that has no check-ins."""

    deleted_ids: list[int] = []

    with transaction.atomic():
        row = (
            ProcessingRow.objects.select_for_update()
            .filter(pk=processing_row_id, purchase_order=order)
            .first()
        )
        if row is None:
            raise ProcessingRow.DoesNotExist
        if row.row_kind != ProcessingRow.ROW_KIND_ADDED:
            raise ValueError('Only unmanifested lines can be deleted from the queue.')

        if row.split_parent_id:
            members = [row]
        else:
            members = [row] + list(
                ProcessingRow.objects.select_for_update()
                .filter(split_parent_id=row.pk)
                .order_by('row_number'),
            )

        for member in members:
            if ItemCheckIn.objects.filter(processing_row_id=member.pk).exists():
                raise ValueError('Remove all check-ins from this line before deleting it.')
            if attributed_items_for_processing_row(member):
                raise ValueError('Remove all check-ins from this line before deleting it.')

        deleted_ids = [m.pk for m in members]
        ProcessingRow.objects.filter(pk__in=deleted_ids).delete()

    return {
        'processing_row_id': processing_row_id,
        'deleted_processing_row_ids': deleted_ids,
    }


def delete_item_check_in(user, order: PurchaseOrder, item_check_in_id: int) -> dict:
    """Delete one ItemCheckIn and its Items (undo a mistaken check-in).

    The check-in's Product is also deleted when the item deletion leaves it fully
    orphaned (no items, rows, manifest lines, vendor refs, or other check-ins).
    """

    with transaction.atomic():
        check_in = (
            ItemCheckIn.objects.select_for_update()
            .filter(pk=item_check_in_id, purchase_order=order)
            .first()
        )
        if check_in is None:
            raise ValueError('Item check-in not found for this order.')
        row = None
        if check_in.processing_row_id:
            row = (
                ProcessingRow.objects.select_for_update()
                .get(pk=check_in.processing_row_id, purchase_order=order)
            )
        check_in_product_id = check_in.product_id

        items = _items_for_item_check_in(check_in, order, for_update=True)
        item_pks = [i.pk for i in items]
        if not item_pks:
            from apps.inventory.services.restoration import delete_restoration_job_if_removable

            delete_restoration_job_if_removable(check_in)
            check_in.delete()
        else:
            sold = [i for i in items if i.status == 'sold' or i.sold_at]
            if sold:
                raise ValueError(
                    f'{len(sold)} item(s) in this check-in are sold — delete is blocked.',
                )
            from apps.pos.models import CartLine

            if CartLine.objects.filter(item_id__in=item_pks).exists():
                raise ValueError('Items in this check-in are referenced by POS carts — delete is blocked.')

            Item.objects.filter(pk__in=item_pks).delete()
            from apps.inventory.services.restoration import delete_restoration_job_if_removable

            delete_restoration_job_if_removable(check_in)
            check_in.delete()

        product_deleted = None
        if check_in_product_id:
            from apps.inventory.services.processing_transforms import _product_safe_to_delete

            product = Product.objects.filter(pk=check_in_product_id).first()
            exclude_row_ids = [row.pk] if row is not None else []
            if product is not None and _product_safe_to_delete(product, exclude_row_ids=exclude_row_ids):
                product.delete()
                product_deleted = check_in_product_id

    touched_row_ids = [row.pk] if row is not None else []
    if touched_row_ids:
        refresh_processing_rows_denorm(order, processing_row_ids=touched_row_ids)
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk) if row is not None else {'row': None}
    return {
        'item_check_in_id': item_check_in_id,
        'items_deleted': len(item_pks),
        'product_deleted': product_deleted,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_row_ids),
    }


def update_item_check_in(user, order: PurchaseOrder, item_check_in_id: int, data: dict) -> dict:
    """Edit one prior ItemCheckIn in place (owner spec 2026-06-12).

    Clicking a prior check-in EDITS that event — it never creates a new one:
    - ``quantity`` greater than current ADDS items (bulk, same product/defaults);
      smaller DELETES the newest items (sold / POS-cart items block the shrink).
    - ``condition`` / ``dispatch`` / ``price`` / ``retail`` / ``notes`` apply to
      every remaining item in the check-in.
    - ``product_mode`` existing/new re-points the check-in (remap); ``edit`` updates
      the check-in product's catalog fields in place.
    """

    with transaction.atomic():
        check_in = (
            ItemCheckIn.objects.select_for_update()
            .filter(pk=item_check_in_id, purchase_order=order)
            .first()
        )
        if check_in is None:
            raise ValueError('Item check-in not found for this order.')
        row = None
        if check_in.processing_row_id:
            row = (
                ProcessingRow.objects.select_for_update()
                .get(pk=check_in.processing_row_id, purchase_order=order)
            )
            row = (
                ProcessingRow.objects.select_related('manifest_row', 'matched_product')
                .get(pk=row.pk)
            )

        items = _items_for_item_check_in(check_in, order, for_update=True)

        histories: list[ItemHistory] = []
        original_order_id = order.pk

        # --- Purchase order reassignment -------------------------------------------
        new_po_raw = data.get('purchase_order') if 'purchase_order' in data else data.get('purchase_order_id')
        if new_po_raw not in (None, ''):
            try:
                new_po_id = int(new_po_raw)
            except (TypeError, ValueError) as e:
                raise ValueError('purchase_order must be an integer') from e
            if new_po_id != check_in.purchase_order_id:
                new_order = PurchaseOrder.objects.filter(pk=new_po_id).first()
                if new_order is None:
                    raise ValueError('Purchase order not found.')
                if check_in.processing_row_id:
                    pr_po_id = (
                        ProcessingRow.objects.filter(pk=check_in.processing_row_id)
                        .values_list('purchase_order_id', flat=True)
                        .first()
                    )
                    if pr_po_id != new_po_id:
                        check_in.processing_row = None
                check_in.purchase_order = new_order
                order = new_order
                for item in items:
                    item.purchase_order = new_order
                    item.save(update_fields=['purchase_order', 'updated_at'], defer_po_cost_recompute=True)

        # --- Product: keep / existing / new / edit ---------------------------------
        product = Product.objects.filter(pk=check_in.product_id).first() if check_in.product_id else None
        product_mode = str(data.get('product_mode') or '').strip().lower()
        if product_mode in ('existing', 'new', 'edit'):
            fallback_title = (row.title if row else None) or (product.title if product else f'Check-in {check_in.pk}')
            fallback_brand = (row.brand if row else '') or (product.brand if product else '')
            fallback_category = (row.category if row else '') or (product.category.name if product and product.category_id else '')
            fallback_model = (row.model if row else '') or (product.model if product else '')
            fallback_upc = _processing_row_upc(row) if row else ''
            fallback_identifiers = (row.identifiers if row else {}) or (product.identifiers if product else {})
            fallback_specs = (row.specifications if row else {}) or {}
            fallback_search_tags = normalize_search_tags(getattr(row, 'search_tags', None) if row else None)
            product = _resolve_product_for_processing(
                data,
                matched_product=product,
                fallback_title=fallback_title,
                fallback_brand=fallback_brand,
                fallback_category=fallback_category,
                fallback_model=fallback_model,
                fallback_upc=fallback_upc,
                fallback_identifiers=fallback_identifiers,
                fallback_specs=fallback_specs,
                fallback_search_tags=fallback_search_tags,
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
                        note='Product changed via check-in edit',
                        created_by=user,
                    ),
                )
                item.product = product
            if check_in.product_id != (product.id if product else None):
                check_in.product = product

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
        if 'status' in data:
            st = str(data.get('status') or '').strip()
            if st == 'sold':
                raise ValueError('Sold status is set through point of sale')
            allowed_status = {c[0] for c in Item.STATUS_CHOICES}
            if st in allowed_status:
                updates['status'] = st
        if 'notes' in data:
            updates['notes'] = str(data.get('notes') or '')
        if 'specifications' in data:
            specs = data.get('specifications')
            updates['specifications'] = specs if isinstance(specs, dict) else {}
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
                            note='Edited via check-in edit',
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
                row_retail = effective_row_unit_retail(row) if row else None
                row_shelf = effective_row_shelf_price(row) if row else None
                scaled_row_retail = (
                    scale_row_amount_for_product_link(row_retail, product.id, row)
                    if row and product else row_retail
                )
                scaled_row_shelf = (
                    scale_row_amount_for_product_link(row_shelf, product.id, row)
                    if row and product else row_shelf
                )
                row_specs = (
                    updates.get('specifications')
                    or (template.specifications if template and isinstance(template.specifications, dict) else {})
                    or (row.specifications if row else {})
                )
                row_manifest = row.manifest_row if row else check_in.manifest_row
                price_val = updates.get('price', template.price if template else (scaled_row_shelf or Decimal('0.00')))
                retail_val = updates.get('retail', template.retail if template else scaled_row_retail)
                cond_val = updates.get('condition', template.condition if template else 'good')
                status_val = updates.get('status', template.status if template else 'on_shelf')
                loc_val = updates.get('location', template.location if template else 'on_shelf')
                notes_val = updates.get('notes', template.notes if template else '')
                unit_cost = order.compute_item_cost(retail_val)
                added_items = _bulk_create_checked_in_items([
                    Item(
                        product=product,
                        purchase_order=order,
                        manifest_row=row_manifest,
                        check_in=check_in,
                        price=price_val,
                        retail=retail_val,
                        cost=unit_cost,
                        source='purchased',
                        status=status_val,
                        condition=cond_val,
                        location=loc_val,
                        listed_at=now,
                        checked_in_at=now,
                        checked_in_by=user,
                        specifications=row_specs or {},
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
                        note='Added via check-in edit',
                        created_by=user,
                    )
                    for item in added_items
                )
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
                items = items[:new_qty]

        _sync_item_check_in_quantity(check_in)
        snapshot = dict(check_in.defaults_snapshot or {})
        prior_dispatch = snapshot.get('dispatch')
        effective_dispatch = dispatch or prior_dispatch
        for key, src in (
            ('condition', updates.get('condition')),
            ('status', updates.get('status')),
            ('location', updates.get('location')),
            ('price', str(updates['price']) if updates.get('price') is not None else None),
            ('retail', str(updates['retail']) if updates.get('retail') is not None else None),
            ('notes', updates.get('notes')),
            ('specifications', updates.get('specifications')),
        ):
            if src is not None:
                snapshot[key] = src

        handoff_present = 'processing_handoff' in data
        if handoff_present:
            if effective_dispatch != 'restoration':
                raise ValueError('processing_handoff is only valid for restoration check-ins.')
            from apps.inventory.services.restoration import normalize_processing_handoff

            snapshot['processing_handoff'] = normalize_processing_handoff(
                data.get('processing_handoff'),
                user=user,
            )

        restoration_config_present = (
            'restoration_scale' in data or 'restoration_grade_values' in data
        )
        restoration_scale = str(
            data.get('restoration_scale', snapshot.get('restoration_scale')) or '',
        ).strip()
        restoration_grade_values = (
            data.get('restoration_grade_values')
            if 'restoration_grade_values' in data
            else snapshot.get('restoration_grade_values')
        )
        if effective_dispatch == 'restoration' and (
            restoration_config_present or prior_dispatch != 'restoration'
        ):
            from apps.inventory.services.restoration import (
                merge_restoration_into_defaults_snapshot,
                validate_restoration_check_in_payload,
            )

            restoration_scale, restoration_grade_values = validate_restoration_check_in_payload({
                'dispatch': 'restoration',
                'restoration_scale': restoration_scale,
                'restoration_grade_values': restoration_grade_values,
            })
            snapshot = merge_restoration_into_defaults_snapshot(
                snapshot,
                restoration_scale,
                restoration_grade_values,
            )

        if dispatch:
            snapshot['dispatch'] = dispatch
            if prior_dispatch == 'restoration' and dispatch != 'restoration':
                from apps.inventory.services.restoration import delete_restoration_job_for_check_in

                delete_restoration_job_for_check_in(check_in)
        check_in.defaults_snapshot = snapshot
        check_in.save()

        if effective_dispatch == 'restoration':
            from apps.inventory.models import RestorationJob
            from apps.inventory.services.restoration import create_restoration_job_from_check_in

            existing_job = RestorationJob.objects.filter(item_check_in=check_in).first()
            if restoration_config_present and existing_job is not None:
                if existing_job.stage != RestorationJob.STAGE_QUEUED:
                    raise ValueError('Restoration values cannot be edited after the job leaves the queue.')
            if prior_dispatch != 'restoration' or restoration_config_present:
                create_restoration_job_from_check_in(
                    check_in,
                    scale=restoration_scale,
                    grade_values=restoration_grade_values,
                    user=user,
                )

        if histories:
            ItemHistory.objects.bulk_create(histories)
        manifest_row_id = row.manifest_row_id if row else check_in.manifest_row_id
        if updates.get('price') is not None and manifest_row_id:
            push_shelf_price_to_bookmark(
                order.id,
                manifest_row_id,
                updates['price'],
                processing_row_id=row.pk if row else None,
            )

    touched_row_ids = [row.pk] if row is not None else []
    if touched_row_ids:
        refresh_processing_rows_denorm(order, processing_row_ids=touched_row_ids)
    if original_order_id != order.pk:
        refresh_processing_rows_denorm(PurchaseOrder.objects.get(pk=original_order_id), processing_row_ids=[])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=row.pk) if row is not None else {'row': None}
    from apps.inventory.services.restoration import restoration_job_id_for_check_in

    return {
        'item_check_in_id': check_in.id,
        'purchase_order_id': check_in.purchase_order_id,
        'items_added': len(added_items),
        'items_removed': len(removed_ids),
        'items_updated': items_updated,
        'quantity': check_in.quantity,
        'product_id': check_in.product_id,
        'restoration_job_id': restoration_job_id_for_check_in(check_in.id),
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched_row_ids),
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
    """Create a pending unmanifested ProcessingRow (no Items until row check-in)."""

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

    if not title:
        raise ValueError('title is required')

    product_mode = str(data.get('product_mode') or '').strip().lower()
    product: Product | None = None
    if product_mode in ('new', 'existing', 'edit', 'keep'):
        product = _resolve_product_for_processing(
            {**data, 'product_mode': product_mode},
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
        if product is not None:
            identifiers = merge_identifiers(product.identifiers, identifiers)
            if not brand and product.brand:
                brand = product.brand
            if not model and product.model:
                model = product.model
            if not category and product.category_id:
                category = product.category.name

    item_price = price or Decimal('0.00')
    item_retail = retail

    with transaction.atomic():
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            row_number=_next_processing_row_number(order),
            row_kind=ProcessingRow.ROW_KIND_ADDED,
            manifest_row=None,
            matched_product=product,
            quantity=quantity,
            item_ids=[],
            title=title,
            brand=brand,
            model=model,
            category=category,
            unit_retail=item_retail,
            shelf_price=item_price if item_price is not None else None,
            final_price=item_price if item_price is not None else None,
            identifiers=identifiers,
            search_tags=search_tags,
            specifications=specs,
            notes=notes,
            condition=cond_db,
            queue_status='pending',
            qty_dispositioned=0,
            pending_item_count=quantity,
            has_on_shelf_unit=False,
            list_dispatch=str(dispatch or 'on_shelf'),
            list_sku='',
        )
        from apps.inventory.services.processing_search_string import build_processing_row_search_string

        pr.search_string = build_processing_row_search_string(pr)
        pr.save(update_fields=['search_string', 'updated_at'])

    refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
    from apps.inventory.services.processing_workspace import build_processing_row_detail

    detail = build_processing_row_detail(order, processing_row_id=pr.pk)
    return {
        'row': detail['row'],
        'items': [],
        'created_count': 0,
        'created_items': [],
        'created_item_ids': [],
        'processing_row_id': pr.pk,
        'item_check_in_id': None,
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[pr.pk]),
        'printed_items_preview': [],
    }


def product_check_in_order_options(*, search: str = '', limit: int = 25) -> list[dict]:
    """Preferred purchase orders for product-first check-in (default misfit, then manual adds)."""

    seen: set[int] = set()
    out: list[dict] = []

    def append(po: PurchaseOrder | None, *, is_default: bool = False, hint: str = '') -> None:
        if po is None or po.pk in seen:
            return
        seen.add(po.pk)
        out.append({
            'id': po.pk,
            'order_number': po.order_number or f'PO #{po.pk}',
            'vendor_name': po.vendor.name if po.vendor_id else '',
            'ordered_date': po.ordered_date.isoformat() if po.ordered_date else None,
            'description': (po.description or '').strip(),
            'is_default': is_default,
            'hint': hint,
        })

    misfit = (
        PurchaseOrder.objects
        .select_related('vendor')
        .filter(order_number__startswith='MISFIT')
        .order_by('-ordered_date', '-id')
        .first()
    )
    append(misfit, is_default=True, hint='Default no-manifest check-in order')

    added_po_ids = (
        ProcessingRow.objects
        .filter(row_kind=ProcessingRow.ROW_KIND_ADDED)
        .values_list('purchase_order_id', flat=True)
        .distinct()
    )
    manual_qs = (
        PurchaseOrder.objects
        .select_related('vendor')
        .filter(id__in=added_po_ids)
        .order_by('-ordered_date', '-id')
    )
    if misfit is not None:
        manual_qs = manual_qs.exclude(pk=misfit.pk)
    for po in manual_qs[:8]:
        append(po, hint='Prior manual check-in order')

    raw = (search or '').strip()
    if raw:
        qs = PurchaseOrder.objects.select_related('vendor').all()
        for word in raw.split()[:5]:
            w = word.strip()
            if w:
                qs = qs.filter(search_text__icontains=w.lower())
        for po in qs.order_by('-ordered_date', '-id'):
            append(po)
            if len(out) >= limit:
                break

    return out[:limit]


def product_check_in(user, product: Product, data: dict) -> dict:
    """Check in on-shelf items for a locked catalog product (no product identity edits)."""

    raw_po = data.get('purchase_order')
    if raw_po in (None, ''):
        raise ValueError('purchase_order is required')
    try:
        po_id = int(raw_po)
    except (TypeError, ValueError) as e:
        raise ValueError('purchase_order must be an integer') from e

    order = PurchaseOrder.objects.filter(pk=po_id).first()
    if order is None:
        raise ValueError('Purchase order not found')

    category_name = product.category.name if product.category_id else ''
    payload = {
        **data,
        'product_mode': 'existing',
        'product_id': product.pk,
        'title': product.title or 'Product',
        'brand': product.brand or '',
        'model': product.model or '',
        'category': category_name,
    }
    result = processing_add_item(user, order, payload)
    row_id = result.get('processing_row_id')
    if not row_id:
        raise ValueError('Could not create processing row for check-in')

    check_in_result = processing_row_check_in(user, order, row_id, payload)
    created_item_ids = [item['id'] for item in check_in_result.get('items', [])]

    return {
        'product_id': product.pk,
        'purchase_order_id': order.pk,
        'created_count': check_in_result['created_count'],
        'created_item_ids': created_item_ids,
        'processing_row_id': row_id,
        'item_check_in_id': check_in_result.get('item_check_in_id'),
        'printed_items_preview': check_in_result.get('printed_items_preview') or [],
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
                # Keep final_price in lockstep (same as push_shelf_price_to_bookmark).
                # Denorm falls back to final_price when a row has no items; leaving it
                # stale would overwrite a fresh shelf_price on the next refresh.
                row.shelf_price = shelf
                row.final_price = shelf
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
        if 'product_links' in data or 'productLinks' in data:
            from apps.inventory.services.processing_workspace import _serialize_product_links, _processing_row_item_count_for_product

            raw_links = data.get('product_links', data.get('productLinks'))
            new_links = _serialize_product_links(raw_links)
            old_links = _serialize_product_links(row.product_links)
            for key in set(old_links) - set(new_links):
                pid = int(key)
                if _processing_row_item_count_for_product(row, pid) > 0:
                    raise ValueError(
                        'Cannot remove a product that already has check-ins on this row.',
                    )
            row.product_links = new_links
            if row.matched_product_id and str(int(row.matched_product_id)) not in new_links:
                remaining = list(new_links.keys())
                row.matched_product_id = int(remaining[-1]) if remaining else None
        elif 'attach_product_id' in data or 'attachProductId' in data:
            from apps.inventory.services.processing_workspace import attach_product_link

            raw_pid = data.get('attach_product_id', data.get('attachProductId'))
            try:
                pid = int(raw_pid)
            except (TypeError, ValueError) as e:
                raise ValueError('attach_product_id must be an integer') from e
            if not Product.objects.filter(pk=pid).exists():
                raise ValueError('Product not found.')
            row.product_links = attach_product_link(row, pid)
            if row.matched_product_id is None:
                row.matched_product_id = pid

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


_PROCESSING_PATCH_SHELF_ONLY_KEYS = frozenset({
    'price',
    'unit_retail',
    'retail',
    'condition',
    'dispatch',
    'notes',
    'disputed',
    'dispute_type',
    'dispute_pct_loss',
    'dispute_description',
})


def processing_patch_item(user, item: Item, data: dict) -> dict:
    """Edit item after check-in (condition/dispatch/price on shelf; status on checked-in items)."""
    if any(key in data for key in _PROCESSING_PATCH_SHELF_ONLY_KEYS):
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
    if 'status' in data:
        st = str(data.get('status') or '').strip()
        if st == 'sold':
            raise ValueError('Sold status is set through point of sale')
        allowed_status = {choice[0] for choice in Item.STATUS_CHOICES}
        if st in allowed_status:
            if item.status == 'sold' or item.sold_at:
                raise ValueError('Cannot change status on sold items')
            updates['status'] = st
    if 'notes' in data:
        updates['notes'] = str(data.get('notes') or '')
    _apply_checked_in_dispute_patch(updates, data)

    if not updates:
        item.refresh_from_db()
        po = PurchaseOrder.objects.get(pk=item.purchase_order_id)
        mids = {item.manifest_row_id} if item.manifest_row_id else set()
        pr_ids = processing_row_ids_for_manifest_rows(po, mids)
        return {
            'item': ItemSerializer(item).data,
            'workspace_patch': build_workspace_patch(po, touched_processing_row_ids=pr_ids),
        }

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
