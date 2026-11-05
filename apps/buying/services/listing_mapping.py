"""Map B-Stock search listing JSON rows to Auction field dicts. Shared by pipeline and sweep upsert."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.buying.models import Auction


# "Truckload (23 Pallets) of ...", "3 Pallet Spaces of ...", "Est. 1 Pallet of ..."
_TITLE_PALLETS_RE = re.compile(r'(\d{1,3})\s+pallets?\b', re.IGNORECASE)


def pallet_count_from_listing(raw: dict[str, Any], title: str = '') -> int | None:
    """B-Stock palletCount when positive, else the pallet count in the title, else None."""
    n = _to_int(_first(raw, 'palletCount', 'pallet_count'))
    if n is not None and n > 0:
        return n
    m = _TITLE_PALLETS_RE.search(title or '')
    if m:
        n = int(m.group(1))
        return n if n > 0 else None
    return None


def origin_from_listing(raw: dict[str, Any]) -> tuple[str, str]:
    """(``"City, ST"``, zip) where the lot ships from; blanks when B-Stock does not say."""
    city = str(_first(raw, 'sellerCity') or '').strip()
    state = str(_first(raw, 'provinceCode', 'sellerState') or '').strip()
    label = f'{city}, {state}' if city and state else city
    zip_code = str(_first(raw, 'sellerZipCode') or '').strip()[:12]
    return label[:120], zip_code


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
    not cent-scaled - do not use _price_to_dollars (large integers would be misread).
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
    Map a B-Stock money field (search ``winningBidAmount``, auction-state ``startPrice``,
    ``buyNow.price``...) to a dollar Decimal.

    Both APIs send whole dollars (``bidPrecision`` 1), integer or float: measured 2026-11-05
    (Dash #75). Integers are NOT cents: the old ">= 10,000 is cents" rule stored every price of
    $10,000 or more at 1/100 (lot 677978: Buy Now $10,750 stored as $107.50). Manifest retail is
    the one cents field, and it has its own path (``normalize``, ``whole_numbers_are_cents``).
    """
    if val is None or val == '' or isinstance(val, bool):
        return None
    d = _to_decimal(val)
    if d is None:
        return None
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
    pallet_count = pallet_count_from_listing(raw, title)
    origin_city, origin_zip = origin_from_listing(raw)
    shipment_type = str(_first(raw, 'shipmentType') or '').strip()[:20]

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
        _first(raw, 'buyNowPrice', 'binPrice', 'buyNowAmount')
    )
    buy_now_ends_at = None
    if raw.get('buyNow') is True:
        # Search sends Buy Now as a flag. While its window is open (before buyNowEndTime, when
        # bidding starts) the shown price, winningBidAmount, IS the Buy Now price, not a bid:
        # 11 of 11 lots matched auction state buyNow.price on 2026-11-05. After the window it is
        # a real bid again, so it is read as Buy Now only inside the window, with no bids.
        buy_now_ends_at = _parse_end_time({'endTime': raw.get('buyNowEndTime')})
        bids = _to_int(_first(raw, 'numberOfBids', 'bidCount'))
        if buy_now_ends_at is not None and buy_now_ends_at > timezone.now() and not bids:
            if buy_now_price is None:
                buy_now_price = current_price
            current_price = None  # no bid yet: the lot opens for bids at its start price
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
        'pallet_count': pallet_count,
        'origin_city': origin_city,
        'origin_zip': origin_zip,
        'shipment_type': shipment_type,
        'listing_type': listing_type,
        'total_retail_value': total_retail_value,
        'current_price': current_price,
        'starting_price': starting_price,
        'buy_now_price': buy_now_price,
        'buy_now_ends_at': buy_now_ends_at,
        'bid_count': bid_count,
        'time_remaining_seconds': time_remaining_seconds,
        'end_time': end_time,
        'status': status,
        'has_manifest': has_manifest,
    }


def apply_closed_inference(fields: dict[str, Any], now: datetime, *, grace=None) -> None:
    """If the auction has clearly ended, set status to closed (does not change WatchlistEntry).

    ``grace`` (a timedelta): the end time must be at least this long ago; the sweep uses the same
    hour as ``pipeline.close_ended_auctions`` so a watched lot still gets its final poll.
    """
    et = fields.get('end_time')
    if et is not None:
        if timezone.is_naive(et):
            et = timezone.make_aware(et, timezone.get_current_timezone())
        if et <= (now - grace if grace else now):
            fields['status'] = Auction.STATUS_CLOSED
            return
    tr = fields.get('time_remaining_seconds')
    if tr is not None and tr == 0:
        fields['status'] = Auction.STATUS_CLOSED
