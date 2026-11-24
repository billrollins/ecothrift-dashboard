"""Black Friday (owner 2026-11-24, Dash Update #220; rulebook F5): one price for everyone, from one method.

**The price** (Bill 11-24: "What would it have Normally been on saturday? Tag - Saturdays_Earned_ThriftBucks That is the
price"): our tag less the ThriftBucks the item would show on Saturday 11-28 under the normal rules, at full value.
``black_friday_price(item)`` is the one method: the register, both scanners, the website and the ad's export
(``manage.py black_friday_prices``) all get their number from it. Saturday's ThriftBucks are worked out by stepping the
nightly engine (``rewards.step``, the same rule the daily update uses) forward one night at a time from the item's last
computed state, its product's pace held as it is now; an item still waiting on Saturday has none, a markdown resets them
(P3a), consignment has none. The number is **frozen**: worked out once per item and saved (``pos.BlackFridayPrice``), so
it is the same in the ad, on the website, in the scanners and at the register on Friday and on Saturday. Never below the ThriftBucks floor (5% of
the tag). ``ten_percent_min`` (one switch, open with Bill): at least 10% off the tag.

Customers see the retail struck through (only a retail the tag may print) and this price: never our tag, never
ThriftBucks. Guests and members pay the same, no sign-in.

**A member may build instead** (``CartMember.builds``): pay our tag and keep today's ThriftBucks as on any day.

**Not Thrift+.** The register keeps the discount on the line as a Black Friday sale (``sale_label`` ``black_friday``,
``sale_off`` dollars), never as ThriftBucks redeemed: no ThriftBucks collected, nothing in the ledger, no Thrift+ revenue.

**When** (AppSetting ``pos.black_friday``, store time; missing or unreadable is off)::

    {"show_from": "2026-11-26T00:00", "start": "2026-11-27T00:00", "end": "2026-11-28T18:00",
     "bucks_on": "2026-11-28", "ten_percent_min": true}

``start`` to ``end``: the register charges the price (``is_on``). ``show_from`` to ``end``: the website's Black Friday
theme, and the website and scanners show the price as the Fri & Sat price (``shown``). ``bucks_on``: the day whose
ThriftBucks set the price (default: the end's day).
"""

from __future__ import annotations

import contextvars
import os
import threading
import time
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
WINDOW_KEY = 'pos.black_friday'
SALE_LABEL = 'black_friday'
NAME = 'Black Friday'
SHARE = Decimal('0.10')  # the 10% minimum, while ten_percent_min is on
CACHE_SECONDS = 600


# ── The setting ────────────────────────────────────────────────────────────────


def _when(raw) -> datetime | None:
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(str(raw).strip())
    except ValueError:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


def _raw() -> dict:
    """The setting as a dict ({} when missing or unreadable). Never raises.

    Local dev only (``DEBUG``): ``ECOTHRIFT_BLACK_FRIDAY="<start>/<end>"`` in one server's environment tries it there
    (shown from the start) without changing the shared local database's setting for every other server."""
    from django.conf import settings

    dev = os.environ.get('ECOTHRIFT_BLACK_FRIDAY', '') if settings.DEBUG else ''
    if '/' in dev:
        start, _, end = dev.partition('/')
        return {'start': start, 'end': end, 'bucks_on': os.environ.get('ECOTHRIFT_BLACK_FRIDAY_BUCKS_ON', '')}
    try:
        from apps.core.models import AppSetting

        raw = AppSetting.objects.filter(key=WINDOW_KEY).values_list('value', flat=True).first()
    except Exception:  # a settings read never stops a sale
        return {}
    return raw if isinstance(raw, dict) else {}


def window() -> tuple[datetime | None, datetime | None]:
    """(start, end) of the days the register charges the price; (None, None) when off."""
    raw = _raw()
    return _when(raw.get('start')), _when(raw.get('end'))


def is_on(now: datetime | None = None) -> bool:
    """The register charges the Black Friday price now."""
    start, end = window()
    return start is not None and end is not None and start <= (now or timezone.now()) < end


def charged(cart, now: datetime | None = None) -> bool:
    """This sale is charged the Black Friday price: the register's days, and on a training register as soon as the
    setting is there (until the end), so the owner can ring it up before Friday with nothing real sold."""
    if is_on(now):
        return True
    start, end = window()
    if start is None or end is None or (now or timezone.now()) >= end:
        return False
    from apps.thriftplus.services.register import is_training

    return is_training(cart)


def _priced_lines(cart) -> list:
    """The sale lines Black Friday prices: items and pink tags. Drinks stay at their price (owner's line: drinks are
    rung at the counter, never tagged)."""
    from apps.pos.models import CartLine

    return [l for l in CartLine.objects.filter(cart_id=cart.pk).select_related('item').order_by('pk')
            if l.is_sale_eligible() and not l.is_drink]


# The owner's Testing page (apps/core/services/site_testing.py): Black Friday shows for ONE request, on his own linked
# device. Set and cleared by PublicSiteMiddleware around that request; anything shared between visitors (the storefront
# snapshot, the per-worker caches) reads ``shown_live`` so a test can never leak into what customers see.
_forced: contextvars.ContextVar[bool] = contextvars.ContextVar('black_friday_forced', default=False)


def force():
    """Show Black Friday for the current request. Answers the token for :func:`unforce`."""
    return _forced.set(True)


def unforce(token) -> None:
    _forced.reset(token)


def forced() -> bool:
    return _forced.get()


def shown(now: datetime | None = None) -> bool:
    """The website's Black Friday theme is on, and the site and scanners show the Black Friday price (from
    ``show_from``, else the start, until the end); or this request is the owner's Black Friday test."""
    return _forced.get() or shown_live(now)


def shown_live(now: datetime | None = None) -> bool:
    """:func:`shown` for everyone: the setting alone, never a test."""
    raw = _raw()
    start, end = _when(raw.get('show_from')) or _when(raw.get('start')), _when(raw.get('end'))
    return start is not None and end is not None and start <= (now or timezone.now()) < end


def bucks_day() -> date | None:
    """The day whose ThriftBucks set the price (Saturday 11-28)."""
    raw = _raw()
    try:
        if raw.get('bucks_on'):
            return date.fromisoformat(str(raw['bucks_on'])[:10])
    except ValueError:
        pass
    end = _when(raw.get('end'))
    return timezone.localdate(end) if end else None


def ten_percent_min() -> bool:
    return _raw().get('ten_percent_min', True) is not False


def payload(now: datetime | None = None) -> dict:
    start, end = window()
    return {'on': is_on(now), 'shown': shown(now), 'name': NAME, 'start': start.isoformat() if start else None,
            'end': end.isoformat() if end else None}


# ── The price (pure) ───────────────────────────────────────────────────────────


def unit_off(tag: Decimal, bucks: Decimal, floor_share: Decimal, *, ten_min: bool = True) -> Decimal:
    """Dollars off one unit: its Saturday ThriftBucks (at least 10% of the tag while ``ten_min``), never taking it
    below the floor."""
    tag = Decimal(tag or 0)
    if tag <= 0:
        return ZERO
    from apps.thriftplus.services.rewards import floor_for

    off = Decimal(bucks or 0)
    if ten_min:
        off = max(off, (tag * SHARE).quantize(CENT, rounding=ROUND_HALF_UP))
    return min(off, max(ZERO, tag - floor_for(tag, floor_share)))


def unit_price(tag: Decimal, bucks: Decimal, floor_share: Decimal, *, ten_min: bool = True) -> Decimal:
    """The Black Friday price of one unit at ``tag`` with ``bucks`` Saturday ThriftBucks."""
    return (Decimal(tag or 0) - unit_off(tag, bucks, floor_share, ten_min=ten_min)).quantize(CENT)


def projected_bucks(unit, prior, pace, rules_, target: date, *, today: date) -> Decimal:
    """The ThriftBucks ``unit`` would show on ``target`` under the normal rules: the nightly ``rewards.step`` run one
    night at a time from its last computed state (``prior``, or none yet: from today), ``pace`` held."""
    from apps.thriftplus.services.rewards import Prior, marked_down, step

    # A closed state carries on (owner 2026-11-24: "sold is a system mistake ... their price is still normal"):
    # rewards.step keeps a closed item's floor date, ThriftBucks and days, so a "sold" item is priced as if it
    # never left the shelf.
    if prior is not None and prior.computed_on >= target:
        return ZERO if marked_down(unit.price, prior.starting_price) else prior.reward
    night = prior.computed_on + timedelta(days=1) if prior is not None else today
    key = f'p{unit.product_id}'
    reward = prior.reward if prior is not None else ZERO
    while night <= target:
        out = step(unit, prior, night, pace, rules_, key)
        reward = out.reward
        prior = Prior(floor_date=out.floor_date, starting_price=out.price, grow_days=out.grow_days, reward=out.reward,
                      status=out.status, reason=out.reason, day=out.day, computed_on=night, exit_on=out.exit_on,
                      scans=prior.scans if prior else 0, adds=prior.adds if prior else 0, floor_price=out.floor_price,
                      reset_on=out.reset_on)
        night += timedelta(days=1)
    return reward


# ── The one method (DB) ────────────────────────────────────────────────────────

_cache: dict = {}
_lock = threading.Lock()


def saturday_bucks(item_ids, *, target: date | None = None, tags: dict | None = None,
                   again: bool = False) -> dict[int, Decimal]:
    """{item id: the ThriftBucks it would show on ``target`` (Saturday)} for floor items (others: 0).

    **Frozen** (owner 2026-11-24: "the scanner and the POS all get to the same number"): the first time an item is
    asked for, its number is worked out and saved (``pos.BlackFridayPrice``); every later ask reads the saved number, so
    the ad, the website, the scanners and the register agree on Friday and on Saturday whatever sells in between. A new
    tag on the item (a markdown, a retag) works it out again; ``again`` works everything asked for out again.
    ``tags`` {item id: tag} prices a line whose tag was edited at the register (worked out, never saved)."""
    from apps.inventory.models import Item
    from apps.pos.models import BlackFridayPrice
    from apps.thriftplus.models import ItemReward
    from apps.thriftplus.services.rewards import Prior, Unit, _local_date, paces, rules

    target = target or bucks_day() or timezone.localdate()
    ids = [int(i) for i in item_ids if i]
    tags = tags or {}
    now = time.monotonic()
    out: dict[int, Decimal] = {}
    todo = []
    with _lock:
        for i in ids:
            hit = None if again else _cache.get((i, target, tags.get(i)))
            if hit is not None and now - hit[1] < CACHE_SECONDS:
                out[i] = hit[0]
            else:
                todo.append(i)
    if not todo:
        return out
    today = timezone.localdate()
    rows: dict[int, tuple] = {}
    frozen: dict[int, tuple] = {}
    for n in range(0, len(todo), 5000):
        chunk = todo[n:n + 5000]
        for row in Item.objects.filter(pk__in=chunk).values_list(
                'pk', 'product_id', 'price', 'source', 'status', 'listed_at', 'checked_in_at', 'created_at'):
            rows[row[0]] = row
        if not again:
            for item_id, tag, bucks in BlackFridayPrice.objects.filter(item_id__in=chunk, bucks_on=target).values_list(
                    'item_id', 'tag', 'bucks'):
                frozen[item_id] = (tag, bucks)
    live: dict[int, Unit] = {}
    own_tag: set[int] = set()
    for pk in todo:
        row = rows.get(pk)
        if row is None:
            out[pk] = ZERO
            continue
        _, product_id, price, source, status, listed, checked, created = row
        price = Decimal(price or 0).quantize(CENT)
        tag = Decimal(tags.get(pk, price) or 0).quantize(CENT)
        held = frozen.get(pk)
        if held is not None and held[0] == tag:
            out[pk] = held[1]
        else:
            live[pk] = Unit(item_id=pk, product_id=product_id, price=tag, source=source,
                            floor_date=_local_date(listed or checked or created) or today)
            if tag == price:
                own_tag.add(pk)
    if live:
        rules_ = rules()
        # Each product's pace as the nightly run would see it now (rulebook P6): all its floor units.
        pids = list({u.product_id for u in live.values()})
        floor = []
        for n in range(0, len(pids), 5000):
            floor += [Unit(item_id=pk, product_id=pid, price=price or ZERO, source=source,
                           floor_date=_local_date(listed or checked or created) or today)
                      for pk, pid, price, source, listed, checked, created in Item.objects.filter(
                          status='on_shelf', product_id__in=pids[n:n + 5000]).values_list(
                          'pk', 'product_id', 'price', 'source', 'listed_at', 'checked_in_at', 'created_at')]
        wanted = list({u.item_id for u in floor} | set(live))
        priors = {}
        for n in range(0, len(wanted), 5000):
            priors.update({r.item_id: Prior.of(r) for r in ItemReward.objects.filter(item_id__in=wanted[n:n + 5000])})
        supply = paces(floor, priors, today + timedelta(days=1), rules_)
        stamp = timezone.now()
        save = []
        for pk, unit in live.items():
            value = projected_bucks(unit, priors.get(pk), supply.get(f'p{unit.product_id}'), rules_, target, today=today)
            out[pk] = value
            if pk in own_tag:
                save.append(BlackFridayPrice(item_id=pk, tag=unit.price, bucks=value, bucks_on=target, frozen_at=stamp))
        for n in range(0, len(save), 2000):
            BlackFridayPrice.objects.bulk_create(save[n:n + 2000], update_conflicts=True, unique_fields=['item'],
                                                 update_fields=['tag', 'bucks', 'bucks_on', 'frozen_at'])
    with _lock:
        if len(_cache) > 200_000:
            _cache.clear()
        for pk in todo:
            _cache[(pk, target, tags.get(pk))] = (out[pk], now)
    return out


def freeze(*, target: date | None = None, again: bool = False) -> int:
    """Work out and save the number for every item on the floor now (``manage.py black_friday_prices --freeze``): run
    it once when the ad's prices are taken, so everything the ad shows is what the store charges. Items that reach the
    floor later are frozen the first time they are scanned or rung up. Answers how many floor items have a number."""
    from apps.inventory.models import Item

    ids = list(Item.objects.filter(status='on_shelf').values_list('pk', flat=True))
    return len(saturday_bucks(ids, target=target, again=again))


def prices_for(items, *, target: date | None = None) -> dict[int, Decimal]:
    """{item id: Black Friday price} for Item rows (their tag)."""
    from apps.thriftplus.services.rewards import rules

    items = list(items)
    bucks = saturday_bucks([i.pk for i in items], target=target)
    share, ten = rules().floor_share, ten_percent_min()
    return {i.pk: unit_price(i.price or ZERO, bucks.get(i.pk, ZERO), share, ten_min=ten) for i in items}


def black_friday_price(item, *, target: date | None = None) -> Decimal:
    """THE Black Friday price of one item: our tag less its Saturday ThriftBucks, never below the floor."""
    return prices_for([item], target=target)[item.pk]


def forget() -> None:
    with _lock:
        _cache.clear()


# ── The register ───────────────────────────────────────────────────────────────


def _line_bucks(lines: list) -> dict[int, Decimal]:
    """Per line: one unit's Saturday ThriftBucks at the line's tag (none for a pink tag or consignment)."""
    items = [l for l in lines if l.item_id and l.line_kind == 'item']
    by_item = saturday_bucks([l.item_id for l in items], tags={l.item_id: l.unit_price for l in items}) if items else {}
    return {l.pk: (by_item.get(l.item_id, ZERO) if l in items else ZERO) for l in lines}


def builds(cart) -> bool:
    from apps.thriftplus.models import CartMember

    return CartMember.objects.filter(cart_id=cart.pk, builds=True).exists()


def sync_cart(cart) -> None:
    """Called by ``Cart.recalculate`` before Thrift+: puts the Black Friday price on every sale line of an open sale
    while the register charges it (unless its member builds), and takes it off again outside it. Never raises."""
    import logging

    try:
        _sync(cart)
    except Exception:  # pragma: no cover - a failure leaves the lines as they were
        logging.getLogger(__name__).exception('black friday sync failed for cart %s', cart.pk)


def _sync(cart) -> None:
    from apps.pos.models import CartLine
    from apps.pos.services.sale_mode import apply_sale_to_line
    from apps.thriftplus.services.rewards import rules

    if cart.status != 'open':
        return
    on = charged(cart)
    lines = _priced_lines(cart)
    if not on and not any(l.sale_label == SALE_LABEL or l.sale_off for l in lines):
        return
    priced = on and not builds(cart)
    bucks = _line_bucks(lines) if priced else {}
    share, ten = rules().floor_share, ten_percent_min()
    for line in lines:
        if priced:
            qty = int(line.quantity or 1)
            off = (unit_off(line.unit_price or ZERO, bucks.get(line.pk, ZERO), share, ten_min=ten) * qty).quantize(CENT)
            if line.sale_label == CartLine.SALE_LABEL_SUMMER and line.sale_percent:
                summer = (line.list_total * line.sale_percent / Decimal('100')).quantize(CENT)
                if summer >= off:  # the cashier's line sale takes more off: it stays (no stacking, the bigger wins)
                    if line.sale_off:
                        line.sale_off = ZERO
                        line.save()
                    continue
            if (line.sale_label, line.sale_percent, line.sale_off) != (SALE_LABEL, ZERO, off):
                line.sale_label, line.sale_percent, line.sale_off = SALE_LABEL, ZERO, off
                line.save()
        elif line.sale_label == SALE_LABEL or line.sale_off:
            line.sale_label, line.sale_percent, line.sale_off = '', ZERO, ZERO
            apply_sale_to_line(line)  # the store sale, if one is on; saves the line


def build_offer(cart) -> dict:
    """What building would mean for a member on this sale: today's ThriftBucks kept, and the dollars more today."""
    from apps.pos.models import CartLine
    from apps.thriftplus.services.register import _rewards
    from apps.thriftplus.services.rewards import floor_for, rules

    lines = _priced_lines(cart)
    share, ten = rules().floor_share, ten_percent_min()
    items = [l for l in lines if l.item_id and l.line_kind == 'item']
    today = _rewards([l.item_id for l in items]) if items else {}
    keep = ZERO
    for l in items:
        tag = l.unit_price or ZERO
        if tag > 0 and getattr(l.item, 'source', '') != 'consignment':
            keep += min(today.get(l.item_id, ZERO), max(ZERO, tag - floor_for(tag, share))) * int(l.quantity or 1)
    sat = _line_bucks(lines)
    more = sum((unit_off(l.unit_price or ZERO, sat.get(l.pk, ZERO), share, ten_min=ten) * int(l.quantity or 1)
                for l in lines), ZERO)
    return {'bucks': str(keep.quantize(CENT)), 'more': str(more.quantize(CENT))}

