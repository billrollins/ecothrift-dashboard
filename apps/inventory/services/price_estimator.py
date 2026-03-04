"""
Price estimation service for inventory items.

Provides `estimate_price()` which returns a suggested selling price,
confidence interval, and top comparable sold items.

APPROACH
--------
1. Loads a trained gradient-boosted model (LightGBM or XGBoost fallback)
   serialized at workspace/models/price_model.joblib.
2. If the model file is not yet trained, falls back to a heuristic:
   - Uses retail_value * 0.35 as a starting estimate
   - Adjusts by condition and source multipliers
3. Always returns the top 3 most similar sold items from the DB for context.

TRAINING
--------
Run: python manage.py train_price_model
The model is trained on Item records where sold_for is not null.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent.parent.parent.parent / 'workspace' / 'models' / 'price_model.joblib'

# Condition multipliers for heuristic fallback (applied to retail_value * base_pct)
CONDITION_MULTIPLIERS = {
    'new': 0.55,
    'like_new': 0.45,
    'good': 0.35,
    'fair': 0.25,
    'salvage': 0.12,
    'unknown': 0.30,
}

SOURCE_ADJUSTMENTS = {
    'purchased': 1.0,
    'consignment': 1.05,  # consignment items typically priced slightly higher
    'house': 0.90,
}


@dataclass
class PriceEstimate:
    estimated_price: Decimal
    low_estimate: Decimal
    high_estimate: Decimal
    confidence: float          # 0.0 – 1.0
    method: str                # 'model' | 'heuristic'
    comparables: list[dict] = field(default_factory=list)
    notes: str = ''


def _load_model():
    """Load the trained model. Returns (model, feature_encoder) or None."""
    if not MODEL_PATH.exists():
        return None
    try:
        import joblib
        return joblib.load(MODEL_PATH)
    except ImportError:
        logger.debug('joblib not installed; ML pricing unavailable.')
        return None
    except Exception as exc:
        logger.warning('Could not load price model: %s', exc)
        return None


def _build_features(
    title: str,
    brand: Optional[str],
    category_name: Optional[str],
    condition: str,
    source: str,
    retail_value: Optional[Decimal],
) -> dict:
    """Build a feature dict for the ML model."""
    return {
        'title': (title or '').lower()[:200],
        'brand': (brand or '').lower()[:100],
        'category': (category_name or '').lower(),
        'condition': condition or 'unknown',
        'source': source or 'purchased',
        'retail_value': float(retail_value) if retail_value else 0.0,
    }


def _heuristic_estimate(
    retail_value: Optional[Decimal],
    condition: str,
    source: str,
) -> tuple[Decimal, Decimal, Decimal]:
    """
    Heuristic price estimate when no model is available.
    Returns (estimated, low, high).
    """
    if not retail_value or retail_value <= 0:
        # No retail value — return a generic low-value estimate
        return Decimal('5.00'), Decimal('1.00'), Decimal('15.00')

    multiplier = CONDITION_MULTIPLIERS.get(condition, 0.30)
    source_adj = SOURCE_ADJUSTMENTS.get(source, 1.0)

    mid = float(retail_value) * multiplier * source_adj
    low = mid * 0.7
    high = mid * 1.4

    # Ensure minimum prices
    mid = max(mid, 1.00)
    low = max(low, 0.50)
    high = max(high, mid * 1.1)

    return (
        Decimal(str(round(mid, 2))),
        Decimal(str(round(low, 2))),
        Decimal(str(round(high, 2))),
    )


def _find_comparables(
    title: str,
    brand: Optional[str],
    category_name: Optional[str],
    condition: str,
    limit: int = 3,
) -> list[dict]:
    """
    Find similar sold items from the database for price context.
    Uses simple text matching on title and brand.
    """
    from apps.inventory.models import Item

    qs = Item.objects.filter(
        status='sold',
        sold_for__isnull=False,
    ).exclude(sold_for=0)

    # Narrow by category first
    if category_name:
        qs = qs.filter(category__icontains=category_name.split(' ')[0])

    # Further narrow by brand
    if brand and brand.strip():
        brand_qs = qs.filter(brand__icontains=brand)
        if brand_qs.count() >= 2:
            qs = brand_qs

    # Same condition preferred
    if condition and condition != 'unknown':
        cond_qs = qs.filter(condition=condition)
        if cond_qs.count() >= 1:
            qs = cond_qs

    results = list(
        qs.order_by('-sold_at').values(
            'sku', 'title', 'brand', 'condition', 'sold_for', 'sold_at',
        )[:limit]
    )
    for r in results:
        r['sold_for'] = str(r['sold_for'])
        if r['sold_at']:
            r['sold_at'] = r['sold_at'].strftime('%Y-%m-%d')
    return results


def estimate_price(
    title: str,
    brand: Optional[str] = None,
    model_name: Optional[str] = None,
    category_name: Optional[str] = None,
    condition: str = 'unknown',
    source: str = 'purchased',
    retail_value: Optional[Decimal] = None,
    include_comparables: bool = True,
) -> PriceEstimate:
    """
    Estimate the selling price for an item.

    Args:
        title:            Item title / description.
        brand:            Brand name.
        model_name:       Model number (not to be confused with the Django model).
        category_name:    Category text (e.g. "Small Kitchen Appliances").
        condition:        One of: new / like_new / good / fair / salvage / unknown.
        source:           One of: purchased / consignment / house.
        retail_value:     Vendor-stated retail / cost.
        include_comparables: Whether to query the DB for similar sold items.

    Returns:
        PriceEstimate with price, confidence interval, and comparables.
    """
    comparables: list[dict] = []
    if include_comparables:
        comparables = _find_comparables(title, brand, category_name, condition)

    ml_bundle = _load_model()
    if ml_bundle is not None:
        try:
            model, preprocessor = ml_bundle
            features = _build_features(title, brand, category_name, condition, source, retail_value)
            import pandas as pd
            df = pd.DataFrame([features])
            X = preprocessor.transform(df)
            pred = float(model.predict(X)[0])
            pred = max(pred, 0.50)

            # Compute interval from model's feature importances (approximation)
            confidence = 0.80 if retail_value else 0.60
            low = pred * 0.75
            high = pred * 1.30

            return PriceEstimate(
                estimated_price=Decimal(str(round(pred, 2))),
                low_estimate=Decimal(str(round(low, 2))),
                high_estimate=Decimal(str(round(high, 2))),
                confidence=confidence,
                method='model',
                comparables=comparables,
            )
        except Exception as exc:
            logger.warning('ML price prediction failed, falling back to heuristic: %s', exc)

    # Heuristic fallback
    mid, low, high = _heuristic_estimate(retail_value, condition, source)
    confidence = 0.40 if retail_value else 0.20
    notes = (
        'Estimated using heuristic rules (retail value × condition multiplier). '
        'Run `python manage.py train_price_model` to enable ML-based estimates.'
    )
    return PriceEstimate(
        estimated_price=mid,
        low_estimate=low,
        high_estimate=high,
        confidence=confidence,
        method='heuristic',
        comparables=comparables,
        notes=notes,
    )
