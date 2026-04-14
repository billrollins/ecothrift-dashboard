"""Raw PostgreSQL upsert for buying sweep — preserves first_seen_at and staff JSON fields on conflict."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from django.db import connection
from psycopg2.extras import Json

from apps.buying.services.listing_mapping import map_listing_raw_to_auction_fields

logger = logging.getLogger(__name__)

UPSERT_SQL = """
INSERT INTO buying_auction (
    marketplace_id, external_id, lot_id, group_id, auction_ext_id, seller_id,
    title, description, url, category, condition_summary, lot_size, listing_type,
    total_retail_value, current_price, starting_price, buy_now_price,
    bid_count, time_remaining_seconds, end_time, status, has_manifest,
    ai_score_data,
    priority, priority_override, thumbs_up,
    first_seen_at, last_updated_at, created_at
) VALUES (
    %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s,
    %s, %s, %s, %s, %s,
    %s,
    %s, %s, %s,
    %s, %s, %s
)
ON CONFLICT (marketplace_id, external_id) DO UPDATE SET
    lot_id = EXCLUDED.lot_id,
    group_id = EXCLUDED.group_id,
    auction_ext_id = EXCLUDED.auction_ext_id,
    seller_id = EXCLUDED.seller_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    url = EXCLUDED.url,
    category = EXCLUDED.category,
    condition_summary = EXCLUDED.condition_summary,
    lot_size = EXCLUDED.lot_size,
    listing_type = EXCLUDED.listing_type,
    total_retail_value = EXCLUDED.total_retail_value,
    current_price = EXCLUDED.current_price,
    starting_price = EXCLUDED.starting_price,
    buy_now_price = EXCLUDED.buy_now_price,
    bid_count = EXCLUDED.bid_count,
    time_remaining_seconds = EXCLUDED.time_remaining_seconds,
    end_time = EXCLUDED.end_time,
    status = EXCLUDED.status,
    has_manifest = EXCLUDED.has_manifest,
    first_seen_at = COALESCE(buying_auction.first_seen_at, EXCLUDED.first_seen_at),
    last_updated_at = EXCLUDED.last_updated_at
RETURNING id, (xmax = 0) AS inserted
"""


def upsert_listings_raw(
    marketplace_id: int,
    storefront_id: str,
    listings: list[dict[str, Any]],
    now: datetime,
) -> tuple[int, int, int, int, list[int]]:
    """
    Upsert listing rows for one marketplace. Returns:
    (inserted_count, updated_count, skipped_count, db_error_count, all_touched_auction_ids).
    """
    inserted = 0
    updated = 0
    skipped = 0
    db_errors = 0
    ids_out: list[int] = []

    with connection.cursor() as cur:
        for raw in listings:
            if not isinstance(raw, dict):
                skipped += 1
                continue
            fields = map_listing_raw_to_auction_fields(
                raw, storefront_id=storefront_id
            )
            ext = fields.get('external_id') or ''
            if not ext:
                skipped += 1
                continue

            row_vals = (
                marketplace_id,
                ext,
                fields.get('lot_id'),
                fields.get('group_id'),
                fields.get('auction_ext_id'),
                fields.get('seller_id'),
                fields['title'],
                fields['description'],
                fields['url'],
                fields['category'],
                fields['condition_summary'],
                fields['lot_size'],
                fields.get('listing_type') or '',
                fields.get('total_retail_value'),
                fields['current_price'],
                fields['starting_price'],
                fields['buy_now_price'],
                fields['bid_count'],
                fields['time_remaining_seconds'],
                fields['end_time'],
                fields['status'],
                fields['has_manifest'],
                Json({}),
                50,
                False,
                False,
                now,
                now,
                now,
            )
            cur.execute('SAVEPOINT sweep_upsert_row')
            try:
                cur.execute(UPSERT_SQL, row_vals)
                row = cur.fetchone()
                cur.execute('RELEASE SAVEPOINT sweep_upsert_row')
                if row:
                    pk, was_insert = row[0], row[1]
                    ids_out.append(int(pk))
                    if was_insert:
                        inserted += 1
                    else:
                        updated += 1
            except Exception:
                cur.execute('ROLLBACK TO SAVEPOINT sweep_upsert_row')
                db_errors += 1
                logger.exception('Sweep upsert row failed marketplace_id=%s ext=%s', marketplace_id, ext)

    return inserted, updated, skipped, db_errors, ids_out


def run_sweep_upsert_for_batches(
    batches: list[tuple[Any, str, str, list[dict[str, Any]]]],
    now: datetime,
) -> dict[str, Any]:
    """
    batches: list of (Marketplace model instance, storefront_id string, slug for logging, rows).

    Runs upserts sequentially on the main thread (caller already on main thread).
    """
    if not batches:
        return {
            'inserted': 0,
            'updated': 0,
            'skipped': 0,
            'db_errors': 0,
            'auction_ids': [],
            'by_marketplace': [],
        }

    total_ins = 0
    total_upd = 0
    total_skip = 0
    total_err = 0
    all_ids: list[int] = []
    per_mp: list[dict[str, Any]] = []

    for mp, storefront_id, _slug, rows in batches:
        ins, upd, skip, err, pks = upsert_listings_raw(
            mp.pk, storefront_id, rows, now
        )
        total_ins += ins
        total_upd += upd
        total_skip += skip
        total_err += err
        all_ids.extend(pks)
        per_mp.append(
            {
                'slug': mp.slug,
                'name': mp.name,
                'listings_found': len(rows),
                'inserted': ins,
                'updated': upd,
                'skipped': skip,
                'db_errors': err,
            }
        )

    return {
        'inserted': total_ins,
        'updated': total_upd,
        'skipped': total_skip,
        'db_errors': total_err,
        'auction_ids': all_ids,
        'by_marketplace': per_mp,
    }
