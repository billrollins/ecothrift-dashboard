"""Auction valuation recompute (Phase 5): mix, revenue, costs, need, priority.

Phase 3B (D+L): changes to need_score / priority blending and spread tuning wait for Bill approval
after `audit_auction_need_priority` numbers — see initiative ui_ux_polish Session 5.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db.models import Sum
from django.utils import timezone

from apps.buying.models import Auction, CategoryWantVote, ManifestRow, PricingRule
from apps.buying.services.category_need import build_category_need_rows
from apps.buying.services.want_vote import effective_want_value
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.core.models import AppSetting

logger = logging.getLogger(__name__)


def get_global_shrinkage() -> Decimal:
    try:
        s = AppSetting.objects.get(key="pricing_shrinkage_factor")
        return Decimal(str(s.value))
    except AppSetting.DoesNotExist:
        return Decimal("0.10")
    except Exception:
        return Decimal("0.10")


def _load_sell_through_rates() -> dict[str, Decimal]:
    out: dict[str, Decimal] = {}
    for pr in PricingRule.objects.all().only("category", "sell_through_rate"):
        out[pr.category] = pr.sell_through_rate
    return out


def _normalize_mix_dict(raw: dict[str, Any] | None) -> dict[str, Decimal]:
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
    if maxv > Decimal("1.5"):
        pos = {k: v / Decimal("100") for k, v in pos.items()}
        s = sum(pos.values())
    if s <= 0:
        return {}
    return {k: (v / s).quantize(Decimal("0.000001")) for k, v in pos.items()}


def _mix_for_auction(auction: Auction) -> dict[str, Decimal]:
    if auction.manifest_category_distribution:
        return _normalize_mix_dict(dict(auction.manifest_category_distribution))
    if auction.ai_category_estimates:
        return _normalize_mix_dict(dict(auction.ai_category_estimates))
    return {}


def compute_and_save_manifest_distribution(auction: Auction) -> dict[str, float]:
    """Count fast_cat_value per row; null/blank -> Mixed lots. Percentages sum to 100."""
    counts: dict[str, int] = defaultdict(int)
    qs = ManifestRow.objects.filter(auction=auction).only("fast_cat_value")
    for r in qs:
        cat = (r.fast_cat_value or "").strip()
        if not cat:
            cat = MIXED_LOTS_UNCATEGORIZED
        counts[cat] += 1
    total = sum(counts.values())
    if total == 0:
        auction.manifest_category_distribution = None
        auction.save(update_fields=["manifest_category_distribution"])
        return {}
    raw_pct = {k: 100.0 * v / total for k, v in counts.items()}
    rounded = {k: round(v, 2) for k, v in raw_pct.items()}
    gap = round(100.0 - sum(rounded.values()), 2)
    if abs(gap) >= 0.01 and rounded:
        biggest = max(rounded.keys(), key=lambda x: rounded[x])
        rounded[biggest] = round(rounded[biggest] + gap, 2)
    auction.manifest_category_distribution = {k: float(rounded[k]) for k in sorted(rounded.keys())}
    auction.save(update_fields=["manifest_category_distribution"])
    return dict(auction.manifest_category_distribution)


def get_valuation_source(auction: Auction) -> str:
    m = auction.manifest_category_distribution
    if isinstance(m, dict) and len(m) > 0:
        return "manifest"
    a = auction.ai_category_estimates
    if isinstance(a, dict) and len(a) > 0:
        return "ai"
    return "none"


def _manifest_retail_sum(auction: Auction) -> Decimal:
    agg = ManifestRow.objects.filter(auction=auction).aggregate(s=Sum("retail_value"))
    s = agg.get("s")
    return s if s is not None else Decimal("0")


def _time_pressure(auction: Auction) -> Decimal:
    et = auction.end_time
    if et is None:
        return Decimal("0")
    now = timezone.now()
    if timezone.is_naive(et):
        et = timezone.make_aware(et, timezone.get_current_timezone())
    hours = (et - now).total_seconds() / 3600.0
    tp = max(0.0, 10.0 - hours) / 10.0
    if tp > 1.0:
        tp = 1.0
    return Decimal(str(round(tp, 6)))


def recompute_auction_valuation(auction: Auction) -> None:
    """Recompute stored valuation fields for one auction (DB write)."""
    rules = _load_sell_through_rates()
    if not rules:
        logger.warning("recompute_auction_valuation: no PricingRule rows; valuation may be zero.")

    weights = _mix_for_auction(auction)
    retail_manifest = _manifest_retail_sum(auction)
    if auction.has_manifest and retail_manifest > 0:
        retail_base = retail_manifest
    else:
        retail_base = auction.total_retail_value or Decimal("0")

    est_rev = Decimal("0")
    if retail_base > 0 and weights:
        for cat, w in weights.items():
            rate = rules.get(cat)
            if rate is None:
                rate = rules.get(MIXED_LOTS_UNCATEGORIZED)
            if rate is None:
                rate = Decimal("0")
            est_rev += retail_base * w * rate
    est_rev = est_rev.quantize(Decimal("0.01"))

    price = auction.current_price or Decimal("0")
    mp = auction.marketplace
    fee_rate = (mp.default_fee_rate if mp else None) or Decimal("0")
    ship_rate = (mp.default_shipping_rate if mp else None) or Decimal("0")

    if auction.fees_override is not None:
        fees = auction.fees_override.quantize(Decimal("0.01"))
    else:
        fees = (price * fee_rate).quantize(Decimal("0.01"))

    if auction.shipping_override is not None:
        shipping = auction.shipping_override.quantize(Decimal("0.01"))
    else:
        shipping = (price * ship_rate).quantize(Decimal("0.01"))

    total_cost = (price + fees + shipping).quantize(Decimal("0.01"))

    shrink = auction.shrinkage_override if auction.shrinkage_override is not None else get_global_shrinkage()
    base_rev_for_eff = auction.revenue_override if auction.revenue_override is not None else est_rev
    effective_rev = (base_rev_for_eff * (Decimal("1") - shrink)).quantize(Decimal("0.01"))

    if total_cost > 0:
        profitability_ratio = (effective_rev / total_cost).quantize(Decimal("0.0001"))
    else:
        profitability_ratio = None

    need_rows = build_category_need_rows()
    need_by_cat = {r["category"]: float(r["need_gap"]) for r in need_rows}

    want_sums: dict[str, list[float]] = {c: [] for c in TAXONOMY_V1_CATEGORY_NAMES}
    for v in CategoryWantVote.objects.all().only("category", "value", "voted_at"):
        if v.category in want_sums:
            want_sums[v.category].append(effective_want_value(v.value, v.voted_at))

    mean_want: dict[str, float] = {}
    for c in TAXONOMY_V1_CATEGORY_NAMES:
        vals = want_sums.get(c) or []
        mean_want[c] = sum(vals) / len(vals) if vals else 5.0

    need_score = Decimal("0")
    if weights:
        for cat, w in weights.items():
            ng = Decimal(str(need_by_cat.get(cat, 0.0)))
            mw = Decimal(str(mean_want.get(cat, 5.0)))
            need_score += w * ng * (mw / Decimal("5"))
    need_score = need_score.quantize(Decimal("0.0001"))

    tp = _time_pressure(auction)

    auction.estimated_revenue = est_rev
    auction.estimated_fees = fees
    auction.estimated_shipping = shipping
    auction.estimated_total_cost = total_cost
    auction.profitability_ratio = profitability_ratio
    auction.need_score = need_score

    if not auction.priority_override:
        pr = float(profitability_ratio or 0)
        ns = float(need_score or 0)
        tpf = float(tp)
        pri = int(round(pr * 15.0 + ns * 3.0 + tpf * 10.0))
        pri = max(1, min(99, pri))
        auction.priority = pri

    auction.save(
        update_fields=[
            "estimated_revenue",
            "estimated_fees",
            "estimated_shipping",
            "estimated_total_cost",
            "profitability_ratio",
            "need_score",
            "priority",
        ]
    )


def recompute_all_open_auctions() -> int:
    """Recompute valuations for auctions in open or closing status. Returns count."""
    qs = Auction.objects.filter(
        status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING]
    ).select_related("marketplace")
    n = 0
    for a in qs.iterator(chunk_size=200):
        recompute_auction_valuation(a)
        n += 1
    return n


def run_ai_estimate_for_swept_auctions(
    auction_ids: list[int],
    *,
    limit: int = 25,
) -> dict[str, Any]:
    """Limited batch AI category estimate for newly swept auctions (no manifest distribution)."""
    from apps.buying.services.ai_title_category_estimate import estimate_batch

    if not auction_ids:
        return {"considered": 0, "estimated": 0}
    ids = list(dict.fromkeys(auction_ids))[:limit]
    qs = Auction.objects.filter(pk__in=ids).filter(
        status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING]
    )
    need = []
    for a in qs.order_by("-last_updated_at")[:limit]:
        m = a.manifest_category_distribution
        if isinstance(m, dict) and len(m) > 0:
            continue
        need.append(a.pk)
    if not need:
        return {"considered": len(ids), "estimated": 0}
    return estimate_batch(need)
