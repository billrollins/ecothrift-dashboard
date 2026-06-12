"""
P9 row transforms: Break apart / Make set / Restart row (owner spec 2026-06-12).

Both transforms are unit-of-measure changes on a ProcessingRow:

- **Break apart**: 1 unit → X subitems (10 cases of 500 plates → 5,000 plates).
- **Make set**:  S units → 1 set   (12,000 candles → boxes of 500 for churches).

Whole-row transforms rewrite the row in place; partial transforms create a SUB row
(``split_parent`` FK) sharing the same frozen ``ManifestRow``. The manifest line is
never written. Every operation appends an audit memo to the ROOT row's ``transforms``
list, and the root's pre-transform state is snapshotted once so **Restart row** can
return the whole family to its original finalize state (coarse, all-or-nothing undo).
"""

from __future__ import annotations

import copy
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingCheckInBatch,
    ProcessingRow,
    Product,
    PurchaseOrder,
    VendorProductRef,
)
from apps.inventory.processing_ops import (
    _next_processing_row_number,
    _processing_row_upc,
    _resolve_product_for_processing,
    parse_decimal,
)
from apps.inventory.services.manual_item import normalize_search_tags
from apps.inventory.services.processing_workspace import (
    attributed_items_for_processing_row,
    build_processing_row_detail,
    build_workspace_patch,
    refresh_processing_rows_denorm,
)


# Fields captured before the first transform and restored verbatim by Restart row.
TRANSFORM_SNAPSHOT_FIELDS = (
    'quantity',
    'units_per_item',
    'unit_retail',
    'proposed_price',
    'final_price',
    'shelf_price',
    'pricing_stage',
    'pricing_notes',
    'title',
    'brand',
    'model',
    'category',
    'condition',
    'description',
    'notes',
    'identifiers',
    'taxonomy',
    'specifications',
    'tracking',
    'search_tags',
    'matched_product_id',
)
_SNAPSHOT_DECIMAL_FIELDS = frozenset({'unit_retail', 'proposed_price', 'final_price', 'shelf_price'})
_SNAPSHOT_INT_FIELDS = frozenset({'quantity', 'units_per_item'})

# Fat-finger backstops, mirroring MAX_CHECK_IN_QUANTITY's philosophy: explicit 400, never a clamp.
MAX_TRANSFORM_FACTOR = 100_000
MAX_TRANSFORM_RESULT_UNITS = 1_000_000


def _snapshot_row(row: ProcessingRow) -> dict[str, Any]:
    snap: dict[str, Any] = {}
    for field in TRANSFORM_SNAPSHOT_FIELDS:
        val = getattr(row, field)
        if isinstance(val, Decimal):
            val = str(val)
        elif isinstance(val, (dict, list)):
            val = copy.deepcopy(val)
        snap[field] = val
    return snap


def _restore_row_from_snapshot(row: ProcessingRow, snap: dict[str, Any]) -> None:
    for field in TRANSFORM_SNAPSHOT_FIELDS:
        if field not in snap:
            continue
        val = snap.get(field)
        if field in _SNAPSHOT_DECIMAL_FIELDS:
            val = parse_decimal(val)
        elif field in _SNAPSHOT_INT_FIELDS:
            try:
                val = max(1, int(val))
            except (TypeError, ValueError):
                val = 1
        setattr(row, field, val)


def _parse_positive_int(raw: Any, name: str, *, minimum: int = 1) -> int:
    try:
        val = int(str(raw).strip())
    except (TypeError, ValueError, AttributeError) as e:
        raise ValueError(f'{name} must be an integer.') from e
    if val < minimum:
        raise ValueError(f'{name} must be at least {minimum}.')
    if val > MAX_TRANSFORM_FACTOR:
        raise ValueError(f'{name} exceeds the {MAX_TRANSFORM_FACTOR:,} safety limit.')
    return val


def _locked_row(order: PurchaseOrder, data: dict) -> ProcessingRow:
    raw = data.get('processing_row_id') or data.get('processingRowId')
    if raw is None or not str(raw).strip().isdigit():
        raise ValueError('processing_row_id is required.')
    row = (
        ProcessingRow.objects.select_for_update()
        .filter(pk=int(str(raw).strip()), purchase_order=order)
        .first()
    )
    if row is None:
        raise ProcessingRow.DoesNotExist
    return row


def _guard_transformable(row: ProcessingRow) -> None:
    if row.row_kind == ProcessingRow.ROW_KIND_ADDED:
        raise ValueError('Added rows cannot be transformed in this version.')
    if row.manifest_row_id is None:
        raise ValueError('Finalize preprocessing with a linked manifest row before transforming.')
    if row.split_parent_id:
        parent_rn = ProcessingRow.objects.filter(pk=row.split_parent_id).values_list(
            'row_number', flat=True,
        ).first()
        raise ValueError(
            f'Row {row.row_number} is a sub row of row {parent_rn} — '
            'transforms apply to the original row only (restart and redo to change shape).',
        )
    if row.collapse_master_id or ProcessingRow.objects.filter(collapse_master=row).exists():
        raise ValueError(f'Row {row.row_number} is in a collapse group — uncollapse first.')


def _transform_product(row: ProcessingRow, data: dict) -> tuple[Product | None, int | None]:
    """Resolve target product per product_mode keep|existing|new.

    Returns (product_or_none, created_product_id_or_none). ``keep`` keeps the row's
    current hint (may be None = decide at check-in). ``new`` is the owner-approved
    Level-3 exception (P7 precedent): the transform decision may create the Product
    before check-in, seeded from payload fields falling back to the row's bookmark.
    """
    mode = str(data.get('product_mode') or 'keep').strip().lower()
    if mode == 'keep':
        return (row.matched_product if row.matched_product_id else None), None
    if mode not in ('existing', 'new'):
        raise ValueError('product_mode must be keep, existing, or new.')
    product = _resolve_product_for_processing(
        {**data, 'product_mode': mode},
        matched_product=None,
        fallback_title=row.title or row.description or f'Row {row.row_number}',
        fallback_brand=row.brand or '',
        fallback_category=row.category or '',
        fallback_model=row.model or '',
        fallback_upc=_processing_row_upc(row),
        fallback_specs=row.specifications or {},
        fallback_search_tags=normalize_search_tags(getattr(row, 'search_tags', None)),
        default_price=row.shelf_price or row.final_price or row.proposed_price,
    )
    return product, (product.id if mode == 'new' else None)


def _scaled_money(base: Decimal | None, *, multiply: int = 1, divide: int = 1) -> Decimal | None:
    if base is None:
        return None
    try:
        return (base * Decimal(multiply) / Decimal(divide)).quantize(Decimal('0.01'))
    except (ArithmeticError, ValueError):
        return None


def _append_transform_memo(root: ProcessingRow, memo: dict[str, Any], user) -> None:
    entry = {
        **memo,
        'by': getattr(user, 'pk', None),
        'at': timezone.now().isoformat(),
    }
    root.transforms = [*(root.transforms or []), entry]


def _create_sub_row(
    order: PurchaseOrder,
    root: ProcessingRow,
    *,
    quantity: int,
    units_per_item: int,
    unit_retail: Decimal | None,
    shelf_price: Decimal | None,
    product: Product | None,
) -> ProcessingRow:
    seq = root.split_children.count() + 1
    return ProcessingRow.objects.create(
        purchase_order=order,
        preprocessing_row_id=root.preprocessing_row_id,
        row_number=_next_processing_row_number(order),
        row_kind=ProcessingRow.ROW_KIND_MANIFEST,
        manifest_row_id=root.manifest_row_id,
        split_parent=root,
        split_seq=seq,
        matched_product=product,
        quantity=quantity,
        units_per_item=units_per_item,
        unit_retail=unit_retail,
        final_price=shelf_price,
        shelf_price=shelf_price,
        pricing_stage=root.pricing_stage,
        title=root.title,
        brand=root.brand,
        model=root.model,
        category=root.category,
        condition=root.condition,
        description=root.description,
        notes=root.notes,
        identifiers=copy.deepcopy(root.identifiers) if isinstance(root.identifiers, dict) else {},
        taxonomy=copy.deepcopy(root.taxonomy) if isinstance(root.taxonomy, dict) else {},
        specifications=copy.deepcopy(root.specifications) if isinstance(root.specifications, dict) else {},
        tracking=copy.deepcopy(root.tracking) if isinstance(root.tracking, dict) else {},
        search_tags=list(root.search_tags) if isinstance(root.search_tags, list) else [],
    )


def _transform_response(
    order: PurchaseOrder,
    root: ProcessingRow,
    sub: ProcessingRow | None,
) -> dict[str, Any]:
    touched = [root.pk] + ([sub.pk] if sub is not None else [])
    refresh_processing_rows_denorm(order, processing_row_ids=touched)
    target_pk = sub.pk if sub is not None else root.pk
    detail = build_processing_row_detail(order, processing_row_id=target_pk)
    return {
        'root_processing_row_id': root.pk,
        'sub_processing_row_id': sub.pk if sub is not None else None,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=touched),
    }


def processing_break_apart_row(user, order: PurchaseOrder, data: dict) -> dict[str, Any]:
    """Break N of a row's units into N×X sellable subitems (plates-out-of-cases).

    Whole-row (N = expected, nothing checked in) rewrites the row in place; otherwise a
    sub row carries the N×X subitems and the root keeps the remainder — now flagged as
    known X-packs (``units_per_item``) so leftover case check-ins report real units.
    """
    units = _parse_positive_int(data.get('units'), 'units')
    factor = _parse_positive_int(data.get('factor'), 'factor', minimum=2)
    if units * factor > MAX_TRANSFORM_RESULT_UNITS:
        raise ValueError(
            f'{units:,} × {factor:,} exceeds the {MAX_TRANSFORM_RESULT_UNITS:,} unit safety limit.',
        )

    with transaction.atomic():
        row = _locked_row(order, data)
        _guard_transformable(row)
        row = (
            ProcessingRow.objects.select_related('manifest_row', 'matched_product')
            .get(pk=row.pk)
        )
        items_ct = len(attributed_items_for_processing_row(row))
        available = max(0, int(row.quantity or 0) - items_ct)
        if units > available:
            raise ValueError(
                f'Only {available} of {row.quantity} unit(s) on row {row.row_number} '
                'are still un-checked-in.',
            )
        if not row.original_snapshot:
            row.original_snapshot = _snapshot_row(row)

        product, created_pid = _transform_product(row, data)
        mode = str(data.get('product_mode') or 'keep').strip().lower()
        unit_retail = parse_decimal(data.get('unit_retail') or data.get('retail'))
        if unit_retail is None:
            unit_retail = _scaled_money(row.unit_retail, divide=factor)
        shelf_price = parse_decimal(data.get('shelf_price') or data.get('price'))
        if shelf_price is None:
            shelf_price = _scaled_money(row.shelf_price, divide=factor)

        in_place = units == int(row.quantity or 0) and items_ct == 0
        sub: ProcessingRow | None = None
        if in_place:
            row.quantity = units * factor
            row.units_per_item = 1
            row.unit_retail = unit_retail
            if shelf_price is not None:
                row.shelf_price = shelf_price
                row.final_price = shelf_price
            if mode != 'keep':
                row.matched_product = product
        else:
            sub = _create_sub_row(
                order,
                row,
                quantity=units * factor,
                units_per_item=1,
                unit_retail=unit_retail,
                shelf_price=shelf_price,
                product=product if mode != 'keep' else row.matched_product,
            )
            row.quantity = int(row.quantity or 0) - units
            # Remaining originals are now KNOWN X-packs — their Items report X units.
            row.units_per_item = factor

        _append_transform_memo(row, {
            'op': 'break_apart',
            'units': units,
            'factor': factor,
            'in_place': in_place,
            'sub_row_id': sub.pk if sub is not None else None,
            'sub_row_number': int(sub.row_number) if sub is not None else None,
            'created_product_id': created_pid,
        }, user)
        row.save()

    return _transform_response(order, row, sub)


def processing_make_set_row(user, order: PurchaseOrder, data: dict) -> dict[str, Any]:
    """Bundle K sets of S units each out of a row's pool (candle boxes for churches).

    Whole-pool (K×S = expected, nothing checked in) rewrites the row in place to K sets;
    otherwise a sub row expects the K sets and the root keeps the loose remainder.
    Set rows stamp ``Item.unit_count = S`` at check-in: one tag, S units accounted.
    """
    set_size = _parse_positive_int(data.get('set_size') or data.get('setSize'), 'set_size', minimum=2)
    num_sets = _parse_positive_int(data.get('num_sets') or data.get('numSets'), 'num_sets')
    consumed = set_size * num_sets
    if consumed > MAX_TRANSFORM_RESULT_UNITS:
        raise ValueError(
            f'{num_sets:,} × {set_size:,} exceeds the {MAX_TRANSFORM_RESULT_UNITS:,} unit safety limit.',
        )

    with transaction.atomic():
        row = _locked_row(order, data)
        _guard_transformable(row)
        row = (
            ProcessingRow.objects.select_related('manifest_row', 'matched_product')
            .get(pk=row.pk)
        )
        items_ct = len(attributed_items_for_processing_row(row))
        available = max(0, int(row.quantity or 0) - items_ct)
        if consumed > available:
            raise ValueError(
                f'{num_sets} set(s) of {set_size} needs {consumed} units but only {available} '
                f'of {row.quantity} on row {row.row_number} are still un-checked-in.',
            )
        if not row.original_snapshot:
            row.original_snapshot = _snapshot_row(row)

        product, created_pid = _transform_product(row, data)
        mode = str(data.get('product_mode') or 'keep').strip().lower()
        unit_retail = parse_decimal(data.get('unit_retail') or data.get('retail'))
        if unit_retail is None:
            unit_retail = _scaled_money(row.unit_retail, multiply=set_size)
        shelf_price = parse_decimal(data.get('shelf_price') or data.get('price'))
        if shelf_price is None:
            shelf_price = _scaled_money(row.shelf_price, multiply=set_size)

        in_place = consumed == int(row.quantity or 0) and items_ct == 0
        sub: ProcessingRow | None = None
        if in_place:
            row.quantity = num_sets
            row.units_per_item = set_size
            row.unit_retail = unit_retail
            if shelf_price is not None:
                row.shelf_price = shelf_price
                row.final_price = shelf_price
            if mode != 'keep':
                row.matched_product = product
        else:
            sub = _create_sub_row(
                order,
                row,
                quantity=num_sets,
                units_per_item=set_size,
                unit_retail=unit_retail,
                shelf_price=shelf_price,
                product=product if mode != 'keep' else row.matched_product,
            )
            row.quantity = int(row.quantity or 0) - consumed

        _append_transform_memo(row, {
            'op': 'make_set',
            'set_size': set_size,
            'num_sets': num_sets,
            'units': consumed,
            'in_place': in_place,
            'sub_row_id': sub.pk if sub is not None else None,
            'sub_row_number': int(sub.row_number) if sub is not None else None,
            'created_product_id': created_pid,
        }, user)
        row.save()

    return _transform_response(order, row, sub)


def _product_safe_to_delete(product: Product, *, exclude_row_ids: list[int]) -> bool:
    """A transform-created Product may be deleted only when nothing else references it."""
    if product.items.exists():
        return False
    if ProcessingRow.objects.filter(matched_product=product).exclude(pk__in=exclude_row_ids).exists():
        return False
    if PreprocessingRow.objects.filter(final_matched_product=product).exists():
        return False
    if VendorProductRef.objects.filter(product=product).exists():
        return False
    if ProcessingCheckInBatch.objects.filter(product=product).exists():
        return False
    if ManifestRow.objects.filter(matched_product=product).exists():
        return False
    return True


def processing_restart_row(user, order: PurchaseOrder, data: dict) -> dict[str, Any]:
    """Coarse v1 undo: reset a transform family to its pre-transform finalize state.

    Deletes ALL family Items + check-in batches + sub rows, deletes transform-created
    Products when nothing else references them (kept + reported otherwise), and restores
    the root from its first-transform snapshot. Blocked when any family item is sold or
    referenced by a POS cart line, or while any family row sits in a collapse group.
    Two-step: ``confirm: false`` returns the summary only; ``confirm: true`` executes.
    """
    confirm = bool(data.get('confirm'))

    with transaction.atomic():
        row = _locked_row(order, data)
        if row.split_parent_id:
            root = (
                ProcessingRow.objects.select_for_update()
                .get(pk=row.split_parent_id, purchase_order=order)
            )
        else:
            root = row
        children = list(
            ProcessingRow.objects.select_for_update()
            .filter(split_parent=root)
            .order_by('split_seq', 'row_number'),
        )
        if not (root.transforms or children):
            raise ValueError(f'Row {root.row_number} has no transforms to restart.')
        if root.manifest_row_id is None:
            raise ValueError('Row has no linked manifest line.')
        family_ids = [root.pk, *(c.pk for c in children)]
        if any(r.collapse_master_id for r in (root, *children)) or ProcessingRow.objects.filter(
            collapse_master_id__in=family_ids,
        ).exists():
            raise ValueError('Uncollapse rows in this family before restarting.')

        line_items = list(Item.objects.filter(manifest_row_id=root.manifest_row_id))
        item_ids = [i.pk for i in line_items]
        sold_ct = sum(1 for i in line_items if i.status == 'sold' or i.sold_at)
        if sold_ct:
            raise ValueError(
                f'{sold_ct} item(s) on this line are sold — restart is blocked to protect sales history.',
            )
        from apps.pos.models import CartLine

        if item_ids and CartLine.objects.filter(item_id__in=item_ids).exists():
            raise ValueError('Items on this line are referenced by POS carts — restart is blocked.')

        on_shelf = [i for i in line_items if i.status == 'on_shelf']
        created_pids = list(dict.fromkeys(
            int(m['created_product_id'])
            for m in (root.transforms or [])
            if m.get('created_product_id')
        ))
        summary = {
            'root_processing_row_id': root.pk,
            'root_row_number': int(root.row_number),
            'sub_row_numbers': [int(c.row_number) for c in children],
            'item_count': len(line_items),
            'on_shelf_count': len(on_shelf),
            'on_shelf_skus': [i.sku for i in on_shelf][:50],
            'disputed_count': sum(1 for i in line_items if i.status in ('scrapped', 'lost')),
            'created_product_ids': created_pids,
        }
        if not confirm:
            return {'requires_confirm': True, 'summary': summary}

        ProcessingCheckInBatch.objects.filter(processing_row_id__in=family_ids).delete()
        if item_ids:
            Item.objects.filter(pk__in=item_ids).delete()
        child_ids = [c.pk for c in children]
        if child_ids:
            ProcessingRow.objects.filter(pk__in=child_ids).delete()

        deleted_pids: list[int] = []
        kept_pids: list[int] = []
        for pid in created_pids:
            product = Product.objects.filter(pk=pid).first()
            if product is None:
                continue
            if _product_safe_to_delete(product, exclude_row_ids=[root.pk]):
                product.delete()
                deleted_pids.append(pid)
            else:
                kept_pids.append(pid)

        _restore_row_from_snapshot(root, root.original_snapshot or {})
        root.transforms = []
        root.original_snapshot = {}
        root.save()

    refresh_processing_rows_denorm(order, processing_row_ids=[root.pk])
    detail = build_processing_row_detail(order, processing_row_id=root.pk)
    return {
        'restarted': True,
        'summary': summary,
        'deleted_processing_row_ids': child_ids,
        'deleted_product_ids': deleted_pids,
        'kept_product_ids': kept_pids,
        'row': detail['row'],
        'workspace_patch': build_workspace_patch(order, touched_processing_row_ids=[root.pk]),
    }
