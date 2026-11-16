"""
Pricing standards (Dash Update #180, owner 2026-11-16; worked example: truck WLMRT-O8T-R7L5, PO 428).

**1. Commodity.** Something people buy again and again, new and sealed, with a store price they know (batteries,
diapers, wipes, laundry, cleaners, trash bags, motor oil, printer paper). One steady price: a share of retail, 65% for
a name brand, 55% for a store brand (Great Value, Equate, SuperTech, Parent's Choice). Never marked down; if it sits
60 days it was not a commodity (the "Sat 60 days" list asks).

- **The mark** is ``Product.price_standard`` (name_brand, store_brand, no, or '' not decided). Only a person sets it:
  at check-in (Confirm / Not one), on the truck preview (Apply confirms the matched products) or on the Sat 60 days
  list (Not a commodity).
- **The suggestion** (``suggest``) comes from the PO 428 keyword rules: the commodity words of classes S1 and S2 and
  the store brands. It is worked out each time and never stored.
- **The price** (``commodity_price``) is retail x the share, rounded the house way (``money``).

**2. Deep stock.** 24 or more of the exact same item (one product) on the shelf. It starts at its normal price. Every
two weeks: is it on pace to sell out within 8 weeks of its first day on the floor? If not, it is **due one step**:
the tag less 10% of retail, never below 30% of retail (45% for a commodity). Past the 8 weeks with units left it is
never on pace, so it steps every two weeks down to the floor.

- **The clock:** the lot starts on the earliest floor day of the units on the shelf now (``listed_at``, else
  ``checked_in_at``, else ``created_at``: the Thrift+ engine's day 1). A check falls ``check_days`` after the lot
  started or after its last step, whichever is later.
- **On pace:** units sold since the lot started ÷ the days since = the rate; on pace when the rate x the days left to
  the 8-week mark covers the units on the shelf.
- **Mixed:** a product whose shelf tags vary more than 2x holds unlike items under one name ("Amazing Clothing
  Item"), so it is not the exact same item: it is listed as mixed and never stepped.
- **Nothing changes by itself.** The list shows what is due; a manager ticks and approves; the step is written as a
  ``BulkPriceChange`` (rule ``standard: deep_stock``) with an ``ItemHistory`` line per item, so Inventory's Bulk work
  can undo it, and the page then reprints the price tags through the print server.

**Thrift+ (rulebook P3, P6; Mainline 2026-11-16, logged as guessed for the owner):** the commodity tag holds; a
member's ThriftBucks still grow as it sits (P6 holds them while a 10+ unit product sells within 90 days of supply).
A deep-stock step is a retag: the engine keeps the ThriftBucks a unit already has (capped at the new tag's cap), so a
member gets the step and their ThriftBucks. Accepted as "keep the inventory flowing".

**Owner settings** (AppSetting, Settings → Inventory; defaults below until the owner saves one): ``SETTINGS``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Iterable

from django.db import transaction
from django.db.models import Count
from django.db.models.functions import Coalesce
from django.utils import timezone

NAME_BRAND = 'name_brand'
STORE_BRAND = 'store_brand'
NOT_ONE = 'no'
COMMODITY = (NAME_BRAND, STORE_BRAND)
MARKS = ('', NAME_BRAND, STORE_BRAND, NOT_ONE)
DEEP_STOCK = 'deep_stock'
# Tags on one product varying more than this many times are unlike items under one name (the Thrift+ overstock
# list's "mixed" flag): never stepped; split the product in Inventory first.
MIXED_SPREAD = Decimal('2')

# key -> (default, low, high). Shares are 0-1; days and units whole numbers.
SETTINGS: dict[str, tuple[Any, Any, Any]] = {
    'pricing_commodity_name_share': (0.65, 0.05, 1.0),
    'pricing_commodity_store_share': (0.55, 0.05, 1.0),
    'pricing_commodity_sit_days': (60, 1, 3650),
    'pricing_deep_min_units': (24, 2, 100000),
    'pricing_deep_check_days': (14, 1, 365),
    'pricing_deep_sellout_days': (56, 1, 3650),
    'pricing_deep_step_share': (0.10, 0.01, 0.9),
    'pricing_deep_floor_share': (0.30, 0.0, 1.0),
    'pricing_deep_floor_commodity_share': (0.45, 0.0, 1.0),
}

LABELS = {
    NAME_BRAND: 'Commodity, name brand',
    STORE_BRAND: 'Commodity, store brand',
    NOT_ONE: 'Not a commodity',
    '': 'Not decided',
}


class StandardError(ValueError):
    """The request can't be done; the message is for the person."""


@dataclass(frozen=True)
class Standards:
    name_share: Decimal
    store_share: Decimal
    sit_days: int
    deep_min_units: int
    check_days: int
    sellout_days: int
    step_share: Decimal
    floor_share: Decimal
    floor_commodity_share: Decimal

    def share(self, mark: str) -> Decimal | None:
        return {NAME_BRAND: self.name_share, STORE_BRAND: self.store_share}.get(mark)

    def as_dict(self) -> dict[str, Any]:
        return {
            'name_share': float(self.name_share), 'store_share': float(self.store_share), 'sit_days': self.sit_days,
            'deep_min_units': self.deep_min_units, 'check_days': self.check_days, 'sellout_days': self.sellout_days,
            'step_share': float(self.step_share), 'floor_share': float(self.floor_share),
            'floor_commodity_share': float(self.floor_commodity_share),
        }


def standards() -> Standards:
    """The owner's numbers: a saved AppSetting, else the default; a value out of range falls back to the default."""
    from apps.core.models import AppSetting

    saved = dict(AppSetting.objects.filter(key__in=list(SETTINGS)).values_list('key', 'value'))
    v: dict[str, Any] = {}
    for key, (default, low, high) in SETTINGS.items():
        raw = saved.get(key, default)
        try:
            num = float(raw)
        except (TypeError, ValueError):
            num = float(default)
        if not (low <= num <= high):
            num = float(default)
        v[key] = num
    share = lambda k: Decimal(str(round(v[k], 4)))  # noqa: E731
    days = lambda k: int(round(v[k]))  # noqa: E731
    return Standards(
        name_share=share('pricing_commodity_name_share'), store_share=share('pricing_commodity_store_share'),
        sit_days=days('pricing_commodity_sit_days'), deep_min_units=days('pricing_deep_min_units'),
        check_days=days('pricing_deep_check_days'), sellout_days=days('pricing_deep_sellout_days'),
        step_share=share('pricing_deep_step_share'), floor_share=share('pricing_deep_floor_share'),
        floor_commodity_share=share('pricing_deep_floor_commodity_share'),
    )


# -- money ------------------------------------------------------------------------------------------------------
def _unit(retail: Decimal, price: Decimal) -> Decimal:
    """The house rounding step (PO 428): retail under $1 -> 25 cents; a price under $10 -> 50 cents; else $1."""
    if retail < 1:
        return Decimal('0.25')
    if price < 10:
        return Decimal('0.50')
    return Decimal('1')


def money(price: Decimal, retail: Decimal) -> Decimal:
    """Round a price the house way, never below the smallest step."""
    unit = _unit(retail, price)
    out = (price / unit).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * unit
    return max(out, unit).quantize(Decimal('0.01'))


def money_up(price: Decimal, retail: Decimal) -> Decimal:
    """Round up to the house step (a floor is never rounded below itself)."""
    unit = _unit(retail, price)
    out = (price / unit).quantize(Decimal('1'), rounding=ROUND_CEILING) * unit
    return max(out, unit).quantize(Decimal('0.01'))


def _dec(value: Any) -> Decimal | None:
    if value is None or value == '':
        return None
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return d if d.is_finite() and d > 0 else None


def commodity_price(mark: str, retail: Any, s: Standards | None = None) -> Decimal | None:
    """The steady price of a commodity: retail x its share, rounded. None when not a commodity or no retail."""
    s = s or standards()
    share, r = s.share(mark), _dec(retail)
    if share is None or r is None:
        return None
    return money(r * share, r)


# -- the suggestion (PO 428 rules) --------------------------------------------------------------------------------
# Not commodities even when a word below matches: unknown lots, off season, Christmas, toys (the PO 428 classes
# that came first), winter goods whose words overlap (carbon monoxide hit "carb"), and durable goods that carry a
# consumable's word or brand (a Clorox broom, a litter box, a battery-powered sprayer, a toilet handle).
_NOT = re.compile(
    r'unidentified|unknown|mystery|miscellaneous item|assorted|value pack|'
    r'\bfan\b|charcoal grill|insect|repellent|\bdeet\b|wasp|hornet|\bpest|weed|roundup|crabgrass|citronella|'
    r'torch fuel|lighter fluid|life vest|swim|sunscreen|\bspf\b|refrigerant|r-134a|garden|fishing|camping|\bpool\b|'
    r'christmas|santa|grinch|nutcracker|gingerbread|gift wrap|gift bag|festive|'
    r'pokemon|plush|lego|hot wheels|barbie|board game|\bdoll|playset|\btoys?\b|action figure|skibidi|'
    r'carbon monoxide|space heater|beanie|throw blanket|slipper|umbrella|wiper blade|'
    r'battery[- ](powered|operated)|\b\d{2,3}v\b|battery replacement|replacement battery|charger|'
    r'\b(brush|broom|dustpan|scrubber|bucket|caddy|dispenser|holder|organizer|rack|curtain|rod|handle|'
    r'litter box|vehicle|blaster|sprayer|mop|lamp|light)\b'
)
# Store brands: the owner's list (Walmart), plus the other big stores' own consumable brands we buy.
_STORE = re.compile(
    r"great value|\bgv\b|equate|\beq\b|super ?tech|parent.?s choice|"
    r"\bup ?& ?up\b|market pantry|amazon basics|kirkland|member.?s mark"
)
# Commodity words: classes S1 and S2 of the PO 428 rules (hand_prices.py), as approved on that truck; a few loose
# ones made precise after a check on other trucks ("toilet" -> toilet paper/bowl, "pads" -> maxi pads, "battery"
# -> batteries and 9V/coin cells, "shout" dropped).
_COMMODITY = re.compile(
    r'\btide\b|\bgain\b|downy|diaper|training pants|easy ups|goodnites|disposable underwear|baby wipes|'
    r'wipes 900|wipes 800|wipes 1008|batteries|\b(aa|aaa|9v|cr\d{4}|2032)\b.*batter|trash bags|hammermill|'
    r'copy paper|copy and print|filtrete|mobil 1|royal purple|motor oil|oil filter|\balways\b|tampax|tampons|'
    r'kotex|\bpoise\b|maxi pads|assurance|flushable|'
    r'arm & hammer|woolite|\bxtra\b|purex|\bbounce\b|laundry|clorox|lysol|pine-sol|fabuloso|pinalen|\bajax\b|'
    r'\bdawn\b|palmolive|cascade|\bfinish\b|magic eraser|swiffer|scotch-brite|brillo|chinet|napkins|febreze|'
    r'bleach|oxiclean|drano|windex|pledge|soft scrub|bar keeper|lime-a-way|mrs\. meyer|\bzep\b|formula 409|'
    r'toilet paper|toilet bowl|bath tissue|facial tissue|paper towels?|disinfect|cleaner|glade|air wick|renuzit|'
    r'air freshener|dish soap|rinse aid|dryer sheets|fabric softener|stain remover|odor (remover|eliminator)|'
    r'diesel exhaust|diesel treatment|fuel treatment|sea foam|\bstp\b|valvoline|wd-?40|antifreeze|coolant|'
    r'washer fluid|cat litter|\blitter\b|sprayway|scrub(bing)? sponges?|kitchen sponges?|scour daddy|scrub daddy|brake fluid|gear oil|degreaser|pads with wings|'
    r'scented wipes|dusting spray'
)


def suggest(title: str, brand: str = '') -> str:
    """name_brand, store_brand, or '' (no suggestion) from the words of a title and brand."""
    text = f'{title or ""} | {brand or ""}'.lower()
    if not text.strip(' |') or _NOT.search(text):
        return ''
    store = bool(_STORE.search(text))
    if _COMMODITY.search(text):
        return STORE_BRAND if store else NAME_BRAND
    # Great Value, Equate, SuperTech and Parent's Choice are everyday consumables on their own.
    return STORE_BRAND if store else ''


# -- the mark -----------------------------------------------------------------------------------------------------
def mark(product, value: str) -> str:
    if value not in MARKS:
        raise StandardError('Choose name brand, store brand, or not a commodity.')
    if product.price_standard != value:
        product.price_standard = value
        product.save(update_fields=['price_standard', 'updated_at'])
    return value


def for_product(product, retail: Any = None) -> dict[str, Any]:
    """What the check-in line needs: the mark, the suggestion while undecided, and the steady price."""
    s = standards()
    stored = product.price_standard or ''
    suggestion = suggest(product.title, product.brand) if stored == '' else ''
    use = stored if stored in COMMODITY else suggestion
    price = commodity_price(use, retail, s) if use else None
    share = s.share(use) if use else None
    return {
        'product_id': product.pk, 'standard': stored, 'suggested': suggestion,
        'label': LABELS.get(use or stored, ''), 'share': float(share) if share is not None else None,
        'price': str(price) if price is not None else None,
    }


# -- deep stock ---------------------------------------------------------------------------------------------------
def _floor_day():
    return Coalesce('listed_at', 'checked_in_at', 'created_at')


def _last_steps(product_ids: Iterable[int]) -> dict[int, date]:
    from apps.inventory.models import BulkPriceChange

    ids = {int(p) for p in product_ids}
    out: dict[int, date] = {}
    rows = (BulkPriceChange.objects.filter(rule__standard=DEEP_STOCK, undone_at__isnull=True)
            .order_by('created_at').values_list('rule', 'created_at'))
    for rule, at in rows:
        pid = (rule or {}).get('product_id')
        if pid in ids:
            out[pid] = timezone.localtime(at).date()
    return out


def _step_price(price: Decimal, retail: Decimal | None, floor_share: Decimal, s: Standards) -> tuple[Decimal | None, str]:
    """One step for one unit: (new price or None, why not)."""
    if retail is None:
        return None, 'no_retail'
    floor = money_up(retail * floor_share, retail)
    if price <= floor:
        return None, 'at_floor'
    new = max(money(price - retail * s.step_share, retail), floor)
    if new >= price:
        return None, 'at_floor'
    return new, ''


def deep_stock(today: date | None = None, *, product_ids: list[int] | None = None) -> dict[str, Any]:
    """Every product with deep stock on the shelf, with its pace and, when due, the step for each unit."""
    from apps.inventory.models import Item, Product

    s = standards()
    today = today or timezone.localdate()
    shelf = Item.objects.filter(status='on_shelf', product_id__isnull=False).exclude(source='consignment')
    counts = shelf.values('product_id').annotate(n=Count('pk')).filter(n__gte=s.deep_min_units)
    if product_ids is not None:
        counts = counts.filter(product_id__in=product_ids)
    by_count = {r['product_id']: r['n'] for r in counts}
    if not by_count:
        return {'standards': s.as_dict(), 'today': today.isoformat(), 'rows': []}

    products = {p.pk: p for p in Product.objects.filter(pk__in=list(by_count))}
    units: dict[int, list[dict]] = {}
    for row in (shelf.filter(product_id__in=list(by_count)).annotate(day=_floor_day())
                .values('pk', 'sku', 'product_id', 'price', 'retail', 'day').order_by('pk')):
        units.setdefault(row['product_id'], []).append(row)
    starts = {pid: min(timezone.localtime(u['day']).date() for u in rows) for pid, rows in units.items()}
    sold = _sold_since(starts)
    last = _last_steps(by_count)

    out = []
    for pid, rows in units.items():
        p = products[pid]
        start = starts[pid]
        commodity = p.price_standard in COMMODITY
        floor_share = s.floor_commodity_share if commodity else s.floor_share
        days_in = max((today - start).days, 1)
        n_sold = sold.get(pid, 0)
        left = len(rows)
        rate = n_sold / days_in  # units a day
        deadline = start + timedelta(days=s.sellout_days)
        days_left = (deadline - today).days
        on_pace = days_left > 0 and rate * days_left >= left
        clock = max(start, last.get(pid, start))
        next_check = clock + timedelta(days=s.check_days)

        steps, reasons = [], {'no_retail': 0, 'at_floor': 0}
        for u in rows:
            price = Decimal(u['price'] or 0)
            new, why = _step_price(price, _dec(u['retail']), floor_share, s)
            if new is None:
                reasons[why] += 1
            else:
                steps.append({'id': u['pk'], 'sku': u['sku'], 'old': str(price), 'new': str(new),
                              'retail': str(u['retail'])})
        prices = [Decimal(u['price'] or 0) for u in rows]
        mixed = min(prices) > 0 and max(prices) > MIXED_SPREAD * min(prices)
        if mixed:
            status = 'mixed'
        elif not steps:
            status = 'at_floor' if reasons['at_floor'] else 'no_retail'
        elif on_pace:
            status = 'on_pace'
        elif today < next_check:
            status = 'waiting'
        else:
            status = 'due'

        retails = [r for r in (_dec(u['retail']) for u in rows) if r is not None]
        retail_total = sum(retails, Decimal('0'))
        price_total_r = sum((Decimal(u['price'] or 0) for u in rows if _dec(u['retail'])), Decimal('0'))
        new_total = price_total_r - sum((Decimal(x['old']) - Decimal(x['new']) for x in steps), Decimal('0'))
        out.append({
            'product_id': pid, 'product_number': p.product_number or '', 'title': p.title, 'brand': p.brand,
            'standard': p.price_standard or '', 'commodity': commodity,
            'units': left, 'sold': n_sold, 'start': start.isoformat(), 'days': days_in,
            'per_week': round(rate * 7, 1),
            'sellout_days': round(left / rate) if rate > 0 else None,
            'deadline': deadline.isoformat(), 'days_left': days_left, 'on_pace': on_pace,
            'last_step': last[pid].isoformat() if pid in last else None, 'next_check': next_check.isoformat(),
            'status': status, 'floor_share': float(floor_share),
            'price_low': str(min(prices)), 'price_high': str(max(prices)),
            'pct_now': round(float(100 * price_total_r / retail_total)) if retail_total else None,
            'pct_after': round(float(100 * new_total / retail_total)) if retail_total and steps else None,
            'new_low': min((x['new'] for x in steps), key=Decimal) if steps else None,
            'new_high': max((x['new'] for x in steps), key=Decimal) if steps else None,
            'stepping': len(steps), 'no_retail': reasons['no_retail'], 'at_floor_units': reasons['at_floor'],
            'items': steps if status == 'due' else [],
        })
    order = {'due': 0, 'waiting': 1, 'on_pace': 2, 'at_floor': 3, 'no_retail': 4, 'mixed': 5}
    out.sort(key=lambda r: (order[r['status']], -r['units'], r['title']))
    return {'standards': s.as_dict(), 'today': today.isoformat(), 'rows': out}


def _sold_since(starts: dict[int, date]) -> dict[int, int]:
    """Units of each product sold since its lot started."""
    from apps.inventory.models import Item

    if not starts:
        return {}
    earliest = min(starts.values())
    out: dict[int, int] = {}
    rows = (Item.objects.filter(product_id__in=list(starts), status='sold', sold_at__date__gte=earliest)
            .values_list('product_id', 'sold_at'))
    for pid, at in rows:
        if at and timezone.localtime(at).date() >= starts[pid]:
            out[pid] = out.get(pid, 0) + 1
    return out


@transaction.atomic
def step(user, product_ids: list[int], today: date | None = None) -> list[dict[str, Any]]:
    """Apply one step to each product that is due now (worked out again, so only what is due is changed)."""
    from apps.inventory.models import BulkPriceChange, Item
    from apps.inventory.services import bulk_price

    ids = sorted({int(p) for p in product_ids})
    if not ids:
        raise StandardError('Tick at least one product.')
    rows = [r for r in deep_stock(today, product_ids=ids)['rows'] if r['status'] == 'due']
    if not rows:
        raise StandardError('None of these is due a step now.')
    s = standards()
    done = []
    for r in rows:
        prices = {x['id']: x['new'] for x in r['items']}
        items = list(Item.objects.select_for_update().filter(pk__in=list(prices), status='on_shelf')
                     .select_related('product').order_by('pk'))
        # A price changed since the list was worked out: leave that unit alone.
        old = {x['id']: x['old'] for x in r['items']}
        items = [i for i in items if str(i.price) == old[i.pk]]
        if not items:
            continue
        changes = [c for c in bulk_price._rows(items, None)]
        for c in changes:
            c['new'] = prices[c['id']]
        pct = int(round(s.step_share * 100))
        floor_pct = int(round(Decimal(str(r['floor_share'])) * 100))
        rule = {'mode': 'standard', 'standard': DEEP_STOCK, 'product_id': r['product_id'],
                'step_share': str(s.step_share), 'floor_share': str(r['floor_share']),
                'units': r['units'], 'sold': r['sold'], 'days': r['days'],
                'pct_before': r['pct_now'], 'pct_after': r['pct_after']}
        change = BulkPriceChange.objects.create(
            rule=rule, description=f'Deep stock step: {pct}% of retail off (floor {floor_pct}%)'[:120],
            item_count=len(changes), changes=changes, created_by=user,
            total_before=sum((Decimal(c['old']) for c in changes), Decimal('0')),
            total_after=sum((Decimal(c['new']) for c in changes), Decimal('0')),
        )
        bulk_price._write(items, {c['id']: c['new'] for c in changes}, user,
                          f'Bulk price change #{change.pk}: {change.description}')
        done.append({**bulk_price.summary(change, with_items=True), 'product_id': r['product_id'], 'title': r['title']})
    if not done:
        raise StandardError('The prices changed since the list was made. Refresh and try again.')
    return done


def stepped(limit: int = 200) -> list[dict[str, Any]]:
    """The report: every deep-stock step, newest first, with how many of its units have sold since."""
    from apps.inventory.models import BulkPriceChange, Item, Product

    changes = list(BulkPriceChange.objects.filter(rule__standard=DEEP_STOCK)
                   .select_related('created_by', 'undone_by').order_by('-created_at')[:limit])
    item_ids = {c_['id'] for c in changes for c_ in (c.changes or [])}
    sold = set(Item.objects.filter(pk__in=item_ids, status='sold').values_list('pk', flat=True))
    names = dict(Product.objects.filter(pk__in={(c.rule or {}).get('product_id') for c in changes})
                 .values_list('pk', 'title'))
    out = []
    for c in changes:
        rule = c.rule or {}
        who = c.created_by
        out.append({
            'id': c.pk, 'at': c.created_at, 'by': (getattr(who, 'first_name', '') or getattr(who, 'email', '')) if who else '',
            'product_id': rule.get('product_id'), 'title': names.get(rule.get('product_id'), ''),
            'units': c.item_count, 'before': str(c.total_before), 'after': str(c.total_after),
            'pct_before': rule.get('pct_before'), 'pct_after': rule.get('pct_after'),
            'sold_since': sum(1 for x in (c.changes or []) if x['id'] in sold),
            'undone_at': c.undone_at,
        })
    return out


def sat_too_long(today: date | None = None, limit: int = 200) -> list[dict[str, Any]]:
    """Commodities with units on the shelf longer than the sit days: "was it a commodity?"."""
    from apps.inventory.models import Item

    s = standards()
    today = today or timezone.localdate()
    cutoff = timezone.make_aware(datetime.combine(today - timedelta(days=s.sit_days), time.min))
    rows: dict[int, dict[str, Any]] = {}
    qs = (Item.objects.filter(status='on_shelf', product__price_standard__in=COMMODITY)
          .annotate(day=_floor_day()).filter(day__lt=cutoff)
          .values('product_id', 'product__title', 'product__brand', 'product__product_number',
                  'product__price_standard', 'day', 'price'))
    for r in qs:
        pid = r['product_id']
        d = timezone.localtime(r['day']).date()
        row = rows.setdefault(pid, {
            'product_id': pid, 'title': r['product__title'], 'brand': r['product__brand'],
            'product_number': r['product__product_number'] or '', 'standard': r['product__price_standard'],
            'units': 0, 'oldest_days': 0, 'price_total': Decimal('0'),
        })
        row['units'] += 1
        row['oldest_days'] = max(row['oldest_days'], (today - d).days)
        row['price_total'] += Decimal(r['price'] or 0)
    out = sorted(rows.values(), key=lambda x: (-x['oldest_days'], x['title']))[:limit]
    for r in out:
        r['price_total'] = str(r['price_total'])
    return out


# -- the truck (manifest stage) -----------------------------------------------------------------------------------
def _truck_rows(po_id: int):
    from apps.inventory.models import ProcessingRow

    return (ProcessingRow.objects.filter(purchase_order_id=po_id, qty_dispositioned=0)
            .select_related('matched_product', 'manifest_row').order_by('row_number', 'split_seq', 'pk'))


def truck(po_id: int) -> dict[str, Any]:
    """Rows of an order not yet checked in that the standard prices: marked products first, then suggestions."""
    s = standards()
    out = []
    for row in _truck_rows(po_id):
        product = row.matched_product
        stored = (product.price_standard or '') if product else ''
        if stored == NOT_ONE:
            continue
        if stored in COMMODITY:
            use, source = stored, 'product'
        else:
            use, source = suggest(row.title, row.brand), 'suggested'
            if not use and product is not None:
                use = suggest(product.title, product.brand)
        if not use:
            continue
        price = commodity_price(use, row.unit_retail, s)
        if price is None:
            continue
        now = row.shelf_price if row.shelf_price is not None else row.final_price
        out.append({
            'id': row.pk, 'row_number': row.row_number, 'title': row.title, 'brand': row.brand,
            'quantity': row.quantity, 'retail': str(row.unit_retail), 'price_now': str(now) if now is not None else None,
            'price': str(price), 'standard': use, 'label': LABELS[use], 'source': source,
            'product_id': product.pk if product else None, 'product_title': product.title if product else '',
            'changes': now is None or Decimal(now) != price,
        })
    return {'standards': s.as_dict(), 'rows': out}


@transaction.atomic
def apply_truck(po_id: int, row_ids: list[int]) -> dict[str, Any]:
    """Write the standard price on the ticked rows (shelf and final price, the manifest line's proposed price) and
    confirm the mark on their matched products."""
    from apps.inventory.models import ManifestRow, ProcessingRow, Product

    wanted = {int(r) for r in row_ids}
    if not wanted:
        raise StandardError('Tick at least one line.')
    plan = {r['id']: r for r in truck(po_id)['rows'] if r['id'] in wanted}
    if not plan:
        raise StandardError('None of these lines can take a standard price now.')
    rows = list(ProcessingRow.objects.select_for_update(of=('self',)).filter(pk__in=list(plan)).select_related('manifest_row'))
    manifest, marks, s = [], {}, standards()
    for row in rows:
        r = plan[row.pk]
        price = Decimal(r['price'])
        note = f'{r["label"]}: {int(round(s.share(r["standard"]) * 100))}% of retail, holds steady'
        row.final_price = price
        row.shelf_price = price
        row.pricing_notes = (note if not row.pricing_notes else f'{note}. {row.pricing_notes}')[:2000]
        if row.manifest_row_id:
            m = row.manifest_row
            m.proposed_price = price
            manifest.append(m)
        if r['product_id']:
            marks.setdefault(r['standard'], set()).add(r['product_id'])
    ProcessingRow.objects.bulk_update(rows, ['final_price', 'shelf_price', 'pricing_notes'], batch_size=500)
    ManifestRow.objects.bulk_update(manifest, ['proposed_price'], batch_size=500)
    confirmed = 0
    for value, pids in marks.items():
        confirmed += Product.objects.filter(pk__in=pids, price_standard='').update(price_standard=value, updated_at=timezone.now())
    return {'priced': len(rows), 'confirmed': confirmed}
