"""Deterministic repairs for the four intake rollout POs (316–319).

Order of operations in apply path (see management command):
1. Manifest denorm backfill (formerly `_backfill_manifest_denorm.py`)
2. Deterministic receiving/processing train repairs
"""

from __future__ import annotations

from datetime import datetime, time
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.models import S3File
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingDataBuild,
    ProcessingRow,
    PurchaseOrder,
    Receiving,
)
from apps.inventory.services.manifest_meta import compute_category_count

# Hard-coded rollout targets: id -> order_number
EXPECTED_INTAKE_POS: dict[int, str] = {
    316: 'AMZ0N-OQL-CCP4',
    317: 'C5TC0-OM1-A8R3',
    318: 'TRGET-O4U-QP68',
    319: 'TRGET-O2R-1K40',
}

TERMINAL_ITEM_STATUSES = frozenset({'sold', 'scrapped', 'lost'})


def assert_expected_pos(po: PurchaseOrder) -> None:
    exp = EXPECTED_INTAKE_POS.get(po.pk)
    if exp is None:
        raise ValueError(f'PurchaseOrder {po.pk} is not a configured intake repair target')
    if (po.order_number or '') != exp:
        raise ValueError(
            f'PurchaseOrder id={po.pk} has order_number={po.order_number!r}, expected {exp!r}',
        )


def _aware_start_of_date(d) -> datetime | None:
    if not d:
        return None
    dt = datetime.combine(d, time.min)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _aware_end_of_date(d) -> datetime | None:
    if not d:
        return None
    dt = datetime.combine(d, time.max.replace(microsecond=0))
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def compute_manifest_row_count_snapshot(po: PurchaseOrder, preview: dict[str, Any]) -> int:
    """Best-effort row count: prefer real counts over preview sample length."""
    mr_ct = ManifestRow.objects.filter(purchase_order=po).count()
    pr_ct = PreprocessingRow.objects.filter(purchase_order=po).count()
    bm_ct = ProcessingRow.objects.filter(purchase_order=po).count()
    stored = int(po.manifest_row_count or 0)
    preview_rows = preview.get('rows') if isinstance(preview, dict) else None
    preview_len = len(preview_rows) if isinstance(preview_rows, list) else 0
    candidates = [stored, mr_ct, pr_ct, bm_ct, preview_len]
    positives = [c for c in candidates if isinstance(c, int) and c > 0]
    if positives:
        return max(positives)
    return 0


def backfill_manifest_denorm_fields(po: PurchaseOrder) -> dict[str, Any]:
    """Refresh PO manifest denormalized fields from S3File + manifest_preview (sample)."""
    assert_expected_pos(po)
    if not po.manifest_id:
        return {'skipped': True, 'reason': 'no_manifest'}

    preview = po.manifest_preview if isinstance(po.manifest_preview, dict) else {}
    headers = preview.get('headers') or []
    if not isinstance(headers, list):
        headers = []
    rows = preview.get('rows') or []
    if not isinstance(rows, list):
        rows = []

    row_count = compute_manifest_row_count_snapshot(po, preview)
    s3 = S3File.objects.filter(pk=po.manifest_id).first()
    mf = s3.filename if s3 else None
    mu = s3.uploaded_at if s3 else None
    cc = compute_category_count(headers, rows)

    PurchaseOrder.objects.filter(pk=po.pk).update(
        manifest_filename=mf,
        manifest_uploaded_at=mu,
        manifest_row_count=row_count,
        manifest_category_count=cc,
    )
    return {
        'skipped': False,
        'manifest_filename': mf,
        'manifest_uploaded_at': mu,
        'manifest_row_count': row_count,
        'manifest_category_count': cc,
    }


def classify_processing_stage(po: PurchaseOrder) -> str:
    """Return 'completed', 'in_flight', or 'no_bookmarks'."""
    pr_total = ProcessingRow.objects.filter(purchase_order=po).count()
    if pr_total == 0:
        return 'no_bookmarks'
    linked = ProcessingRow.objects.filter(purchase_order=po, manifest_row_id__isnull=False).count()
    mr_ct = ManifestRow.objects.filter(purchase_order=po).count()
    build = ProcessingDataBuild.objects.filter(purchase_order=po).first()

    if build and build.status == ProcessingDataBuild.STATUS_COMPLETE:
        return 'completed'

    # Open build session: stay in-flight until ProcessingDataBuild is marked complete.
    if build and build.status != ProcessingDataBuild.STATUS_COMPLETE:
        return 'in_flight'

    if linked == pr_total and mr_ct == pr_total and pr_total > 0:
        return 'completed'

    return 'in_flight'


def count_unmanifested_intake_items(po: PurchaseOrder) -> int:
    """Items received with the PO but absent from the vendor manifest are valid overages."""
    return Item.objects.filter(
        purchase_order=po,
        manifest_row_id__isnull=True,
        status='intake',
        product__isnull=True,
    ).count()


def apply_intake_po_repairs(po: PurchaseOrder) -> dict[str, Any]:
    """Apply manifest denorm + deterministic train repairs for one PO."""
    assert_expected_pos(po)
    now = timezone.now()
    out: dict[str, Any] = {'po_id': po.pk, 'order_number': po.order_number}

    with transaction.atomic():
        po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
        assert_expected_pos(po)

        out['manifest_denorm'] = backfill_manifest_denorm_fields(po)
        po.refresh_from_db()

        stage = classify_processing_stage(po)
        out['processing_stage'] = stage

        out['unmanifested_intake_items_preserved'] = count_unmanifested_intake_items(po)

        updates: dict[str, Any] = {}
        if po.uses_legacy_processing:
            updates['uses_legacy_processing'] = False

        if po.preprocess_status != 'finalized' or not po.finalized_at:
            raise ValueError(
                f'PO {po.pk}: expected preprocess_status=finalized with finalized_at (got {po.preprocess_status!r})',
            )

        rec = Receiving.objects.filter(purchase_order=po).order_by('id').first()

        if po.status == 'delivered':
            updates['receiving_status'] = 'done'
            if not po.receiving_started_at:
                if rec and rec.created_at:
                    updates['receiving_started_at'] = rec.created_at
                else:
                    updates['receiving_started_at'] = _aware_start_of_date(po.delivered_date) or po.updated_at or now
            if not po.receiving_done_at:
                if rec and rec.completed_at:
                    updates['receiving_done_at'] = rec.completed_at
                else:
                    updates['receiving_done_at'] = _aware_end_of_date(po.delivered_date) or now
        else:
            raise ValueError(f'PO {po.pk}: unexpected PO.status={po.status!r} (expected delivered for repair)')

        build = ProcessingDataBuild.objects.filter(purchase_order=po).first()

        if stage == 'no_bookmarks':
            raise ValueError(f'PO {po.pk}: no ProcessingRow bookmarks; refusing repair')

        if stage == 'completed':
            updates['processing_status'] = 'done'
            if not po.processing_started_at:
                if build and build.started_at:
                    updates['processing_started_at'] = build.started_at
                else:
                    first = (
                        ProcessingRow.objects.filter(purchase_order=po)
                        .order_by('created_at')
                        .values_list('created_at', flat=True)
                        .first()
                    )
                    if first:
                        updates['processing_started_at'] = first
                    else:
                        updates['processing_started_at'] = now
            if not po.processing_done_at:
                if build and build.completed_at:
                    updates['processing_done_at'] = build.completed_at
                else:
                    updates['processing_done_at'] = now
        else:
            updates['processing_status'] = 'active'
            if not po.processing_started_at:
                if build and build.started_at:
                    updates['processing_started_at'] = build.started_at
                else:
                    first = (
                        ProcessingRow.objects.filter(purchase_order=po)
                        .order_by('created_at')
                        .values_list('created_at', flat=True)
                        .first()
                    )
                    if first:
                        updates['processing_started_at'] = first
                    else:
                        updates['processing_started_at'] = now
            if build and build.status != ProcessingDataBuild.STATUS_COMPLETE:
                updates['processing_done_at'] = None
            elif not build:
                updates['processing_done_at'] = None

        if updates:
            PurchaseOrder.objects.filter(pk=po.pk).update(**updates)

        ic = Item.objects.filter(purchase_order_id=po.pk).count()
        PurchaseOrder.objects.filter(pk=po.pk).update(item_count=ic)

        out['purchase_order_updates'] = list(updates.keys())
        out['item_count_synced'] = ic

    return out


def verify_intake_po(po: PurchaseOrder) -> list[str]:
    """Return a list of error strings; empty means OK."""
    errors: list[str] = []
    try:
        assert_expected_pos(po)
    except ValueError as e:
        return [str(e)]

    if po.uses_legacy_processing:
        errors.append(f'PO {po.pk}: uses_legacy_processing should be False')
    if po.preprocess_status != 'finalized' or not po.finalized_at:
        errors.append(f'PO {po.pk}: preprocess not finalized')

    preview = po.manifest_preview if isinstance(po.manifest_preview, dict) else {}
    headers = preview.get('headers') or []
    rows = preview.get('rows') or []
    if not isinstance(headers, list):
        headers = []
    if not isinstance(rows, list):
        rows = []
    expected_rc = compute_manifest_row_count_snapshot(po, preview)
    if po.manifest_row_count != expected_rc:
        errors.append(
            f'PO {po.pk}: manifest_row_count={po.manifest_row_count} expected {expected_rc} '
            f'(snapshot from manifests/bookmarks/preview)',
        )
    if po.manifest_id and not po.manifest_filename:
        errors.append(f'PO {po.pk}: manifest_filename empty but manifest_id set')
    cc = compute_category_count(headers, rows)
    if po.manifest_category_count != cc:
        errors.append(
            f'PO {po.pk}: manifest_category_count={po.manifest_category_count} expected {cc} '
            f'(from preview sample and header rules)',
        )

    if po.status != 'delivered':
        errors.append(f'PO {po.pk}: status should be delivered')
    if po.receiving_status != 'done' or not po.receiving_done_at:
        errors.append(f'PO {po.pk}: receiving not done (status={po.receiving_status!r})')

    stage = classify_processing_stage(po)
    pr_total = ProcessingRow.objects.filter(purchase_order=po).count()
    linked_pr = ProcessingRow.objects.filter(purchase_order=po, manifest_row_id__isnull=False).count()
    mr_ct = ManifestRow.objects.filter(purchase_order=po).count()
    mr_qty = ManifestRow.objects.filter(purchase_order=po).aggregate(s=Sum('quantity'))['s'] or 0
    linked_items = Item.objects.filter(purchase_order=po, manifest_row_id__isnull=False).count()

    build = ProcessingDataBuild.objects.filter(purchase_order=po).first()

    if stage == 'completed':
        if po.processing_status != 'done' or not po.processing_done_at:
            errors.append(
                f'PO {po.pk}: processing should be done (status={po.processing_status!r})',
            )
        if linked_pr != pr_total or pr_total == 0:
            errors.append(f'PO {po.pk}: not all ProcessingRow bookmarks linked ({linked_pr}/{pr_total})')
        if mr_ct != pr_total:
            errors.append(f'PO {po.pk}: ManifestRow count {mr_ct} != ProcessingRow {pr_total}')
        if linked_items != mr_qty:
            errors.append(
                f'PO {po.pk}: linked items {linked_items} != sum(ManifestRow.quantity) {mr_qty}',
            )
        if build and build.status != ProcessingDataBuild.STATUS_COMPLETE:
            errors.append(
                f'PO {po.pk}: build status {build.status!r} but data looks completed',
            )
    elif stage == 'in_flight':
        if po.processing_status != 'active':
            errors.append(
                f'PO {po.pk}: expected processing_status=active for in-flight build (got {po.processing_status!r})',
            )
        if po.processing_done_at:
            errors.append(f'PO {po.pk}: processing_done_at should be null while in flight')
        if not po.processing_started_at:
            errors.append(f'PO {po.pk}: processing_started_at missing for in-flight build')
        if mr_ct != linked_pr:
            errors.append(
                f'PO {po.pk}: ManifestRow count {mr_ct} != linked ProcessingRow {linked_pr}',
            )
        if linked_items != mr_qty:
            errors.append(
                f'PO {po.pk}: linked items {linked_items} != materialized qty {mr_qty}',
            )
        if build and build.status == ProcessingDataBuild.STATUS_COMPLETE:
            errors.append(f'PO {po.pk}: build complete but classified in_flight')
    else:
        errors.append(f'PO {po.pk}: unexpected stage {stage!r}')

    return errors
