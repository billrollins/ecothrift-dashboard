"""Orchestration for discovery and manifest pulls. Callable from commands and notebooks."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.buying.models import Auction, ManifestRow, Marketplace
from apps.buying.services import normalize, scraper

logger = logging.getLogger(__name__)


def _first(raw: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in raw and raw[k] is not None and raw[k] != '':
            return raw[k]
    return None


def _to_decimal(v: Any) -> Decimal | None:
    if v is None or v == '':
        return None
    try:
        return Decimal(str(v).replace(',', '').strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_int(v: Any) -> int | None:
    if v is None or v == '':
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(str(v)))
        except (TypeError, ValueError):
            return None


def _price_to_dollars(val: Any) -> Decimal | None:
    """
    Map B-Stock money fields to dollar Decimal for Auction model.

    Search and auction APIs mix floats (dollars), integers (often whole dollars), and
    large integers (cents). Values >= 10_000 as integers are treated as cents.
    """
    if val is None or val == '':
        return None
    d = _to_decimal(val)
    if d is None:
        return None
    if isinstance(val, int) and abs(val) >= 10_000:
        return (d / Decimal('100')).quantize(Decimal('0.01'))
    return d.quantize(Decimal('0.01'))


def _parse_end_time(raw: dict[str, Any]) -> datetime | None:
    for key in (
        'endTime',
        'auctionEndTime',
        'initialEndTime',
        'actualEndTime',
        'endsAt',
        'end_time',
        'closeTime',
        'closingTime',
    ):
        v = raw.get(key)
        if v is None:
            continue
        if isinstance(v, (int, float)):
            try:
                ts = float(v)
                if ts > 1e12:
                    ts = ts / 1000.0
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                continue
        if isinstance(v, str):
            dt = parse_datetime(v)
            if dt:
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
    return None


def _normalize_status(raw_val: Any) -> str:
    s = (str(raw_val or '')).strip().lower()
    if s in ('open', 'active', 'live'):
        return Auction.STATUS_OPEN
    if s in ('closing', 'ending', 'ending_soon'):
        return Auction.STATUS_CLOSING
    if s in ('closed', 'ended', 'complete', 'completed'):
        return Auction.STATUS_CLOSED
    if s in ('cancelled', 'canceled'):
        return Auction.STATUS_CANCELLED
    return Auction.STATUS_OPEN


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


def _extract_group_id_from_listing(raw: dict[str, Any]) -> str | None:
    """groupId for order-process manifests may be top-level or nested under group."""
    g = _first(raw, 'groupId', 'group_id', 'groupID')
    if g is not None:
        s = str(g).strip()[:64]
        return s or None
    grp = raw.get('group')
    if isinstance(grp, dict):
        inner = _first(grp, 'id', '_id', 'groupId', 'group_id')
        if inner is not None:
            s = str(inner).strip()[:64]
            return s or None
    lgrp = raw.get('lotGroup')
    if isinstance(lgrp, dict):
        inner = _first(lgrp, 'id', '_id', 'groupId')
        if inner is not None:
            s = str(inner).strip()[:64]
            return s or None
    return None


def map_listing_raw_to_auction_fields(
    raw: dict[str, Any],
    *,
    storefront_id: str | None = None,
) -> dict[str, Any]:
    """
    Map one search listings API row to Auction model field names.

    Search response: listingId, lotId, groupId (or nested group.id), storeFrontId.
    See scraper.discover_auctions log_full_first_response for live schema.
    """
    listing_id = _first(raw, 'listingId', 'listing_id', 'id')
    external_id = str(listing_id).strip() if listing_id is not None else ''

    lot_raw = _first(raw, 'lotId', 'lot_id', 'lotID')
    lot_id_val = str(lot_raw).strip()[:64] if lot_raw is not None else ''

    group_id_val = _extract_group_id_from_listing(raw)

    seller = _first(raw, 'storeFrontId', 'storefrontId', 'sellerId') or storefront_id
    seller_val = str(seller).strip()[:64] if seller else ''

    auction_ext = _first(raw, 'auctionId', 'auction_id')
    auction_ext_val = (
        str(auction_ext).strip()[:64] if auction_ext is not None else ''
    )

    title = str(_first(raw, 'title', 'name', 'listingTitle') or '')[:500]
    description = str(_first(raw, 'description', 'longDescription', 'summary') or '')
    url = str(_first(raw, 'url', 'linkUrl', 'listingUrl', 'auctionUrl', 'href') or '').strip()
    if not url and external_id:
        url = f'https://bstock.com/buy/listings/details/{external_id}'
    url = url[:1000]
    cats = raw.get('categories')
    if isinstance(cats, list) and cats:
        category = ', '.join(str(x) for x in cats)[:300]
    else:
        category = str(
            _first(raw, 'category', 'categoryName', 'productCategory') or ''
        )[:300]
    condition_summary = str(
        _first(raw, 'condition', 'conditionSummary', 'conditionName') or ''
    )[:500]

    lot_size = _to_int(_first(raw, 'lotSize', 'itemCount', 'quantity', 'units'))

    current_price = _price_to_dollars(
        _first(
            raw,
            'winningBidAmount',
            'currentPrice',
            'currentBid',
            'price',
            'highBid',
            'leadingBid',
        )
    )
    starting_price = _price_to_dollars(
        _first(raw, 'startingPrice', 'startPrice', 'openingBid', 'minBid')
    )
    buy_now_price = _price_to_dollars(
        _first(raw, 'buyNowPrice', 'buyItNow', 'binPrice', 'buyNowAmount')
    )

    bid_count = _to_int(_first(raw, 'bidCount', 'bids', 'numberOfBids'))

    time_remaining_seconds = _to_int(
        _first(raw, 'timeRemainingSeconds', 'secondsRemaining', 'timeLeftSeconds')
    )

    end_time = _parse_end_time(raw)

    status = _normalize_status(_first(raw, 'status', 'auctionStatus', 'state'))

    hm = _first(raw, 'hasManifest', 'manifestAvailable', 'has_manifest')
    if hm is True:
        has_manifest = True
    elif hm is False:
        has_manifest = False
    else:
        has_manifest = bool(
            _first(raw, 'manifestUrl', 'manifest_url')
        ) or bool((lot_id_val or '').strip())

    return {
        'external_id': external_id,
        'lot_id': lot_id_val or None,
        'group_id': group_id_val,
        'auction_ext_id': auction_ext_val or None,
        'seller_id': seller_val or None,
        'title': title,
        'description': description,
        'url': url,
        'category': category,
        'condition_summary': condition_summary,
        'lot_size': lot_size,
        'current_price': current_price,
        'starting_price': starting_price,
        'buy_now_price': buy_now_price,
        'bid_count': bid_count,
        'time_remaining_seconds': time_remaining_seconds,
        'end_time': end_time,
        'status': status,
        'has_manifest': has_manifest,
    }


def run_discovery(
    marketplace_slug: str | None = None,
    *,
    dry_run: bool = False,
    enrich_detail: bool = False,
    page_limit: int = 20,
    max_pages: int | None = None,
) -> dict[str, Any]:
    """
    Discover listings for one marketplace (or all active if slug is None), upsert Auction rows.

    ``enrich_detail`` calls ``scraper.get_auction_detail`` (auction service) and merges state.
    Requires ``BSTOCK_AUTH_TOKEN`` in ``.env`` when enrich_detail is True.
    """
    qs = Marketplace.objects.filter(is_active=True)
    if marketplace_slug:
        qs = qs.filter(slug=marketplace_slug)
    marketplaces = list(qs.order_by('slug'))
    if not marketplaces:
        logger.warning('No active marketplaces. Add one in Django admin.')
        return {'marketplaces': 0, 'rows': 0, 'upserted': 0}

    total_raw = 0
    upserted = 0
    now = timezone.now()

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
                    logger.warning('Skipping row without listing id: %s', list(raw.keys())[:20])
                    continue

                if enrich_detail:
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

    return {
        'marketplaces': len(marketplaces),
        'rows': total_raw,
        'upserted': upserted,
        'dry_run': dry_run,
        'page_limit': page_limit,
        'max_pages': max_pages,
    }


def run_manifest_pull(
    auction_ids: list[int] | None = None,
    *,
    force: bool = False,
    log_first_manifest_schema: bool = True,
) -> dict[str, Any]:
    """
    Pull manifests for given auction PKs, or all auctions with has_manifest=True
    that have no ManifestRow rows (unless force).
    """
    qs = Auction.objects.all().order_by('id')
    if auction_ids is not None:
        qs = qs.filter(id__in=auction_ids)
    else:
        qs = qs.filter(has_manifest=True)

    processed = 0
    rows_saved = 0

    logged_schema = False

    for auction in qs:
        if not force and auction.manifest_rows.exists():
            continue
        processed += 1
        lot_key = (auction.lot_id or '').strip()
        if not lot_key:
            logger.warning(
                'Auction listing_id=%s has no lot_id; cannot fetch manifest',
                auction.external_id,
            )
            continue

        try:
            raw_rows = scraper.get_manifest(lot_key)
        except scraper.BStockAuthError:
            raise

        if not raw_rows:
            logger.info(
                'No manifest rows for lot_id=%s listing=%s',
                lot_key,
                auction.external_id,
            )
            continue

        if log_first_manifest_schema and not logged_schema:
            try:
                sample = json.dumps(raw_rows[0], indent=2, default=str)[:50000]
                logger.info(
                    'B-Stock manifest first row sample (schema discovery):\n%s',
                    sample,
                )
            except (TypeError, ValueError):
                logger.info('Manifest first row keys: %s', list(raw_rows[0].keys())[:40])
            logged_schema = True

        if force:
            auction.manifest_rows.all().delete()

        bulk: list[ManifestRow] = []
        for i, raw in enumerate(raw_rows, start=1):
            if not isinstance(raw, dict):
                continue
            norm = normalize.normalize_manifest_row(raw)
            bulk.append(
                ManifestRow(
                    auction=auction,
                    row_number=i,
                    raw_data=raw,
                    title=norm['title'],
                    brand=norm['brand'],
                    model=norm['model'],
                    category=norm['category'],
                    sku=norm['sku'],
                    upc=norm['upc'],
                    quantity=norm['quantity'],
                    retail_value=norm['retail_value'],
                    condition=norm['condition'],
                    notes=norm['notes'],
                )
            )
        ManifestRow.objects.bulk_create(bulk)
        rows_saved += len(bulk)

    return {
        'auctions_processed': processed,
        'manifest_rows_saved': rows_saved,
        'logged_first_manifest_schema': logged_schema,
    }
