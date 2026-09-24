"""
A category's recovery rate (what we sell for ÷ retail), with the store-wide fill-in.

The four categories added in 2026-09 (Appliances, Automotive, Arts & crafts, Lawn & garden)
have no sales yet, so their own rate is 0. Valuing on that turned every appliance truck into
$0 (R-055, 2026-09-24). A category with no rate of its own uses the Mixed lots rate, which
is the whole store's, and the auction page says so (ITM-12).
"""
from __future__ import annotations

from decimal import Decimal

from apps.buying.models import CategoryStats
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED


def _own_rate(stats: dict[str, CategoryStats], category: str) -> Decimal | None:
    row = stats.get(category)
    rate = row.recovery_rate if row is not None else None
    return rate if rate is not None and rate > 0 else None


def store_rate(stats: dict[str, CategoryStats]) -> Decimal:
    return _own_rate(stats, MIXED_LOTS_UNCATEGORIZED) or Decimal('0')


def recovery_rate(stats: dict[str, CategoryStats], category: str) -> Decimal:
    """The category's own rate, else the store-wide one."""
    return _own_rate(stats, category) or store_rate(stats)


def filled_in(stats: dict[str, CategoryStats], category: str) -> bool:
    """True when ``category`` has no rate of its own and is valued at the store-wide rate."""
    return category != MIXED_LOTS_UNCATEGORIZED and _own_rate(stats, category) is None
