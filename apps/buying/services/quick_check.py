"""The quick check (Dash #75): new lots, Buy Now lots and watched lots, every 1-2 minutes, public only.

One tick:
1. One search of every public seller at once, newest first (``storeFrontId`` list, 200 a page;
   216 live lots on 2026-11-05 = 2 calls). New lots and Buy Now lots appear here first, with the
   Buy Now price (``listing_mapping``) and ``last_listed_at``.
2. One anonymous auction-state call for the watched lots that are due (``run_watch_poll``): end
   time, closed, cancelled.
3. Ended lots close; new lots get a lightweight valuation. The heavy work (AI categories, full
   recompute, signed-in sellers) stays in the hourly sweep.

Every call passes ``bstock_calls`` (kill switch, hourly cap, back-off, random gap, call log).
Signed-in-only sellers (Costco) are never searched here.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.buying.models import Auction, Marketplace
from apps.buying.services import bstock_calls, scraper, sweep_upsert

logger = logging.getLogger(__name__)

PAGE_LIMIT = 200
MAX_PAGES = 3  # 600 lots: well above today's ~216; a bigger market waits for the hourly sweep


def run_tick() -> dict[str, Any]:
    from apps.buying.services import pipeline

    try:
        bstock_calls.check()
    except bstock_calls.CallsPaused as e:
        return {'paused': str(e)}

    mps = [
        m for m in Marketplace.objects.filter(is_active=True, requires_login=False).order_by('slug')
        if (m.external_id or '').strip()
    ]
    if not mps:
        return {'paused': 'No active public sellers.'}
    by_storefront = {m.external_id.strip(): m for m in mps}

    started = timezone.now()
    rows, err, ms = scraper._search_post_paginate(
        list(by_storefront),
        page_limit=PAGE_LIMIT,
        max_pages=MAX_PAGES,
        log_full_first_response=False,
        slug_for_log='quick',
        call_kind=bstock_calls.KIND_QUICK,
        sort_newest=True,
    )
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        sf = str(r.get('storefrontId') or r.get('storeFrontId') or '').strip()
        if sf in by_storefront:
            grouped[sf].append(r)
    batches = [(by_storefront[sf], sf, by_storefront[sf].slug, rs) for sf, rs in grouped.items()]
    with transaction.atomic():
        result = sweep_upsert.run_sweep_upsert_for_batches(batches, started)

    new_ids = list(
        Auction.objects.filter(pk__in=result['auction_ids'], first_seen_at__gte=started).values_list('pk', flat=True)
    )
    watch: dict[str, Any] = {}
    if err is None:
        try:
            watch = pipeline.run_watch_poll(background=True)
        except Exception as e:  # noqa: BLE001 - the search part is already saved
            logger.exception('Quick check watch poll failed')
            watch = {'error': str(e)}
    closed_n = pipeline.close_ended_auctions()
    if new_ids:
        _value_new(new_ids)
        pipeline._ensure_origin_miles_for(new_ids)

    return {
        'listings': len(rows),
        'error': err,
        'inserted': result['inserted'],
        'updated': result['updated'],
        'new_ids': new_ids,
        'buy_now_live': Auction.objects.filter(pk__in=result['auction_ids'], buy_now_ends_at__gt=timezone.now()).count(),
        'watch_polled': watch.get('polled', 0),
        'closed_ended': closed_n,
        'http_ms': round(ms),
    }


def _value_new(ids: list[int]) -> None:
    from apps.buying.services import valuation

    try:
        stats = valuation.load_category_stats_dict()
        shrink = valuation.get_global_shrinkage()
        for a in Auction.objects.filter(pk__in=ids):
            valuation.recompute_auction_lightweight(a, stats=stats, shrink_global=shrink)
    except Exception:  # noqa: BLE001 - the hourly sweep values them anyway
        logger.exception('Quick check valuation of new lots failed')
