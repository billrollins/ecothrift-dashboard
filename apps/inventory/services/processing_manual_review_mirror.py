"""Keep ``ProcessingRow`` listing/search fields aligned with manual-review ``ManifestRow`` edits."""

from __future__ import annotations

from typing import Iterable

from django.db import transaction

from apps.inventory.manifest_standard_fields import slugify_formula_search_tags
from apps.inventory.models import ManifestRow, ProcessingRow, PurchaseOrder
from apps.inventory.services.processing_search_string import build_processing_row_search_string


def mirror_manifest_rows_into_processing_bookmarks(
    order: PurchaseOrder,
    manifest_rows: Iterable[ManifestRow],
) -> int:
    """Copy searchable manifest fields onto linked bookmarks; refresh ``search_string`` via ``bulk_update``.

    ``pre_save`` does not run on ``bulk_update``, so ``search_string`` is set explicitly.
    Returns count of bookmarks updated.
    """

    rows = list(manifest_rows)
    if not rows:
        return 0

    mids = [m.pk for m in rows]
    prs = list(
        ProcessingRow.objects.filter(
            purchase_order=order,
            manifest_row_id__in=mids,
        ),
    )
    by_mid: dict[int, ProcessingRow] = {p.manifest_row_id: p for p in prs if p.manifest_row_id}

    touched: list[ProcessingRow] = []
    for mr in rows:
        pr = by_mid.get(mr.pk)
        if not pr:
            continue
        pr.title = str(mr.title or '')[:300]
        pr.brand = str(mr.brand or '')[:200]
        pr.model = str(mr.model or '')[:200]
        pr.category = str(mr.category or '')[:200]
        pr.condition = str(mr.condition or '')[:20]
        pr.description = str(mr.description or '')
        pr.notes = str(mr.notes or '')
        pr.pricing_notes = str(mr.pricing_notes or '')
        pr.batch_flag = bool(mr.batch_flag)
        pr.identifiers = mr.identifiers if isinstance(mr.identifiers, dict) else {}
        pr.taxonomy = mr.taxonomy if isinstance(mr.taxonomy, dict) else {}
        pr.specifications = mr.specifications if isinstance(mr.specifications, dict) else {}
        pr.tracking = mr.tracking if isinstance(mr.tracking, dict) else {}
        if isinstance(mr.search_tags, list):
            pr.search_tags = [str(x).strip() for x in mr.search_tags if str(x).strip()]
        else:
            pr.search_tags = slugify_formula_search_tags(str(mr.search_tags or ''))
        pr.final_price = mr.final_price
        pr.proposed_price = mr.proposed_price
        pr.pricing_stage = mr.pricing_stage
        pr.unit_retail = mr.unit_retail
        pr.search_string = build_processing_row_search_string(pr)
        touched.append(pr)

    if not touched:
        return 0

    with transaction.atomic():
        ProcessingRow.objects.bulk_update(
            touched,
            [
                'title',
                'brand',
                'model',
                'category',
                'condition',
                'description',
                'notes',
                'pricing_notes',
                'batch_flag',
                'identifiers',
                'taxonomy',
                'specifications',
                'tracking',
                'search_tags',
                'final_price',
                'proposed_price',
                'pricing_stage',
                'unit_retail',
                'search_string',
            ],
        )
    return len(touched)
