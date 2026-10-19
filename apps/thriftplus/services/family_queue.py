"""
The Families page (thrift_plus_families Phase 1, owner 2026-10-13): every pricing family on the floor with what the
owner needs to decide it fast, and the decisions.

**A card:** units on the floor, the price range, retail and cost, the age, sales in the last 90 and 180 days, the
conservative sales estimate ((sold + 1) ÷ days, as if one more sold now), today's ThriftBucks %, a suggested target
(clear the floor in 90 days) and flags:
- **huge** (50+ units): decided one by one, never in bulk;
- **volume**: at the estimated rate it takes more than 90 days to sell them;
- **cost**: the cost is 40% of the tag or more, so the order was bought to sell near the tag;
- **junk**: 20+ units at $5 or less;
- **fast**: it sells faster than the floor count, so don't discount it.

**The order:** money at stake (units × tag) first.

**Decisions** (the owner): approve with a target (the units then share one ThriftBucks %, starting at the median of
their current %), not a family, exit, or reopen. Bulk approve at the suggestion (never a huge lot), and "mark the
rest not a family". Every decision is stamped (who, when).

**Approved by default** (owner 2026-10-16): every possible family is approved each night at the default target (clear
its floor count in 90 days), unstamped, so nothing sits frozen. An approved family with no one stamped on it is **to
review**: the owner works those (the big lots first) and his save stamps it.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from statistics import median

from django.db import transaction
from django.db.models import Count, Max, Min, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.thriftplus.models import FamilyLink, ItemReward, RewardFamily
from apps.thriftplus.services.rewards import HORIZON, conservative_per_90

HUGE = 50
JUNK_UNITS = 20
JUNK_PRICE = Decimal('5')
COST_SHARE = Decimal('0.40')
SIZE_BANDS = [('2-3', 2, 3), ('4-9', 4, 9), ('10-49', 10, 49), ('50+', 50, None)]
ZERO = Decimal('0')


REVIEW = 'review'  # a view, not a status: approved by default and not yet reviewed by the owner
STATUS_KEYS = [s for s, _ in RewardFamily.STATUS_CHOICES] + [REVIEW]


class FamilyError(Exception):
    pass


def _band(units: int) -> str:
    for label, lo, hi in SIZE_BANDS:
        if units >= lo and (hi is None or units <= hi):
            return label
    return SIZE_BANDS[0][0]


def _rows() -> list[dict]:
    """Every family with units on the floor, worked out once (about 2,500 in production)."""
    from apps.inventory.models import Item

    fam_of = dict(FamilyLink.objects.filter(family__isnull=False).values_list('product_id', 'family_id'))
    if not fam_of:
        return []
    floor = (Item.objects.filter(status='on_shelf', product_id__in=list(fam_of)).exclude(source='consignment')
             .values('product_id')
             .annotate(n=Count('id'), tag=Sum('price'), lo=Min('price'), hi=Max('price'), retail_sum=Sum('retail'),
                       retail_n=Count('retail'), cost_sum=Sum('cost'), cost_n=Count('cost'),
                       oldest=Min(Coalesce('listed_at', 'checked_in_at', 'created_at')),
                       newest=Max(Coalesce('listed_at', 'checked_in_at', 'created_at'))))
    now = timezone.now()
    today = timezone.localdate()
    agg: dict[int, dict] = {}
    for r in floor:
        fid = fam_of[r['product_id']]
        a = agg.setdefault(fid, {'units': 0, 'tag': ZERO, 'lo': None, 'hi': None, 'retail': ZERO, 'retail_n': 0, 'cost': ZERO,
                                 'cost_n': 0, 'oldest': None, 'newest': None, 'products': 0})
        a['units'] += r['n']
        a['products'] += 1
        a['tag'] += r['tag'] or ZERO
        a['lo'] = r['lo'] if a['lo'] is None else min(a['lo'], r['lo'])
        a['hi'] = r['hi'] if a['hi'] is None else max(a['hi'], r['hi'])
        a['retail'] += r['retail_sum'] or ZERO
        a['retail_n'] += r['retail_n']
        a['cost'] += r['cost_sum'] or ZERO
        a['cost_n'] += r['cost_n']
        for k, pick in (('oldest', min), ('newest', max)):
            if r[k] is not None:
                a[k] = r[k] if a[k] is None else pick(a[k], r[k])
    if not agg:
        return []
    sold90: dict[int, int] = defaultdict(int)
    sold180: dict[int, int] = defaultdict(int)
    sold_dates: dict[int, list] = defaultdict(list)
    for pid, sold_at in (Item.objects.filter(status='sold', product_id__in=list(fam_of), sold_at__gte=now - timedelta(days=180))
                         .values_list('product_id', 'sold_at')):
        fid = fam_of[pid]
        sold180[fid] += 1
        if sold_at >= now - timedelta(days=90):
            sold90[fid] += 1
        sold_dates[fid].append(timezone.localdate(sold_at))
    pct_now: dict[int, tuple[Decimal, Decimal]] = defaultdict(lambda: (ZERO, ZERO))
    for pid, reward, price in (ItemReward.objects.filter(item__status='on_shelf', item__product_id__in=list(fam_of))
                               .exclude(status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED])
                               .values_list('item__product_id', 'reward', 'starting_price')):
        fid = fam_of[pid]
        r, p = pct_now[fid]
        pct_now[fid] = (r + (reward or ZERO), p + (price or ZERO))
    fams = {f.pk: f for f in RewardFamily.objects.filter(pk__in=list(agg)).select_related('decided_by')}
    names = _category_names(fam_of, set(agg))
    out = []
    for fid, a in agg.items():
        f = fams.get(fid)
        if f is None:
            continue
        units = a['units']
        age = (today - timezone.localdate(a['oldest'])).days + 1 if a['oldest'] else 1
        window = max(7, min(HORIZON, age))
        since = today - timedelta(days=window)
        est = conservative_per_90(sum(1 for d in sold_dates.get(fid, ()) if d > since), window)
        avg = (a['tag'] / units) if units else ZERO
        rew, base = pct_now[fid]
        days_to_clear = int((Decimal(units) / (est / 90)).to_integral_value()) if est > 0 else None
        flags = []
        if units >= HUGE:
            flags.append({'key': 'huge', 'text': f'Huge lot: {units} units. Decide it on its own.'})
        if days_to_clear and days_to_clear > HORIZON:
            flags.append({'key': 'volume', 'text': f'At about {est:.1f} sales per 90 days, {units} units take about {days_to_clear} days.'})
        if a['cost_n'] and avg > 0 and (a['cost'] / a['cost_n']) >= avg * COST_SHARE:
            share = (a['cost'] / a['cost_n'] / avg * 100).quantize(Decimal('1'))
            flags.append({'key': 'cost', 'text': f'Cost is about {share}% of the tag: the order was bought to sell near the tag.'})
        if units >= JUNK_UNITS and avg <= JUNK_PRICE:
            flags.append({'key': 'junk', 'text': f'Junk volume: {units} units at ${avg:.2f}.'})
        if est >= units * Decimal('1.5'):
            flags.append({'key': 'fast', 'text': 'Sells faster than the floor count: little or no discount needed.'})
        out.append({
            'id': fid, 'name': f.name or f'Family {fid}', 'kind': f.kind, 'status': f.status, 'category': names.get(fid, ''),
            'products': a['products'], 'units': units, 'band': _band(units), 'huge': units >= HUGE,
            'tag_total': str(a['tag'].quantize(Decimal('0.01'))), 'price_avg': str(avg.quantize(Decimal('0.01'))),
            'price_min': str(a['lo'] or ZERO), 'price_max': str(a['hi'] or ZERO),
            'retail_avg': str((a['retail'] / a['retail_n']).quantize(Decimal('0.01'))) if a['retail_n'] else None,
            'cost_avg': str((a['cost'] / a['cost_n']).quantize(Decimal('0.01'))) if a['cost_n'] else None,
            'age_oldest': age, 'age_newest': (today - timezone.localdate(a['newest'])).days + 1 if a['newest'] else None,
            'sold_90': sold90.get(fid, 0), 'sold_180': sold180.get(fid, 0),
            'est_per_90': str(est.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)), 'days_to_clear': days_to_clear,
            'pct_now': str((rew / base * 100).quantize(Decimal('0.1'))) if base else '0.0',
            'suggested_target': max(1, units),
            'target_per_90': f.target_per_90, 'pct': str((f.pct or ZERO) * 100) if f.pct is not None else None,
            'decided_by': (f.decided_by.full_name or f.decided_by.email) if f.decided_by else '',
            'decided_at': f.decided_at.isoformat() if f.decided_at else None, 'note': f.note,
            'auto': f.status == RewardFamily.STATUS_APPROVED and f.decided_by_id is None,
            'flags': flags,
        })
    out.sort(key=lambda r: (-Decimal(r['tag_total']), -r['units'], r['id']))
    return out


def _category_names(fam_of: dict[int, int], fids: set[int]) -> dict[int, str]:
    from apps.inventory.models import Product

    pids = [pid for pid, fid in fam_of.items() if fid in fids]
    names: dict[int, str] = {}
    for pid, cat in Product.objects.filter(pk__in=pids).values_list('pk', 'category__name'):
        fid = fam_of[pid]
        if cat and fid not in names:
            names[fid] = cat
    return names


def queue(*, status: str = RewardFamily.STATUS_POSSIBLE, band: str = '', flag: str = '', q: str = '',
          offset: int = 0, limit: int = 50) -> dict:
    """The page: one status's families (or ``review``) in order, filtered, a page at a time, and the counts."""
    rows = _rows()
    counts = defaultdict(int)
    units_by = defaultdict(int)
    for r in rows:
        counts[r['status']] += 1
        units_by[r['status']] += r['units']
        if r['auto']:
            counts[REVIEW] += 1
            units_by[REVIEW] += r['units']
    shown = [r for r in rows if r['auto']] if status == REVIEW else [r for r in rows if r['status'] == status]
    if band:
        shown = [r for r in shown if r['band'] == band]
    if flag:
        shown = [r for r in shown if any(f['key'] == flag for f in r['flags'])]
    if q:
        ql = q.lower()
        shown = [r for r in shown if ql in r['name'].lower() or ql in (r['category'] or '').lower()]
    total = len(rows)
    return {
        'counts': {s: counts.get(s, 0) for s in STATUS_KEYS},
        'units': {s: units_by.get(s, 0) for s in STATUS_KEYS},
        'total': total, 'decided': total - counts.get(RewardFamily.STATUS_POSSIBLE, 0),
        'reviewed': total - counts.get(RewardFamily.STATUS_POSSIBLE, 0) - counts.get(REVIEW, 0),
        'matching': len(shown), 'bulk_ok': sum(1 for r in shown if not r['huge']),
        'rows': shown[offset:offset + limit],
    }


def _floor_pct(family: RewardFamily) -> Decimal:
    """The median of the family's units' current ThriftBucks as a share of their tags: where an approved family starts."""
    shares = [
        (reward / price) for reward, price in ItemReward.objects.filter(
            item__status='on_shelf', item__product__reward_family_link__family=family,
        ).exclude(status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED]).values_list('reward', 'starting_price')
        if price and price > 0
    ]
    return Decimal(median(shares)).quantize(Decimal('0.0001')) if shares else ZERO


@transaction.atomic
def decide(family: RewardFamily, action: str, *, by, target: int | None = None, note: str = '') -> RewardFamily:
    """Approve (with a target), not a family, exit, or reopen. Approving starts the shared % at the units' median."""
    family = RewardFamily.objects.select_for_update().get(pk=family.pk)
    if action == 'approve':
        if target is None:
            raise FamilyError('A sell target (units per 90 days) is needed.')
        if not 1 <= int(target) <= 100000:
            raise FamilyError('The target is units per 90 days, 1 or more.')
        if family.status != RewardFamily.STATUS_APPROVED:
            family.pct_on = None
        family.status = RewardFamily.STATUS_APPROVED
        family.target_per_90 = int(target)
        if family.pct is None:
            family.pct = _floor_pct(family)
    elif action == 'not_family':
        family.status = RewardFamily.STATUS_NOT_FAMILY
    elif action == 'exit':
        family.status = RewardFamily.STATUS_EXIT
    elif action == 'reopen':
        family.status = RewardFamily.STATUS_POSSIBLE
    else:
        raise FamilyError('Approve, not a family, exit or reopen.')
    family.decided_by = by
    family.decided_at = timezone.now()
    if note:
        family.note = note[:200]
    family.save()
    return family


def bulk_approve(ids: list[int], *, by) -> dict:
    """Approve many possible families at their suggested target (clear the floor in 90 days). Never a huge lot."""
    rows = {r['id']: r for r in _rows() if r['id'] in set(ids)}
    done = skipped = 0
    for fid in ids:
        r = rows.get(fid)
        if r is None or r['status'] != RewardFamily.STATUS_POSSIBLE or r['huge']:
            skipped += 1
            continue
        decide(RewardFamily(pk=fid), 'approve', by=by, target=r['suggested_target'])
        done += 1
    return {'approved': done, 'skipped': skipped}


@transaction.atomic
def rest_not_family(*, by) -> int:
    """Every family still possible becomes "not a family" (owner 2026-10-13: everything decided by launch)."""
    return RewardFamily.objects.filter(status=RewardFamily.STATUS_POSSIBLE).update(
        status=RewardFamily.STATUS_NOT_FAMILY, decided_by=by, decided_at=timezone.now(), note='Marked with the rest')


AUTO_NOTE = 'Approved by default: clear the floor in 90 days'


def auto_approve() -> int:
    """Every possible family becomes approved at the default target (its floor count per 90 days), unstamped, so it is
    to review (owner 2026-10-16). Each starts at the median of its units' current ThriftBucks %. Run nightly after the
    flagging, so a new family never sits frozen."""
    from apps.inventory.models import Item

    fids = list(RewardFamily.objects.filter(status=RewardFamily.STATUS_POSSIBLE).values_list('pk', flat=True))
    if not fids:
        return 0
    units = dict(Item.objects.filter(status='on_shelf', product__reward_family_link__family_id__in=fids)
                 .exclude(source='consignment').values('product__reward_family_link__family_id')
                 .annotate(n=Count('id')).values_list('product__reward_family_link__family_id', 'n'))
    shares: dict[int, list[Decimal]] = defaultdict(list)
    for fid, reward, price in (ItemReward.objects.filter(item__status='on_shelf', item__product__reward_family_link__family_id__in=fids)
                               .exclude(status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED])
                               .values_list('item__product__reward_family_link__family_id', 'reward', 'starting_price')):
        if price and price > 0:
            shares[fid].append(reward / price)
    now = timezone.now()
    done = 0
    for fid in fids:
        pct = Decimal(median(shares[fid])).quantize(Decimal('0.0001')) if shares.get(fid) else ZERO
        done += RewardFamily.objects.filter(pk=fid, status=RewardFamily.STATUS_POSSIBLE).update(
            status=RewardFamily.STATUS_APPROVED, target_per_90=max(1, units.get(fid, 0)), pct=pct, pct_on=None,
            decided_by=None, decided_at=now, note=AUTO_NOTE)
    return done
