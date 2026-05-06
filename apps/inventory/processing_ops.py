"""
Item Processor mutations (print-and-check-in, bulk flows).

Keeps orchestration out of views.py. Uses Item.status/location mapping from processing_workspace.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    Item,
    ItemHistory,
    ManifestRow,
    ProcessingRow,
    Product,
    ProductMergeAudit,
    PurchaseOrder,
)
from apps.inventory.serializers import ItemSerializer
from apps.inventory.services.processing_workspace import (
    build_workspace_patch,
    condition_ui_to_db,
    dispatch_to_location,
    printed_items_preview,
    processing_row_ids_for_manifest_rows,
    push_shelf_price_to_bookmark,
    refresh_processing_rows_denorm,
)


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


def _resolve_condition_db(cond_raw) -> str:
    allowed = {c[0] for c in Item.CONDITION_CHOICES}
    if cond_raw in allowed:
        return cond_raw
    if isinstance(cond_raw, str):
        return condition_ui_to_db(cond_raw)
    return 'unknown'


def processing_print_and_check_in(user, item: Item, data: dict) -> dict:
    """Check in one item; optional sibling updates. Raises ValueError on bad input."""
    if item.status not in ('intake', 'processing'):
        raise ValueError('Item already dispositioned')
    if not item.purchase_order_id:
        raise ValueError('Item has no purchase order')

    cond_db = _resolve_condition_db(data.get('condition'))
    retail = parse_decimal(data.get('retail') or data.get('unit_retail'))
    price = parse_decimal(data.get('price'))
    dispatch = data.get('dispatch') or 'on_shelf'
    notes = str(data.get('notes') or '')
    apply_condition_all = bool(data.get('apply_condition_all') or data.get('applyConditionAll'))
    apply_retail_all = bool(data.get('apply_retail_all') or data.get('applyRetailAll'))

    if cond_db == 'salvage':
        location = 'salvage'
    else:
        location = dispatch_to_location(dispatch)

    touched_mrs: set[int] = set()
    histories: list[ItemHistory] = []
    now = timezone.now()

    with transaction.atomic():
        siblings_qs = Item.objects.none()
        if item.product_id:
            siblings_qs = (
                Item.objects.select_for_update()
                .filter(
                    purchase_order_id=item.purchase_order_id,
                    product_id=item.product_id,
                    status__in=['intake', 'processing'],
                )
                .exclude(pk=item.pk)
            )

        if price is not None and item.manifest_row_id:
            push_shelf_price_to_bookmark(item.purchase_order_id, item.manifest_row_id, price)

        if apply_condition_all or apply_retail_all:
            for sib in siblings_qs:
                ch_updates = {}
                if apply_condition_all:
                    ch_updates['condition'] = cond_db
                if apply_retail_all and retail is not None:
                    ch_updates['unit_retail'] = retail
                if not ch_updates:
                    continue
                changed = apply_item_updates(sib, ch_updates)
                sib.save()
                for field, old_v, new_v in changed:
                    histories.append(
                        ItemHistory(
                            item=sib,
                            event_type=history_event_type_for_field(field),
                            old_value='' if old_v is None else str(old_v),
                            new_value='' if new_v is None else str(new_v),
                            note='Sibling apply from processing check-in',
                            created_by=user,
                        ),
                    )
                if sib.manifest_row_id:
                    touched_mrs.add(sib.manifest_row_id)

        updates = {'condition': cond_db, 'location': location, 'notes': notes}
        if price is not None:
            updates['price'] = price
        if retail is not None:
            updates['unit_retail'] = retail

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
                updates['unit_retail'] = retail
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

    return {'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=pr_ids)}


def _apply_product_field_values(product: Product, fv: dict) -> None:
    if 'title' in fv:
        product.title = str(fv['title'] or '')[:300]
    if 'brand' in fv:
        product.brand = str(fv['brand'] or '')[:200]
    if 'model' in fv:
        product.model = str(fv['model'] or '')[:200]
    if 'description' in fv:
        product.description = str(fv['description'] or '')
    if 'specs' in fv and isinstance(fv['specs'], dict):
        product.specifications = fv['specs']
    if 'tags' in fv:
        tags = fv['tags']
        if isinstance(tags, str):
            product.specifications = dict(product.specifications or {})
            product.specifications['tags'] = tags
    if 'taxonomy' in fv:
        pass  # taxonomy lives on ManifestRow primarily
    if 'category' in fv:
        product.category = str(fv['category'] or '')[:200]


def processing_merge_rows(user, order: PurchaseOrder, data: dict) -> dict:
    row_ids, _src = _resolve_merge_or_bulk_manifest_ids(order, data)
    fv = data.get('field_values') or {}
    if len(row_ids) < 2:
        raise ValueError('At least two manifest rows required')

    rows = list(
        ManifestRow.objects.filter(purchase_order=order, pk__in=row_ids)
        .select_related('matched_product')
        .order_by('row_number'),
    )
    if len(rows) != len(set(row_ids)):
        raise ValueError('Invalid manifest row ids')

    canonical_row = rows[0]
    target = canonical_row.matched_product
    snapshots = []

    with transaction.atomic():
        if target is None:
            target = Product.objects.create(
                title=str(fv.get('title') or canonical_row.title or 'Merged')[:300],
                brand=str(fv.get('brand') or canonical_row.brand or '')[:200],
                model=str(fv.get('model') or canonical_row.model or '')[:200],
                category=str(fv.get('category') or canonical_row.category or '')[:200],
                description=str(fv.get('description') or canonical_row.description or ''),
                specifications=fv.get('specs') if isinstance(fv.get('specs'), dict) else {},
                default_price=canonical_row.final_price or canonical_row.proposed_price,
                upc=str((canonical_row.identifiers or {}).get('upc') or '')[:100],
            )

        pre_merge = {'product_id': target.id, 'title': target.title, 'brand': target.brand}
        _apply_product_field_values(target, fv)
        target.save()

        for row in rows:
            old_p = row.matched_product
            snapshots.append(
                {
                    'manifest_row_id': row.id,
                    'row_number': row.row_number,
                    'prior_product_id': old_p.id if old_p else None,
                },
            )
            row.matched_product = target
            row.save(update_fields=['matched_product'])
            for it in Item.objects.select_for_update().filter(manifest_row=row):
                it.product = target
                it.title = target.title
                it.brand = target.brand or it.brand
                it.save()

        ProductMergeAudit.objects.create(
            purchase_order=order,
            merged_by=user,
            source_manifest_row_ids=[r.id for r in rows],
            target_product=target,
            snapshot={'rows': snapshots, 'prior_canonical': pre_merge},
        )

    touched_mr_ids = {r.id for r in rows}
    pr_ids = list(
        ProcessingRow.objects.filter(
            purchase_order=order,
            manifest_row_id__in=touched_mr_ids,
        ).values_list('pk', flat=True),
    )
    refresh_processing_rows_denorm(order, processing_row_ids=pr_ids)
    return {'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=pr_ids)}


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
                    it.unit_retail = retail
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
            updates['unit_retail'] = r
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

    histories = []
    with transaction.atomic():
        if updates.get('price') is not None and item.manifest_row_id:
            push_shelf_price_to_bookmark(item.purchase_order_id, item.manifest_row_id, updates['price'])
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
