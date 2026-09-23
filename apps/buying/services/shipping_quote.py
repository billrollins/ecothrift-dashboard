"""B-Stock shipping quotes: read the buyer's freight quote for a listing and keep it on the auction.

B-Stock makes a quote (to the buyer's saved address) when the buyer opens the listing on
bstock.com, so a listing nobody opened has none. We only read quotes; we never ask B-Stock
to make one. The quote replaces the shipping-rate estimate in valuation; an override still wins.
"""

from __future__ import annotations

import logging
from decimal import Decimal

import requests
from django.utils import timezone

from apps.buying.models import Auction
from apps.buying.services import scraper

logger = logging.getLogger(__name__)


def save_shipping_quote(auction: Auction, quote: scraper.ShippingQuote) -> Decimal:
    """Store the quote on the auction (no re-valuation) and return the amount in dollars."""
    amount = (Decimal(quote.amount_cents) / Decimal(100)).quantize(Decimal('0.01'))
    now = timezone.now()
    info = quote.info()
    Auction.objects.filter(pk=auction.pk).update(
        shipping_quote=amount,
        shipping_quote_at=now,
        shipping_quote_info=info,
    )
    auction.shipping_quote = amount
    auction.shipping_quote_at = now
    auction.shipping_quote_info = info
    return amount


def refresh_shipping_quote(
    auction: Auction,
    *,
    bearer: str,
    session: requests.Session | None = None,
) -> scraper.ShippingQuote | None:
    """
    Read B-Stock's quote for this auction's listing and store it. Returns None (and keeps
    any quote already stored) when B-Stock has none. Raises the scraper's errors.
    """
    listing_id = (auction.external_id or '').strip()
    if not listing_id:
        return None
    quote = scraper.fetch_shipping_quote(listing_id, bearer=bearer, session=session)
    if quote is not None:
        save_shipping_quote(auction, quote)
    return quote


def try_refresh_shipping_quote(
    auction: Auction,
    *,
    bearer: str,
    session: requests.Session | None = None,
) -> scraper.ShippingQuote | None:
    """``refresh_shipping_quote`` for the manifest pull: a failed quote never fails a manifest."""
    try:
        return refresh_shipping_quote(auction, bearer=bearer, session=session)
    except Exception as e:  # noqa: BLE001 - the manifest already succeeded; the quote is extra
        logger.warning('shipping quote skipped for auction %s: %s', auction.pk, type(e).__name__)
        return None
