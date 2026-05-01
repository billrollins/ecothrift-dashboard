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
    ItemSwapAudit,
    ManifestRow,
    Product,
    ProductMergeAudit,
    PurchaseOrder,
)
from apps.inventory.serializers import ItemSerializer
from apps.inventory.services.processing_workspace import (
    build_processing_workspace,
    condition_ui_to_db,
    dispatch_to_location,
)


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

        item.refresh_from_db()
        po = PurchaseOrder.objects.get(pk=item.purchase_order_id)
        ws = build_processing_workspace(po)

    out = ItemSerializer(item).data
    out['checked_in'] = True
    return {'item': out, 'workspace': ws, 'label_print_job_id': ''}


def processing_print_multiple(user, order: PurchaseOrder, data: dict) -> dict:
    manifest_row_id = data.get('manifest_row_id')
    qty = int(data.get('qty') or 0)
    if not manifest_row_id or qty < 1:
        raise ValueError('manifest_row_id and positive qty required')

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
    return {
        'checked_in_item_ids': checked,
        'workspace': build_processing_workspace(order),
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

    return {'workspace': build_processing_workspace(order)}


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
    row_ids = data.get('manifest_row_ids') or []
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

    return {'workspace': build_processing_workspace(order)}


def _row_checked_in(items: list[Item]) -> bool:
    return any(i.status == 'on_shelf' for i in items)


def processing_swap(user, order: PurchaseOrder, data: dict) -> dict:
    row_a_num = int(data.get('row_a') or 0)
    row_b_num = int(data.get('row_b') or 0)
    mode = data.get('mode') or ''
    if row_a_num <= 0 or row_b_num <= 0:
        raise ValueError('row_a and row_b required')
    if row_a_num == row_b_num:
        raise ValueError('Rows must differ')

    ra = ManifestRow.objects.filter(purchase_order=order, row_number=row_a_num).first()
    rb = ManifestRow.objects.filter(purchase_order=order, row_number=row_b_num).first()
    if not ra or not rb:
        raise ValueError('Manifest row not found')

    items_a = list(Item.objects.filter(manifest_row=ra).order_by('id'))
    items_b = list(Item.objects.filter(manifest_row=rb).order_by('id'))

    a_in = _row_checked_in(items_a)
    b_in = _row_checked_in(items_b)

    def fields_tuple(it: Item):
        return {
            'condition': it.condition,
            'unit_retail': it.unit_retail,
            'price': it.price,
            'location': it.location,
            'notes': it.notes,
            'status': it.status,
            'listed_at': it.listed_at,
            'checked_in_at': it.checked_in_at,
            'checked_in_by_id': it.checked_in_by_id,
        }

    def apply_fields(it: Item, src: dict):
        it.condition = src['condition']
        it.unit_retail = src['unit_retail']
        it.price = src['price']
        it.location = src['location']
        it.notes = src['notes']
        it.status = src['status']
        it.listed_at = src['listed_at']
        it.checked_in_at = src['checked_in_at']
        it.checked_in_by_id = src['checked_in_by_id']

    def reset_to_pending(it: Item):
        it.status = 'intake'
        it.listed_at = None
        it.checked_in_at = None
        it.checked_in_by = None

    with transaction.atomic():
        if not a_in and not b_in:
            raise ValueError('Neither row has checked-in items to swap')

        if mode == 'a_to_b':
            if not a_in or b_in:
                raise ValueError('Invalid swap mode for row states')
            if len(items_a) != len(items_b):
                raise ValueError('Row item counts must match for swap')
            for ia, ib in zip(items_a, items_b):
                snap = fields_tuple(ia)
                apply_fields(ib, snap)
                ib.save()
                reset_to_pending(ia)
                ia.save()
        elif mode == 'b_to_a':
            if not b_in or a_in:
                raise ValueError('Invalid swap mode for row states')
            if len(items_a) != len(items_b):
                raise ValueError('Row item counts must match for swap')
            for ib, ia in zip(items_b, items_a):
                snap = fields_tuple(ib)
                apply_fields(ia, snap)
                ia.save()
                reset_to_pending(ib)
                ib.save()
        elif mode == 'both':
            if not a_in or not b_in:
                raise ValueError('Invalid swap mode for row states')
            if len(items_a) != len(items_b):
                raise ValueError('Row item counts must match for swap')
            for ia, ib in zip(items_a, items_b):
                sa, sb = fields_tuple(ia), fields_tuple(ib)
                apply_fields(ia, sb)
                apply_fields(ib, sa)
                ia.save()
                ib.save()
        else:
            raise ValueError('Invalid mode')

        ItemSwapAudit.objects.create(
            purchase_order=order,
            swapped_by=user,
            source_row=ra,
            target_row=rb,
            mode=mode,
            snapshot={'row_a': row_a_num, 'row_b': row_b_num},
        )

    return {'workspace': build_processing_workspace(order)}


def processing_bulk_disposition(user, order: PurchaseOrder, data: dict) -> dict:
    row_ids = data.get('manifest_row_ids') or []
    retail = parse_decimal(data.get('retail'))
    groups = data.get('groups') or []
    if not row_ids or not groups:
        raise ValueError('manifest_row_ids and groups required')

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
                    price = parse_decimal(g.get('price'))
                    if price is not None:
                        it.price = price
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

    return {'workspace': build_processing_workspace(order)}


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
    return {'item': ItemSerializer(item).data, 'workspace': build_processing_workspace(po)}
