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
    BatchGroup,
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


def build_manifest_from_processing_rows(order: PurchaseOrder, user) -> dict[str, Any]:
    """Rebuild canonical ManifestRow + Product + Item (+ batch heuristic) from bookmarks."""

    from apps.inventory.models import ProcessingBatch
    from apps.inventory.views import (
        TERMINAL_ITEM_STATUSES,
        effective_manifest_row_price,
        ensure_manifest_products_and_items,
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

        manifest_objs.append(
            ManifestRow(
                purchase_order=order,
                row_number=bk.row_number,
                quantity=bk.quantity or 1,
                description=str(bk.description or ''),
                title=str(bk.title or ''),
                brand=str(bk.brand or ''),
                model=str(bk.model or ''),
                category=str(bk.category or '')[:200],
                condition=str(bk.condition or '')[:20],
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

    batch_groups_created = 0
    now = timezone.now()

    with transaction.atomic():
        ManifestRow.objects.filter(purchase_order=order).delete()
        order.items.exclude(status__in=TERMINAL_ITEM_STATUSES).delete()
        order.batch_groups.all().delete()

        ManifestRow.objects.bulk_create(manifest_objs)

        ensure_summary = ensure_manifest_products_and_items(order, user)

        link_processing_rows_to_manifest_rows(order)
        refresh_processing_rows_denorm(order)

        rows = list(
            ManifestRow.objects.filter(purchase_order=order)
            .select_related('matched_product')
            .prefetch_related('batch_groups'),
        )

        batch = ProcessingBatch.objects.filter(purchase_order=order).order_by('-started_at').first()
        if not batch:
            batch = ProcessingBatch.objects.create(
                purchase_order=order,
                status='in_progress',
                total_rows=len(rows),
                processed_count=len(rows),
                items_created=order.items.count(),
                started_at=now,
                completed_at=now,
                created_by=user,
            )

        for row in rows:
            quantity = row.quantity if row.quantity and row.quantity > 0 else 1
            row_price = effective_manifest_row_price(row)
            is_batch = False
            if row_price is not None:
                is_batch = quantity >= 6 and float(row_price) < 75
            elif quantity >= 10:
                is_batch = True
            if not is_batch:
                continue
            batch_group = row.batch_groups.first()
            if not batch_group:
                batch_group = BatchGroup.objects.create(
                    batch_number=BatchGroup.generate_batch_number(),
                    product=row.matched_product,
                    purchase_order=order,
                    manifest_row=row,
                    total_qty=quantity,
                    unit_price=row_price,
                    unit_cost=row.unit_retail,
                    condition='unknown',
                    status='pending',
                )
                batch_groups_created += 1
            row.items.exclude(status__in=TERMINAL_ITEM_STATUSES).update(
                batch_group=batch_group,
                processing_tier='batch',
            )

        return {
            'manifest_rows': len(rows),
            'processing_row_bookmarks': len(bookmarks),
            'batch_groups_created': batch_groups_created,
            'processing_batch_id': batch.id if batch else None,
            **ensure_summary,
        }
