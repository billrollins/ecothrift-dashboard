"""Shrink by age (E4): estimated stock on hand without a full count.

Every item the system has on the shelf (``status='on_shelf'``; not in restoration, processing or salvage) carries a
**likelihood it is gone**, from how long since anyone last **saw** it:

- **Seen** = the latest of: check-in / listing (``checked_in_at``, ``listed_at``; ``created_at`` only when both are
  empty), an inventory-count scan (``stocktake.CountScan``), a register, lookup or audit scan (``ItemScanHistory``),
  a price, location, status or found change (``ItemHistory``), or a "back stock" mark in a count
  (``stocktake.ShrinkMark``), or work on its Online Sales listing. A sale takes it off the shelf altogether.
- **Likelihood**: 0 before ``shrink_age_start_days`` (90); from ``shrink_age_start_pct`` (10%) at 90 days rising in a
  straight line to 100% at ``shrink_age_lost_days`` (180); past that it counts as lost. Owner settings (Settings →
  Inventory → Shrink by age).
- An item a count marked gone (stolen, broken, scrap, owner took, sold as generic, sold online) and not seen since
  counts as lost. A count's "back stock" mark counts as seen that day.
- An item the last closed full count expected and did not find, with no mark and not seen since, is "Shrink
  (general)" in the count's own rules: it counts as lost while ``shrink_count_not_found_lost`` is on (default), else it
  follows the age rule. Either way ``last_count_not_found`` reports it.

**Estimated on hand** = sum of (1 - likelihood): units and $ at today's tag price. Data quality: ITM-02 / ITM-03 (old
``listed_at`` gaps: the retag era's ``listed_at`` is the retag day), SHR-01 / SHR-02 (no shrink measure until now),
SHR-04. Items with no date at all are counted as seen at ``created_at`` and reported as ``undated_units``.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db.models import Max, Q
from django.utils import timezone

from apps.core.models import AppSetting
from apps.inventory.models import Item, ItemHistory, ItemScanHistory

DEFAULT_START_DAYS = 90
DEFAULT_LOST_DAYS = 180
DEFAULT_START_PCT = Decimal('0.10')
EXCLUDED_LOCATIONS = ('restoration', 'processing', 'salvage')
SEEN_HISTORY_EVENTS = ('price_change', 'location_change', 'status_change', 'found', 'condition_change')
_CENT = Decimal('0.01')

BANDS = (
    ('seen', 'Seen in the window'),
    ('aging', 'Unseen, likely some gone'),
    ('lost', 'Unseen past the limit: counted lost'),
    ('marked_gone', 'Marked gone in a count'),
    ('count_missing', 'Not found in the last count'),
)


def _setting(key: str, default):
    try:
        return AppSetting.objects.get(key=key).value
    except AppSetting.DoesNotExist:
        return default


def shrink_settings() -> dict[str, Any]:
    try:
        start = max(1, int(_setting('shrink_age_start_days', DEFAULT_START_DAYS)))
    except (TypeError, ValueError):
        start = DEFAULT_START_DAYS
    try:
        lost = int(_setting('shrink_age_lost_days', DEFAULT_LOST_DAYS))
    except (TypeError, ValueError):
        lost = DEFAULT_LOST_DAYS
    if lost <= start:
        lost = start + 1
    try:
        pct = Decimal(str(_setting('shrink_age_start_pct', DEFAULT_START_PCT)))
    except ArithmeticError:
        pct = DEFAULT_START_PCT
    if pct < 0 or pct > 1:
        pct = DEFAULT_START_PCT
    count_missing_lost = _setting('shrink_count_not_found_lost', True) is not False
    return {'start_days': start, 'lost_days': lost, 'start_pct': pct, 'count_missing_lost': count_missing_lost}


def likelihood_lost(days_unseen: float, settings: dict[str, Any]) -> Decimal:
    """0 before the start; ``start_pct`` at the start rising straight to 1 at the limit; 1 after."""
    start, lost, pct = settings['start_days'], settings['lost_days'], settings['start_pct']
    if days_unseen < start:
        return Decimal('0')
    if days_unseen >= lost:
        return Decimal('1')
    frac = Decimal(str((days_unseen - start) / (lost - start)))
    return (pct + (Decimal('1') - pct) * frac).quantize(Decimal('0.0001'))


def shelf_items_last_seen(now: datetime | None = None) -> list[dict[str, Any]]:
    """Each on-shelf item: price, location, last seen, how it was last seen, and any count mark."""
    items = list(
        Item.objects.filter(status='on_shelf')
        .exclude(location__in=EXCLUDED_LOCATIONS)
        .values('id', 'sku', 'price', 'location', 'listed_at', 'checked_in_at', 'created_at'),
    )
    on_shelf = Q(item__status='on_shelf')

    seen: dict[int, datetime] = {}
    source: dict[int, str] = {}

    def merge(rows, label):
        for item_id, at in rows:
            if at and (item_id not in seen or at > seen[item_id]):
                seen[item_id] = at
                source[item_id] = label

    merge(
        ItemScanHistory.objects.filter(on_shelf).values('item_id').annotate(at=Max('scanned_at')).values_list(
            'item_id', 'at',
        ),
        'scan',
    )
    merge(
        ItemHistory.objects.filter(on_shelf, event_type__in=SEEN_HISTORY_EVENTS)
        .values('item_id').annotate(at=Max('created_at')).values_list('item_id', 'at'),
        'change',
    )

    # Someone working on an item's Online Sales listing has it in hand (photos, price, posting).
    try:
        from apps.webstore.models import WebListing
    except ImportError:  # pragma: no cover - webstore is always installed
        WebListing = None
    if WebListing is not None:
        merge(
            WebListing.objects.filter(on_shelf, status__in=('draft', 'ready', 'published', 'paused'))
            .values('item_id').annotate(at=Max('updated_at')).values_list('item_id', 'at'),
            'online_listing',
        )

    marks: dict[int, tuple[str, datetime]] = {}
    try:
        from apps.stocktake.models import CountScan, ShrinkMark
    except ImportError:  # pragma: no cover - stocktake is always installed
        CountScan = ShrinkMark = None
    if CountScan is not None:
        merge(
            CountScan.objects.filter(
                on_shelf, removed_at__isnull=True,
                result__in=(CountScan.RESULT_OK, CountScan.RESULT_ALREADY, CountScan.RESULT_ODD),
            ).values('item_id').annotate(at=Max('scanned_at')).values_list('item_id', 'at'),
            'count',
        )
        for item_id, outcome, at in ShrinkMark.objects.filter(on_shelf).order_by('marked_at').values_list(
            'item_id', 'outcome', 'marked_at',
        ):
            marks[item_id] = (outcome, at)
        merge(
            ((item_id, at) for item_id, (outcome, at) in marks.items() if outcome == ShrinkMark.OUTCOME_BACK_STOCK),
            'back_stock_mark',
        )

    not_found, count_info = _last_count_not_found()

    out = []
    for it in items:
        base = max((d for d in (it['listed_at'], it['checked_in_at']) if d), default=None)
        undated = base is None
        if undated:
            base = it['created_at']
        last, how = base, 'check_in'
        other = seen.get(it['id'])
        if other and (last is None or other > last):
            last, how = other, source[it['id']]
        mark = marks.get(it['id'])
        gone = bool(mark and mark[0] != 'back_stock' and (last is None or mark[1] >= last))
        out.append({
            'id': it['id'],
            'sku': it['sku'],
            'price': it['price'] or Decimal('0'),
            'location': it['location'] or '',
            'last_seen': last,
            'seen_by': how,
            'undated': undated,
            'marked_gone': mark[0] if gone else '',
            # Expected in the last closed full count, not found, and not seen since it started.
            'count_not_found': bool(
                it['id'] in not_found and count_info and (last is None or last < count_info['started_at'])
            ),
        })
    return out


def _last_count_not_found() -> tuple[set[int], dict[str, Any] | None]:
    """Items the last closed full inventory expected and did not find (stocktake.services.shrink.missing_ids)."""
    try:
        from apps.stocktake.models import InventoryCount
        from apps.stocktake.services.shrink import missing_ids
    except ImportError:  # pragma: no cover
        return set(), None
    count = (
        InventoryCount.objects.filter(status=InventoryCount.STATUS_CLOSED, day__isnull=False)
        .order_by('-day', '-pk').first()
    )
    if count is None:
        return set(), None
    return missing_ids(count), {'name': count.name, 'day': count.day, 'started_at': count.started_at}


def last_count_info() -> dict[str, Any] | None:
    return _last_count_not_found()[1]


def _money(v: Decimal) -> str:
    return str(v.quantize(_CENT))


def _units(v: Decimal) -> float:
    return round(float(v), 1)


def estimated_on_hand(now: datetime | None = None, *, with_items: str | None = None, limit: int = 200) -> dict[str, Any]:
    """Shelf per the system vs estimated on hand (units, $ at tag), by band. ``with_items`` = a band to list."""
    now = now or timezone.now()
    settings = shrink_settings()
    bands = {key: {'units': 0, 'tag': Decimal('0'), 'est_units': Decimal('0'), 'est_tag': Decimal('0')} for key, _ in BANDS}
    by_location: dict[str, dict[str, Any]] = defaultdict(
        lambda: {'units': 0, 'tag': Decimal('0'), 'est_units': Decimal('0'), 'est_tag': Decimal('0')},
    )
    listed: list[dict[str, Any]] = []
    undated = 0
    not_found = {key: {'units': 0, 'tag': Decimal('0')} for key, _ in BANDS}
    for row in shelf_items_last_seen(now):
        days = (now - row['last_seen']).total_seconds() / 86400.0 if row['last_seen'] else 10_000.0
        if row['marked_gone']:
            p, band = Decimal('1'), 'marked_gone'
        elif row['count_not_found'] and settings['count_missing_lost']:
            p, band = Decimal('1'), 'count_missing'
        else:
            p = likelihood_lost(days, settings)
            band = 'seen' if p == 0 else ('lost' if p >= 1 else 'aging')
        keep = Decimal('1') - p
        price = Decimal(row['price'])
        for bucket in (bands[band], by_location[row['location'] or 'on_shelf']):
            bucket['units'] += 1
            bucket['tag'] += price
            bucket['est_units'] += keep
            bucket['est_tag'] += price * keep
        undated += 1 if row['undated'] else 0
        if row['count_not_found']:
            not_found[band]['units'] += 1
            not_found[band]['tag'] += price
        if with_items == band:
            listed.append({
                'id': row['id'],
                'sku': row['sku'],
                'price': _money(price),
                'location': row['location'],
                'last_seen': row['last_seen'].isoformat() if row['last_seen'] else None,
                'seen_by': row['seen_by'],
                'days_unseen': round(days, 0),
                'likelihood_lost': float(p),
                'marked_gone': row['marked_gone'],
            })

    def total(key):
        return sum((b[key] for b in bands.values()), Decimal('0') if key != 'units' else 0)

    shelf_units, shelf_tag = total('units'), total('tag')
    est_units, est_tag = total('est_units'), total('est_tag')
    payload = {
        'as_of': now.isoformat(),
        'settings': {
            'start_days': settings['start_days'],
            'lost_days': settings['lost_days'],
            'start_pct': float(settings['start_pct']),
            'count_missing_lost': settings['count_missing_lost'],
        },
        'system': {'units': shelf_units, 'tag': _money(shelf_tag)},
        'estimated': {'units': _units(est_units), 'tag': _money(est_tag)},
        'expected_lost': {'units': _units(shelf_units - est_units), 'tag': _money(shelf_tag - est_tag)},
        'bands': [
            {
                'key': key, 'label': label, 'units': bands[key]['units'], 'tag': _money(bands[key]['tag']),
                'est_units': _units(bands[key]['est_units']), 'est_tag': _money(bands[key]['est_tag']),
            }
            for key, label in BANDS
        ],
        'by_location': {
            loc: {'units': b['units'], 'tag': _money(b['tag']), 'est_units': _units(b['est_units']),
                  'est_tag': _money(b['est_tag'])}
            for loc, b in sorted(by_location.items())
        },
        'undated_units': undated,
        # Expected in the last closed count, not found, no mark, not seen since ("Shrink (general)" in the count).
        'last_count_not_found': _not_found_out(not_found),
    }
    if with_items:
        listed.sort(key=lambda r: -r['days_unseen'])
        payload['items'] = listed[:limit]
        payload['items_total'] = len(listed)
    return payload


def _not_found_out(not_found: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    info = last_count_info()
    if info is None:
        return None
    return {
        'count': info['name'],
        'day': info['day'].isoformat() if info['day'] else None,
        'units': sum(b['units'] for b in not_found.values()),
        'tag': _money(sum((b['tag'] for b in not_found.values()), Decimal('0'))),
        'by_band': {key: {'units': b['units'], 'tag': _money(b['tag'])} for key, b in not_found.items()},
    }
