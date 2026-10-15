"""
The Thrift+ reward engine (thrift_plus_rewards Phase 2): what a member takes off the tag price,
per floor item. A guest always pays the tag.

The rules (owner's design, 2026-09-25; the rate and the launch start since 2026-10-13):
- **The saved setting** (``thrift_plus_engine``, saved from the Calculator tab, owner 2026-10-13): the % of the tag
  a day, the wait, and the launch start for stock already on the floor. Unsaved, the engine runs as it did before:
  the tag ÷ 90 a day after 7 days, and the ``thrift_plus_rewards_start`` setting.
- **Day 1** is the day the item reached the floor (``listed_at``, else ``checked_in_at``, else
  ``created_at``). **Launch start:** stock on the floor before launch counts as if it had been there only a share of
  its real age (30%), at most so many days (45), on launch day; from launch it ages a day a day. Without a saved
  launch, day 1 is never before the ``thrift_plus_rewards_start`` setting.
- **Days 1 to 7** (the wait): no reward. **Then** it grows by the % a day of the starting price (0.75%).
- **Before launch** the nightly run computes launch day (``default_day``), so staff see launch-day ThriftBucks.
- **Pricing families** (thrift_plus_families, owner 2026-10-13): a product with 2+ floor units is a possible family
  (``families.flag_identical``, run first each night). A **possible** family (or one sent to **exit**) holds: a unit
  keeps the ThriftBucks of its first night and grows no more. An **approved** family prices its units together: one
  share of each tag (``RewardFamily.pct``), rising ``family_rise_pct`` (0.25%) a night while the family sells slower
  than its target, holding at or above it; a unit never goes down. The family's sales are estimated conservatively, as
  if one more sold now: (sold in the window + 1) ÷ the window's days, over the family's age (7 to 90 days). **Not a
  family**: each unit grows on its own again, from the ThriftBucks it has.
- **The floor:** a member never pays less than the floor share of the tag (the
  ``thrift_plus_floor_share`` setting, 10%: owner, 2026-09-25). Cost plays no part: the allocated
  cost is too rough an estimate. The reward stops there (``capped``). A reward is never more than
  the tag, so banked rewards can never exceed what a member spent. An item with no tag price gets
  none (``no_room``).
- **Pacing:** units of one product (bulk), and products in one ``RewardFamily``, pace by
  sell-through:
  - the required rate is units left ÷ days left to day 90 (counted from the oldest unit);
  - the actual rate is the family's units sold in the last 14 days, per day.

  On or ahead of pace the reward holds (``paused``); behind pace it grows. A family's last unit
  climbs on its own, and so does a unit whose scans-to-adds lags its family's (once the scanner
  app reports scans).
- **Never decreases; overnight only.** ``recompute(day)`` steps each item once per day and skips
  items already computed for that day. Nights the job missed count as growth days; only a night
  that saw the family on pace holds. The one way a reward goes down is a retag that leaves it
  above the new cap, and that is logged.
- **Day 90:** the item goes on the exit list (bundle, dollar bin, donate or scrap). Its reward
  keeps its rules.
- **Consignment** items are excluded: their price is the consignor's.
- **Logged:** every change of status or reason is a ``RewardEvent``, with the pace numbers behind
  it. Growth inside one status is not repeated, because the reward on any day follows from
  ``grow_days``.
- **Never published.** Customers only ever see the ThriftBucks an item collects ("+13.00 ThriftBucks").

``plan(day)`` computes without writing: the dry run on the Rewards tab. ``recompute(day)``
writes it (the nightly ``recompute_rewards`` command). The math is plain Python over
``values()``: no model and no LLM.
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import ROUND_DOWN, ROUND_UP, Decimal, InvalidOperation
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import FamilyLink, ItemReward, RewardEvent, RewardFamily, RewardRun

logger = logging.getLogger(__name__)

WAIT_DAYS = 7
HORIZON = 90
PACE_WINDOW = 14
SCAN_MIN = 5  # a unit's scans before its scans-to-adds is compared with its family's
SCAN_LAG = Decimal('0.5')  # a unit adding at under half its family's rate climbs on its own
CENT = Decimal('0.01')
ZERO = Decimal('0')
CHUNK = 2000

FLOOR_SHARE_KEY = 'thrift_plus_floor_share'
START_KEY = 'thrift_plus_rewards_start'
ENGINE_KEY = 'thrift_plus_engine'
DEFAULT_FLOOR_SHARE = Decimal('0.10')

PRICE_BANDS = [(ZERO, Decimal('10'), 'Under $10'), (Decimal('10'), Decimal('30'), '$10 to $30'),
               (Decimal('30'), Decimal('100'), '$30 to $100'), (Decimal('100'), None, '$100 and up')]


# ── Settings ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Rules:
    floor_share: Decimal = DEFAULT_FLOOR_SHARE
    start: date | None = None
    pct_per_day: Decimal | None = None  # % of the tag a day after the wait; None = the tag ÷ 90 (before a save)
    wait_days: int = WAIT_DAYS
    launch: date | None = None  # the launch start (with age_factor and max_age); None = the old start setting
    age_factor: Decimal = Decimal(1)
    max_age: int | None = None
    saved: bool = False
    family_rise_pct: Decimal = Decimal('0.25')  # an approved family behind its target: % of the tag a night

    def first_day(self, floor_date: date) -> date:
        """Day 1 for an item: its floor date, or for stock on the floor before launch, launch day less a share of
        its real age (at most ``max_age`` days), as in the calculator's launch start."""
        if self.launch is not None:
            if floor_date >= self.launch:
                return floor_date
            age = (self.launch - floor_date).days + 1
            if age > 1 and self.age_factor != 1:
                age = max(1, int((Decimal(age) * self.age_factor).to_integral_value()))
            if self.max_age:
                age = min(age, self.max_age)
            return self.launch - timedelta(days=age - 1)
        return max(floor_date, self.start) if self.start else floor_date

    @property
    def pct(self) -> Decimal:
        """% of the tag a day (for display)."""
        return self.pct_per_day if self.pct_per_day is not None else Decimal(100) / HORIZON

    def grown(self, price: Decimal, grow_days: int) -> Decimal:
        """The reward after ``grow_days`` growth days, exact before rounding down to the cent."""
        if self.pct_per_day is None:
            return (price * grow_days / HORIZON).quantize(CENT, rounding=ROUND_DOWN)
        return (price * grow_days * self.pct_per_day / 100).quantize(CENT, rounding=ROUND_DOWN)

    def as_dict(self) -> dict:
        return {
            'floor_share': str(self.floor_share), 'start': self.start.isoformat() if self.start else None,
            'pct_per_day': str(self.pct.quantize(Decimal('0.001'))), 'wait_days': self.wait_days,
            'launch': self.launch.isoformat() if self.launch else None, 'age_factor': str(self.age_factor),
            'max_age': self.max_age, 'saved': self.saved, 'horizon': HORIZON, 'pace_window': PACE_WINDOW,
        }


def default_day(rules_: 'Rules', *, tomorrow: bool = False) -> date:
    """The day a run computes: today (or tomorrow for the dry run), but launch day while launch is ahead, so staff
    testing before launch see what members will see on launch day."""
    day = timezone.localdate() + timedelta(days=1 if tomorrow else 0)
    return max(day, rules_.launch) if rules_.launch else day


def saved_engine() -> dict | None:
    from apps.core.models import AppSetting

    value = AppSetting.objects.filter(key=ENGINE_KEY).values_list('value', flat=True).first()
    return value if isinstance(value, dict) else None


def save_engine(values: dict, *, user) -> dict:
    """Save the calculator's setting for the engine (owner 2026-10-13), and the floor share with it."""
    from apps.core.models import AppSetting, AppSettingHistory

    def num(key, lo, hi, cast=Decimal):
        try:
            value = cast(str(values.get(key)))
        except (InvalidOperation, ValueError, TypeError) as exc:
            raise ValueError(f'{key} must be a number') from exc
        if not lo <= value <= hi:
            raise ValueError(f'{key} must be {lo} to {hi}')
        return value

    try:
        launch = date.fromisoformat(str(values.get('launch')))
    except ValueError as exc:
        raise ValueError('launch must be a date (YYYY-MM-DD)') from exc
    max_age = values.get('max_age')
    setting = {
        'pct_per_day': str(num('pct_per_day', Decimal('0.01'), Decimal('20'))),
        'wait_days': int(num('wait_days', 0, 60, int)),
        'launch': launch.isoformat(),
        'age_factor': str(num('age_factor', Decimal('0'), Decimal('1'))),
        'max_age': None if max_age in (None, '') else int(num('max_age', 1, 3650, int)),
        'saved_at': timezone.now().isoformat(),
        'saved_by': getattr(user, 'email', '') or '',
    }
    floor_share = str(num('floor_share', Decimal('0'), Decimal('0.95')))
    for key, new in ((ENGINE_KEY, setting), (FLOOR_SHARE_KEY, floor_share)):
        row = AppSetting.objects.filter(key=key).first()
        old = row.value if row else None
        AppSetting.objects.update_or_create(key=key, defaults={'value': new, 'updated_by': user})
        AppSettingHistory.objects.create(key=key, old_value=old, new_value=new, changed_by=user)
    return setting


def rules() -> Rules:
    """The owner settings, read fresh; a bad value falls back to the default and is logged."""
    from apps.core.models import AppSetting

    values = dict(AppSetting.objects.filter(key__in=[FLOOR_SHARE_KEY, START_KEY, ENGINE_KEY]).values_list('key', 'value'))
    share = DEFAULT_FLOOR_SHARE
    try:
        raw = values.get(FLOOR_SHARE_KEY)
        if raw not in (None, ''):
            share = Decimal(str(raw))
        if not ZERO <= share <= 1:
            raise InvalidOperation
    except (InvalidOperation, ValueError):
        logger.warning('%s is not a share between 0 and 1: %r', FLOOR_SHARE_KEY, values.get(FLOOR_SHARE_KEY))
        share = DEFAULT_FLOOR_SHARE
    start = None
    raw_start = str(values.get(START_KEY) or '').strip()
    if raw_start:
        try:
            start = date.fromisoformat(raw_start)
        except ValueError:
            logger.warning('%s is not a date: %r', START_KEY, raw_start)
    engine = values.get(ENGINE_KEY)
    if isinstance(engine, dict):
        try:
            return Rules(
                floor_share=share, start=start, pct_per_day=Decimal(str(engine['pct_per_day'])),
                wait_days=int(engine['wait_days']), launch=date.fromisoformat(engine['launch']),
                age_factor=Decimal(str(engine['age_factor'])),
                max_age=int(engine['max_age']) if engine.get('max_age') else None, saved=True,
                family_rise_pct=Decimal(str(engine.get('family_rise_pct') or '0.25')),
            )
        except (KeyError, InvalidOperation, ValueError, TypeError):
            logger.warning('%s is not a usable engine setting: %r', ENGINE_KEY, engine)
    return Rules(floor_share=share, start=start)


# ── The math (pure) ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Unit:
    """An on-floor item, as the engine sees it."""

    item_id: int
    product_id: int
    price: Decimal
    source: str
    floor_date: date


@dataclass(frozen=True)
class Prior:
    """The stored state a step starts from."""

    floor_date: date
    starting_price: Decimal
    grow_days: int
    reward: Decimal
    status: str
    reason: str
    day: int
    computed_on: date
    exit_on: date | None = None
    scans: int = 0
    adds: int = 0
    floor_price: Decimal = ZERO

    @classmethod
    def of(cls, s: ItemReward) -> 'Prior':
        return cls(
            floor_date=s.floor_date, starting_price=s.starting_price, grow_days=s.grow_days, reward=s.reward,
            status=s.status, reason=s.reason, day=s.day, computed_on=s.computed_on, exit_on=s.exit_on,
            scans=s.scans, adds=s.adds, floor_price=s.floor_price,
        )


@dataclass(frozen=True)
class Pace:
    """A family's sell-through against the pace it needs to clear by day 90."""

    units: int
    days_left: int
    sold_recent: int
    window: int
    scans: int = 0
    adds: int = 0

    @property
    def required(self) -> Decimal:
        return Decimal(self.units) / Decimal(max(1, self.days_left))

    @property
    def actual(self) -> Decimal:
        return Decimal(self.sold_recent) / Decimal(max(1, self.window))

    @property
    def paced(self) -> bool:
        """Only a family with two or more units on the floor is paced."""
        return self.units >= 2

    @property
    def on_pace(self) -> bool:
        return self.paced and self.actual >= self.required

    def as_dict(self) -> dict:
        return {
            'units': self.units, 'days_left': self.days_left, 'sold_recent': self.sold_recent, 'window': self.window,
            'required_per_day': str(self.required.quantize(Decimal('0.001'))),
            'actual_per_day': str(self.actual.quantize(Decimal('0.001'))),
        }


@dataclass(frozen=True)
class FamilyState:
    """A pricing family as tonight's step sees it (thrift_plus_families)."""

    id: int
    status: str
    pct: Decimal = ZERO  # approved: tonight's share of each tag
    behind: bool = False  # approved: selling slower than the target
    target_per_90: int | None = None
    est_per_90: Decimal | None = None
    moved: bool = False  # approved: pct rose tonight

    def as_dict(self) -> dict:
        return {'id': self.id, 'status': self.status, 'pct': str(self.pct), 'behind': self.behind,
                'target_per_90': self.target_per_90,
                'est_per_90': str(self.est_per_90.quantize(Decimal('0.1'))) if self.est_per_90 is not None else None}


def conservative_per_90(sold: int, days: int) -> Decimal:
    """Sales per 90 days, as if one more sold now (owner 2026-10-13): one lucky sale isn't a fast seller, and no
    sales yet still gives a small, honest number."""
    return Decimal(sold + 1) / Decimal(max(1, days)) * 90


@dataclass
class Outcome:
    item_id: int
    product_id: int
    family_key: str
    floor_date: date
    price: Decimal
    floor_price: Decimal
    grow_days: int
    reward: Decimal
    status: str
    reason: str
    day: int
    exit_on: date | None
    fresh: bool = True  # False when the item was already computed for this day
    new: bool = False
    event: dict | None = None  # {'reason': ..., 'detail': {...}} when the change is logged

    @property
    def member_price(self) -> Decimal:
        return self.price - self.reward


def floor_for(price: Decimal, share: Decimal) -> Decimal:
    """The lowest a member ever pays: the floor share of the tag, rounded up to the cent, and
    never below 0. So the reward (the tag less this) is never more than the tag itself."""
    return max(ZERO, (price * share).quantize(CENT, rounding=ROUND_UP))


def first_day(floor_date: date, rules_: Rules) -> date:
    return rules_.first_day(floor_date)


def day_number(floor_date: date, on: date, rules_: Rules) -> int:
    """Day 1 is the first day on the floor (the launch start for older stock)."""
    return (on - first_day(floor_date, rules_)).days + 1


def _lags(prior: Prior | None, pace: Pace) -> bool:
    """A unit that shoppers scan but don't add, well below its family's rate, climbs alone."""
    if prior is None or prior.scans < SCAN_MIN or not pace.scans or not pace.adds:
        return False
    return Decimal(prior.adds) / prior.scans < SCAN_LAG * Decimal(pace.adds) / pace.scans


def step(unit: Unit, prior: Prior | None, on: date, pace: Pace | None, rules_: Rules, family_key: str,
         family: FamilyState | None = None) -> Outcome:
    """One item, one night. Deterministic: the same inputs always give the same reward."""
    floor_date = prior.floor_date if prior else unit.floor_date
    n = day_number(floor_date, on, rules_)
    price = unit.price
    prev_reward = prior.reward if prior else ZERO
    grow_days = prior.grow_days if prior else 0
    exit_on = prior.exit_on if prior else None
    if exit_on is None and n >= HORIZON:
        exit_on = first_day(floor_date, rules_) + timedelta(days=HORIZON - 1)
    detail: dict = {'day': n}

    if unit.source == 'consignment':
        floor_price, reward, status, reason = price, ZERO, ItemReward.STATUS_EXCLUDED, 'consignment'
    elif family is not None and family.status == RewardFamily.STATUS_APPROVED:
        # An approved family: one share of each tag for all its units; a unit never goes down.
        floor_price = floor_for(price, rules_.floor_share)
        cap = max(ZERO, price - floor_price)
        reward = min(cap, max(prev_reward, (price * family.pct).quantize(CENT, rounding=ROUND_DOWN)))
        if cap <= 0:
            status, reason = ItemReward.STATUS_NO_ROOM, 'no_room'
        elif reward >= cap:
            status, reason = ItemReward.STATUS_CAPPED, 'reached_floor'
        elif family.behind:
            status, reason = ItemReward.STATUS_CLIMBING, 'family_behind'
        else:
            status, reason = ItemReward.STATUS_PAUSED, 'family_on_target'
        detail['family'] = family.as_dict()
    elif family is not None and family.status in (RewardFamily.STATUS_POSSIBLE, RewardFamily.STATUS_EXIT):
        # A possible family (or one going to exit) holds: the first night counts its start, then no more growth.
        floor_price = floor_for(price, rules_.floor_share)
        cap = max(ZERO, price - floor_price)
        if prior is None:
            grow_days += max(0, n - rules_.wait_days)
        reward = min(cap, max(prev_reward, rules_.grown(price, grow_days)))
        if cap <= 0:
            status, reason = ItemReward.STATUS_NO_ROOM, 'no_room'
        elif reward >= cap:
            status, reason = ItemReward.STATUS_CAPPED, 'reached_floor'
        else:
            status = ItemReward.STATUS_PAUSED
            reason = 'family_possible' if family.status == RewardFamily.STATUS_POSSIBLE else 'family_exit'
        detail['family'] = family.as_dict()
    else:
        floor_price = floor_for(price, rules_.floor_share)
        cap = max(ZERO, price - floor_price)
        new_days = max(0, n - max(prior.day if prior else 0, rules_.wait_days))
        held = lag = False
        if new_days and pace is not None and pace.on_pace:
            lag = _lags(prior, pace)
            if not lag:
                held = True
                new_days -= 1  # tonight holds; missed nights before it still count as growth
        grow_days += new_days
        grown = rules_.grown(price, grow_days)
        reward = min(cap, max(prev_reward, grown))
        if cap <= 0:
            status, reason = ItemReward.STATUS_NO_ROOM, 'no_room'
        elif n <= rules_.wait_days:
            status, reason = ItemReward.STATUS_WAITING, 'days_1_to_7'
        elif reward >= cap:
            status, reason = ItemReward.STATUS_CAPPED, 'reached_floor'
        elif held:
            status, reason = ItemReward.STATUS_PAUSED, 'family_on_pace'
        elif lag:
            status, reason = ItemReward.STATUS_CLIMBING, 'scans_lag'
        elif pace is not None and pace.paced:
            status, reason = ItemReward.STATUS_CLIMBING, 'behind_pace'
        else:
            status, reason = ItemReward.STATUS_CLIMBING, 'one_unit'
        if pace is not None and pace.paced:
            detail['pace'] = pace.as_dict()

    event = None
    retag = prior is not None and prior.starting_price != price
    newly_exit = exit_on is not None and (prior is None or prior.exit_on is None)
    if prior is None or retag or newly_exit or status != prior.status or reason != prior.reason:
        if prior is None:
            code = 'start'
        elif prior.status == ItemReward.STATUS_CLOSED:
            code = 'back_on_floor'
        elif retag:
            code = 'retag'
            detail['retag'] = {'from': str(prior.starting_price), 'to': str(price), 'reward_before': str(prev_reward)}
        elif newly_exit:
            code = 'exit_list'
        else:
            code = reason
        detail['why'] = reason
        if prior is not None:
            detail['from'] = prior.status
        event = {'reason': code, 'detail': detail}

    return Outcome(
        item_id=unit.item_id, product_id=unit.product_id, family_key=family_key, floor_date=floor_date, price=price,
        floor_price=floor_price, grow_days=grow_days, reward=reward, status=status, reason=reason, day=n,
        exit_on=exit_on, new=prior is None, event=event,
    )


# ── Loading ────────────────────────────────────────────────────────────────────

def _local_date(dt: datetime | None) -> date | None:
    return timezone.localdate(dt) if dt else None


def load_units() -> list[Unit]:
    from apps.inventory.models import Item

    rows = Item.objects.filter(status='on_shelf').values_list(
        'pk', 'product_id', 'price', 'source', 'listed_at', 'checked_in_at', 'created_at',
    )
    return [
        Unit(item_id=pk, product_id=product_id, price=price or ZERO, source=source,
             floor_date=_local_date(listed or checked or created))
        for pk, product_id, price, source, listed, checked, created in rows.iterator(chunk_size=5000)
    ]


def family_keys(product_ids: Iterable[int]) -> dict[int, str]:
    """``f<family>`` for products in a family, ``p<product>`` for a product alone (bulk)."""
    ids = set(product_ids)
    fam: dict[int, int] = {}
    id_list = list(ids)
    for i in range(0, len(id_list), 5000):
        fam.update(FamilyLink.objects.filter(product_id__in=id_list[i:i + 5000], family__isnull=False)
                   .values_list('product_id', 'family_id'))
    return {pid: (f'f{fam[pid]}' if pid in fam else f'p{pid}') for pid in ids}


def _day_start(on: date) -> datetime:
    return timezone.make_aware(datetime.combine(on, time.min), timezone.get_current_timezone())


def paces(units: list[Unit], keys: dict[int, str], priors: dict[int, Prior], on: date, rules_: Rules) -> dict[str, Pace]:
    """Each family's pace on ``on``: units left, days left to day 90, recent sales, scans and adds."""
    from apps.inventory.models import Item

    groups: dict[str, list[Unit]] = defaultdict(list)
    for u in units:
        if u.source != 'consignment':
            groups[keys[u.product_id]].append(u)
    if not groups:
        return {}
    oldest_day = {}
    for key, us in groups.items():
        oldest_day[key] = max(
            day_number(priors[u.item_id].floor_date if u.item_id in priors else u.floor_date, on, rules_) for u in us
        )
    sold = list(
        Item.objects.filter(status='sold', sold_at__gte=_day_start(on - timedelta(days=PACE_WINDOW)), sold_at__lt=_day_start(on))
        .values_list('product_id', 'sold_at')
    )
    sold_keys = family_keys({pid for pid, _ in sold} - set(keys))
    sold_keys.update(keys)
    sold_by_key: dict[str, list[date]] = defaultdict(list)
    for pid, sold_at in sold:
        sold_by_key[sold_keys[pid]].append(timezone.localdate(sold_at))
    out = {}
    for key, us in groups.items():
        fday = oldest_day[key]
        window = max(1, min(PACE_WINDOW, fday - 1))
        since = on - timedelta(days=window)
        scans = sum(priors[u.item_id].scans for u in us if u.item_id in priors)
        adds = sum(priors[u.item_id].adds for u in us if u.item_id in priors)
        out[key] = Pace(
            units=len(us), days_left=max(1, HORIZON - fday + 1),
            sold_recent=sum(1 for d in sold_by_key.get(key, ()) if d >= since), window=window, scans=scans, adds=adds,
        )
    return out


# ── Plan (dry run) and recompute (write) ───────────────────────────────────────

def family_states(units: list[Unit], keys: dict[int, str], priors: dict[int, Prior], on: date, rules_: Rules) -> dict[str, FamilyState]:
    """Each pricing family's state for ``on``: held, or (approved) tonight's share of the tag and whether it sells
    slower than its target. Computes only; ``recompute`` stores an approved family's new share."""
    from apps.inventory.models import Item

    fids = {int(k[1:]) for k in keys.values() if k.startswith('f')}
    if not fids:
        return {}
    families = {f.pk: f for f in RewardFamily.objects.filter(pk__in=fids)}
    out: dict[str, FamilyState] = {}
    approved = {fid for fid, f in families.items() if f.status == RewardFamily.STATUS_APPROVED}
    by_family: dict[int, list[Unit]] = defaultdict(list)
    for u in units:
        k = keys[u.product_id]
        if k.startswith('f') and u.source != 'consignment':
            by_family[int(k[1:])].append(u)
    sold_by_family: dict[int, list[date]] = defaultdict(list)
    if approved:
        products = {pid for pid, k in keys.items() if k.startswith('f') and int(k[1:]) in approved}
        family_of = {pid: int(keys[pid][1:]) for pid in products}
        for pid, sold_at in (Item.objects.filter(status='sold', product_id__in=list(products),
                                                 sold_at__gte=_day_start(on - timedelta(days=HORIZON)), sold_at__lt=_day_start(on))
                             .values_list('product_id', 'sold_at')):
            sold_by_family[family_of[pid]].append(timezone.localdate(sold_at))
    cap_share = max(ZERO, 1 - rules_.floor_share)
    rise = rules_.family_rise_pct / 100
    for fid, fam in families.items():
        key = f'f{fid}'
        if fid not in approved:
            out[key] = FamilyState(id=fid, status=fam.status)
            continue
        us = by_family.get(fid, [])
        oldest = max((day_number(priors[u.item_id].floor_date if u.item_id in priors else u.floor_date, on, rules_) for u in us),
                     default=1)
        window = max(7, min(HORIZON, oldest - 1))
        since = on - timedelta(days=window)
        sold = sum(1 for d in sold_by_family.get(fid, ()) if d >= since)
        est = conservative_per_90(sold, window)
        target = fam.target_per_90 or max(1, len(us))
        behind = est < target
        pct = fam.pct or ZERO
        moved = False
        if fam.pct_on is None or fam.pct_on < on:
            if behind and pct < cap_share:
                pct = min(cap_share, pct + rise)
                moved = True
        out[key] = FamilyState(id=fid, status=fam.status, pct=pct, behind=behind, target_per_90=target, est_per_90=est, moved=moved)
    return out


@dataclass
class Plan:
    day: date
    rules: Rules
    outcomes: list[Outcome]
    paces: dict[str, Pace]
    to_close: list[dict] = field(default_factory=list)
    families: dict[str, FamilyState] = field(default_factory=dict)


def plan(on: date | None = None, rules_: Rules | None = None) -> Plan:
    """Every floor item's reward for ``on`` (default tomorrow, or launch day before launch), computed without
    writing."""
    rules_ = rules_ or rules()
    on = on or default_day(rules_, tomorrow=True)
    units = load_units()
    states = {s.item_id: s for s in ItemReward.objects.filter(item__status='on_shelf').iterator(chunk_size=5000)}
    priors = {pk: Prior.of(s) for pk, s in states.items()}
    keys = family_keys(u.product_id for u in units)
    family_pace = paces(units, keys, priors, on, rules_)
    fstates = family_states(units, keys, priors, on, rules_)
    outcomes = []
    for u in units:
        prior = priors.get(u.item_id)
        if prior is not None and prior.computed_on >= on:
            s = states[u.item_id]
            outcomes.append(Outcome(
                item_id=u.item_id, product_id=u.product_id, family_key=s.family_key, floor_date=s.floor_date,
                price=u.price, floor_price=s.floor_price, grow_days=s.grow_days, reward=s.reward, status=s.status,
                reason=s.reason, day=s.day, exit_on=s.exit_on, fresh=False,
            ))
            continue
        key = keys[u.product_id]
        fam = fstates.get(key)
        # Not a family: each unit on its own, no pacing (owner 2026-10-13).
        pace = None if fam is not None and fam.status == RewardFamily.STATUS_NOT_FAMILY else family_pace.get(key)
        outcomes.append(step(u, prior, on, pace, rules_, key, fam))
    to_close = list(
        ItemReward.objects.exclude(status=ItemReward.STATUS_CLOSED).exclude(item__status='on_shelf')
        .values('item_id', 'reward', 'status', 'day', 'item__status', 'item__sold_at')
    )
    return Plan(day=on, rules=rules_, outcomes=outcomes, paces=family_pace, to_close=to_close, families=fstates)


STATE_FIELDS = [
    'family_key', 'starting_price', 'floor_price', 'grow_days', 'reward', 'status', 'reason', 'day', 'computed_on',
    'exit_on', 'closed_at', 'closed_status', 'reward_at_close', 'updated_at',
]


def recompute(on: date | None = None) -> RewardRun:
    """Tonight's step for every floor item, written in chunks. Safe to re-run: items already
    computed for ``on`` are skipped, so a re-run changes nothing. It starts by expiring kept ThriftBucks past their
    use-by date (B5; ``ledger.expire_lots``, safe to re-run too)."""
    on = on or default_day(rules())
    run = RewardRun.objects.create(day=on)
    expired: dict = {}
    try:
        from apps.thriftplus.services import ledger

        expired = ledger.expire_lots(timezone.localdate())
    except Exception:  # never stops the nightly run
        logger.exception('expiring ThriftBucks failed')
    try:
        from apps.thriftplus.services import families

        try:
            flagged = families.flag_identical()
        except Exception:  # never stops the nightly run
            logger.exception('flagging possible families failed')
            flagged = {}
        p = plan(on)
        now = timezone.now()
        fresh = [o for o in p.outcomes if o.fresh]
        for i in range(0, len(fresh), CHUNK):
            _write(fresh[i:i + CHUNK], run, on, now)
        closed = _close(p.to_close, run, on, now)
        _store_family_pcts(p, on)
        run.counts = {**summary_counts(p), 'computed': len(fresh), 'closed': closed,
                      'families_flagged': flagged.get('new', 0), 'bucks_lots_expired': expired.get('lots', 0)}
    except Exception as exc:
        logger.exception('reward recompute for %s failed', on)
        run.error = str(exc)[:4000]
    run.finished_at = timezone.now()
    run.save(update_fields=['counts', 'error', 'finished_at'])
    return run


def _store_family_pcts(p: Plan, on: date) -> None:
    """An approved family's share for the night, stored once (a re-run never moves it twice)."""
    from django.db.models import Q

    for fs in p.families.values():
        if fs.status == RewardFamily.STATUS_APPROVED:
            RewardFamily.objects.filter(Q(pct_on__isnull=True) | Q(pct_on__lt=on), pk=fs.id).update(pct=fs.pct, pct_on=on)


def _write(chunk: list[Outcome], run: RewardRun, on: date, now: datetime) -> None:
    creates, updates, events = [], [], []
    for o in chunk:
        state = ItemReward(
            item_id=o.item_id, family_key=o.family_key, floor_date=o.floor_date, starting_price=o.price,
            floor_price=o.floor_price, grow_days=o.grow_days, reward=o.reward, status=o.status, reason=o.reason,
            day=o.day, computed_on=on, exit_on=o.exit_on, closed_at=None, closed_status='', reward_at_close=None,
            updated_at=now,
        )
        (creates if o.new else updates).append(state)
        if o.event:
            events.append((o.item_id, o))
    with transaction.atomic():
        ItemReward.objects.bulk_create(creates, batch_size=CHUNK)
        if updates:
            ItemReward.objects.bulk_update(updates, STATE_FIELDS, batch_size=CHUNK)
        RewardEvent.objects.bulk_create([
            RewardEvent(item_reward_id=item_id, run=run, on=on, day=o.day, reward=o.reward, status=o.status,
                        reason=o.event['reason'], detail=o.event['detail'])
            for item_id, o in events
        ], batch_size=CHUNK)


def _close(rows: list[dict], run: RewardRun, on: date, now: datetime) -> int:
    """Items that left the floor: the state closes with the reward they left at."""
    for i in range(0, len(rows), CHUNK):
        part = rows[i:i + CHUNK]
        with transaction.atomic():
            for r in part:
                ItemReward.objects.filter(pk=r['item_id']).update(
                    status=ItemReward.STATUS_CLOSED, reason=f"left_floor_{r['item__status']}",
                    closed_at=r['item__sold_at'] or now, closed_status=r['item__status'],
                    reward_at_close=r['reward'], computed_on=on, updated_at=now,
                )
            RewardEvent.objects.bulk_create([
                RewardEvent(item_reward_id=r['item_id'], run=run, on=on, day=r['day'], reward=r['reward'],
                            status=ItemReward.STATUS_CLOSED, reason='closed',
                            detail={'item_status': r['item__status'], 'from': r['status']})
                for r in part
            ], batch_size=CHUNK)
    return len(rows)


# ── What the register reads (Phase 3) ──────────────────────────────────────────

def member_price(item) -> tuple[Decimal, Decimal]:
    """(reward, member price) for an item right now. The reward is last night's, but never takes a
    member below the floor of today's tag (a retag since last night is honoured at once)."""
    price = item.price or ZERO
    last_night = ItemReward.objects.filter(item_id=item.pk).exclude(
        status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED],
    ).values_list('reward', flat=True).first()
    if not last_night or item.source == 'consignment':
        return ZERO, price
    reward = max(ZERO, min(last_night, price - floor_for(price, rules().floor_share)))
    return reward, price - reward


# ── The dry-run report ─────────────────────────────────────────────────────────

def summary_counts(p: Plan) -> dict:
    by_status = Counter(o.status for o in p.outcomes)
    rewarded = [o for o in p.outcomes if o.reward > 0]
    paced = [x for x in p.paces.values() if x.paced]
    return {
        'units': len(p.outcomes),
        'with_reward': len(rewarded),
        'reward_total': str(sum((o.reward for o in rewarded), ZERO)),
        'by_status': dict(by_status),
        'exit_list': sum(1 for o in p.outcomes if o.exit_on and o.exit_on <= p.day),
        'paced_families': len(paced),
        'on_pace_families': sum(1 for x in paced if x.on_pace),
        'to_close': len(p.to_close),
    }


def _pct(part: Decimal, whole: Decimal) -> str | None:
    return str((part / whole * 100).quantize(Decimal('0.1'))) if whole else None


def summarize(p: Plan, *, top: int = 50) -> dict:
    """What members would pay on ``p.day``: totals, bands, the exit list and the biggest rewards."""
    from apps.inventory.models import Item

    outcomes = p.outcomes
    tag_total = sum((o.price for o in outcomes), ZERO)
    reward_total = sum((o.reward for o in outcomes), ZERO)
    rewarded_tag = sum((o.price for o in outcomes if o.reward > 0), ZERO)
    bands = []
    for lo, hi, label in PRICE_BANDS:
        rows = [o for o in outcomes if o.price >= lo and (hi is None or o.price < hi)]
        r_total = sum((o.reward for o in rows), ZERO)
        r_tag = sum((o.price for o in rows if o.reward > 0), ZERO)
        bands.append({
            'band': label, 'units': len(rows), 'with_reward': sum(1 for o in rows if o.reward > 0),
            'reward_total': str(r_total), 'pct_off_rewarded': _pct(r_total, r_tag),
        })
    exits = sorted((o for o in outcomes if o.exit_on and o.exit_on <= p.day), key=lambda o: -o.day)
    biggest = sorted((o for o in outcomes if o.reward > 0), key=lambda o: (-o.reward, o.item_id))[:top]
    ids = {o.item_id for o in exits[:top]} | {o.item_id for o in biggest}
    info = {r['pk']: r for r in Item.objects.filter(pk__in=ids).values('pk', 'sku', 'product__title')}

    def row(o: Outcome) -> dict:
        i = info.get(o.item_id, {})
        return {
            'item_id': o.item_id, 'sku': i.get('sku', ''), 'title': i.get('product__title', ''),
            'price': str(o.price), 'reward': str(o.reward), 'member_price': str(o.member_price),
            'floor_price': str(o.floor_price), 'day': o.day, 'status': o.status, 'reason': o.reason,
            'family': o.family_key,
        }

    counts = summary_counts(p)
    return {
        'day': p.day.isoformat(),
        'rules': p.rules.as_dict(),
        'totals': {
            'units': len(outcomes), 'with_reward': counts['with_reward'], 'tag_total': str(tag_total),
            'reward_total': str(reward_total), 'member_total': str(tag_total - reward_total),
            'pct_off_rewarded': _pct(reward_total, rewarded_tag),
        },
        'by_status': counts['by_status'],
        'bands': bands,
        'families': {'paced': counts['paced_families'], 'on_pace': counts['on_pace_families'],
                     'linked': len({o.family_key for o in outcomes if o.family_key.startswith('f')})},
        'exit_list': {'count': len(exits), 'tag_total': str(sum((o.price for o in exits), ZERO)),
                      'rows': [row(o) for o in exits[:top]]},
        'top': [row(o) for o in biggest],
        'to_close': len(p.to_close),
    }


def item_detail(item) -> dict:
    """One item's reward, how it got there and what a member pays now."""
    state = ItemReward.objects.filter(item_id=item.pk).first()
    reward, member = member_price(item)
    out = {
        'item_id': item.pk, 'sku': item.sku, 'title': item.product.title if item.product_id else '',
        'price': str(item.price), 'reward_now': str(reward), 'member_price_now': str(member), 'state': None, 'events': [],
    }
    if state:
        s = asdict(Prior.of(state))
        out['state'] = {k: (str(v) if isinstance(v, (Decimal, date)) else v) for k, v in s.items()}
        out['state'].update({'family_key': state.family_key, 'passes': state.passes, 'feedback': state.feedback,
                             'closed_status': state.closed_status})
        out['events'] = [
            {'on': e.on.isoformat(), 'day': e.day, 'reward': str(e.reward), 'status': e.status, 'reason': e.reason,
             'detail': e.detail}
            for e in state.events.all()[:100]
        ]
    return out
