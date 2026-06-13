"""Fast preprocessing finalize → durable processing bookmarks (`ProcessingRow`)."""

from __future__ import annotations

import copy
import logging
from decimal import Decimal
from typing import Any, Iterable

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.inventory.manifest_standard_fields import slugify_formula_search_tags
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingBatch,
    ProcessingDataBuild,
    ProcessingRow,
    Product,
    PurchaseOrder,
)
from apps.inventory.layer_helpers import effective_taxonomy_category_for_row
from apps.inventory.product_identity import merge_identifiers
from apps.inventory.services.manual_item import find_or_create_product_for_manual_item
from apps.inventory.services.intake_gates import raise_if_processing_blocked_by_intake
from apps.inventory.services.processing_search_string import assign_search_strings_for_instances, build_processing_row_search_string
from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm


logger = logging.getLogger(__name__)

MAX_BUILD_WARNINGS = 100
_TERMINAL_ITEM_STATUSES_FROZEN = frozenset({'sold', 'scrapped', 'lost'})


# Narrow columns read from preprocessing at finalize-time (avoid SELECT * hydrations).
PREPROCESSING_PROJECT_TO_BOOKMARK_FIELDS = (
    'id',
    'manifest_row_id',
    'final_matched_product_id',
    'row_number',
    'purchase_order_id',
    'quantity',
    'unit_retail',
    'proposed_price',
    'final_price',
    'pricing_stage',
    'pricing_notes',
    'batch_flag',
    'ai_reasoning',
    'final_description',
    'final_title',
    'final_brand',
    'final_model',
    'final_condition',
    'final_notes',
    'final_identifiers',
    'final_taxonomy',
    'final_specifications',
    'final_tracking',
    'final_search_tags',
    'final_category',
)


def _safe_json_dict(val: Any) -> dict[str, Any]:
    if isinstance(val, dict):
        return copy.deepcopy(val)
    return {}


def _normalize_manifest_search_tags(tags: Any) -> list[str]:
    if tags is None:
        return []
    if isinstance(tags, list):
        return [str(x).strip() for x in tags if str(x).strip()]
    return slugify_formula_search_tags(str(tags or ''))


def _effective_unit_price_from_row(row: dict[str, Any]) -> Decimal | None:
    fp = row.get('final_price')
    if fp is not None:
        return fp
    pp = row.get('proposed_price')
    if pp is not None:
        return pp
    return None


def validate_preprocessing_value_rows_for_finalize(
    rows: list[dict[str, Any]],
    *,
    max_errors: int = 100,
) -> None:
    """Raises ValidationError compatible with finalize API if validation fails."""

    errs: list[dict[str, Any]] = []

    def add_err(row_num: int | None, reason: str) -> None:
        if len(errs) >= max_errors:
            return
        errs.append({'row_number': row_num or 0, 'reason': reason})

    for row in rows:
        rn = int(row['row_number']) if row.get('row_number') is not None else None
        if _effective_unit_price_from_row(row) is None:
            add_err(rn, 'missing_price')
            continue
        title = str(row.get('final_title') or '').strip()
        desc = str(row.get('final_description') or '').strip()
        if not title and not desc:
            add_err(rn, 'missing_title_or_description')

    if errs:
        raise ValidationError({
            'detail': 'All staging rows must have a listing title/description and a price.',
            'code': 'validation_failed',
            'errors': errs,
        })


def load_preprocessing_values_for_finalize(order: PurchaseOrder) -> Iterable[dict[str, Any]]:
    """Hydrate rows lightly so linked ManifestRow can provide standard fallbacks."""

    rows = (
        PreprocessingRow.objects
        .filter(purchase_order=order)
        .select_related('manifest_row')
        .only(
            'id',
            'manifest_row_id',
            'final_matched_product_id',
            'row_number',
            'purchase_order_id',
            'quantity',
            'unit_retail',
            'proposed_price',
            'final_price',
            'pricing_stage',
            'pricing_notes',
            'batch_flag',
            'ai_reasoning',
            'final_description',
            'final_title',
            'final_brand',
            'final_model',
            'final_condition',
            'final_notes',
            'final_identifiers',
            'final_taxonomy',
            'final_specifications',
            'final_tracking',
            'final_search_tags',
            'final_category',
            'manifest_row__row_number',
            'manifest_row__quantity',
            'manifest_row__unit_retail',
            'manifest_row__proposed_price',
            'manifest_row__final_price',
            'manifest_row__pricing_stage',
            'manifest_row__pricing_notes',
            'manifest_row__batch_flag',
            'manifest_row__ai_reasoning',
            'manifest_row__description',
            'manifest_row__title',
            'manifest_row__brand',
            'manifest_row__model',
            'manifest_row__category',
            'manifest_row__condition',
            'manifest_row__notes',
            'manifest_row__identifiers',
            'manifest_row__taxonomy',
            'manifest_row__specifications',
            'manifest_row__tracking',
            'manifest_row__search_tags',
        )
        .order_by('row_number')
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        mr = row.manifest_row
        out.append({
            'id': row.id,
            'manifest_row_id': row.manifest_row_id,
            'final_matched_product_id': row.final_matched_product_id,
            'row_number': row.row_number,
            'purchase_order_id': row.purchase_order_id,
            'quantity': row.quantity or (mr.quantity if mr is not None else 1),
            'unit_retail': row.unit_retail if row.unit_retail is not None else (mr.unit_retail if mr is not None else None),
            'proposed_price': row.proposed_price if row.proposed_price is not None else (mr.proposed_price if mr is not None else None),
            'final_price': row.final_price,
            'pricing_stage': row.pricing_stage or (mr.pricing_stage if mr is not None else 'unpriced'),
            'pricing_notes': row.pricing_notes or (mr.pricing_notes if mr is not None else ''),
            'batch_flag': row.batch_flag or (bool(mr.batch_flag) if mr is not None else False),
            'ai_reasoning': row.ai_reasoning or (mr.ai_reasoning if mr is not None else ''),
            'final_description': row.final_description or (mr.description if mr is not None else ''),
            'final_title': row.final_title or (mr.title if mr is not None else ''),
            'final_brand': row.final_brand or (mr.brand if mr is not None else ''),
            'final_model': row.final_model or (mr.model if mr is not None else ''),
            'final_category': row.final_category or effective_taxonomy_category_for_row(row),
            'final_condition': row.final_condition or (mr.condition if mr is not None else ''),
            'final_notes': row.final_notes or (mr.notes if mr is not None else ''),
            'final_identifiers': row.final_identifiers if row.final_identifiers is not None else (mr.identifiers if mr is not None else {}),
            'final_taxonomy': row.final_taxonomy if row.final_taxonomy is not None else (mr.taxonomy if mr is not None else {}),
            'final_specifications': row.final_specifications if row.final_specifications is not None else (mr.specifications if mr is not None else {}),
            'final_tracking': row.final_tracking if row.final_tracking is not None else (mr.tracking if mr is not None else {}),
            'final_search_tags': row.final_search_tags if row.final_search_tags is not None else (mr.search_tags if mr is not None else []),
        })
    return out


def finalize_preprocessing_to_bookmarks(
    order: PurchaseOrder,
) -> int:
    """
    Validate narrow preprocessing rows OOB, then in one txn:
      - replace bookmarks for PO
      - keep the ManifestRow spine and real Items intact

    Returns ProcessingRow insert count.
    """

    val_rows = list(load_preprocessing_values_for_finalize(order))
    validate_preprocessing_value_rows_for_finalize(val_rows)

    objs: list[ProcessingRow] = []

    for r in val_rows:
        qty_raw = r.get('quantity') or 1
        qty = max(1, int(qty_raw))

        objs.append(
            ProcessingRow(
                purchase_order_id=order.id,
                preprocessing_row_id=r.get('id'),
                manifest_row_id=r.get('manifest_row_id'),
                matched_product_id=r.get('final_matched_product_id'),
                row_number=int(r['row_number']),
                quantity=qty,
                unit_retail=r.get('unit_retail'),
                proposed_price=r.get('proposed_price'),
                final_price=r.get('final_price'),
                pricing_stage=r.get('pricing_stage') or 'unpriced',
                pricing_notes=r.get('pricing_notes') or '',
                batch_flag=bool(r.get('batch_flag')),
                ai_reasoning=r.get('ai_reasoning') or '',
                description=str(r.get('final_description') or ''),
                title=str(r.get('final_title') or '')[:300],
                brand=str(r.get('final_brand') or '')[:200],
                model=str(r.get('final_model') or '')[:200],
                category=str(r.get('final_category') or '')[:200],
                condition=str(r.get('final_condition') or ''),
                notes=str(r.get('final_notes') or ''),
                identifiers=_safe_json_dict(r.get('final_identifiers')),
                taxonomy=_safe_json_dict(r.get('final_taxonomy')),
                specifications=_safe_json_dict(r.get('final_specifications')),
                tracking=_safe_json_dict(r.get('final_tracking')),
                search_tags=_normalize_manifest_search_tags(r.get('final_search_tags')),
                shelf_price=_effective_unit_price_from_row(r),
            ),
        )

    product_ids = {o.matched_product_id for o in objs if o.matched_product_id}
    products_by_id = (
        {p.id: p for p in Product.objects.filter(pk__in=product_ids)}
        if product_ids else {}
    )
    assign_search_strings_for_instances(objs, products_by_id=products_by_id)

    now = timezone.now()

    with transaction.atomic():
        ProcessingRow.objects.filter(purchase_order=order).delete()
        ProcessingDataBuild.objects.filter(purchase_order_id=order.id).delete()

        ProcessingRow.objects.bulk_create(objs)

        po = PurchaseOrder.objects.select_for_update().get(pk=order.id)
        po.finalized_at = now
        po.preprocess_status = 'finalized'
        po.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])

    return len(objs)


def bookmarks_exist_for_order(order: PurchaseOrder) -> bool:
    return ProcessingRow.objects.filter(purchase_order=order).exists()


def _safe_quantity(raw: Any) -> int:
    try:
        return max(1, int(raw or 1))
    except (TypeError, ValueError):
        return 1


def _safe_condition(raw: Any) -> str:
    val = str(raw or '').strip()
    allowed = {choice[0] for choice in Item.CONDITION_CHOICES}
    return val if val in allowed else 'unknown'


def _listing_text_or_placeholder(bk: ProcessingRow) -> tuple[str, str]:
    title = str(bk.title or '').strip()
    desc = str(bk.description or '').strip()
    if title or desc:
        return title[:300], desc
    placeholder = f'Review raw manifest row {bk.row_number}'
    return placeholder[:300], placeholder


def _next_sku_batch(count: int) -> list[str]:
    if count <= 0:
        return []
    first = Item.generate_sku()
    try:
        start = int(str(first)[3:])
    except (TypeError, ValueError):
        start = 1
    return [f'ITM{n:07d}' for n in range(start, start + count)]


# --- Chunked ProcessingDataBuild ---------------------------------------------------------------


def _destructive_manifest_item_reset(order: PurchaseOrder) -> None:
    ManifestRow.objects.filter(purchase_order=order).delete()
    order.items.exclude(status__in=_TERMINAL_ITEM_STATUSES_FROZEN).delete()
    order.batch_groups.all().delete()


def _unlink_processing_bookmarks(order: PurchaseOrder) -> None:
    prs = list(ProcessingRow.objects.filter(purchase_order=order))
    for pr in prs:
        pr.manifest_row_id = None
        pr.matched_product_id = None
        pr.search_string = build_processing_row_search_string(pr)
    if prs:
        ProcessingRow.objects.bulk_update(
            prs,
            ['manifest_row_id', 'matched_product_id', 'search_string'],
        )


def _ensure_preprocessing_finalized(order: PurchaseOrder) -> None:
    if not order.finalized_at:
        raise ValidationError({
            'detail': 'Finalize preprocessing before building processing data.',
            'code': 'not_finalized',
        })


def _validate_bookmarks_and_terminal(order: PurchaseOrder) -> None:
    if not bookmarks_exist_for_order(order):
        raise ValidationError(
            {'detail': 'No processing bookmarks; finalize preprocessing first.', 'code': 'no_bookmarks'},
        )
    if order.items.filter(status__in=_TERMINAL_ITEM_STATUSES_FROZEN).exists():
        raise ValidationError({
            'detail': (
                'Cannot build processing data — some items are sold, scrapped, or lost. '
                'Resolve inventory state before rebuilding.'
            ),
            'code': 'terminal_items_block',
        })


def _quantity_for_manifest(bk: ProcessingRow, rn: int, chunk_warnings: list[dict[str, Any]]) -> int:
    raw = bk.quantity
    try:
        q = int(raw)
    except (TypeError, ValueError):
        chunk_warnings.append({
            'row_number': rn,
            'rule': 'invalid_quantity',
            'message': 'Quantity invalid; defaulted to 1.',
        })
        return 1
    if q < 1:
        chunk_warnings.append({
            'row_number': rn,
            'rule': 'invalid_quantity',
            'message': 'Quantity was below 1; defaulted to 1.',
        })
    return max(1, q)


def _bookmark_json(bookk: Any, rn: int, chunk_warnings: list[dict[str, Any]]) -> dict[str, Any]:
    if isinstance(bookk, dict):
        return dict(bookk)
    if bookk not in (None, '', {}, []):
        chunk_warnings.append({
            'row_number': rn,
            'rule': 'json_defaulted',
            'message': 'Structured field was not JSON; defaulted to {}.',
        })
    return {}


def _condition_for_manifest(raw: Any, rn: int, chunk_warnings: list[dict[str, Any]]) -> str:
    stripped = str(raw or '').strip()
    allowed = {choice[0] for choice in Item.CONDITION_CHOICES}
    if stripped and stripped not in allowed:
        chunk_warnings.append({
            'row_number': rn,
            'rule': 'invalid_condition',
            'message': 'Condition unsupported; defaulted to unknown.',
        })
    val = stripped if stripped in allowed else 'unknown'
    return val if val else 'unknown'


def _maybe_warn_missing_listing(bk: ProcessingRow, rn: int, chunk_warnings: list[dict[str, Any]]) -> None:
    if not str(bk.title or '').strip() and not str(bk.description or '').strip():
        chunk_warnings.append({
            'row_number': rn,
            'rule': 'missing_listing_text',
            'message': 'Missing title/description; placeholder text used.',
        })


def _manifest_objects_for_bookmarks(
    order: PurchaseOrder,
    bookmarks: Iterable[ProcessingRow],
    chunk_warnings: list[dict[str, Any]],
) -> list[ManifestRow]:
    manifest_objs: list[ManifestRow] = []
    for bk in bookmarks:
        rn = int(bk.row_number)
        qty = _quantity_for_manifest(bk, rn, chunk_warnings)
        _maybe_warn_missing_listing(bk, rn, chunk_warnings)

        stags = bk.search_tags
        if isinstance(stags, list):
            stags = list(stags)
        else:
            stags = _normalize_manifest_search_tags(stags)
        title, desc = _listing_text_or_placeholder(bk)

        manifest_objs.append(
            ManifestRow(
                purchase_order=order,
                row_number=rn,
                quantity=qty,
                description=desc,
                title=title,
                brand=str(bk.brand or ''),
                model=str(bk.model or ''),
                category=str(bk.category or '')[:200],
                condition=_condition_for_manifest(bk.condition, rn, chunk_warnings),
                unit_retail=bk.unit_retail,
                proposed_price=bk.proposed_price,
                final_price=bk.final_price,
                pricing_stage=bk.pricing_stage or 'unpriced',
                pricing_notes=bk.pricing_notes or '',
                batch_flag=bk.batch_flag,
                identifiers=_bookmark_json(bk.identifiers, rn, chunk_warnings),
                taxonomy=_bookmark_json(bk.taxonomy, rn, chunk_warnings),
                search_tags=stags or [],
                specifications=_bookmark_json(bk.specifications, rn, chunk_warnings),
                tracking=_bookmark_json(bk.tracking, rn, chunk_warnings),
                ai_reasoning=bk.ai_reasoning or '',
                notes=str(bk.notes or ''),
                match_status='pending',
            ),
        )
    return manifest_objs


def _take_next_bookmark_chunk(
    order: PurchaseOrder,
    *,
    chunk_size: int,
    max_items_per_chunk: int,
) -> list[ProcessingRow]:
    qs = ProcessingRow.objects.filter(
        purchase_order=order,
        manifest_row_id__isnull=True,
    ).order_by('row_number')
    batch: list[ProcessingRow] = []
    units_acc = 0
    step = min(250, max(chunk_size * 4, 50))
    for bk in qs.iterator(chunk_size=step):
        rn_q = max(1, _safe_quantity(bk.quantity))
        if batch and units_acc + rn_q > max_items_per_chunk:
            break
        batch.append(bk)
        units_acc += rn_q
        if len(batch) >= chunk_size:
            break
    return batch


def _bulk_create_chunk_items(order: PurchaseOrder, m_rows: list[ManifestRow]) -> list[Item]:
    total_units = sum(_safe_quantity(m.quantity) for m in m_rows)
    skus = _next_sku_batch(total_units)
    item_objs: list[Item] = []
    sku_idx = 0
    for row in m_rows:
        quantity = _safe_quantity(row.quantity)
        item_cost = order.compute_item_cost(row.unit_retail)
        price = row.final_price if row.final_price is not None else row.proposed_price
        if price is None:
            price = 0
        title = (row.title or f'Review raw manifest row {row.row_number}')[:300]
        product = find_or_create_product_for_manual_item(
            title=title,
            brand=row.brand or 'Generic',
            category=row.category or 'Mixed lots & uncategorized',
            model=row.model or '',
            identifiers=merge_identifiers(row.identifiers),
            specifications=row.specifications or {},
            search_tags=row.search_tags or [],
        )
        for _ in range(quantity):
            sku = skus[sku_idx] if sku_idx < len(skus) else Item.generate_sku()
            sku_idx += 1
            item = Item(
                sku=sku,
                product=product,
                purchase_order=order,
                manifest_row=row,
                price=price,
                retail=row.unit_retail,
                cost=item_cost,
                source='purchased',
                status='intake',
                condition=_safe_condition(row.condition),
                specifications=row.specifications or {},
            )
            item.search_text = item.rebuild_search_text()
            item_objs.append(item)
    return item_objs


def _upsert_workspace_batch_totals(order: PurchaseOrder, user, now) -> ProcessingBatch | None:
    mr_count = ManifestRow.objects.filter(purchase_order=order).count()
    item_total = Item.objects.filter(purchase_order=order).count()

    batch = ProcessingBatch.objects.filter(purchase_order=order).order_by('-started_at').first()
    if not batch:
        return ProcessingBatch.objects.create(
            purchase_order=order,
            status='in_progress',
            total_rows=mr_count,
            processed_count=mr_count,
            items_created=item_total,
            started_at=now,
            completed_at=now,
            created_by=user,
        )
    batch.total_rows = mr_count
    batch.processed_count = mr_count
    batch.items_created = item_total
    batch.completed_at = now
    batch.status = 'in_progress'
    batch.save(
        update_fields=['total_rows', 'processed_count', 'items_created', 'completed_at', 'status'],
    )
    return batch


def _sync_purchase_order_item_count(order: PurchaseOrder) -> int:
    item_count = Item.objects.filter(purchase_order=order).count()
    if order.item_count != item_count:
        order.item_count = item_count
        order.save(update_fields=['item_count', 'updated_at'])
    return item_count


def _finalize_completed_processing_build(
    order: PurchaseOrder,
    user,
    build: ProcessingDataBuild,
    now,
) -> None:
    refresh_processing_rows_denorm(order)
    _upsert_workspace_batch_totals(order, user, now)
    ic = _sync_purchase_order_item_count(order)
    PurchaseOrder.objects.filter(pk=order.pk).update(
        processing_status='done',
        processing_done_at=now,
    )
    build.status = ProcessingDataBuild.STATUS_COMPLETE
    build.completed_at = now
    build.processed_rows = ProcessingRow.objects.filter(
        purchase_order=order,
        manifest_row_id__isnull=False,
    ).count()
    build.created_items = ic
    max_rn = (
        ProcessingRow.objects.filter(purchase_order=order)
        .order_by('-row_number')
        .values_list('row_number', flat=True)
        .first()
    )
    if max_rn is not None:
        build.current_row_number = int(max_rn)


def merge_chunk_warnings_into_build(build: ProcessingDataBuild, chunk_warnings: list[dict[str, Any]]) -> None:
    base = list(build.warnings or [])
    for row in chunk_warnings:
        if len(base) >= MAX_BUILD_WARNINGS:
            break
        base.append(row)
    build.warnings = base


def serialize_processing_data_build(order: PurchaseOrder, build: ProcessingDataBuild | None) -> dict[str, Any]:
    """Progress + legacy summary fields for ``build-processing-data`` / status polling."""
    _ensure_preprocessing_finalized(order)
    bookmarks_total = ProcessingRow.objects.filter(purchase_order=order).count()
    manifest_ct = ManifestRow.objects.filter(purchase_order=order).count()
    item_ct = Item.objects.filter(purchase_order=order).count()
    product_ct = Product.objects.filter(items__purchase_order=order).distinct().count()

    if build is None:
        return {
            'status': 'none',
            'done': True,
            'blocked': False,
            'processed_rows': 0,
            'total_rows': bookmarks_total,
            'created_items': item_ct,
            'total_items': 0,
            'percent': 0,
            'warnings': [],
            'error_count': 0,
            'last_error': '',
            'manifest_rows': manifest_ct,
            'processing_row_bookmarks': bookmarks_total,
            'batch_groups_created': 0,
            'products_created': product_ct,
            'items_created': item_ct,
            'item_count': item_ct,
            'processing_batch_id': None,
            'rows': manifest_ct,
            'rows_linked': 0,
            'items_updated': 0,
            'items_deleted': 0,
        }

    done = build.status == ProcessingDataBuild.STATUS_COMPLETE
    pct = 100 if build.total_rows == 0 else min(100, int(100 * build.processed_rows / build.total_rows))
    blocked = build.status in (ProcessingDataBuild.STATUS_FAILED, ProcessingDataBuild.STATUS_BLOCKED)

    batch = ProcessingBatch.objects.filter(purchase_order=order).order_by('-started_at').first()

    return {
        'status': build.status,
        'done': done,
        'blocked': blocked,
        'processed_rows': build.processed_rows,
        'total_rows': build.total_rows,
        'created_items': item_ct,
        'total_items': build.total_items,
        'percent': pct,
        'warnings': list(build.warnings or [])[:MAX_BUILD_WARNINGS],
        'error_count': build.error_count,
        'last_error': build.last_error or '',
        'manifest_rows': manifest_ct,
        'processing_row_bookmarks': build.total_rows,
        'batch_groups_created': 0,
        'processing_batch_id': batch.id if batch else None,
        'products_created': product_ct,
        'items_created': item_ct,
        'item_count': item_ct,
        'rows': manifest_ct,
        'rows_linked': 0,
        'items_updated': 0,
        'items_deleted': 0,
        'generation': build.generation,
        'chunk_size': build.chunk_size,
    }


def processing_data_build_start_session(
    order: PurchaseOrder,
    user,
    *,
    reset: bool = False,
) -> ProcessingDataBuild:
    """Create/reset or resume a ``ProcessingDataBuild`` row (destructive only on reset/first run)."""

    _ensure_preprocessing_finalized(order)
    order.refresh_from_db(fields=['receiving_status'])
    raise_if_processing_blocked_by_intake(order)
    _validate_bookmarks_and_terminal(order)

    probe = ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).first()
    if probe and probe.status == ProcessingDataBuild.STATUS_COMPLETE and not reset:
        return probe

    with transaction.atomic():
        locked = ProcessingDataBuild.objects.select_for_update().filter(purchase_order_id=order.pk).first()

        destructive_needed = reset or locked is None
        if destructive_needed:
            _destructive_manifest_item_reset(order)
            _unlink_processing_bookmarks(order)

        bk_qs = ProcessingRow.objects.filter(purchase_order=order)
        total_bookmarks = bk_qs.count()
        total_units = 0
        for bk in bk_qs.iterator(chunk_size=500):
            total_units += max(1, _safe_quantity(bk.quantity))

        next_gen = locked.generation + 1 if locked is not None else 0

        if destructive_needed:
            build, _created = ProcessingDataBuild.objects.update_or_create(
                purchase_order=order,
                defaults={
                    'generation': next_gen,
                    'status': ProcessingDataBuild.STATUS_RUNNING,
                    'chunk_size': locked.chunk_size if locked else 100,
                    'max_items_per_chunk': locked.max_items_per_chunk if locked else 500,
                    'total_rows': total_bookmarks,
                    'total_items': total_units,
                    'processed_rows': 0,
                    'created_items': 0,
                    'current_row_number': 0,
                    'warnings': [],
                    'last_error': '',
                    'error_count': 0,
                    'started_at': timezone.now(),
                    'completed_at': None,
                    'created_by': user,
                },
            )
            now_po = timezone.now()
            po_updates: dict[str, object] = {}
            if order.processing_status == 'not_started':
                po_updates['processing_status'] = 'active'
            if order.processing_started_at is None:
                po_updates['processing_started_at'] = now_po
            if po_updates:
                PurchaseOrder.objects.filter(pk=order.pk).update(**po_updates)
            return build

        if locked is None:
            raise ValidationError({'detail': 'Missing build row after session start.', 'code': 'build_missing'})

        if locked.status == ProcessingDataBuild.STATUS_FAILED:
            locked.status = ProcessingDataBuild.STATUS_RUNNING
            locked.last_error = ''
            locked.save(update_fields=['status', 'last_error', 'updated_at'])
        elif locked.status == ProcessingDataBuild.STATUS_PENDING:
            locked.status = ProcessingDataBuild.STATUS_RUNNING
            locked.save(update_fields=['status', 'updated_at'])
        return locked


def process_processing_data_build_chunk(order: PurchaseOrder, user) -> dict[str, Any]:
    """Process one bounded chunk under row + item caps; idempotent when already complete."""

    _ensure_preprocessing_finalized(order)
    order.refresh_from_db(fields=['receiving_status'])
    raise_if_processing_blocked_by_intake(order)
    _validate_bookmarks_and_terminal(order)

    now = timezone.now()
    last_exc: Exception | None = None

    for attempt in range(2):
        try:
            with transaction.atomic():
                try:
                    build = ProcessingDataBuild.objects.select_for_update(of=('self',)).get(
                        purchase_order_id=order.pk,
                    )
                except ProcessingDataBuild.DoesNotExist:
                    raise ValidationError({
                        'detail': 'Start build-processing-data before requesting chunks.',
                        'code': 'no_build_session',
                    }) from None

                if build.status == ProcessingDataBuild.STATUS_COMPLETE:
                    return serialize_processing_data_build(order, build)

                if build.status == ProcessingDataBuild.STATUS_FAILED:
                    build.status = ProcessingDataBuild.STATUS_RUNNING
                    build.last_error = ''
                    build.save(update_fields=['status', 'last_error', 'updated_at'])

                if build.status == ProcessingDataBuild.STATUS_PENDING:
                    build.status = ProcessingDataBuild.STATUS_RUNNING
                    build.save(update_fields=['status', 'updated_at'])

                still_open = ProcessingRow.objects.filter(
                    purchase_order=order,
                    manifest_row_id__isnull=True,
                )
                chunk_bks = _take_next_bookmark_chunk(
                    order,
                    chunk_size=build.chunk_size,
                    max_items_per_chunk=build.max_items_per_chunk,
                )

                if not chunk_bks:
                    if still_open.exists():
                        build.status = ProcessingDataBuild.STATUS_FAILED
                        build.last_error = 'Build stalled: bookmarks remain unlinked after an empty chunk.'
                        build.error_count += 1
                        build.save(
                            update_fields=['status', 'last_error', 'error_count', 'updated_at'],
                        )
                        return serialize_processing_data_build(order, build)

                    _finalize_completed_processing_build(order, user, build, now)
                    build.save(
                        update_fields=[
                            'status',
                            'completed_at',
                            'processed_rows',
                            'created_items',
                            'current_row_number',
                            'warnings',
                            'updated_at',
                        ],
                    )
                    return serialize_processing_data_build(order, build)

                chunk_warnings: list[dict[str, Any]] = []
                manifest_objs = _manifest_objects_for_bookmarks(order, chunk_bks, chunk_warnings)
                ManifestRow.objects.bulk_create(manifest_objs)

                for bk, mr in zip(chunk_bks, manifest_objs):
                    bk.manifest_row_id = mr.pk
                    # One-way legacy bootstrap only (P6): never clobber the
                    # bookmark's decided match with the fresh row's empty FK.
                    if bk.matched_product_id is None and mr.matched_product_id:
                        bk.matched_product_id = mr.matched_product_id

                ProcessingRow.objects.bulk_update(
                    chunk_bks,
                    ['manifest_row_id', 'matched_product_id'],
                )

                item_objs = _bulk_create_chunk_items(order, manifest_objs)
                Item.objects.bulk_create(item_objs, batch_size=500)

                merge_chunk_warnings_into_build(build, chunk_warnings)

                refresh_processing_rows_denorm(order, processing_row_ids=[b.pk for b in chunk_bks])

                build.processed_rows = ProcessingRow.objects.filter(
                    purchase_order=order,
                    manifest_row_id__isnull=False,
                ).count()
                build.created_items = Item.objects.filter(purchase_order=order).count()
                build.current_row_number = max(int(b.row_number) for b in chunk_bks)
                build.status = ProcessingDataBuild.STATUS_RUNNING

                save_fields = [
                    'processed_rows',
                    'created_items',
                    'current_row_number',
                    'status',
                    'warnings',
                    'updated_at',
                ]
                build.save(update_fields=save_fields)

                if not ProcessingRow.objects.filter(
                    purchase_order=order,
                    manifest_row_id__isnull=True,
                ).exists():
                    _finalize_completed_processing_build(order, user, build, now)
                    build.save(
                        update_fields=[
                            'status',
                            'completed_at',
                            'processed_rows',
                            'created_items',
                            'current_row_number',
                            'warnings',
                            'updated_at',
                        ],
                    )

                return serialize_processing_data_build(order, build)

        except IntegrityError as exc:
            last_exc = exc
            logger.warning(
                'processing_data_chunk_integrity_retry order_id=%s attempt=%s',
                order.pk,
                attempt,
            )
            continue

    err_text = str(last_exc) if last_exc else 'unknown integrity error'
    with transaction.atomic():
        build = ProcessingDataBuild.objects.select_for_update(of=('self',)).get(purchase_order_id=order.pk)
        build.status = ProcessingDataBuild.STATUS_FAILED
        build.last_error = err_text[:2000]
        build.error_count += 1
        merge_chunk_warnings_into_build(
            build,
            [{
                'row_number': 0,
                'rule': 'item_create_retry',
                'message': 'SKU or DB uniqueness conflict after retry; build stopped.',
            }],
        )
        build.save(
            update_fields=['status', 'last_error', 'error_count', 'warnings', 'updated_at'],
        )
    return serialize_processing_data_build(order, build)


def build_manifest_from_processing_rows(
    order: PurchaseOrder,
    user,
    *,
    reset: bool = False,
) -> dict[str, Any]:
    """Start/resume a chunked build and process the first bounded chunk in this request."""

    processing_data_build_start_session(order, user, reset=reset)
    return process_processing_data_build_chunk(order, user)


def get_processing_data_build_status(order: PurchaseOrder) -> dict[str, Any]:
    """Read-only status for polling (no chunk work)."""

    _ensure_preprocessing_finalized(order)
    build = ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).first()
    return serialize_processing_data_build(order, build)


def clear_processing_data_to_bookmarks_phase(order: PurchaseOrder) -> dict[str, Any]:
    """Drop manifest/items/batches/build state and return to post-preprocessing bookmarks only.

    Does **not** change staging ``PreprocessingRow`` rows, and does **not**
    recreate manifest lines or items — the operator uses **Create Processing Data** when ready.
    """

    _ensure_preprocessing_finalized(order)
    order.refresh_from_db(fields=['receiving_status'])
    raise_if_processing_blocked_by_intake(order)
    _validate_bookmarks_and_terminal(order)

    with transaction.atomic():
        _destructive_manifest_item_reset(order)
        _unlink_processing_bookmarks(order)
        ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).delete()
        ProcessingBatch.objects.filter(purchase_order=order).delete()
        refresh_processing_rows_denorm(order)
        bookmark_count = ProcessingRow.objects.filter(purchase_order=order).count()
        ic = _sync_purchase_order_item_count(order)
        PurchaseOrder.objects.filter(pk=order.pk).update(
            processing_status='not_started',
            processing_started_at=None,
            processing_done_at=None,
        )

    return {
        'detail': (
            'Removed manifest rows, processing items (non-terminal), batch groups, and processing-batch records. '
            'Finalized preprocessing and bookmark rows are unchanged — tap Create Processing Data when you want canonical lines again.'
        ),
        'code': 'processing_data_cleared',
        'status': 'none',
        'done': True,
        'blocked': False,
        'processed_rows': 0,
        'total_rows': bookmark_count,
        'created_items': ic,
        'total_items': 0,
        'percent': 0,
        'warnings': [],
        'error_count': 0,
        'last_error': '',
        'manifest_rows': 0,
        'processing_row_bookmarks': bookmark_count,
        'batch_groups_created': 0,
        'products_created': 0,
        'items_created': ic,
        'item_count': ic,
        'processing_batch_id': None,
        'rows': 0,
        'rows_linked': 0,
        'items_updated': 0,
        'items_deleted': 0,
    }
