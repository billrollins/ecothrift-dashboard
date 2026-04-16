"""Orchestration for discovery and manifest pulls. Callable from commands and notebooks."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import Case, Count, Exists, IntegerField, OuterRef, Q, Value, When
from django.utils import timezone

from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    ManifestRow,
    Marketplace,
    WatchlistEntry,
)
from apps.buying.services import manifest_dev_timelog, scraper
from apps.buying.services import sweep_upsert
from apps.buying.services.manifest_api_pipeline import run_api_manifest_pull
from apps.buying.services.listing_mapping import (
    _first,
    _normalize_status,
    _parse_end_time,
    _price_to_dollars,
    _to_int,
    map_listing_raw_to_auction_fields,
)

logger = logging.getLogger(__name__)


def merge_auction_state_into_fields(
    fields: dict[str, Any],
    state: dict[str, Any],
) -> None:
    """Overlay auction.bstock.com state (price, bids, auction id, timing, group id)."""
    if not state:
        return
    gid = _first(state, 'groupId', 'group_id', 'groupID')
    if gid is not None:
        fields['group_id'] = str(gid).strip()[:64] or None
    grp = state.get('group')
    if isinstance(grp, dict) and not fields.get('group_id'):
        inner = _first(grp, 'id', '_id', 'groupId')
        if inner is not None:
            fields['group_id'] = str(inner).strip()[:64] or None
    aid = _first(state, 'auctionId', 'id', '_id')
    if aid is not None:
        fields['auction_ext_id'] = str(aid)[:64]
    cp = _first(
        state,
        'winningBidAmount',
        'currentPrice',
        'currentBid',
        'highBid',
        'price',
    )
    if cp is not None:
        d = _price_to_dollars(cp)
        if d is not None:
            fields['current_price'] = d
    sp = _first(state, 'startPrice', 'startingPrice', 'openingBid', 'openBid')
    if sp is not None:
        d = _price_to_dollars(sp)
        if d is not None:
            fields['starting_price'] = d
    bn = _first(state, 'buyNowPrice', 'buyItNowPrice', 'binPrice')
    if bn is None and isinstance(state.get('buyNow'), dict):
        bn = _first(state['buyNow'], 'price', 'amount')
    if bn is not None:
        d = _price_to_dollars(bn)
        if d is not None:
            fields['buy_now_price'] = d
    bc = _first(state, 'bidCount', 'bids', 'numberOfBids')
    if bc is not None:
        bi = _to_int(bc)
        if bi is not None:
            fields['bid_count'] = bi
    tr = _first(state, 'timeRemainingSeconds', 'secondsRemaining', 'timeLeftSeconds')
    if tr is not None:
        ti = _to_int(tr)
        if ti is not None:
            fields['time_remaining_seconds'] = ti
    et = _parse_end_time(state)
    if et is not None:
        fields['end_time'] = et
    st = _first(state, 'status', 'auctionStatus', 'state')
    if st is not None:
        fields['status'] = _normalize_status(st)


def apply_closed_inference(fields: dict[str, Any], now: datetime) -> None:
    """If auction has clearly ended, set status to closed (does not change WatchlistEntry)."""
    et = fields.get('end_time')
    if et is not None:
        if timezone.is_naive(et):
            et = timezone.make_aware(et, timezone.get_current_timezone())
        if et <= now:
            fields['status'] = Auction.STATUS_CLOSED
            return
    tr = fields.get('time_remaining_seconds')
    if tr is not None and tr == 0:
        fields['status'] = Auction.STATUS_CLOSED


def run_discovery(
    marketplace_slug: str | None = None,
    *,
    dry_run: bool = False,
    enrich_detail: bool = False,
    page_limit: int = 200,
    max_pages: int | None = None,
) -> dict[str, Any]:
    """
    Discover listings for one marketplace (or all active if slug is None), upsert Auction rows.

    Parallel POST search + raw SQL upsert when ``enrich_detail`` is False (normal sweep).

    ``enrich_detail`` uses sequential search + ORM get_or_create and calls
    ``scraper.get_auction_detail`` per listing. Requires JWT for those calls.
    """
    t0 = time.perf_counter()
    qs = Marketplace.objects.filter(is_active=True)
    if marketplace_slug:
        qs = qs.filter(slug=marketplace_slug)
    marketplaces = list(qs.order_by('slug'))
    if not marketplaces:
        logger.warning('No active marketplaces. Add one in Django admin.')
        return {
            'marketplaces': 0,
            'rows': 0,
            'upserted': 0,
            'upserted_auction_ids': [],
            'dry_run': dry_run,
            'page_limit': page_limit,
            'max_pages': max_pages,
            'refreshed_at': timezone.now().isoformat(),
            'total_seconds': round(time.perf_counter() - t0, 3),
            'total_listings': 0,
            'by_marketplace': [],
            'inserted': 0,
            'updated': 0,
        }

    now = timezone.now()
    mp_by_slug = {m.slug: m for m in marketplaces}

    if enrich_detail:
        total_raw = 0
        upserted = 0
        upserted_auction_ids: list[int] = []

        for mp in marketplaces:
            storefront = (mp.external_id or '').strip()
            rows = scraper.discover_auctions(
                mp.slug,
                page_limit=page_limit,
                max_pages=max_pages,
                log_full_first_response=dry_run,
            )
            total_raw += len(rows)
            if dry_run:
                logger.info(
                    '[dry-run] marketplace=%s rows=%s (not saving)',
                    mp.slug,
                    len(rows),
                )
                continue

            with transaction.atomic():
                for raw in rows:
                    if not isinstance(raw, dict):
                        continue
                    fields = map_listing_raw_to_auction_fields(
                        raw,
                        storefront_id=storefront or None,
                    )
                    ext = fields.get('external_id') or ''
                    if not ext:
                        logger.warning(
                            'Skipping row without listing id: %s', list(raw.keys())[:20]
                        )
                        continue

                    try:
                        state = scraper.get_auction_detail(ext)
                    except scraper.BStockAuthError:
                        raise
                    if isinstance(state, dict) and state:
                        merge_auction_state_into_fields(fields, state)

                    auction, created = Auction.objects.get_or_create(
                        marketplace=mp,
                        external_id=ext,
                        defaults={
                            'lot_id': fields.get('lot_id'),
                            'group_id': fields.get('group_id'),
                            'auction_ext_id': fields.get('auction_ext_id'),
                            'seller_id': fields.get('seller_id'),
                            'title': fields['title'],
                            'description': fields['description'],
                            'url': fields['url'],
                            'category': fields['category'],
                            'condition_summary': fields['condition_summary'],
                            'lot_size': fields['lot_size'],
                            'listing_type': fields.get('listing_type') or '',
                            'total_retail_value': fields.get('total_retail_value'),
                            'current_price': fields['current_price'],
                            'starting_price': fields['starting_price'],
                            'buy_now_price': fields['buy_now_price'],
                            'bid_count': fields['bid_count'],
                            'time_remaining_seconds': fields['time_remaining_seconds'],
                            'end_time': fields['end_time'],
                            'status': fields['status'],
                            'has_manifest': fields['has_manifest'],
                            'first_seen_at': now,
                            'last_updated_at': now,
                        },
                    )
                    if not created:
                        for name in (
                            'lot_id',
                            'group_id',
                            'auction_ext_id',
                            'seller_id',
                            'title',
                            'description',
                            'url',
                            'category',
                            'condition_summary',
                            'lot_size',
                            'listing_type',
                            'total_retail_value',
                            'current_price',
                            'starting_price',
                            'buy_now_price',
                            'bid_count',
                            'time_remaining_seconds',
                            'end_time',
                            'status',
                            'has_manifest',
                        ):
                            setattr(auction, name, fields[name])
                        if auction.first_seen_at is None:
                            auction.first_seen_at = now
                        auction.last_updated_at = now
                        auction.save()
                    upserted += 1
                    upserted_auction_ids.append(auction.pk)

        elapsed = time.perf_counter() - t0
        return {
            'marketplaces': len(marketplaces),
            'rows': total_raw,
            'upserted': upserted,
            'upserted_auction_ids': upserted_auction_ids,
            'dry_run': dry_run,
            'page_limit': page_limit,
            'max_pages': max_pages,
            'refreshed_at': timezone.now().isoformat(),
            'total_seconds': round(elapsed, 3),
            'total_listings': total_raw,
            'by_marketplace': [],
            'inserted': upserted,
            'updated': 0,
        }

    batches_http = scraper.discover_auctions_parallel(
        page_limit=page_limit,
        max_pages=max_pages,
        log_full_first_response=dry_run,
        marketplace_slug=marketplace_slug,
    )
    total_raw = sum(len(b.rows) for b in batches_http)
    by_marketplace_out: list[dict[str, Any]] = []

    if dry_run:
        for b in batches_http:
            by_marketplace_out.append(
                {
                    'slug': b.slug,
                    'name': b.name,
                    'listings_found': len(b.rows),
                    'http_ms': round(b.http_ms, 1),
                    'http_error': b.error,
                    'inserted': 0,
                    'updated': 0,
                    'skipped': 0,
                    'db_errors': 0,
                }
            )
        elapsed = time.perf_counter() - t0
        return {
            'marketplaces': len(marketplaces),
            'rows': total_raw,
            'upserted': 0,
            'upserted_auction_ids': [],
            'dry_run': dry_run,
            'page_limit': page_limit,
            'max_pages': max_pages,
            'refreshed_at': timezone.now().isoformat(),
            'total_seconds': round(elapsed, 3),
            'total_listings': total_raw,
            'by_marketplace': by_marketplace_out,
            'inserted': 0,
            'updated': 0,
        }

    sweep_batches: list[tuple[Any, str, str, list[dict[str, Any]]]] = []
    for b in batches_http:
        mp = mp_by_slug.get(b.slug)
        if not mp:
            continue
        st = (mp.external_id or '').strip()
        if not st:
            continue
        sweep_batches.append((mp, st, b.slug, b.rows))

    with transaction.atomic():
        sweep_result = sweep_upsert.run_sweep_upsert_for_batches(sweep_batches, now)

    sweep_rows = {r['slug']: r for r in sweep_result['by_marketplace']}
    for b in batches_http:
        sr = sweep_rows.get(b.slug, {})
        by_marketplace_out.append(
            {
                'slug': b.slug,
                'name': b.name,
                'listings_found': len(b.rows),
                'http_ms': round(b.http_ms, 1),
                'http_error': b.error,
                'inserted': int(sr.get('inserted', 0)),
                'updated': int(sr.get('updated', 0)),
                'skipped': int(sr.get('skipped', 0)),
                'db_errors': int(sr.get('db_errors', 0)),
            }
        )

    elapsed = time.perf_counter() - t0
    inserted = int(sweep_result['inserted'])
    updated = int(sweep_result['updated'])
    upserted_n = inserted + updated

    return {
        'marketplaces': len(marketplaces),
        'rows': total_raw,
        'upserted': upserted_n,
        'upserted_auction_ids': sweep_result['auction_ids'],
        'dry_run': dry_run,
        'page_limit': page_limit,
        'max_pages': max_pages,
        'refreshed_at': timezone.now().isoformat(),
        'total_seconds': round(elapsed, 3),
        'total_listings': total_raw,
        'by_marketplace': by_marketplace_out,
        'inserted': inserted,
        'updated': updated,
    }


def manifest_pull_queue_queryset():
    """
    Auctions eligible for anonymous manifest pull: lot_id present, not archived,
    open/closing, future or unknown end_time, manifest not yet pulled.
    Order: watchlist, watchlist priority, thumbs-up count, auction priority, oldest first.
    Skips completed/closed/cancelled and archived (see filters).
    """
    now = timezone.now()
    row_exists = Exists(ManifestRow.objects.filter(auction=OuterRef('pk')))
    return (
        Auction.objects.filter(
            archived_at__isnull=True,
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            manifest_pulled_at__isnull=True,
        )
        .exclude(Q(lot_id__isnull=True) | Q(lot_id=''))
        .filter(Q(end_time__isnull=True) | Q(end_time__gte=now))
        .select_related('marketplace', 'watchlist_entry')
        .annotate(
            _has_manifest_rows=row_exists,
            _watch_pri=Case(
                When(watchlist_entry__isnull=True, then=Value(0)),
                When(
                    watchlist_entry__priority=WatchlistEntry.PRIORITY_CRITICAL,
                    then=Value(4),
                ),
                When(
                    watchlist_entry__priority=WatchlistEntry.PRIORITY_HIGH,
                    then=Value(3),
                ),
                When(
                    watchlist_entry__priority=WatchlistEntry.PRIORITY_MEDIUM,
                    then=Value(2),
                ),
                When(watchlist_entry__priority=WatchlistEntry.PRIORITY_LOW, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            ),
            _is_watched=Case(
                When(watchlist_entry__isnull=False, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            ),
            _thumbs_count=Count('staff_thumbs_votes', distinct=True),
        )
        .exclude(_has_manifest_rows=True)
        .order_by(
            '-_is_watched',
            '-_watch_pri',
            '-_thumbs_count',
            '-priority',
            'created_at',
        )
    )


def run_manifest_pull(
    auction_ids: list[int] | None = None,
    *,
    force: bool = False,
    log_first_manifest_schema: bool = True,
    batch_size: int | None = None,
    time_cutoff: datetime | None = None,
    inter_auction_delay: float = 0.0,
    use_has_manifest_fallback: bool = False,
    prefetch_next: bool | None = None,
) -> dict[str, Any]:
    """
    Pull manifests for given auction PKs, or the nightly queue (see
    ``manifest_pull_queue_queryset``), or legacy ``has_manifest=True`` when
    ``use_has_manifest_fallback`` is True and ``auction_ids`` is None.

    Skips when ``manifest_pulled_at`` is set or manifest rows exist (unless ``force``).
    """
    row_exists = Exists(ManifestRow.objects.filter(auction=OuterRef('pk')))
    if auction_ids is not None:
        qs = (
            Auction.objects.filter(id__in=auction_ids)
            .order_by('id')
            .annotate(_has_manifest_rows=row_exists)
        )
    elif use_has_manifest_fallback:
        qs = (
            Auction.objects.filter(has_manifest=True)
            .annotate(_has_manifest_rows=row_exists)
            .order_by('id')
        )
        if batch_size is not None:
            qs = qs[: int(batch_size)]
    else:
        qs = manifest_pull_queue_queryset()
        if batch_size is not None:
            qs = qs[: int(batch_size)]

    _ = prefetch_next  # Retained for backwards-compatible kwarg; two-worker pipeline now overlaps fetch+process per auction.

    auction_list = list(qs)

    processed = 0
    rows_saved = 0
    stopped_early = False
    logged_schema = False

    def _skip_auction(a: Auction) -> bool:
        if not force and a.manifest_pulled_at is not None:
            return True
        if not force and getattr(a, '_has_manifest_rows', False):
            return True
        if not (a.lot_id or '').strip():
            return True
        return False

    for auction in auction_list:
        if time_cutoff is not None and timezone.now() >= time_cutoff:
            stopped_early = True
            break

        if _skip_auction(auction):
            if not (auction.lot_id or '').strip():
                logger.warning(
                    'Auction listing_id=%s has no lot_id; cannot fetch manifest',
                    auction.external_id,
                )
            continue

        processed += 1
        t_start = time.perf_counter()
        body, http_status = run_api_manifest_pull(auction, force=force)
        duration = time.perf_counter() - t_start
        saved = int(body.get('rows_saved', 0) or 0) if isinstance(body, dict) else 0
        ok = http_status == 200 and saved > 0
        if ok:
            rows_saved += saved

        if log_first_manifest_schema and not logged_schema and saved > 0:
            try:
                first = ManifestRow.objects.filter(auction=auction).order_by('row_number').first()
                if first is not None and first.raw_data is not None:
                    logger.info(
                        'B-Stock manifest first row sample (schema discovery):\n%s',
                        json.dumps(first.raw_data, indent=2, default=str)[:50000],
                    )
                    logged_schema = True
            except (TypeError, ValueError):
                logged_schema = True

        manifest_dev_timelog.log_manifest_api_pull(
            auction_id=auction.pk,
            rows_saved=saved,
            duration_seconds=float(duration),
            success=ok,
        )

        if inter_auction_delay > 0:
            time.sleep(inter_auction_delay)

    return {
        'auctions_processed': processed,
        'manifest_rows_saved': rows_saved,
        'logged_first_manifest_schema': logged_schema,
        'stopped_early_time_cutoff': stopped_early,
    }


def run_budget_manifest_pull(
    *,
    seconds: float,
    batch_size: int = 50,
    inter_auction_delay: float = 1.0,
    force: bool = False,
) -> dict[str, Any]:
    """Reusable budget pull: loops ``run_manifest_pull`` on the nightly queue until the cutoff."""
    if seconds <= 0:
        raise ValueError('seconds must be positive')
    cutoff = timezone.now() + timedelta(seconds=float(seconds))

    total_processed = 0
    total_rows = 0
    iterations = 0
    stopped_early = False

    while True:
        if timezone.now() >= cutoff:
            stopped_early = True
            break
        summary = run_manifest_pull(
            auction_ids=None,
            force=force,
            batch_size=batch_size,
            time_cutoff=cutoff,
            inter_auction_delay=inter_auction_delay,
            use_has_manifest_fallback=False,
        )
        iterations += 1
        total_processed += int(summary.get('auctions_processed', 0))
        total_rows += int(summary.get('manifest_rows_saved', 0))
        if summary.get('stopped_early_time_cutoff'):
            stopped_early = True
            break
        if summary.get('auctions_processed', 0) == 0:
            break

    return {
        'iterations': iterations,
        'auctions_processed': total_processed,
        'manifest_rows_saved': total_rows,
        'stopped_early_time_cutoff': stopped_early,
        'cutoff': cutoff.isoformat(),
    }


def _auction_to_merge_fields(auction: Auction) -> dict[str, Any]:
    """Build field dict for merge_auction_state_into_fields from a persisted Auction."""
    return {
        'external_id': auction.external_id,
        'lot_id': auction.lot_id,
        'group_id': auction.group_id,
        'auction_ext_id': auction.auction_ext_id,
        'seller_id': auction.seller_id,
        'title': auction.title or '',
        'description': auction.description or '',
        'url': auction.url or '',
        'category': auction.category or '',
        'condition_summary': auction.condition_summary or '',
        'lot_size': auction.lot_size,
        'listing_type': auction.listing_type or '',
        'total_retail_value': auction.total_retail_value,
        'current_price': auction.current_price,
        'starting_price': auction.starting_price,
        'buy_now_price': auction.buy_now_price,
        'bid_count': auction.bid_count,
        'time_remaining_seconds': auction.time_remaining_seconds,
        'end_time': auction.end_time,
        'status': auction.status,
        'has_manifest': auction.has_manifest,
    }


def _apply_merge_fields_to_auction(auction: Auction, fields: dict[str, Any], now: datetime) -> None:
    """Write merged poll fields onto Auction (same column set as discovery upsert)."""
    for name in (
        'lot_id',
        'group_id',
        'auction_ext_id',
        'seller_id',
        'title',
        'description',
        'url',
        'category',
        'condition_summary',
        'lot_size',
        'listing_type',
        'total_retail_value',
        'current_price',
        'starting_price',
        'buy_now_price',
        'bid_count',
        'time_remaining_seconds',
        'end_time',
        'status',
        'has_manifest',
    ):
        setattr(auction, name, fields[name])
    auction.last_updated_at = now
    auction.save(
        update_fields=list(
            (
                'lot_id',
                'group_id',
                'auction_ext_id',
                'seller_id',
                'title',
                'description',
                'url',
                'category',
                'condition_summary',
                'lot_size',
                'listing_type',
                'total_retail_value',
                'current_price',
                'starting_price',
                'buy_now_price',
                'bid_count',
                'time_remaining_seconds',
                'end_time',
                'status',
                'has_manifest',
                'last_updated_at',
            )
        )
    )


def run_watch_poll(
    auction_ids: list[int] | None = None,
    *,
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Poll auction.bstock.com for watched auctions (JWT required), write snapshots,
    update Auction rows, set WatchlistEntry.last_polled_at. Does not change
    WatchlistEntry.status when auction closes (no outcome data).
    """
    now = timezone.now()

    qs = (
        Auction.objects.filter(watchlist_entry__isnull=False)
        .filter(archived_at__isnull=True)
        .exclude(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
        .exclude(status__in=[Auction.STATUS_CLOSED, Auction.STATUS_CANCELLED])
        .select_related('watchlist_entry', 'marketplace')
    )
    if auction_ids is not None:
        qs = qs.filter(pk__in=auction_ids)

    candidates: list[Auction] = []
    for auction in qs.order_by('id'):
        we = auction.watchlist_entry
        if not force and we.last_polled_at:
            elapsed = (now - we.last_polled_at).total_seconds()
            if elapsed < we.poll_interval_seconds:
                continue
        candidates.append(auction)

    if dry_run:
        return {
            'dry_run': True,
            'would_poll': len(candidates),
            'auction_ids': [a.pk for a in candidates],
        }

    if not candidates:
        return {
            'polled': 0,
            'snapshots': 0,
            'skipped': 0,
            'errors': [],
        }

    from apps.buying.services import valuation as valuation_mod

    stats = valuation_mod.load_category_stats_dict()
    shrink = valuation_mod.get_global_shrinkage()

    listing_ids = [a.external_id for a in candidates]
    states: dict[str, dict[str, Any]] = {}
    try:
        states = scraper.get_auction_states_batch(listing_ids)
    except scraper.BStockAuthError:
        raise

    polled = 0
    snapshots_n = 0
    errors: list[str] = []
    skipped = 0

    for auction in candidates:
        try:
            state = states.get(auction.external_id.strip())
            if not state:
                skipped += 1
                logger.warning(
                    'Watch poll: no auction state for listing_id=%s', auction.external_id
                )
                continue

            fields = _auction_to_merge_fields(auction)
            merge_auction_state_into_fields(fields, state)
            apply_closed_inference(fields, now)
            with transaction.atomic():
                _apply_merge_fields_to_auction(auction, fields, now)
                AuctionSnapshot.objects.create(
                    auction=auction,
                    price=fields.get('current_price'),
                    bid_count=fields.get('bid_count'),
                    time_remaining_seconds=fields.get('time_remaining_seconds'),
                )
                WatchlistEntry.objects.filter(pk=auction.watchlist_entry.pk).update(
                    last_polled_at=now
                )
            auction.refresh_from_db()
            valuation_mod.recompute_auction_lightweight(
                auction,
                stats=stats,
                shrink_global=shrink,
            )
            polled += 1
            snapshots_n += 1
        except Exception as e:
            logger.exception('Watch poll failed for auction_id=%s', auction.pk)
            errors.append(f'auction {auction.pk}: {e}')

    return {
        'polled': polled,
        'snapshots': snapshots_n,
        'skipped': skipped,
        'errors': errors,
        'refreshed_at': timezone.now().isoformat(),
    }


def refresh_auction_from_bstock(auction: Auction) -> dict[str, Any]:
    """Anonymous GET auction state → merge into ``Auction``, snapshot, lightweight valuation."""
    from apps.buying.services import valuation as valuation_mod

    if auction.archived_at is not None:
        return {'ok': False, 'code': 'auction_archived', 'detail': 'Archived auctions are not refreshed.'}
    lid = (auction.external_id or '').strip()
    if not lid:
        return {'ok': False, 'code': 'missing_listing_id', 'detail': 'Auction has no external_id.'}
    states = scraper.get_auction_states_batch([lid])
    state = states.get(lid)
    if not state:
        return {'ok': False, 'code': 'no_auction_state', 'detail': 'No state returned for this listing.'}
    now = timezone.now()
    fields = _auction_to_merge_fields(auction)
    merge_auction_state_into_fields(fields, state)
    apply_closed_inference(fields, now)
    with transaction.atomic():
        _apply_merge_fields_to_auction(auction, fields, now)
        AuctionSnapshot.objects.create(
            auction=auction,
            price=fields.get('current_price'),
            bid_count=fields.get('bid_count'),
            time_remaining_seconds=fields.get('time_remaining_seconds'),
        )
    auction.refresh_from_db()
    stats = valuation_mod.load_category_stats_dict()
    valuation_mod.recompute_auction_lightweight(
        auction,
        stats=stats,
        shrink_global=valuation_mod.get_global_shrinkage(),
    )
    return {'ok': True}
