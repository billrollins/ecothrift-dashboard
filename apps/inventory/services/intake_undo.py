"""Intake pipeline undo (staging-first): preview + apply rewinds aligned to data_flow_plan §6."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.inventory.layer_helpers import (
    bulk_clear_preprocess_ai_and_final_layers,
    bulk_clear_preprocess_standard_layer,
)
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingDataBuild,
    ProcessingRow,
    PurchaseOrder,
)
from apps.inventory.services.manifest_remove import remove_manifest_database

TERMINAL_ITEM_STATUSES = frozenset({'sold', 'scrapped', 'lost'})
UNDO_STAGES = frozenset({'manifest_upload', 'standardize', 'ai_cleanup', 'finalize'})


class UndoNotAllowed(Exception):
    """Raised when apply_undo is called but the preview would be unsafe."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _blocked(payload: dict[str, Any], reason: str) -> dict[str, Any]:
    out = {**payload, 'safe': False, 'blocked_reason': reason}
    return out


def _empty_preview(to_stage: str) -> dict[str, Any]:
    return {
        'target_stage': to_stage,
        'fields_to_null': [],
        'status_resets': {},
        'rows_to_delete': {},
        'rows_to_update': {},
        'files_to_delete': [],
        'cascade_warnings': [],
        'safe': True,
        'blocked_reason': None,
    }


def _terminal_block_reason(order: PurchaseOrder) -> str | None:
    if order.items.filter(status__in=TERMINAL_ITEM_STATUSES).exists():
        return (
            'Cannot undo — some generated items are sold, scrapped, or lost.'
        )
    return None


def compute_undo_preview(order: PurchaseOrder, to_stage: str) -> dict[str, Any]:
    if to_stage not in UNDO_STAGES:
        return _blocked(
            _empty_preview(to_stage),
            f'Invalid to_stage {to_stage!r}; expected one of {sorted(UNDO_STAGES)}.',
        )

    base = _empty_preview(to_stage)
    if getattr(order, 'uses_legacy_processing', False):
        return _blocked(
            base,
            'Undo is disabled for legacy-processed orders (uses_legacy_processing).',
        )
    t = _terminal_block_reason(order)
    if t:
        return _blocked(base, t)

    preprow_ct = PreprocessingRow.objects.filter(purchase_order_id=order.pk).count()
    legacy_manifest = ManifestRow.objects.filter(purchase_order_id=order.pk).exists()
    bookmark_ct = ProcessingRow.objects.filter(purchase_order_id=order.pk).count()
    linked_bm = ProcessingRow.objects.filter(
        purchase_order_id=order.pk,
        manifest_row_id__isnull=False,
    ).exists()
    build_ct = ProcessingDataBuild.objects.filter(purchase_order_id=order.pk).count()
    non_terminal_items = Item.objects.filter(purchase_order_id=order.pk).exclude(
        status__in=TERMINAL_ITEM_STATUSES,
    ).count()

    if to_stage == 'manifest_upload':
        if not order.manifest_id:
            return _blocked(base, 'No manifest file on this order.')
        base['fields_to_null'] = [
            'manifest',
            'manifest_preview',
            'manifest_filename',
            'manifest_uploaded_at',
            'manifest_row_count',
            'manifest_category_count',
            'manifest_signature',
            'manifest_headers',
            'template',
            'template_name_cache',
            'template_header_signature_cache',
            'template_column_mappings_cache',
            'standardization_formulas',
            'standardized_at',
            'ai_cleaned_at',
            'review_saved_at',
            'finalized_at',
        ]
        base['status_resets'] = {'preprocess_status': 'not_started'}
        if preprow_ct:
            base['rows_to_delete']['inventory_preprocessingrow'] = preprow_ct
        base['files_to_delete'] = [order.manifest_filename or 'manifest file']
        return base

    if to_stage == 'standardize':
        if legacy_manifest:
            return _blocked(
                base,
                'This order has legacy ManifestRow lines. Use legacy tools or clear manifest rows before rewinding standardization.',
            )
        if bookmark_ct:
            return _blocked(
                base,
                'Cannot undo standardize while processing bookmarks exist. Undo finalize (timeline) first.',
            )
        base['fields_to_null'] = [
            'standardized_at',
            'ai_cleaned_at',
            'review_saved_at',
            'finalized_at',
            'template',
            'template_name_cache',
            'template_header_signature_cache',
            'template_column_mappings_cache',
            'standardization_formulas',
        ]
        base['status_resets'] = {'preprocess_status': 'not_started'}
        base['rows_to_update']['inventory_preprocessingrow'] = preprow_ct
        base['cascade_warnings'].append(
            'Increments ai_cleanup_generation to invalidate in-flight AI cleanup batches.',
        )
        return base

    if to_stage == 'ai_cleanup':
        if legacy_manifest:
            return _blocked(
                base,
                'This order has legacy ManifestRow lines; AI cleanup undo is not supported on that path.',
            )
        if bookmark_ct:
            return _blocked(
                base,
                'Cannot undo AI cleanup while processing bookmarks exist. Undo finalize first.',
            )
        base['fields_to_null'] = ['ai_cleaned_at', 'review_saved_at', 'finalized_at']
        base['status_resets'] = {'preprocess_status': 'standardized'}
        base['rows_to_update']['inventory_preprocessingrow'] = preprow_ct
        return base

    # finalize
    if legacy_manifest:
        return _blocked(
            base,
            'Cannot undo finalize while canonical manifest rows exist.',
        )
    if non_terminal_items:
        return _blocked(
            base,
            'Cannot undo finalize while processing items exist on this order.',
        )
    if linked_bm:
        return _blocked(
            base,
            'Bookmarks are already linked to manifest rows; cannot safely rewind finalize.',
        )
    base['fields_to_null'] = ['finalized_at', 'review_saved_at']
    base['status_resets'] = {'preprocess_status': 'cleaned'}
    base['rows_to_delete']['inventory_processingrow'] = bookmark_ct
    if build_ct:
        base['rows_to_delete']['inventory_processingdatabuild'] = build_ct
    base['rows_to_update']['inventory_preprocessingrow'] = preprow_ct
    return base


def _apply_standardize(order: PurchaseOrder) -> None:
    with transaction.atomic():
        locked = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        pr_qs = PreprocessingRow.objects.filter(purchase_order_id=locked.pk)
        bulk_clear_preprocess_standard_layer(pr_qs)
        bulk_clear_preprocess_ai_and_final_layers(pr_qs)
        pr_qs.update(
            unit_retail=None,
            proposed_price=None,
            final_price=None,
            pricing_stage='unpriced',
            pricing_notes='',
            ai_reasoning='',
            ai_status={},
        )
        locked.standardized_at = None
        locked.ai_cleaned_at = None
        locked.review_saved_at = None
        locked.finalized_at = None
        locked.template = None
        locked.template_name_cache = ''
        locked.template_header_signature_cache = ''
        locked.template_column_mappings_cache = []
        locked.standardization_formulas = {}
        locked.preprocess_status = 'not_started'
        locked.ai_cleanup_generation = (locked.ai_cleanup_generation or 0) + 1
        locked.save(
            update_fields=[
                'standardized_at',
                'ai_cleaned_at',
                'review_saved_at',
                'finalized_at',
                'template',
                'template_name_cache',
                'template_header_signature_cache',
                'template_column_mappings_cache',
                'standardization_formulas',
                'preprocess_status',
                'ai_cleanup_generation',
                'updated_at',
            ],
        )


def _apply_ai_cleanup(order: PurchaseOrder) -> None:
    with transaction.atomic():
        locked = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        pr_qs = PreprocessingRow.objects.filter(purchase_order_id=locked.pk)
        bulk_clear_preprocess_ai_and_final_layers(pr_qs)
        pr_qs.update(ai_reasoning='', ai_status={})
        locked.ai_cleaned_at = None
        locked.review_saved_at = None
        locked.finalized_at = None
        locked.preprocess_status = 'standardized'
        locked.save(
            update_fields=[
                'ai_cleaned_at',
                'review_saved_at',
                'finalized_at',
                'preprocess_status',
                'updated_at',
            ],
        )


def _apply_finalize(order: PurchaseOrder) -> None:
    with transaction.atomic():
        locked = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        pr_qs = PreprocessingRow.objects.filter(purchase_order_id=locked.pk)
        pr_qs.update(
            final_description=None,
            final_title=None,
            final_category=None,
            final_brand=None,
            final_model=None,
            final_condition=None,
            final_notes=None,
            final_identifiers=None,
            final_taxonomy=None,
            final_specifications=None,
            final_tracking=None,
            final_search_tags=None,
        )
        ProcessingDataBuild.objects.filter(purchase_order_id=locked.pk).delete()
        ProcessingRow.objects.filter(purchase_order_id=locked.pk).delete()
        locked.finalized_at = None
        locked.review_saved_at = None
        locked.preprocess_status = 'cleaned'
        locked.save(
            update_fields=[
                'finalized_at',
                'review_saved_at',
                'preprocess_status',
                'updated_at',
            ],
        )


def apply_undo(order: PurchaseOrder, to_stage: str) -> PurchaseOrder:
    preview = compute_undo_preview(order, to_stage)
    if not preview['safe']:
        raise UndoNotAllowed(preview.get('blocked_reason') or 'Undo not allowed.')

    if to_stage == 'manifest_upload':
        key = remove_manifest_database(order)
        if key:
            from django.core.files.storage import default_storage

            try:
                default_storage.delete(key)
            except Exception:
                pass
        order.refresh_from_db()
        return order

    if to_stage == 'standardize':
        _apply_standardize(order)
        order.refresh_from_db()
        return order

    if to_stage == 'ai_cleanup':
        _apply_ai_cleanup(order)
        order.refresh_from_db()
        return order

    if to_stage == 'finalize':
        _apply_finalize(order)
        order.refresh_from_db()
        return order

    raise UndoNotAllowed(f'Unhandled stage {to_stage!r}.')
