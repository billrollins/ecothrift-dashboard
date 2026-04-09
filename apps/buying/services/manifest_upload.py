"""Process uploaded manifest CSV for an auction (Phase 4.1A / 4.1B)."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction
from apps.buying.models import Auction, CategoryMapping, ManifestRow
from apps.buying.services.ai_key_mapping import (
    count_distinct_unmapped_keys,
    total_batches_for_count,
)
from apps.buying.services.ai_manifest_template import propose_manifest_template_with_ai
from apps.buying.services.manifest_template import (
    build_fast_cat_key,
    compute_fill_rates,
    compute_header_signature,
    create_template_stub,
    detect_template,
    effective_category_fields,
    parse_csv_dict_rows,
    standardize_row,
)

logger = logging.getLogger(__name__)


def _load_category_mapping() -> dict[str, str]:
    return dict(
        CategoryMapping.objects.values_list('source_key', 'canonical_category')
    )


def process_manifest_upload(
    auction: Auction,
    file_content: bytes | str,
    filename: str,
) -> tuple[dict[str, Any], int]:
    """
    Parse CSV, match template, create ManifestRow rows.

    Returns (response_dict, http_status).
    Unknown / unreviewed template: 400, stub created, no rows.
    """
    _ = filename
    marketplace = auction.marketplace
    try:
        columns, rows = parse_csv_dict_rows(file_content)
    except Exception as e:
        logger.exception('manifest CSV parse failed')
        return (
            {
                'detail': f'Could not parse CSV: {e}',
                'code': 'parse_error',
            },
            400,
        )

    if not columns:
        return (
            {
                'detail': 'CSV has no header row.',
                'code': 'empty_csv',
            },
            400,
        )

    sig = compute_header_signature(columns)
    template = detect_template(marketplace, columns)
    template_source: str = 'existing'

    if template is None:
        stub = create_template_stub(marketplace, columns)
        if getattr(settings, 'ANTHROPIC_API_KEY', None) and propose_manifest_template_with_ai(
            stub,
            marketplace,
            columns,
            rows,
            auction_id=auction.pk,
        ):
            stub.refresh_from_db()
            template = stub
            template_source = 'ai_created'
        else:
            return (
                {
                    'detail': (
                        'Unknown manifest format. A template stub was created for review. '
                        'Configure the template in admin or re-upload after setting ANTHROPIC_API_KEY.'
                    ),
                    'code': 'unknown_template',
                    'template_status': 'unknown',
                    'header_signature': sig,
                    'manifest_template_id': stub.pk,
                },
                400,
            )

    if not template.is_reviewed:
        return (
            {
                'detail': (
                    'This manifest matches a template that is not reviewed yet. '
                    'Complete template configuration in admin, then re-upload.'
                ),
                'code': 'template_not_reviewed',
                'template_status': 'not_reviewed',
                'header_signature': sig,
                'manifest_template_id': template.pk,
            },
            400,
        )

    fill_rates = compute_fill_rates(rows, columns)
    eff_cat = effective_category_fields(template, fill_rates)
    mapping = _load_category_mapping()

    warnings: list[str] = []
    bulk: list[ManifestRow] = []

    with transaction.atomic():
        auction.manifest_rows.all().delete()

        for i, raw_row in enumerate(rows, start=1):
            std = standardize_row(template, raw_row)
            fck = build_fast_cat_key(marketplace, template, raw_row, eff_cat)
            fcv = mapping.get(fck) if fck else None
            if fcv:
                conf = ManifestRow.CONF_FAST_CAT
            else:
                fcv = None
                conf = None

            bulk.append(
                ManifestRow(
                    auction=auction,
                    row_number=i,
                    manifest_template=template,
                    raw_data=dict(raw_row),
                    title=std['title'],
                    brand=std['brand'],
                    model=std['model'],
                    sku=std['sku'],
                    upc=std['upc'],
                    quantity=std['quantity'],
                    retail_value=std['retail_value'],
                    condition=std['condition'],
                    notes=std['notes'],
                    fast_cat_key=fck,
                    fast_cat_value=fcv,
                    category_confidence=conf,
                )
            )

        ManifestRow.objects.bulk_create(bulk)
        auction.has_manifest = len(bulk) > 0
        auction.save(update_fields=['has_manifest'])

    mapping = _load_category_mapping()
    unmapped_key_count = count_distinct_unmapped_keys(auction, mapping)
    total_batches = total_batches_for_count(unmapped_key_count)

    rows_saved = len(bulk)
    rows_with_fast_cat = (
        ManifestRow.objects.filter(auction=auction)
        .filter(fast_cat_value__isnull=False)
        .exclude(fast_cat_value='')
        .count()
    )

    return (
        {
            'rows_saved': rows_saved,
            'rows_with_fast_cat': rows_with_fast_cat,
            'template_source': template_source,
            'ai_mappings_created': 0,
            'unmapped_key_count': unmapped_key_count,
            'total_batches': total_batches,
            'manifest_template_id': template.pk,
            'template_display_name': template.display_name,
            'header_signature': sig,
            'warnings': warnings,
        },
        200,
    )
