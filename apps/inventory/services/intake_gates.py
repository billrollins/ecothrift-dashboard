"""Shared intake pipeline gates (preprocessing vs receiving vs processing)."""

from __future__ import annotations

from django.core.exceptions import ValidationError

from apps.inventory.models import PurchaseOrder


def raise_if_processing_blocked_by_intake(order: PurchaseOrder) -> None:
    """Processing mutations require finalized preprocessing and completed receiving."""

    if not order.finalized_at:
        raise ValidationError({
            'detail': 'Finalize preprocessing before processing operations.',
            'code': 'not_finalized',
        })
    if order.receiving_status != 'done':
        raise ValidationError({
            'detail': 'Complete receiving before processing operations.',
            'code': 'receiving_not_done',
        })
