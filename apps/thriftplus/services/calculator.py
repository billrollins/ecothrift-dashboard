"""
The rewards calculator (owner, 2026-10-07): "what would the stock from the last inventory do under these rules?"
What-if only: it changes no price, no setting and no reward.

**Who:** the items the latest inventory counted that are still on the shelf (or every on-shelf item today).

**What it shows:** items, $ retail; guests (they pay the tag) and members (tag − reward): total, average price,
% of retail. A timeline over the 90 days after launch, and breakdowns by age, price band and % off.

**The inputs.** The defaults are the live engine (``rewards.py``): wait 7 days, then the tag ÷ 90 a day, every
night, in a straight line, never below 10% of the tag.

- **Basic discount:** wait days; % of the tag per day; how often it steps (1 = nightly, 7 = weekly); the curve
  (straight, slow start, fast start; the same end point); the floor share.
- **More than one:** grow X% slower for each extra unit of the same product (back-stock estimates from the last
  inventory can count), and Y% slower for each extra similar item (same brand and category). Capped. The live
  engine instead holds a family's reward while it sells on pace; that needs real sales, so it is not replayed here.
- **Demand (beta):** each category's days to sell (V3 sales with a floor date, last 180 days), blended with the
  store's by credibility (n ÷ (n + 30)). A category that sells faster than the store discounts slower, and a slow
  one faster: the rate × (category days ÷ store days) ^ strength, kept between ½ and 2.
- **Shotgun start** (stock already on the floor at launch): a maximum age (the ``thrift_plus_rewards_start``
  setting: no item counts older than N days on launch day), an age factor (old stock counts at X% of its real
  age), and a maximum starting % off on launch day. From launch it grows at the normal rate.

The math is floats (it is an estimate); rewards round down to the cent and never take a member below the floor.
"""
from __future__ import annotations

import math
import statistics
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta

CACHE_SECONDS = 60
CURVES = ('linear', 'slow_start', 'fast_start')
TIMELINE = [0, 7, 14, 21, 30, 45, 60, 75, 90]
AGE_BUCKETS = [(1, 7, 'Days 1 to 7'), (8, 30, 'Days 8 to 30'), (31, 60, 'Days 31 to 60'), (61, 90, 'Days 61 to 90'),
               (91, None, 'Over 90 days')]
PRICE_BANDS = [(0, 10, 'Under $10'), (10, 30, '$10 to $30'), (30, 100, '$30 to $100'), (100, None, '$100 and up')]
OFF_BANDS = [(0, 0, 'No reward'), (0, 10, 'Under 10% off'), (10, 25, '10 to 25% off'), (25, 50, '25 to 50% off'),
             (50, 75, '50 to 75% off'), (75, None, '75% off and more')]
DEMAND_K = 30          # sales a category needs for half credibility
DEMAND_DAYS = 180

_cache: dict[str, tuple[float, object]] = {}


@dataclass(frozen=True)
class Params:
    population: str = 'counted'          # 'counted' (last inventory, still on the shelf) or 'shelf' (on the shelf today)
    launch: date = date(2026, 10, 20)
    offset: int = 0                      # show launch + offset days
    # Basic discount
    wait_days: int = 7
    pct_per_day: float = 100 / 90        # % of the tag a day (the live engine: the tag ÷ 90)
    step_days: int = 1                   # 1 = every night; 7 = once a week
    curve: str = 'linear'
    floor_share: float = 0.10
    # More than one
    same_slowdown: float = 0.0           # % slower for each extra unit of the same product
    count_back_stock: bool = True
    similar_slowdown: float = 0.0        # % slower for each extra similar item (same brand and category)
    max_slowdown: float = 75.0
    # Demand (beta)
    demand: bool = False
    demand_strength: float = 1.0
    # Shotgun start
    max_age: int | None = None           # no item counts older than this on launch day
    age_factor: float = 1.0              # old stock counts at this share of its real age
    max_start_pct: float | None = None   # no item starts launch day with more than this % off

    def start_equivalent(self) -> str | None:
        return (self.launch - timedelta(days=self.max_age - 1)).isoformat() if self.max_age else None


# ── The rows ────────────────────────────────────────────────────────────────────

@dataclass
class Row:
    price: float
    retail: float | None
    source: str
    floor_date: date | None
    product_id: int
    category: str
    brand: str


def _cached(key: str, build):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = build()
    _cache[key] = (time.monotonic(), value)
    return value


def latest_count():
    from apps.stocktake.services.counting import latest_count as latest

    return latest()


def load_rows(population: str) -> tuple[list[Row], dict]:
    """The items, and where they came from (which inventory)."""
    def build():
        from django.db.models import F
        from django.utils import timezone

        from apps.inventory.models import Item
        from apps.stocktake.services.shrink import _category

        qs = Item.objects.filter(status='on_shelf')
        info: dict = {'population': population}
        if population == 'counted':
            count = latest_count()
            if count is None:
                return [], {**info, 'count': None}
            from apps.stocktake.services.report import counted_ok_ids

            ids = counted_ok_ids(count)
            qs = qs.filter(pk__in=list(ids))
            info['count'] = {'id': count.pk, 'name': count.name, 'day': count.day.isoformat() if count.day else None,
                             'counted': len(ids)}
        rows = []
        for price, retail, source, listed, checked, created, pid, cat, brand1, brand2 in (
            qs.annotate(cat=_category(), brand_p=F('product__profile__brand'))
            .values_list('price', 'retail', 'source', 'listed_at', 'checked_in_at', 'created_at', 'product_id', 'cat',
                         'brand_p', 'product__brand')
            .iterator(chunk_size=5000)
        ):
            moment = listed or checked or created
            rows.append(Row(
                price=float(price or 0), retail=float(retail) if retail else None, source=source or '',
                floor_date=timezone.localdate(moment) if moment else None, product_id=pid,
                category=cat or 'No category', brand=((brand1 or brand2 or '').strip().lower()),
            ))
        return rows, info

    return _cached(f'rows:{population}', build)


def back_stock_by_product() -> Counter:
    """Units of each product the latest inventory estimated as back stock."""
    def build():
        from apps.stocktake.models import ShrinkMark

        count = latest_count()
        if count is None:
            return Counter()
        return Counter(ShrinkMark.objects.filter(count=count, outcome=ShrinkMark.OUTCOME_BACK_STOCK)
                       .values_list('item__product_id', flat=True))

    return _cached('back_stock', build)


def demand_speeds() -> dict:
    """Each category's median days to sell (V3 sales with a floor date, last 180 days), with credibility."""
    def build():
        from django.utils import timezone

        from apps.inventory.models import Item
        from apps.stocktake.services.shrink import _category

        since = timezone.now() - timedelta(days=DEMAND_DAYS)
        days: dict[str, list[float]] = defaultdict(list)
        every: list[float] = []
        for listed, sold, cat in (
            Item.objects.filter(status='sold', sold_at__gte=since, listed_at__isnull=False)
            .annotate(cat=_category()).values_list('listed_at', 'sold_at', 'cat').iterator(chunk_size=5000)
        ):
            d = (sold - listed).total_seconds() / 86400
            if d < 0:
                continue
            days[cat or 'No category'].append(d)
            every.append(d)
        store = statistics.median(every) if every else None
        out = {}
        for cat, ds in days.items():
            med = statistics.median(ds)
            z = len(ds) / (len(ds) + DEMAND_K)
            blended = z * med + (1 - z) * store if store else med
            out[cat] = {'median_days': round(med, 1), 'sales': len(ds), 'credibility': round(z, 2),
                        'blended_days': round(blended, 1)}
        return {'store_median_days': round(store, 1) if store else None, 'sales': len(every), 'categories': out}

    return _cached('demand', build)


# ── The math ────────────────────────────────────────────────────────────────────

def _fraction(g: float, rate: float, cap: float, curve: str) -> float:
    """Share of the tag taken off after ``g`` growth days at ``rate`` a day (the curves share the end point)."""
    if g <= 0 or rate <= 0 or cap <= 0:
        return 0.0
    t = cap / rate                      # days to reach the floor in a straight line
    x = min(1.0, g / t)
    if curve == 'slow_start':
        return cap * x * x
    if curve == 'fast_start':
        return cap * math.sqrt(x)
    return cap * x


def _growth_for(f: float, rate: float, cap: float, curve: str) -> float:
    """The growth days that give ``f`` (the inverse of ``_fraction``)."""
    if f <= 0 or rate <= 0 or cap <= 0:
        return 0.0
    t = cap / rate
    x = min(1.0, f / cap)
    if curve == 'slow_start':
        return t * math.sqrt(x)
    if curve == 'fast_start':
        return t * x * x
    return t * x


def _multipliers(rows: list[Row], p: Params) -> list[float]:
    """Each row's rate multiplier: slower with more of the same or similar, and (beta) by category demand."""
    same = Counter(r.product_id for r in rows)
    if p.count_back_stock and p.same_slowdown:
        same.update(back_stock_by_product())
    similar = Counter((r.brand, r.category) for r in rows if r.brand and r.brand != 'generic')
    speeds = demand_speeds() if p.demand else None
    store = (speeds or {}).get('store_median_days')
    out = []
    for r in rows:
        slow = p.same_slowdown * (same[r.product_id] - 1)
        if r.brand and r.brand != 'generic':
            slow += p.similar_slowdown * max(0, similar[(r.brand, r.category)] - same[r.product_id])
        m = 1 - min(p.max_slowdown, max(0.0, slow)) / 100
        if speeds and store:
            cat = speeds['categories'].get(r.category)
            if cat:
                m *= min(2.0, max(0.5, (cat['blended_days'] / store) ** p.demand_strength))
        out.append(m)
    return out


def _reward(r: Row, m: float, p: Params, offset: int) -> float:
    """The reward (dollars) on launch + ``offset`` days."""
    if r.price <= 0 or r.floor_date is None:
        return 0.0
    cap = max(0.0, 1 - p.floor_share)
    rate = p.pct_per_day / 100 * m
    real_age = (p.launch - r.floor_date).days + 1
    age = max(1, real_age)
    if age > 1 and p.age_factor != 1:
        age = max(1, round(age * p.age_factor))
    if p.max_age:
        age = min(age, p.max_age)
    g0 = max(0, age - p.wait_days)                       # growth days on launch day
    if p.max_start_pct is not None and g0 > 0:
        f0 = _fraction(g0, rate, cap, p.curve)
        if f0 * 100 > p.max_start_pct:
            g0 = _growth_for(p.max_start_pct / 100, rate, cap, p.curve)
    if age > p.wait_days:
        g = g0 + offset
    else:
        g = max(0, age + offset - p.wait_days)
    if p.step_days > 1:
        g = math.floor(g / p.step_days) * p.step_days
    f = _fraction(g, rate, cap, p.curve)
    floor_price = math.ceil(r.price * p.floor_share * 100) / 100
    return max(0.0, min(r.price - floor_price, math.floor(r.price * f * 100) / 100))


def _bucket(label: str) -> dict:
    return {'label': label, 'items': 0, 'tag': 0.0, 'reward': 0.0, 'with_reward': 0,
            'retail': 0.0, 'tag_with_retail': 0.0, 'reward_with_retail': 0.0, 'with_retail': 0}


def _add(b: dict, r: Row, reward: float) -> None:
    b['items'] += 1
    b['tag'] += r.price
    b['reward'] += reward
    if reward > 0:
        b['with_reward'] += 1
    if r.retail:
        b['with_retail'] += 1
        b['retail'] += r.retail
        b['tag_with_retail'] += r.price
        b['reward_with_retail'] += reward


def _finish(b: dict) -> dict:
    n = b['items'] or 1
    member = b['tag'] - b['reward']
    member_r = b['tag_with_retail'] - b['reward_with_retail']
    pct = (lambda part, whole: round(100 * part / whole, 1) if whole else None)
    return {
        'label': b['label'], 'items': b['items'], 'with_reward': b['with_reward'], 'with_retail': b['with_retail'],
        'retail_total': round(b['retail'], 2),
        'guest': {'total': round(b['tag'], 2), 'avg': round(b['tag'] / n, 2), 'pct_of_retail': pct(b['tag_with_retail'], b['retail'])},
        'member': {'total': round(member, 2), 'avg': round(member / n, 2), 'pct_of_retail': pct(member_r, b['retail'])},
        'reward_total': round(b['reward'], 2), 'pct_off': pct(b['reward'], b['tag']),
    }


def simulate(p: Params) -> dict:
    rows_all, info = load_rows(p.population)
    rows = [r for r in rows_all if r.source != 'consignment' and r.floor_date is not None]
    excluded = {'consignment': sum(1 for r in rows_all if r.source == 'consignment'),
                'no_floor_date': sum(1 for r in rows_all if r.source != 'consignment' and r.floor_date is None)}
    mults = _multipliers(rows, p)

    total = _bucket('All items')
    ages = {lbl: _bucket(lbl) for _, _, lbl in AGE_BUCKETS}
    bands = {lbl: _bucket(lbl) for _, _, lbl in PRICE_BANDS}
    offs = {lbl: _bucket(lbl) for _, _, lbl in OFF_BANDS}
    cats: dict[str, dict] = {}
    for r, m in zip(rows, mults):
        reward = _reward(r, m, p, p.offset)
        real_age = (p.launch - r.floor_date).days + 1
        age_lbl = next((lbl for lo, hi, lbl in AGE_BUCKETS if real_age >= lo and (hi is None or real_age <= hi)), AGE_BUCKETS[0][2])
        band_lbl = next(lbl for lo, hi, lbl in PRICE_BANDS if r.price >= lo and (hi is None or r.price < hi))
        off = 100 * reward / r.price if r.price > 0 else 0
        off_lbl = OFF_BANDS[0][2] if reward <= 0 else next(
            lbl for lo, hi, lbl in OFF_BANDS[1:] if off >= lo and (hi is None or off < hi))
        cats.setdefault(r.category, _bucket(r.category))
        for b in (total, ages[age_lbl], bands[band_lbl], offs[off_lbl], cats[r.category]):
            _add(b, r, reward)

    timeline = []
    for k in TIMELINE:
        b = _bucket(f'Day {k}')
        for r, m in zip(rows, mults):
            _add(b, r, _reward(r, m, p, k))
        timeline.append({'offset': k, 'on': (p.launch + timedelta(days=k)).isoformat(), **_finish(b)})

    slowed = sum(1 for m in mults if m < 0.999)
    sped = sum(1 for m in mults if m > 1.001)
    out = {
        'params': {**{k: (v.isoformat() if isinstance(v, date) else v) for k, v in asdict(p).items()},
                   'start_equivalent': p.start_equivalent(),
                   'on': (p.launch + timedelta(days=p.offset)).isoformat()},
        'source': info,
        'excluded': excluded,
        'totals': _finish(total),
        'by_age': [_finish(ages[lbl]) for _, _, lbl in AGE_BUCKETS],
        'by_band': [_finish(bands[lbl]) for _, _, lbl in PRICE_BANDS],
        'by_off': [_finish(offs[lbl]) for _, _, lbl in OFF_BANDS],
        'by_category': [_finish(c) for c in sorted(cats.values(), key=lambda c: -c['tag'])[:12]],
        'timeline': timeline,
        'rate_changes': {'slower': slowed, 'faster': sped, 'items': len(rows)},
        'live_engine': {'wait_days': 7, 'pct_per_day': round(100 / 90, 3), 'step_days': 1, 'curve': 'linear'},
    }
    if p.demand:
        speeds = demand_speeds()
        store = speeds.get('store_median_days')
        top = sorted(speeds['categories'].items(), key=lambda kv: -kv[1]['sales'])[:15]
        out['demand'] = {
            'store_median_days': store, 'sales': speeds.get('sales'),
            'categories': [{'category': c, **v, 'multiplier': round(min(2.0, max(0.5, (v['blended_days'] / store) ** p.demand_strength)), 2) if store else None}
                           for c, v in top],
        }
    return out
