"""Retail on the price tag (retail_tags_and_social Phase 1, owner call F1).

A manifest's unit retail is often inflated (a $9.99 toy listed at $999). At check-in the retail is checked
before the tag prints:

- it is more than ``tags.retail_check_price_multiple`` times the tag price (default 6: 99% of tags sit under
  5.1x, 2026-10-21), or
- it is more than ``tags.retail_check_median_multiple`` times what this product usually carries (the median retail
  of its other items, once it has ``tags.retail_check_min_items`` of them; default 2x of 3), or
- it is not the manifest's figure and nobody typed it (an estimate).

A flagged retail stops the check-in until the processor answers: **confirm** it, **fix** it (type the right one),
or **no retail** on the tag. ``Item.retail_check`` keeps the answer and ``Item.retail_source`` where the figure came
from (register ITM-08 / ITM-10: retail is flagged, never dropped; cost allocation still uses it).

The tag prints "Retail $x" per ``tags.retail_on_tag``: ``checked`` (default; only a retail that passed, was
confirmed or was fixed), ``always``, or ``never``. Tags printed before this are untouched.
"""
from __future__ import annotations

import time
from decimal import Decimal
from statistics import median
from typing import Any

from apps.core.models import AppSetting

MODE_ALWAYS = 'always'
MODE_CHECKED = 'checked'
MODE_NEVER = 'never'
MODES = (MODE_ALWAYS, MODE_CHECKED, MODE_NEVER)

DEFAULTS: dict[str, Any] = {
    'tags.retail_on_tag': MODE_CHECKED,
    'tags.retail_check_price_multiple': 6,
    'tags.retail_check_median_multiple': 2,
    'tags.retail_check_min_items': 3,
}

# Item.retail_check
CHECK_NONE = ''            # never checked (tags from before, and paths with no check)
CHECK_PASSED = 'passed'    # the check found nothing
CHECK_CONFIRMED = 'confirmed'  # flagged; the processor said it is right
CHECK_FIXED = 'fixed'      # flagged (or found bad later); a person typed the right retail
CHECK_NO_RETAIL = 'no_retail'  # flagged; the processor chose no retail on the tag
CHECK_MISSING = 'missing'  # no retail at all
PRINTABLE = (CHECK_PASSED, CHECK_CONFIRMED, CHECK_FIXED)

# Item.retail_source
SOURCE_MANIFEST = 'manifest'
SOURCE_TYPED = 'typed'
SOURCE_ESTIMATE = 'estimate'

ANSWERS = ('confirm', 'fix', 'none')

_cache: dict[str, Any] = {'at': 0.0, 'values': None}
_CACHE_SECONDS = 30


class RetailCheckNeeded(ValueError):
    """The retail looks wrong: the processor confirms, fixes or drops it before the tag prints."""

    def __init__(self, payload: dict):
        self.payload = payload
        super().__init__(payload.get('message') or 'Check the retail before the tag prints.')


def tag_settings() -> dict[str, Any]:
    now = time.monotonic()
    if _cache['values'] is not None and now - _cache['at'] < _CACHE_SECONDS:
        return _cache['values']
    stored = dict(AppSetting.objects.filter(key__in=list(DEFAULTS)).values_list('key', 'value'))
    out: dict[str, Any] = {}
    for key, fallback in DEFAULTS.items():
        raw = stored.get(key, fallback)
        if key == 'tags.retail_on_tag':
            raw = str(raw or '').strip().lower()
            out[key] = raw if raw in MODES else fallback
            continue
        try:
            num = float(raw)
        except (TypeError, ValueError):
            num = fallback
        out[key] = num if num > 0 else fallback
    _cache.update(at=now, values=out)
    return out


def clear_cache() -> None:
    _cache.update(at=0.0, values=None)


def typical_retail(product_id: int | None) -> tuple[Decimal | None, int]:
    """Median retail of this product's items (retail over 0), and how many it is from."""
    if not product_id:
        return None, 0
    from apps.inventory.models import Item

    values = list(
        Item.objects.filter(product_id=product_id, retail__gt=0).order_by('-pk').values_list('retail', flat=True)[:200]
    )
    if not values:
        return None, 0
    return Decimal(str(median(values))).quantize(Decimal('0.01')), len(values)


def _source(retail: Decimal | None, *, manifest_retail: Decimal | None, typed: bool) -> str:
    if retail is None:
        return ''
    if manifest_retail is not None and retail == manifest_retail:
        return SOURCE_MANIFEST
    # The manifest had a figure and this one differs: a person changed it (here or at preprocessing).
    return SOURCE_TYPED if typed or manifest_retail is not None else SOURCE_ESTIMATE


def assess(
    product_id: int | None,
    retail: Decimal | None,
    price: Decimal | None,
    *,
    manifest_retail: Decimal | None = None,
    typed: bool = False,
) -> dict:
    """What the check finds: ``status`` passed / flagged / missing, ``reasons`` in plain words, ``typical``."""
    cfg = tag_settings()
    source = _source(retail, manifest_retail=manifest_retail, typed=typed)
    if retail is None or retail <= 0:
        return {'status': CHECK_MISSING, 'source': source, 'reasons': [], 'typical': None, 'typical_from': 0}
    reasons: list[str] = []
    price_multiple = Decimal(str(cfg['tags.retail_check_price_multiple']))
    if price is not None and price > 0 and retail > price * price_multiple:
        reasons.append(f'Retail is over {cfg["tags.retail_check_price_multiple"]:g}x the tag price.')
    typical, n = typical_retail(product_id)
    if typical is not None and n >= cfg['tags.retail_check_min_items']:
        if retail > typical * Decimal(str(cfg['tags.retail_check_median_multiple'])):
            reasons.append(f'This product usually carries ${typical} retail ({n} items).')
    if source == SOURCE_ESTIMATE:
        reasons.append('This retail is an estimate: no manifest figure, and nobody typed it.')
    return {
        'status': 'flagged' if reasons else CHECK_PASSED,
        'source': source,
        'reasons': reasons,
        'typical': str(typical) if typical is not None else None,
        'typical_from': n,
    }


def resolve(found: dict, answer: str, *, retail: Decimal | None, price: Decimal | None) -> str:
    """The ``Item.retail_check`` for a check-in. Raises ``RetailCheckNeeded`` while a flag has no answer."""
    if found['status'] != 'flagged':
        return found['status']
    answer = (answer or '').strip().lower()
    if answer == 'confirm':
        return CHECK_CONFIRMED
    if answer == 'fix':
        return CHECK_FIXED
    if answer == 'none':
        return CHECK_NO_RETAIL
    raise RetailCheckNeeded({
        'code': 'retail_check',
        'message': 'Check the retail before the tag prints.',
        'retail': str(retail) if retail is not None else None,
        'price': str(price) if price is not None else None,
        'reasons': found['reasons'],
        'typical': found['typical'],
        'typical_from': found['typical_from'],
        'source': found['source'],
    })


def tag_retail(item, *, mode: str | None = None) -> Decimal | None:
    """The retail to print on this item's tag, or None."""
    mode = mode or tag_settings()['tags.retail_on_tag']
    retail = getattr(item, 'retail', None)
    if mode == MODE_NEVER or retail is None or retail <= 0:
        return None
    price = getattr(item, 'price', None)
    if price is not None and retail <= price:
        return None
    if mode == MODE_ALWAYS:
        return retail
    return retail if (getattr(item, 'retail_check', '') or '') in PRINTABLE else None


def tag_retail_text(item, *, mode: str | None = None) -> str | None:
    value = tag_retail(item, mode=mode)
    return f'Retail ${value:.2f}' if value is not None else None
