"""
Fast preprocessing finalize → durable processing bookmarks (`ProcessingRow`).
Heavy ManifestRow/Product/Item creation happens in ``build_manifest_from_processing_rows``.
"""

from __future__ import annotations

import copy
from decimal import Decimal
from typing import Any, Iterable

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.inventory.manifest_standard_fields import slugify_formula_search_tags
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingOrder,
    PreprocessingRow,
    ProcessingRow,
    PurchaseOrder,
)
from apps.inventory.services.processing_workspace import (
    link_processing_rows_to_manifest_rows,
    refresh_processing_rows_denorm,
)


# Narrow columns read from preprocessing at finalize-time (avoid SELECT * hydrations).
PREPROCESSING_PROJECT_TO_BOOKMARK_FIELDS = (
    'id',
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


def load_preprocessing_values_for_finalize(
    prep: PreprocessingOrder,
) -> Iterable[dict[str, Any]]:
    """Query only columns needed for bookmark copy (no ai/standard select)."""

    return PreprocessingRow.objects.filter(preprocessing_order=prep).order_by('row_number').values(
        *PREPROCESSING_PROJECT_TO_BOOKMARK_FIELDS,
    )


def finalize_preprocessing_to_bookmarks(
    order: PurchaseOrder,
    prep: PreprocessingOrder,
) -> int:
    """
    Validate narrow preprocessing rows OOB, then in one txn:
      - replace bookmarks for PO
      - clear canonical ManifestRow/non-terminal Items/BatchGroups

    Returns ProcessingRow insert count.
    """

    from apps.inventory.views import TERMINAL_ITEM_STATUSES

    val_rows = list(load_preprocessing_values_for_finalize(prep))
    validate_preprocessing_value_rows_for_finalize(val_rows)

    objs: list[ProcessingRow] = []

    for r in val_rows:
        qty_raw = r.get('quantity') or 1
        qty = max(1, int(qty_raw))

        objs.append(
            ProcessingRow(
                purchase_order_id=order.id,
                preprocessing_row_id=r.get('id'),
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
            ),
        )

    now = timezone.now()

    with transaction.atomic():
        ProcessingRow.objects.filter(purchase_order=order).delete()
        ManifestRow.objects.filter(purchase_order=order).delete()
        order.items.exclude(status__in=TERMINAL_ITEM_STATUSES).delete()
        order.batch_groups.all().delete()

        ProcessingRow.objects.bulk_create(objs)

        prep.finalized_at = now
        prep.workflow_status = 'finalized'
        prep.current_step = max(prep.current_step, 2)
        prep.save(
            update_fields=['finalized_at', 'workflow_status', 'current_step', 'updated_at'],
        )

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


def build_manifest_from_processing_rows(order: PurchaseOrder, user) -> dict[str, Any]:
    """Fast rebuild of canonical ManifestRow + minimal Item rows from bookmarks.

    This hot path intentionally skips Product matching, Product rollups, and BatchGroup creation
    so large POs can enter Item Processor without a long synchronous request.
    """

    from apps.inventory.models import ProcessingBatch
    from apps.inventory.views import (
        TERMINAL_ITEM_STATUSES,
    )

    if not bookmarks_exist_for_order(order):
        raise ValidationError(
            {'detail': 'No processing bookmarks; finalize preprocessing first.', 'code': 'no_bookmarks'},
        )

    terminal_count = order.items.filter(status__in=TERMINAL_ITEM_STATUSES).count()
    if terminal_count:
        raise ValidationError({
            'detail': (
                'Cannot build processing data — some items are sold, scrapped, or lost. '
                'Resolve inventory state before rebuilding.'
            ),
            'code': 'terminal_items_block',
        })

    bookmarks = list(
        ProcessingRow.objects.filter(purchase_order=order).order_by('row_number'),
    )

    manifest_objs = []
    for bk in bookmarks:
        stags = bk.search_tags
        if isinstance(stags, list):
            stags = list(stags)
        else:
            stags = _normalize_manifest_search_tags(stags)
        title, desc = _listing_text_or_placeholder(bk)

        manifest_objs.append(
            ManifestRow(
                purchase_order=order,
                row_number=bk.row_number,
                quantity=_safe_quantity(bk.quantity),
                description=desc,
                title=title,
                brand=str(bk.brand or ''),
                model=str(bk.model or ''),
                category=str(bk.category or '')[:200],
                condition=_safe_condition(bk.condition),
                unit_retail=bk.unit_retail,
                proposed_price=bk.proposed_price,
                final_price=bk.final_price,
                pricing_stage=bk.pricing_stage or 'unpriced',
                pricing_notes=bk.pricing_notes or '',
                batch_flag=bk.batch_flag,
                identifiers=dict(bk.identifiers or {}),
                taxonomy=dict(bk.taxonomy or {}),
                search_tags=stags or [],
                specifications=dict(bk.specifications or {}),
                tracking=dict(bk.tracking or {}),
                ai_reasoning=bk.ai_reasoning or '',
                notes=str(bk.notes or ''),
                match_status='pending',
            ),
        )

    now = timezone.now()

    with transaction.atomic():
        ManifestRow.objects.filter(purchase_order=order).delete()
        order.items.exclude(status__in=TERMINAL_ITEM_STATUSES).delete()
        order.batch_groups.all().delete()

        ManifestRow.objects.bulk_create(manifest_objs)

        link_processing_rows_to_manifest_rows(order)

        rows = list(
            ManifestRow.objects.filter(purchase_order=order).order_by('row_number'),
        )

        total_items = sum(_safe_quantity(row.quantity) for row in rows)
        skus = _next_sku_batch(total_items)
        item_objs: list[Item] = []
        sku_idx = 0
        for row in rows:
            quantity = _safe_quantity(row.quantity)
            item_cost = order.compute_item_cost(row.unit_retail)
            price = row.final_price if row.final_price is not None else row.proposed_price
            if price is None:
                price = 0
            for _ in range(quantity):
                sku = skus[sku_idx] if sku_idx < len(skus) else Item.generate_sku()
                sku_idx += 1
                item = Item(
                    sku=sku,
                    product=None,
                    purchase_order=order,
                    manifest_row=row,
                    processing_tier='individual',
                    title=(row.title or row.description or f'Review raw manifest row {row.row_number}')[:300],
                    brand=row.brand or '',
                    price=price,
                    unit_retail=row.unit_retail,
                    cost=item_cost,
                    source='purchased',
                    status='intake',
                    condition=_safe_condition(row.condition),
                    specifications=row.specifications or {},
                )
                item.search_text = item.rebuild_search_text()
                item_objs.append(item)

        if item_objs:
            Item.objects.bulk_create(item_objs, batch_size=1000)

        refresh_processing_rows_denorm(order)

        batch = ProcessingBatch.objects.filter(purchase_order=order).order_by('-started_at').first()
        if not batch:
            batch = ProcessingBatch.objects.create(
                purchase_order=order,
                status='in_progress',
                total_rows=len(rows),
                processed_count=len(rows),
                items_created=len(item_objs),
                started_at=now,
                completed_at=now,
                created_by=user,
            )
        else:
            batch.total_rows = len(rows)
            batch.processed_count = len(rows)
            batch.items_created = len(item_objs)
            batch.completed_at = now
            batch.status = 'in_progress'
            batch.save(
                update_fields=['total_rows', 'processed_count', 'items_created', 'completed_at', 'status'],
            )

        item_count = order.items.count()
        if order.item_count != item_count:
            order.item_count = item_count
            order.save(update_fields=['item_count', 'updated_at'])

        return {
            'manifest_rows': len(rows),
            'processing_row_bookmarks': len(bookmarks),
            'batch_groups_created': 0,
            'processing_batch_id': batch.id if batch else None,
            'rows': len(rows),
            'rows_linked': 0,
            'products_created': 0,
            'items_created': len(item_objs),
            'items_updated': 0,
            'items_deleted': 0,
            'item_count': item_count,
        }
