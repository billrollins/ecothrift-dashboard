"""
The floor-stock planner (thrift_plus_rewards Phase 5): "what would members pay for the stock already on
the floor?", for any set of choices, without touching a price or a setting.

It replays the reward engine's own rules (``rewards.step``) over today's on-shelf items in closed form:
day 1 is the first day on the floor, nothing for the first ``wait_days``, then the price ÷ ``horizon`` a
day, never below the floor share of the tag. Pacing (a family selling on pace holds its reward) is left
out on purpose: it can only hold a reward lower, so these are the most members could be offered.

The one choice that is new here is ``max_age``: stock already on the floor counts as at most that many days
old on launch day. It is exactly what the ``thrift_plus_rewards_start`` setting does: ``max_age = N`` is
the same as setting the start to ``launch - (N - 1)`` days.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_DOWN, Decimal

from apps.thriftplus.services import rewards

ZERO = Decimal('0')
CENT = Decimal('0.01')
CACHE_SECONDS = 60
AGE_BUCKETS = [(1, 7, 'Days 1 to 7'), (8, 30, 'Days 8 to 30'), (31, 60, 'Days 31 to 60'), (61, 90, 'Days 61 to 90'), (91, None, 'Over 90 days')]

_cache: tuple[float, list[tuple]] | None = None


@dataclass(frozen=True)
class Scenario:
    launch: date
    offset: int = 0                       # look at launch + offset days
    max_age: int | None = None            # None = every item counts from its own floor date
    floor_share: Decimal = rewards.DEFAULT_FLOOR_SHARE
    wait_days: int = rewards.WAIT_DAYS
    horizon: int = rewards.HORIZON

    @property
    def on(self) -> date:
        return self.launch + timedelta(days=self.offset)

    def start_equivalent(self) -> date | None:
        """The ``thrift_plus_rewards_start`` value that gives the same result as ``max_age``."""
        return self.launch - timedelta(days=self.max_age - 1) if self.max_age else None


def load_rows(*, fresh: bool = False) -> list[tuple]:
    """(price, retail, floor_date, source, category name) for every on-shelf item; cached a minute."""
    global _cache
    if not fresh and _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    from apps.inventory.models import Item

    rows = []
    qs = Item.objects.filter(status='on_shelf').values_list(
        'price', 'retail', 'source', 'listed_at', 'checked_in_at', 'created_at', 'product__category__name',
    )
    from django.utils import timezone

    for price, retail, source, listed, checked, created, category in qs.iterator(chunk_size=5000):
        moment = listed or checked or created
        rows.append((price or ZERO, retail, source, timezone.localdate(moment) if moment else None, category or 'No category'))
    _cache = (time.monotonic(), rows)
    return rows


def clear_cache() -> None:
    global _cache
    _cache = None


def reward_for(price: Decimal, day: int, sc: Scenario) -> Decimal:
    """The engine's reward for an item on ``day`` (1-based), with no pacing."""
    cap = max(ZERO, price - rewards.floor_for(price, sc.floor_share))
    grow_days = max(0, day - sc.wait_days)
    grown = (price * grow_days / sc.horizon).quantize(CENT, rounding=ROUND_DOWN)
    return min(cap, grown)


def _day_on(floor_date: date, sc: Scenario) -> int:
    """Day number on ``sc.on``, with the max-age rule applied at launch."""
    first = floor_date
    if sc.max_age:
        first = max(first, sc.launch - timedelta(days=sc.max_age - 1))
    return (sc.on - first).days + 1


def _pct(part: Decimal, whole: Decimal) -> float:
    return round(float(100 * part / whole), 1) if whole else 0.0


def _bucket(label: str) -> dict:
    return {'label': label, 'units': 0, 'retail': ZERO, 'tag': ZERO, 'reward': ZERO, 'with_reward': 0}


def _finish(b: dict) -> dict:
    return {
        'label': b['label'], 'units': b['units'], 'with_reward': b['with_reward'],
        'retail_total': str(b['retail']), 'tag_total': str(b['tag']), 'reward_total': str(b['reward']),
        'member_total': str(b['tag'] - b['reward']), 'pct_off': _pct(b['reward'], b['tag']),
    }


def simulate(sc: Scenario, *, rows: list[tuple] | None = None) -> dict:
    rows = load_rows() if rows is None else rows
    total = _bucket('All items')
    ages = {label: _bucket(label) for _, _, label in AGE_BUCKETS}
    bands = {label: _bucket(label) for _, _, label in rewards.PRICE_BANDS}
    cats: dict[str, dict] = defaultdict(lambda: None)  # type: ignore[assignment]
    consignment = no_price = retail_missing = at_floor = exit_list = 0

    for price, retail, source, floor_date, category in rows:
        if source == 'consignment':
            consignment += 1
            continue
        if floor_date is None:
            continue
        day = _day_on(floor_date, sc)
        reward = reward_for(price, day, sc) if price > 0 else ZERO
        if price <= 0:
            no_price += 1
        elif reward >= price - rewards.floor_for(price, sc.floor_share):
            at_floor += 1
        if day >= sc.horizon:
            exit_list += 1
        real_age = (sc.launch - floor_date).days + 1
        age_label = next((lbl for lo, hi, lbl in AGE_BUCKETS if real_age >= lo and (hi is None or real_age <= hi)), AGE_BUCKETS[0][2])
        band_label = next(lbl for lo, hi, lbl in rewards.PRICE_BANDS if price >= lo and (hi is None or price < hi))
        if cats[category] is None:
            cats[category] = _bucket(category)
        for b in (total, ages[age_label], bands[band_label], cats[category]):
            b['units'] += 1
            b['tag'] += price
            b['reward'] += reward
            if retail is not None:
                b['retail'] += retail
            if reward > 0:
                b['with_reward'] += 1
        if retail is None:
            retail_missing += 1

    top_cats = sorted((c for c in cats.values() if c), key=lambda c: -c['tag'])[:15]
    out = _finish(total)
    return {
        'scenario': {
            'launch': sc.launch.isoformat(), 'on': sc.on.isoformat(), 'offset': sc.offset, 'max_age': sc.max_age,
            'floor_share': str(sc.floor_share), 'wait_days': sc.wait_days, 'horizon': sc.horizon,
            'start_equivalent': sc.start_equivalent().isoformat() if sc.max_age else None,
        },
        'totals': {**out, 'consignment_excluded': consignment, 'no_price': no_price, 'retail_missing': retail_missing,
                   'at_floor': at_floor, 'exit_list': exit_list},
        'by_age': [_finish(ages[lbl]) for _, _, lbl in AGE_BUCKETS],
        'by_band': [_finish(bands[lbl]) for _, _, lbl in rewards.PRICE_BANDS],
        'by_category': [_finish(c) for c in top_cats],
    }


# The options the owner is most likely choosing between, side by side.
PRESETS = [
    ('Real age', {'max_age': None}),
    ('Everyone starts fresh on launch day', {'max_age': 1}),
    ('Old stock counts as 30 days old', {'max_age': 30}),
    ('Old stock counts as 60 days old', {'max_age': 60}),
]
COMPARE_OFFSETS = [0, 14, 30, 60]


def _quick_totals(sc: Scenario, rows: list[tuple]) -> dict:
    """Just the headline numbers for one scenario (no breakdowns): what the side-by-side table needs."""
    tag = reward_sum = ZERO
    with_reward = 0
    for price, _retail, source, floor_date, _category in rows:
        if source == 'consignment' or floor_date is None:
            continue
        r = reward_for(price, _day_on(floor_date, sc), sc) if price > 0 else ZERO
        tag += price
        reward_sum += r
        if r > 0:
            with_reward += 1
    return {'with_reward': with_reward, 'reward_total': str(reward_sum), 'member_total': str(tag - reward_sum), 'pct_off': _pct(reward_sum, tag)}


def compare(base: Scenario) -> dict:
    rows = load_rows()
    table = []
    for label, change in PRESETS:
        cells = []
        for offset in COMPARE_OFFSETS:
            sc = Scenario(launch=base.launch, offset=offset, max_age=change['max_age'], floor_share=base.floor_share,
                          wait_days=base.wait_days, horizon=base.horizon)
            cells.append({'offset': offset, 'on': sc.on.isoformat(), **_quick_totals(sc, rows)})
        table.append({'label': label, 'max_age': change['max_age'],
                      'start_equivalent': (base.launch - timedelta(days=change['max_age'] - 1)).isoformat() if change['max_age'] else None,
                      'cells': cells})
    return {'launch': base.launch.isoformat(), 'offsets': COMPARE_OFFSETS, 'rows': table}
