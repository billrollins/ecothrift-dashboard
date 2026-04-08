"""Process uploaded manifest CSV for an auction (Phase 4.1A)."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from apps.buying.models import Auction, CategoryMapping, ManifestRow
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

    if template is None:
        stub = create_template_stub(marketplace, columns)
        return (
            {
                'detail': (
                    'Unknown manifest format. A template stub was created for review. '
                    'Configure the template in admin or wait for Phase 4.1B AI mapping, then re-upload.'
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
    n_with_val = 0
    n_without = 0

    with transaction.atomic():
        auction.manifest_rows.all().delete()

        for i, raw_row in enumerate(rows, start=1):
            std = standardize_row(template, raw_row)
            fck = build_fast_cat_key(marketplace, template, raw_row, eff_cat)
            fcv = mapping.get(fck) if fck else None
            if fcv:
                n_with_val += 1
                conf = ManifestRow.CONF_FAST_CAT
            else:
                n_without += 1
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

    return (
        {
            'rows_created': len(bulk),
            'rows_with_fast_cat_value': n_with_val,
            'rows_without_fast_cat_value': n_without,
            'manifest_template_id': template.pk,
            'template_display_name': template.display_name,
            'header_signature': sig,
            'warnings': warnings,
        },
        200,
    )
