"""Map B-Stock search listing JSON rows to Auction field dicts. Shared by pipeline and sweep upsert."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.buying.models import Auction


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


def _retail_value_from_listing(raw: dict[str, Any]) -> Decimal | None:
    """
    Extended retail from search listing (e.g. retailPrice). Values are dollars (float),
    not cent-scaled — do not use _price_to_dollars (large integers would be misread).
    """
    v = _first(
        raw,
        'retailPrice',
        'totalRetailValue',
        'extendedRetail',
        'totalRetail',
    )
    if v is None:
        return None
    d = _to_decimal(v)
    if d is None:
        return None
    return d.quantize(Decimal('0.01'))


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

    lt_raw = _first(raw, 'listingType', 'listing_type')
    listing_type = str(lt_raw).strip()[:32] if lt_raw is not None else ''

    total_retail_value = _retail_value_from_listing(raw)

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
        'listing_type': listing_type,
        'total_retail_value': total_retail_value,
        'current_price': current_price,
        'starting_price': starting_price,
        'buy_now_price': buy_now_price,
        'bid_count': bid_count,
        'time_remaining_seconds': time_remaining_seconds,
        'end_time': end_time,
        'status': status,
        'has_manifest': has_manifest,
    }
