"""AI-estimated category mix from auction titles (Tier 1), few-shot from manifest distributions."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings

from apps.buying.models import Auction
from apps.buying.services.valuation import recompute_auction_valuation
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.core.services.ai_usage_log import estimate_cost_usd, log_ai_usage, log_ai_usage_from_response

logger = logging.getLogger(__name__)

FEW_SHOT_LIMIT = 5
BATCH_SIZE = 25
JUNK_MIXED_THRESHOLD = 80.0


def _import_anthropic():
    import anthropic as _anthropic

    return _anthropic


def get_anthropic_client():
    api_key = getattr(settings, "ANTHROPIC_API_KEY", None)
    if not api_key:
        return None
    anthropic = _import_anthropic()
    return anthropic.Anthropic(api_key=api_key)


def _fast_model() -> str:
    return (getattr(settings, "AI_MODEL_FAST", None) or "claude-haiku-4-5").strip()


def _parse_json_array(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except json.JSONDecodeError:
        pass
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        data = json.loads(text[start : end + 1])
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    raise ValueError(f"Could not parse JSON array: {text[:400]}")


def _usage_dict(usage: Any) -> dict[str, int]:
    if usage is None:
        return {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation_tokens": 0,
            "cache_read_tokens": 0,
        }
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
        "cache_creation_tokens": int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
        "cache_read_tokens": int(getattr(usage, "cache_read_input_tokens", 0) or 0),
    }


def _few_shot_block(marketplace_id: int) -> str:
    """Up to FEW_SHOT_LIMIT most-recently-updated manifest-backed distributions for this marketplace.

    Drops rows where the 'Mixed lots & uncategorized' share is >= JUNK_MIXED_THRESHOLD
    (those represent incomplete fast_cat mapping, not a true distribution).
    Returns '' when the vendor has no clean examples -- caller should omit the few-shot section.
    """
    qs = (
        Auction.objects.filter(marketplace_id=marketplace_id)
        .exclude(manifest_category_distribution__isnull=True)
        .order_by("-last_updated_at")
    )
    lines: list[str] = []
    n = 0
    for a in qs:
        if n >= FEW_SHOT_LIMIT:
            break
        dist = a.manifest_category_distribution
        if not isinstance(dist, dict) or not dist:
            continue
        try:
            mixed = float(dist.get(MIXED_LOTS_UNCATEGORIZED, 0) or 0)
        except (TypeError, ValueError):
            mixed = 0.0
        if mixed >= JUNK_MIXED_THRESHOLD:
            continue
        title = (a.title or "").strip()
        if not title:
            continue
        lines.append(f"Title: {title[:500]!r}")
        lines.append(f"Distribution: {json.dumps(dist, ensure_ascii=False)}")
        lines.append("")
        n += 1
    return "\n".join(lines)


def _normalize_distribution(raw: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {name: 0.0 for name in TAXONOMY_V1_CATEGORY_NAMES}
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        v = raw.get(name)
        if v is None:
            continue
        try:
            out[name] = float(v)
        except (TypeError, ValueError):
            continue
    s = sum(out.values())
    if s <= 0:
        return {}
    if s > 1.5:
        out = {k: v / s * 100.0 for k, v in out.items()}
        s = sum(out.values())
    scale = 100.0 / s if s else 1.0
    out = {k: round(v * scale, 2) for k, v in out.items()}
    gap = round(100.0 - sum(out.values()), 2)
    if abs(gap) >= 0.01:
        biggest = max(out.keys(), key=lambda x: out[x])
        out[biggest] = round(out[biggest] + gap, 2)
    return out


def estimate_batch(auction_ids: list[int]) -> dict[str, Any]:
    """
    Few-shot Claude (AI_MODEL_FAST) batch: title -> ai_category_estimates (percent by taxonomy key).

    Rows are matched by auction_id to the batch; normalizes percentages to sum 100.
    """
    client = get_anthropic_client()
    if client is None:
        return {"error": "ai_not_configured", "estimated": 0, "items": []}

    auctions = list(
        Auction.objects.filter(pk__in=auction_ids).select_related("marketplace").order_by("id")
    )
    if not auctions:
        return {"estimated": 0, "items": [], "usage": _usage_dict(None), "estimated_cost_usd": 0.0}

    anthropic = _import_anthropic()
    model = _fast_model()
    mp_slug = auctions[0].marketplace.slug if auctions[0].marketplace_id else None

    by_mp: dict[int, list[Auction]] = {}
    for a in auctions:
        by_mp.setdefault(a.marketplace_id, []).append(a)

    items_out: list[dict[str, Any]] = []
    total_usage = _usage_dict(None)
    total_cost = 0.0

    cat_lines = "\n".join(f"- {n}" for n in TAXONOMY_V1_CATEGORY_NAMES)
    system_text = (
        "You estimate retail category mix for liquidation auction lots from titles alone.\n\n"
        "Canonical taxonomy (use these exact names):\n"
        f"{cat_lines}\n\n"
        "Rules:\n"
        "- Return all 19 canonical categories; values are numbers 0-100; they must sum to 100.\n"
        "- When a title names a single category (e.g. 'Apparel & Accessories', 'Toys/Games', "
        "'Kitchen & Bath'), concentrate 70-90% there and give small shares (1-10%) to plausible "
        "companion categories; reserve 5-15% for 'Mixed lots & uncategorized' only when the title "
        "clearly signals a mixed lot.\n"
        "- When a title names 2-3 categories, weight them roughly in the order mentioned.\n"
        "- For generic titles ('Pallet Space', 'Truckload of Assorted', 'Mixed'), lean heavily "
        "on 'Mixed lots & uncategorized' (50-80%).\n"
        "- Use taxonomy-to-vendor hints from the few-shot examples when provided.\n\n"
        "Edge cases:\n"
        "- Words like 'liquidation', 'truckload', 'LTL', 'assorted', 'customer returns' without a "
        "clear product family: put most weight on Mixed lots & uncategorized (50-80%) with small "
        "shares to plausible departments.\n"
        "- Titles naming two families (e.g. bedding and pet supplies): split roughly 40-60% across "
        "both, with minor companion shares.\n"
        "- Hyphens, slashes, and ampersands in titles map to the closest canonical category names.\n\n"
        "Worked example (pattern only; your output must still include all 19 category keys):\n"
        "Title: '8 Pallets of Hair Care, Makeup, and Personal Care — 2,400 Units'\n"
        "→ Concentrate 80-90% in Health, beauty & personal care; reserve the remainder for Mixed "
        "lots & uncategorized and tiny companion categories.\n\n"
        "Output JSON array only (no prose, no markdown). One object per listing, in order, with "
        "exactly these keys:\n"
        "  auction_id (number), distribution (object mapping each canonical category name to a number).\n"
        "Do not include title_echo or any keys other than auction_id and distribution."
    )

    for mp_id, group in by_mp.items():
        for i in range(0, len(group), BATCH_SIZE):
            chunk = group[i : i + BATCH_SIZE]
            few = _few_shot_block(mp_id)
            listings = []
            for a in chunk:
                listings.append({"auction_id": a.pk, "title": (a.title or "")[:500]})
            user_parts: list[str] = []
            if few:
                user_parts.append(
                    "Few-shot examples from this marketplace (manifest-backed real distributions):"
                )
                user_parts.append(few)
            user_parts.append(f"Listings JSON: {json.dumps(listings, ensure_ascii=False)}")
            user = "\n\n".join(user_parts)
            try:
                response = client.messages.create(
                    model=model,
                    max_tokens=8192,
                    system=[{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": user}],
                )
            except anthropic.APIError as e:  # type: ignore[attr-defined]
                logger.warning("Anthropic error in ai_title_category_estimate: %s", e)
                log_ai_usage(
                    "ai_title_category_estimate",
                    model,
                    0,
                    0,
                    auction_id=None,
                    marketplace=mp_slug,
                    detail="estimate_batch",
                    success=False,
                    error=str(e),
                )
                continue

            log_ai_usage_from_response(
                "ai_title_category_estimate",
                response,
                model=model,
                auction_id=chunk[0].pk,
                marketplace=mp_slug,
                detail=f"estimate_batch n={len(chunk)}",
            )
            usage = _usage_dict(getattr(response, "usage", None))
            for k, v in usage.items():
                total_usage[k] = total_usage.get(k, 0) + v
            mid = getattr(response, "model", None) or model
            total_cost += float(
                estimate_cost_usd(
                    mid,
                    usage["input_tokens"],
                    usage["output_tokens"],
                    usage["cache_creation_tokens"],
                    usage["cache_read_tokens"],
                )
            )

            text = ""
            for block in response.content:
                if block.type == "text":
                    text += block.text

            try:
                rows = _parse_json_array(text)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning("Bad JSON from title category AI: %s", e)
                continue

            by_id = {a.pk: a for a in chunk}
            for row in rows:
                aid = row.get("auction_id")
                try:
                    aid_i = int(aid)
                except (TypeError, ValueError):
                    continue
                auc = by_id.get(aid_i)
                if auc is None:
                    continue
                dist_raw = row.get("distribution")
                if not isinstance(dist_raw, dict):
                    continue
                dist = _normalize_distribution(dist_raw)
                if not dist:
                    continue
                auc.ai_category_estimates = dist
                auc.save(update_fields=["ai_category_estimates"])
                recompute_auction_valuation(auc)
                items_out.append({"auction_id": aid_i, "distribution": dist})

    return {
        "estimated": len(items_out),
        "items": items_out,
        "usage": total_usage,
        "estimated_cost_usd": total_cost,
    }
