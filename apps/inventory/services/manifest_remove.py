"""Shared database effects for removing a purchase order manifest (file + staging)."""

from __future__ import annotations

from django.db import transaction

from apps.inventory.models import PreprocessingRow, PurchaseOrder


def remove_manifest_database(order: PurchaseOrder) -> str | None:
    """Clear manifest-related PO fields, delete preprocessing session, delete S3File row.

    Runs in a single atomic transaction. Returns the storage object key to delete outside
    the transaction (or None if there was no manifest file).
    """
    old = order.manifest
    if not old:
        return None
    old_key = old.key
    with transaction.atomic():
        order.manifest = None
        order.manifest_preview = None
        order.manifest_filename = ''
        order.manifest_uploaded_at = None
        order.manifest_row_count = None
        order.manifest_category_count = None
        order.manifest_signature = ''
        order.manifest_headers = None
        order.template = None
        order.template_name_cache = ''
        order.template_header_signature_cache = ''
        order.template_column_mappings_cache = []
        order.standardization_formulas = {}
        order.standardized_at = None
        order.ai_cleaned_at = None
        order.review_saved_at = None
        order.finalized_at = None
        order.preprocess_status = 'not_started'
        order.save(
            update_fields=[
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
                'preprocess_status',
                'updated_at',
            ],
        )
        PreprocessingRow.objects.filter(purchase_order=order).delete()
        old.delete()
    return old_key
