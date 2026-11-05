"""Rates from real recovery, scored blind (Dash #77).

**The measure: 90-day recovery (R90).** For one truck (a 2026 PO with manifest rows): what its items sold for
within 90 days of the truck's first sale, divided by its whole manifest retail (qty x unit retail). Unsold,
missing and damaged units count as zero. A truck is *scored* once its first sale is 90+ days old; its R90 never
changes after that, so every score compares like with like. Rows with $0 retail are left out of the retail and
counted as a flag; sold items with no manifest row are left out of the sold dollars and counted as a flag (both
make R90 run low, never high).

**One fit = one ``RecoveryFit`` row:** per seller, per seller category, pooled R90 (dollars / retail) with a
band (25th-75th percentile of the truck rates when 5+ trucks carry the category, else x0.7 / x1.3), the
whole-truck rate, and a blind score of every scored truck: predicted from rates fitted without it (leave one
truck out). A category gets its own rate only when 3+ scored trucks carry $1,000+ of it and $2,000+ in all: a
fixed rule, never tuned on the scores, so the blind score stays blind. Re-fit = the next fit, built from every
truck that has crossed 90 days since; each fit is scored the same way, so fits compare like with like.

Register: ``inventory_purchaseorder`` (ordered_date, vendor), ``inventory_vendor.code`` (seller),
``inventory_manifestrow`` (quantity, unit_retail, taxonomy.seller_category), ``inventory_item`` (sold_at,
sold_for, manifest_row, purchase_order). Fill-ins: category '' becomes UNKNOWN; sold_for <= 0 is not a sale.
"""

from __future__ import annotations

import logging
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

HORIZON_DAYS = 90
LONG_DAYS = 180
MIN_CATEGORY_RETAIL = 2000.0
MIN_CATEGORY_TRUCKS = 3  # trucks carrying $1,000+ of a category before it gets its own rate
CATEGORY_TRUCK_RETAIL = 1000.0
MIN_SELLER_TRUCKS = 3
QUARTILE_TRUCKS = 5
JUDGEMENT_BAND = (0.7, 1.3)
THIN_TRUCKS = 5
FIRST_YEAR = date(2026, 1, 1)

# Seller slug (B-Stock marketplace) -> our PO vendor code, as in estimate_profit.SELLERS.
SELLER_CODES = {
    'target': 'TRGET',
    'amazon': 'AMZ',
    'costco': 'CST',
    'walmart': 'WAL',
    'homedepot': 'HMD',
    'wayfair': 'WFR',
}

_TRUCKS_SQL = '''
with po as (
  select po.id, po.ordered_date, v.code,
         (select min(i.sold_at)::date from inventory_item i
           where i.purchase_order_id = po.id and i.sold_at is not null and i.sold_for > 0) first_sale
  from inventory_purchaseorder po join inventory_vendor v on v.id = po.vendor_id
  where v.code = any(%s) and po.ordered_date >= %s
    and exists (select 1 from inventory_manifestrow m where m.purchase_order_id = po.id)
)
select po.id, po.code, po.ordered_date, po.first_sale,
       coalesce(nullif(upper(trim(m.taxonomy->>'seller_category')), ''), 'UNKNOWN') sc,
       sum(case when coalesce(m.unit_retail, 0) > 0 then coalesce(m.quantity, 0) * m.unit_retail else 0 end) retail,
       count(*) filter (where coalesce(m.unit_retail, 0) <= 0) zero_rows,
       coalesce(sum((select sum(i.sold_for) from inventory_item i
                      where i.manifest_row_id = m.id and i.sold_for > 0
                        and i.sold_at::date <= po.first_sale + %s)), 0) sold90,
       coalesce(sum((select sum(i.sold_for) from inventory_item i
                      where i.manifest_row_id = m.id and i.sold_for > 0
                        and i.sold_at::date <= po.first_sale + %s)), 0) sold180
from po join inventory_manifestrow m on m.purchase_order_id = po.id
where po.first_sale is not null
group by 1, 2, 3, 4, 5
'''

_UNLINKED_SQL = '''
select i.purchase_order_id, coalesce(sum(i.sold_for), 0)
from inventory_item i
where i.purchase_order_id = any(%s) and i.manifest_row_id is null and i.sold_for > 0 and i.sold_at is not null
group by 1
'''


@dataclass
class Truck:
    po: int
    seller: str
    ordered: date
    first_sale: date
    cats: dict[str, list[float]] = field(default_factory=dict)  # sc -> [retail, sold90, sold180]
    zero_rows: int = 0
    unlinked_sold: float = 0.0

    @property
    def retail(self) -> float:
        return sum(v[0] for v in self.cats.values())

    @property
    def sold90(self) -> float:
        return sum(v[1] for v in self.cats.values())

    @property
    def sold180(self) -> float:
        return sum(v[2] for v in self.cats.values())

    def age_days(self, today: date) -> int:
        return (today - self.first_sale).days


def load_trucks(today: date | None = None) -> list[Truck]:
    """Every 2026 truck with manifest rows and at least one sale, any age (the fit picks the scored ones)."""
    today = today or timezone.localdate()
    codes = list(SELLER_CODES.values())
    slug_of = {code: slug for slug, code in SELLER_CODES.items()}
    trucks: dict[int, Truck] = {}
    with connection.cursor() as cur:
        cur.execute(_TRUCKS_SQL, [codes, FIRST_YEAR, HORIZON_DAYS, LONG_DAYS])
        for po, code, ordered, first, sc, retail, zero, s90, s180 in cur.fetchall():
            t = trucks.setdefault(po, Truck(po=po, seller=slug_of[code], ordered=ordered, first_sale=first))
            t.cats[sc] = [float(retail or 0), float(s90 or 0), float(s180 or 0)]
            t.zero_rows += int(zero or 0)
        if trucks:
            cur.execute(_UNLINKED_SQL, [list(trucks)])
            for po, sold in cur.fetchall():
                trucks[po].unlinked_sold = float(sold or 0)
    return sorted(trucks.values(), key=lambda t: (t.seller, t.ordered, t.po))


def _quartiles(values: list[float]) -> tuple[float, float]:
    if len(values) < 2:
        return values[0], values[0]
    q = statistics.quantiles(values, n=4, method='inclusive')
    return q[0], q[2]


def _rates(trucks: list[Truck]) -> dict[str, Any]:
    """Pooled R90 per category and whole truck over these trucks."""
    pool: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    per_truck: dict[str, list[float]] = defaultdict(list)
    for t in trucks:
        for sc, (r, s, _) in t.cats.items():
            pool[sc][0] += r
            pool[sc][1] += s
            if r >= CATEGORY_TRUCK_RETAIL:
                per_truck[sc].append(s / r)
    all_r = sum(v[0] for v in pool.values())
    all_s = sum(v[1] for v in pool.values())
    whole = all_s / all_r if all_r else 0.0
    cats = {}
    for sc, (r, s) in pool.items():
        if r < MIN_CATEGORY_RETAIL or len(per_truck[sc]) < MIN_CATEGORY_TRUCKS:
            continue
        likely = s / r
        rates = per_truck[sc]
        if len(rates) >= QUARTILE_TRUCKS:
            low, high = _quartiles(rates)
            band = 'quartiles'
        else:
            low, high = likely * JUDGEMENT_BAND[0], likely * JUDGEMENT_BAND[1]
            band = 'judgement band'
        cats[sc] = {'low': low, 'likely': likely, 'high': high, 'retail': r, 'trucks': len(per_truck[sc]) or 1,
                    'band': band}
    truck_rates = [t.sold90 / t.retail for t in trucks if t.retail]
    if len(truck_rates) >= QUARTILE_TRUCKS:
        wl, wh = _quartiles(truck_rates)
        wband = 'quartiles'
    else:
        wl, wh = whole * JUDGEMENT_BAND[0], whole * JUDGEMENT_BAND[1]
        wband = 'judgement band'
    return {'whole': {'low': wl, 'likely': whole, 'high': wh, 'retail': all_r, 'trucks': len(trucks), 'band': wband},
            'categories': cats}


def predict(truck_cats: dict[str, list[float]], rates: dict[str, Any]):
    """(predicted R90 dollars, fill-in retail) for a truck's category retail under these rates."""
    whole = rates['whole']['likely']
    pred = fill = 0.0
    for sc, v in truck_cats.items():
        row = rates['categories'].get(sc)
        if row is None:
            pred += v[0] * whole
            fill += v[0]
        else:
            pred += v[0] * row['likely']
    return pred, fill


def _blind(trucks: list[Truck]) -> list[dict[str, Any]]:
    out = []
    for t in trucks:
        others = [o for o in trucks if o.po != t.po]
        rates = _rates(others)
        pred, fill = predict(t.cats, rates)
        whole_pred = t.retail * rates['whole']['likely']
        retail = t.retail or 1.0
        out.append({
            'po': t.po,
            'predicted': pred,
            'whole_predicted': whole_pred,
            'actual': t.sold90,
            'retail': t.retail,
            'miss': 100 * (pred - t.sold90) / retail,
            'whole_miss': 100 * (whole_pred - t.sold90) / retail,
            'fill_in_share': fill / retail,
        })
    return out


def summarize(scores: list[dict[str, Any]]) -> dict[str, Any]:
    if not scores:
        return {'trucks': 0}
    misses = [s['miss'] for s in scores]
    a = [abs(m) for m in misses]
    wa = [abs(s.get('whole_miss', s['miss'])) for s in scores]
    return {
        'whole_median_miss': statistics.median(wa),
        'trucks': len(scores),
        'median_miss': statistics.median(a),
        'worst_miss': max(a),
        'within_4': sum(1 for x in a if x <= 4),
        'mean_signed': statistics.mean(misses),
        'thin': len(scores) < THIN_TRUCKS,
    }


def fit_seller(trucks: list[Truck], today: date) -> dict[str, Any]:
    """Rates and blind scores for one seller's trucks (scored = first sale 90+ days ago)."""
    scored = [t for t in trucks if t.age_days(today) >= HORIZON_DAYS and t.retail > 0]
    if len(scored) < MIN_SELLER_TRUCKS:
        return {'status': 'not_yet', 'scored_trucks': len(scored), 'young_trucks': len(trucks) - len(scored)}
    scores = _blind(scored)
    rates = _rates(scored)
    long = [t for t in scored if t.age_days(today) >= LONG_DAYS and t.sold90 > 0]
    long_ratio = (sum(t.sold180 for t in long) / sum(t.sold90 for t in long)) if long else None
    by_po = {t.po: t for t in scored}
    for s in scores:
        t = by_po[s['po']]
        s.update({
            'ordered': t.ordered.isoformat(),
            'first_sale': t.first_sale.isoformat(),
            'age_days': t.age_days(today),
            'zero_retail_rows': t.zero_rows,
            'unlinked_sold': t.unlinked_sold,
        })
    cat_report = {}
    for t in scored:
        for sc, v in t.cats.items():
            row = cat_report.setdefault(sc, {'retail': 0.0, 'actual': 0.0, 'trucks': 0})
            row['retail'] += v[0]
            row['actual'] += v[1]
            row['trucks'] += 1
    return {
        'status': 'ok',
        'rates': rates,
        'scores': scores,
        'summary': summarize(scores),
        'long_ratio': long_ratio,
        'long_trucks': len(long),
        'categories': cat_report,
        'scored_trucks': len(scored),
        'young_trucks': len(trucks) - len(scored),
    }


def fit_all(today: date | None = None, trucks: list[Truck] | None = None) -> dict[str, Any]:
    today = today or timezone.localdate()
    trucks = load_trucks(today) if trucks is None else trucks
    by_seller: dict[str, list[Truck]] = defaultdict(list)
    for t in trucks:
        by_seller[t.seller].append(t)
    return {slug: fit_seller(by_seller.get(slug, []), today) for slug in SELLER_CODES}


# --- stored fits ---------------------------------------------------------------------------------

KEY_RATES = 'buying_estimate_rates'  # 'recovery' (default) or 'sold' (the #73 rates; removed next buying ship)


def rates_source() -> str:
    from apps.core.models import AppSetting

    try:
        v = str(AppSetting.objects.get(key=KEY_RATES).value).strip().lower()
    except AppSetting.DoesNotExist:
        return 'recovery'
    return 'sold' if v == 'sold' else 'recovery'


def _previous_on_same_trucks(prev, slug: str, block: dict[str, Any]) -> dict[str, Any] | None:
    """The last fit's blind median on the trucks both fits scored: like with like."""
    if prev is None or block.get('status') != 'ok':
        return None
    old = (prev.sellers or {}).get(slug) or {}
    if old.get('status') != 'ok':
        return None
    now_pos = {s['po'] for s in block['scores']}
    old_scores = [s for s in old.get('scores', []) if s['po'] in now_pos]
    new_scores = [s for s in block['scores'] if s['po'] in {s['po'] for s in old_scores}]
    if not old_scores:
        return None
    return {
        'fit_id': prev.pk,
        'fitted_at': prev.fitted_at.isoformat(),
        'trucks': len(old_scores),
        'median_miss_then': summarize(old_scores)['median_miss'],
        'median_miss_now': summarize(new_scores)['median_miss'],
    }


def save_fit(today: date | None = None):
    """Fit every seller and store it as the newest ``RecoveryFit``."""
    from apps.buying.models import RecoveryFit

    prev = RecoveryFit.objects.first()
    sellers = fit_all(today)
    for slug, block in sellers.items():
        block['previous'] = _previous_on_same_trucks(prev, slug, block)
    return RecoveryFit.objects.create(sellers=sellers)


def latest_fit(*, build_if_missing: bool = True):
    from apps.buying.models import RecoveryFit

    fit = RecoveryFit.objects.first()
    if fit is None and build_if_missing:
        try:
            fit = save_fit()
        except Exception:
            logger.exception('recovery fit failed')
            return None
    return fit


def forward_scores(slug: str, fit) -> list[dict[str, Any]]:
    """
    Saved estimates on lots that became a PO ordered after the fit they used, whose truck is now
    scored in ``fit``: the only test no fit has seen.
    """
    from apps.buying.models import EstimateLog

    block = (fit.sellers or {}).get(slug) if fit else None
    if not block or block.get('status') != 'ok':
        return []
    actual = {s['po']: s for s in block['scores']}
    out = []
    logs = (
        EstimateLog.objects.filter(seller=slug, auction__purchase_order__isnull=False, fit__isnull=False)
        .select_related('auction__purchase_order', 'fit')
        .order_by('auction__purchase_order_id', 'created_at')
    )
    seen: set[int] = set()
    for log in logs:
        po = log.auction.purchase_order
        if po.pk in seen or po.pk not in actual or not log.retail or log.likely is None:
            continue
        if not po.ordered_date or po.ordered_date <= log.fit.fitted_at.date():
            continue
        seen.add(po.pk)
        a = actual[po.pk]
        actual_rate = a['actual'] / a['retail'] if a['retail'] else 0.0
        predicted_rate = float(log.likely) / float(log.retail)
        out.append({
            'po': po.pk,
            'estimated_at': log.created_at.isoformat(),
            'predicted_rate': predicted_rate,
            'actual_rate': actual_rate,
            'miss': 100 * (predicted_rate - actual_rate),
        })
    return out
