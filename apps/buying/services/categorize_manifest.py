"""Tier 1 (CategoryMapping) + tier 3 (auction listing strings) manifest categorization."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Iterable

from django.db.models import QuerySet

from apps.buying.models import Auction, CategoryMapping, ManifestRow
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED

logger = logging.getLogger(__name__)


def manifest_row_source_key(fast_cat_key: str | None) -> str:
    return (fast_cat_key or '').strip()


def load_source_key_to_canonical() -> dict[str, str]:
    return dict(
        CategoryMapping.objects.values_list('source_key', 'canonical_category')
    )


def auction_tier3_lookup_keys(auction: Auction) -> list[str]:
    """Full listing category string first, then comma-separated segments (order preserved, deduped)."""
    cat = (auction.category or '').strip()
    if not cat:
        return []
    keys: list[str] = [cat]
    for part in cat.split(','):
        p = part.strip()
        if p and p not in keys:
            keys.append(p)
    return keys


def apply_tier1_tier3_for_row(
    row: ManifestRow,
    mapping: dict[str, str],
) -> tuple[str, str]:
    """
    Tier 1: ManifestRow.fast_cat_key → CategoryMapping (vendor fast-cat key).
    Tier 3: Auction.category (full + segments) → CategoryMapping, else mixed lots.
    """
    auction = row.auction
    sk = manifest_row_source_key(row.fast_cat_key)
    if sk and sk in mapping:
        return mapping[sk], ManifestRow.CONF_FAST_CAT
    for key in auction_tier3_lookup_keys(auction):
        if key in mapping:
            return mapping[key], ManifestRow.CONF_FALLBACK
    return MIXED_LOTS_UNCATEGORIZED, ManifestRow.CONF_FALLBACK


def categorize_manifest_rows(auction: Auction, *, batch_size: int = 500) -> int:
    """
    Tier 1 + tier 3 only (no AI). Run after manifest rows are saved for this auction.
    Returns number of rows written.
    """
    mapping = load_source_key_to_canonical()
    qs = (
        ManifestRow.objects.filter(auction=auction)
        .select_related('auction')
        .order_by('row_number')
    )
    return _bulk_apply_tier1_tier3(
        qs,
        mapping,
        batch_size=batch_size,
        force=True,
        dry_run=False,
    )


def _bulk_apply_tier1_tier3(
    qs: QuerySet[ManifestRow] | Iterable[ManifestRow],
    mapping: dict[str, str],
    *,
    batch_size: int,
    force: bool,
    dry_run: bool,
) -> int:
    updated = 0
    batch: list[ManifestRow] = []
    fields = ['canonical_category', 'category_confidence']

    for row in qs:
        if not force and row.canonical_category:
            continue
        canonical, conf = apply_tier1_tier3_for_row(row, mapping)
        if (
            not force
            and row.canonical_category == canonical
            and row.category_confidence == conf
        ):
            continue
        row.canonical_category = canonical
        row.category_confidence = conf
        batch.append(row)
        if len(batch) >= batch_size:
            if not dry_run:
                ManifestRow.objects.bulk_update(batch, fields)
            updated += len(batch)
            batch.clear()

    if batch:
        if not dry_run:
            ManifestRow.objects.bulk_update(batch, fields)
        updated += len(batch)

    return updated


def rows_by_source_key(
    qs: QuerySet[ManifestRow],
) -> dict[str, list[ManifestRow]]:
    """Group manifest rows by tier-1 source_key (fast_cat_key strip)."""
    groups: dict[str, list[ManifestRow]] = defaultdict(list)
    for row in qs.order_by('auction_id', 'row_number'):
        sk = manifest_row_source_key(row.fast_cat_key)
        groups[sk].append(row)
    return dict(groups)


def sample_rows_for_ai(
    rows: list[ManifestRow],
    *,
    limit: int = 8,
) -> list[ManifestRow]:
    return sorted(rows, key=lambda r: r.row_number)[:limit]


def run_categorize_manifest_command(
    qs: QuerySet[ManifestRow],
    *,
    use_ai: bool,
    ai_limit: int,
    force: bool,
    dry_run: bool,
    batch_size: int,
    log: logging.Logger,
) -> dict[str, int | bool]:
    """
    Tier 1 + tier 3; optional tier 2 (AI) with a cap on AI calls.
    Returns stats: rows_updated, ai_calls, ai_limit_hit, remaining_unknown_patterns.
    """
    from apps.buying.services import category_ai

    stats: dict[str, int | bool] = {
        'rows_updated': 0,
        'ai_calls': 0,
        'ai_limit_hit': False,
        'remaining_unknown_patterns': 0,
    }

    qs = qs.select_related('auction')
    mapping = load_source_key_to_canonical()

    if use_ai:
        groups = rows_by_source_key(qs)
        unknown_keys = sorted([sk for sk in groups if sk and sk not in mapping])
        remaining = max(0, len(unknown_keys) - ai_limit)
        stats['remaining_unknown_patterns'] = remaining

        to_process = unknown_keys[:ai_limit]
        if dry_run:
            stats['ai_calls'] = len(to_process)
        else:
            ai_calls = 0
            for sk in to_process:
                rows_g = groups[sk]
                sample = sample_rows_for_ai(rows_g, limit=8)
                try:
                    canonical, reasoning = category_ai.suggest_category_for_source_key(
                        sk, sample
                    )
                except Exception as e:
                    log.warning('AI mapping failed for source_key=%r: %s', sk, e)
                    continue
                CategoryMapping.objects.update_or_create(
                    source_key=sk,
                    defaults={
                        'canonical_category': canonical,
                        'rule_origin': CategoryMapping.RULE_AI,
                        'ai_reasoning': reasoning,
                    },
                )
                ai_calls += 1
            stats['ai_calls'] = ai_calls
            mapping = load_source_key_to_canonical()

        if len(unknown_keys) > ai_limit:
            stats['ai_limit_hit'] = True
            log.warning(
                'AI mapping limit (%s) reached; %s unknown pattern(s) remain. '
                'Run again to process more.',
                ai_limit,
                len(unknown_keys) - ai_limit,
            )

    stats['rows_updated'] = _bulk_apply_tier1_tier3(
        qs,
        mapping,
        batch_size=batch_size,
        force=force,
        dry_run=dry_run,
    )
    return stats
