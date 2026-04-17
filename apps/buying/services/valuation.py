"""Auction valuation recompute: CategoryStats-based need/rates, full vs lightweight paths."""

from __future__ import annotations

import logging
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db.models import F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, ManifestRow
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.core.models import AppSetting

logger = logging.getLogger(__name__)


def get_global_shrinkage(using: str = 'default') -> Decimal:
    try:
        s = AppSetting.objects.using(using).get(key='pricing_shrinkage_factor')
        return Decimal(str(s.value))
    except AppSetting.DoesNotExist:
        return Decimal('0.15')
    except Exception:
        return Decimal('0.15')


def load_category_stats_dict(using: str = 'default') -> dict[str, CategoryStats]:
    return {c.category: c for c in CategoryStats.objects.using(using).all()}


def normalize_mix_at_write_time(raw: dict[str, Any] | None) -> dict[str, Decimal]:
    """Normalize category mix to weights summing to 1 (manifest % or fractional)."""
    if not raw:
        return {}
    vals: dict[str, Decimal] = {}
    for k, v in raw.items():
        if v is None:
            continue
        try:
            vals[str(k)] = Decimal(str(v))
        except Exception:
            continue
    if not vals:
        return {}
    pos = {k: abs(v) for k, v in vals.items()}
    s = sum(pos.values())
    if s == 0:
        return {}
    maxv = max(pos.values())
    if maxv > Decimal('1.5'):
        pos = {k: v / Decimal('100') for k, v in pos.items()}
        s = sum(pos.values())
    if s <= 0:
        return {}
    return {k: (v / s).quantize(Decimal('0.000001')) for k, v in pos.items()}


def _mix_for_auction(auction: Auction) -> dict[str, Decimal]:
    """Manifest mix first (retail-weighted on save); blend Mixed lots with AI when mapping is partial."""
    manifest = normalize_mix_at_write_time(dict(auction.manifest_category_distribution or {}))
    ai = normalize_mix_at_write_time(dict(auction.ai_category_estimates or {}))
    if manifest:
        mixed_w = manifest.get(MIXED_LOTS_UNCATEGORIZED, Decimal('0'))
        if mixed_w > Decimal('0') and ai:
            known = {k: v for k, v in manifest.items() if k != MIXED_LOTS_UNCATEGORIZED}
            blended: dict[str, Decimal] = dict(known)
            for k, w in ai.items():
                blended[k] = blended.get(k, Decimal('0')) + w * mixed_w
            return normalize_mix_at_write_time({k: float(v) for k, v in blended.items()})
        return manifest
    return ai


def _round_pct_to_100(raw_pct: dict[str, float]) -> dict[str, float]:
    rounded = {k: round(v, 2) for k, v in raw_pct.items()}
    gap = round(100.0 - sum(rounded.values()), 2)
    if abs(gap) >= 0.01 and rounded:
        biggest = max(rounded.keys(), key=lambda x: rounded[x])
        rounded[biggest] = round(rounded[biggest] + gap, 2)
    return rounded


def compute_and_save_manifest_distribution(auction: Auction) -> dict[str, float]:
    """Retail share per fast_cat_value, qty-weighted: SUM(qty * retail_value); null/blank -> Mixed lots.

    `ManifestRow.retail_value` is canonically per-unit MSRP, so extended retail per row is
    ``Coalesce(quantity, 1) * retail_value``. Percentages sum to 100. If total positive
    extended retail is zero (all null/zero), falls back to row-count weights.
    """
    sums: dict[str, Decimal] = defaultdict(lambda: Decimal('0'))
    counts: dict[str, int] = defaultdict(int)
    for r in ManifestRow.objects.filter(auction=auction).only(
        'fast_cat_value', 'retail_value', 'quantity'
    ):
        cat = (r.fast_cat_value or '').strip()
        if not cat:
            cat = MIXED_LOTS_UNCATEGORIZED
        counts[cat] += 1
        rv = r.retail_value
        if rv is not None and rv > 0:
            qty = r.quantity if r.quantity and r.quantity > 0 else 1
            sums[cat] += rv * Decimal(qty)

    total_retail = sum(sums.values())
    if total_retail > 0:
        tr = float(total_retail)
        raw_pct = {k: float(100.0 * float(v) / tr) for k, v in sums.items()}
    else:
        total = sum(counts.values())
        if total == 0:
            auction.manifest_category_distribution = None
            auction.save(update_fields=['manifest_category_distribution'])
            return {}
        raw_pct = {k: 100.0 * v / total for k, v in counts.items()}

    rounded = _round_pct_to_100(raw_pct)
    auction.manifest_category_distribution = {k: float(rounded[k]) for k in sorted(rounded.keys())}
    auction.save(update_fields=['manifest_category_distribution'])
    return dict(auction.manifest_category_distribution)


def get_valuation_source(auction: Auction) -> str:
    m = auction.manifest_category_distribution
    if isinstance(m, dict) and len(m) > 0:
        return 'manifest'
    a = auction.ai_category_estimates
    if isinstance(a, dict) and len(a) > 0:
        return 'ai'
    return 'none'


def _manifest_retail_sum(auction: Auction) -> Decimal:
    """Qty-weighted manifest retail (extended): SUM(Coalesce(quantity, 1) * retail_value).

    `ManifestRow.retail_value` is canonically per-unit MSRP.
    """
    agg = ManifestRow.objects.filter(auction=auction).aggregate(
        s=Sum(Coalesce(F('quantity'), Value(1)) * F('retail_value'))
    )
    s = agg.get('s')
    return s if s is not None else Decimal('0')


def _recovery_rate_for_category(stats: dict[str, CategoryStats], cat: str) -> Decimal:
    row = stats.get(cat)
    if row is not None:
        return row.recovery_rate
    m = stats.get(MIXED_LOTS_UNCATEGORIZED)
    return m.recovery_rate if m else Decimal('0')


def _need_score_1to99_for_category(stats: dict[str, CategoryStats], cat: str) -> int:
    row = stats.get(cat)
    if row is not None:
        v = getattr(row, 'need_score_1to99', None)
        if v is not None:
            return int(v)
    m = stats.get(MIXED_LOTS_UNCATEGORIZED)
    if m is not None:
        v = getattr(m, 'need_score_1to99', None)
        if v is not None:
            return int(v)
    return 50


def _auction_need_from_mix(
    weights: dict[str, Decimal],
    stats: dict[str, CategoryStats],
) -> int:
    """Weighted SUMPRODUCT of per-category need_score_1to99, clamped 1–99."""
    if not weights:
        return 50
    total = Decimal('0')
    for cat, w in weights.items():
        total += w * Decimal(_need_score_1to99_for_category(stats, str(cat)))
    r = int(total.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return max(1, min(99, r))


def infer_auction_completed_from_end_time(auction: Auction) -> bool:
    """If end_time is in the past, set status to closed (open/closing only)."""
    et = auction.end_time
    if et is None:
        return False
    now = timezone.now()
    if timezone.is_naive(et):
        et = timezone.make_aware(et, timezone.get_current_timezone())
    if et > now:
        return False
    if auction.status not in (Auction.STATUS_OPEN, Auction.STATUS_CLOSING):
        return False
    auction.status = Auction.STATUS_CLOSED
    auction.save(update_fields=['status'])
    return True


def _fees_shipping_total_cost(auction: Auction) -> tuple[Decimal, Decimal, Decimal]:
    price = auction.current_price or Decimal('0')
    mp = auction.marketplace
    fee_rate = (mp.default_fee_rate if mp else None) or Decimal('0')
    ship_rate = (mp.default_shipping_rate if mp else None) or Decimal('0')

    if auction.fees_override is not None:
        fees = auction.fees_override.quantize(Decimal('0.01'))
    else:
        fees = (price * fee_rate).quantize(Decimal('0.01'))

    if auction.shipping_override is not None:
        shipping = auction.shipping_override.quantize(Decimal('0.01'))
    else:
        shipping = (price * ship_rate).quantize(Decimal('0.01'))

    total_cost = (price + fees + shipping).quantize(Decimal('0.01'))
    return fees, shipping, total_cost


def recompute_auction_full(
    auction: Auction,
    *,
    stats: dict[str, CategoryStats] | None = None,
) -> None:
    """Full recompute: revenue from mix × CategoryStats recovery_rate; need_score = auction need 1–99."""
    db = getattr(auction._state, 'db', None) or 'default'
    if stats is None:
        stats = load_category_stats_dict(using=db)
    if not stats:
        logger.warning('recompute_auction_full: no CategoryStats rows; valuation may be zero.')

    infer_auction_completed_from_end_time(auction)
    auction.refresh_from_db()
    if auction.has_manifest:
        compute_and_save_manifest_distribution(auction)
        auction.refresh_from_db()

    weights = _mix_for_auction(auction)
    retail_manifest = _manifest_retail_sum(auction)
    if auction.has_manifest and retail_manifest > 0:
        retail_base = retail_manifest
    else:
        retail_base = auction.total_retail_value or Decimal('0')

    est_rev = Decimal('0')
    if retail_base > 0 and weights:
        for cat, w in weights.items():
            rate = _recovery_rate_for_category(stats, cat)
            est_rev += retail_base * w * rate
    est_rev = est_rev.quantize(Decimal('0.01'))

    fees, shipping, total_cost = _fees_shipping_total_cost(auction)

    shrink = (
        auction.shrinkage_override
        if auction.shrinkage_override is not None
        else get_global_shrinkage(using=db)
    )
    base_rev_for_eff = auction.revenue_override if auction.revenue_override is not None else est_rev
    effective_rev = (base_rev_for_eff * (Decimal('1') - shrink)).quantize(Decimal('0.01'))

    est_profit = (effective_rev - total_cost).quantize(Decimal('0.01'))

    if total_cost > 0:
        profitability_ratio = (est_profit / total_cost).quantize(Decimal('0.0001'))
    else:
        profitability_ratio = None

    need_val = _auction_need_from_mix(weights, stats)

    auction.estimated_revenue = est_rev
    auction.estimated_fees = fees
    auction.estimated_shipping = shipping
    auction.estimated_total_cost = total_cost
    auction.profitability_ratio = profitability_ratio
    auction.need_score = need_val
    auction.est_profit = est_profit

    if not auction.priority_override:
        auction.priority = need_val

    auction.save(
        update_fields=[
            'estimated_revenue',
            'estimated_fees',
            'estimated_shipping',
            'estimated_total_cost',
            'profitability_ratio',
            'need_score',
            'priority',
            'est_profit',
            'status',
        ]
    )


def recompute_auction_lightweight(
    auction: Auction,
    *,
    stats: dict[str, CategoryStats],
    shrink_global: Decimal,
) -> None:
    """Fees/shipping/cost, est_profit from stored revenue line; refresh need_score and priority."""
    infer_auction_completed_from_end_time(auction)
    auction.refresh_from_db()

    fees, shipping, total_cost = _fees_shipping_total_cost(auction)

    shrink = auction.shrinkage_override if auction.shrinkage_override is not None else shrink_global
    base_rev = auction.revenue_override if auction.revenue_override is not None else (auction.estimated_revenue or Decimal('0'))
    effective_rev = (base_rev * (Decimal('1') - shrink)).quantize(Decimal('0.01'))
    est_profit = (effective_rev - total_cost).quantize(Decimal('0.01'))

    if total_cost > 0:
        profitability_ratio = (est_profit / total_cost).quantize(Decimal('0.0001'))
    else:
        profitability_ratio = None

    weights = _mix_for_auction(auction)
    need_val = _auction_need_from_mix(weights, stats)

    auction.estimated_fees = fees
    auction.estimated_shipping = shipping
    auction.estimated_total_cost = total_cost
    auction.profitability_ratio = profitability_ratio
    auction.need_score = need_val
    auction.est_profit = est_profit

    if not auction.priority_override:
        auction.priority = need_val

    auction.save(
        update_fields=[
            'estimated_fees',
            'estimated_shipping',
            'estimated_total_cost',
            'profitability_ratio',
            'need_score',
            'priority',
            'est_profit',
            'status',
        ]
    )


def recompute_auction_valuation(
    auction: Auction,
    need_rows: list[dict[str, Any]] | None = None,
    *,
    stats: dict[str, CategoryStats] | None = None,
) -> None:
    """Backward-compatible name: full recompute (``need_rows`` ignored)."""
    recompute_auction_full(auction, stats=stats)


def recompute_all_open_auctions() -> int:
    """Full recompute for open/closing, non-archived auctions."""
    stats = load_category_stats_dict()
    qs = (
        Auction.objects.filter(status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING], archived_at__isnull=True)
        .select_related('marketplace')
    )
    n = 0
    for a in qs.iterator(chunk_size=200):
        recompute_auction_full(a, stats=stats)
        n += 1
    return n


def recompute_active_auctions_lightweight() -> int:
    """Lightweight recompute: active (non-archived) open/closing with future end_time."""
    stats = load_category_stats_dict()
    shrink = get_global_shrinkage()
    now = timezone.now()
    qs = (
        Auction.objects.filter(
            archived_at__isnull=True,
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            end_time__gte=now,
        )
        .select_related('marketplace')
    )
    n = 0
    for a in qs.iterator(chunk_size=200):
        recompute_auction_lightweight(a, stats=stats, shrink_global=shrink)
        n += 1
    return n


def run_ai_estimate_for_swept_auctions(auction_ids: list[int]) -> dict[str, Any]:
    """AI category estimate for swept auctions without a manifest mix; skips auctions that already have AI estimates."""
    from apps.buying.services.ai_title_category_estimate import estimate_batch

    if not auction_ids:
        return {'considered': 0, 'estimated': 0}
    ids = list(dict.fromkeys(auction_ids))
    qs = Auction.objects.filter(pk__in=ids).filter(
        status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
        archived_at__isnull=True,
    )
    need: list[int] = []
    for a in qs.order_by('-last_updated_at'):
        m = a.manifest_category_distribution
        if isinstance(m, dict) and len(m) > 0:
            continue
        ai = a.ai_category_estimates
        if isinstance(ai, dict) and len(ai) > 0:
            continue
        need.append(a.pk)
    if not need:
        return {'considered': len(ids), 'estimated': 0}
    return estimate_batch(need)
