"""
The scanner app's server side (thrift_plus_rewards Phase 4). It mirrors the contract in
``frontend/src/api/thriftPlusMock.ts``, so the phone swaps the mock for the real API one-to-one.

- **The item card** for a tag: a short title (28 characters, cut at a whole word, never an
  ellipsis), a category icon key, details, the retail struck through, and the price. Also:
  - the member reward and member price, from the engine and scaled by a store sale like the register
    (``.ai/extended/discount-logic.md``);
  - the 18+ flag, and whether it is a 3-day return item (W6's guide, as the register marks it);
  - whether the item can go in a cart.
- **The member's cart** (``AppCart``) is an estimate; the register is the source of truth. Its
  totals come from the same trip math as the register: every ThriftBuck kept (the Default). The
  scanner asks no choice: instant redemption is at the register (B1).
- **Signals** (scan, add, pass, a price feel) are kept per event (``ScanSignal``) and counted on
  the item's reward (``ItemReward``) for the engine's scans-to-adds check.
"""
from __future__ import annotations

import re
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from apps.thriftplus.models import AppCart, AppCartLine, ItemReward, ScanSignal
from apps.thriftplus.services import trip
from apps.thriftplus.services.rewards import floor_for, rules

CENT = Decimal('0.01')
ZERO = Decimal('0.00')
TITLE_MAX = 28

_CATEGORY_WORDS: list[tuple[str, str]] = [
    ('clothing', 'clothing|clothes|apparel|shoe|boot|sneaker|shirt|jacket|dress|pant|jean|coat|hat|handbag|purse|sweater|hoodie'),
    ('bedding', 'bedding|quilt|comforter|sheet|pillow|blanket|towel|linen|curtain|bath'),
    ('baby', 'baby|babie|infant|toddler|stroller|nursery'),
    ('toys', 'toy|game|lego|puzzle|doll'),
    ('tools', 'tool|drill|saw|hardware|wrench|dewalt|milwaukee|ryobi|power tool'),
    ('outdoor', 'outdoor|patio|garden|lawn|grill|yard'),
    ('sporting', 'sport|sporting good|fitness|exercise|bike|bicycle|camping|fishing|golf'),
    ('lighting', 'lighting|light|lamp|chandelier|sconce'),
    ('appliances', 'appliance|vacuum|microwave|washer|dryer|fridge|refrigerator|air fryer|heater|fan'),
    ('kitchen', 'kitchen|cookware|bakeware|dining|dish|cup|mug|blender|mixer|coffee|pan|pot|cutlery|kitchen & dining'),
    ('electronics', 'electronic|tv|television|computer|laptop|phone|audio|speaker|camera|headphone|gaming|video game'),
    ('furniture', 'furniture|chair|table|desk|sofa|couch|dresser|cabinet|shelf|shelves|bed frame|ottoman|bookcase'),
    ('books_media', 'book|media|dvd|vinyl|record|cd'),
    ('home_decor', 'decor|home decor|wall art|frame|vase|rug|mirror|candle'),
]
_CATEGORY_RES = [(key, re.compile(r'\b(' + words + r')(e?s)?\b', re.IGNORECASE)) for key, words in _CATEGORY_WORDS]

CATEGORY_LABELS = {
    'furniture': 'Furniture', 'electronics': 'Electronics', 'appliances': 'Appliances', 'kitchen': 'Kitchen',
    'home_decor': 'Home decor', 'bedding': 'Bedding and linens', 'lighting': 'Lighting', 'toys': 'Toys and games',
    'tools': 'Tools', 'outdoor': 'Outdoor', 'sporting': 'Sports and outdoors', 'books_media': 'Books and media',
    'clothing': 'Clothing', 'baby': 'Baby', 'other': 'Home goods',
}
CONDITION_LABELS = {'new': 'New', 'like_new': 'Like new', 'very_good': 'Very good', 'good': 'Good', 'fair': 'Fair',
                    'salvage': 'For parts'}


def category_for(text: str) -> str:
    for key, pattern in _CATEGORY_RES:
        if pattern.search(text or ''):
            return key
    return 'other'


def short_title(title: str, limit: int = TITLE_MAX) -> str:
    """At most ``limit`` characters, cut at a whole word, never with an ellipsis (as the mock)."""
    clean = ' '.join((title or '').split()) or 'Item'
    if len(clean) <= limit:
        return clean
    out = ''
    for word in clean.split(' '):
        nxt = f'{out} {word}' if out else word
        if len(nxt) > limit:
            break
        out = nxt
    return (out or clean[:limit]).rstrip(' ,;:/(&-')


def _money(value) -> str:
    return str(Decimal(value or 0).quantize(CENT))


def _sale_factor() -> Decimal:
    """The store sale on at the register right now (Labor Day), as the price factor."""
    try:
        from apps.pos.services.sale_mode import get_sale_mode

        mode = get_sale_mode()
    except Exception:
        return Decimal('1')
    if not mode.get('active'):
        return Decimal('1')
    return Decimal('1') - Decimal(str(mode.get('percent') or 0)) / Decimal('100')


def item_card(item, *, factor: Decimal | None = None, guide=None) -> dict:
    """``ThriftPlusItemCard`` for one item. ``guide`` (``returns.guide()``) saves reading the return settings per item
    in a list."""
    from apps.thriftplus.models import RestrictedProduct
    from apps.thriftplus.services.returns import closed_note, qualifies

    product = item.product
    profile = getattr(product, 'profile', None)
    name = (profile.short_name if profile is not None and profile.short_name else '') or product.title
    category_text = ' '.join(x for x in [
        profile.category if profile is not None else '', profile.subcategory if profile is not None else '', product.title,
    ] if x)
    category = category_for(category_text)
    factor = _sale_factor() if factor is None else factor
    tag = item.price or ZERO
    price = (tag * factor).quantize(CENT, rounding=ROUND_HALF_UP)
    reward = ZERO
    state = ItemReward.objects.filter(item_id=item.pk).exclude(
        status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED]).values_list('reward', flat=True).first()
    if state and item.source != 'consignment' and tag > 0:
        reward = min(state, max(ZERO, tag - floor_for(tag, rules().floor_share)))
        reward = (reward * factor).quantize(CENT, rounding=ROUND_DOWN)
    brand = (profile.brand if profile is not None and profile.brand else '') or product.brand or ''
    details = [x for x in [
        f'Brand: {brand}' if brand else '',
        f'Condition: {CONDITION_LABELS[item.condition]}' if item.condition in CONDITION_LABELS else '',
    ] if x]
    details += [line[5:].strip() for line in (item.notes or '').splitlines() if line.upper().startswith('NOTE:')][:3]
    retail = item.retail or (profile.retail_estimate if profile is not None else None)
    restricted = RestrictedProduct.objects.filter(product_id=item.product_id).exists()
    return {
        'sku': item.sku, 'title': short_title(name), 'category': category, 'category_label': CATEGORY_LABELS[category],
        'details': details, 'retail_price': _money(retail) if retail and retail > price else None,
        'price': _money(price), 'reward': _money(reward), 'member_price': _money(price - reward),
        'age_restricted': restricted, 'returnable': (ok := qualifies(item, price=price, reward=reward, rules=guide)),
        'return_note': closed_note() if ok else '',  # closed days in the 3-day window (owner 2026-10-20)
        'available': item.status == 'on_shelf',
    }


def find_item(sku: str):
    from apps.inventory.models import Item

    code = (sku or '').strip()
    return Item.objects.select_related('product__profile').filter(sku__iexact=code).first() if code else None


# Staff testing without a camera (owner 2026-10-10): tags on the floor, from big ThriftBucks down to none.
TEST_TAG_BANDS = [(Decimal('40'), None), (Decimal('20'), Decimal('40')), (Decimal('8'), Decimal('20')),
                  (Decimal('0.01'), Decimal('8'))]


def test_tags(per_band: int = 2) -> list[dict]:
    """A few real tags to pick in the scanner's test mode: two per ThriftBucks band, and one with none yet."""
    from apps.inventory.models import Item

    base = (ItemReward.objects.filter(item__status='on_shelf', item__price__gt=0)
            .exclude(status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED])
            .exclude(item__source='consignment'))
    ids: list[int] = []
    for low, high in TEST_TAG_BANDS:
        band = base.filter(reward__gte=low)
        if high is not None:
            band = band.filter(reward__lt=high)
        ids += list(band.order_by('item__sku').values_list('item_id', flat=True)[:per_band])
    ids += list(base.filter(reward=0).order_by('item__sku').values_list('item_id', flat=True)[:1])
    factor = _sale_factor()
    from apps.thriftplus.services.returns import guide

    rules_ = guide()
    cards = [item_card(i, factor=factor, guide=rules_)
             for i in Item.objects.select_related('product__profile').filter(pk__in=ids)]
    cards.sort(key=lambda c: -Decimal(c['reward']))
    return [{'sku': c['sku'], 'title': c['title'], 'price': c['price'], 'reward': c['reward']} for c in cards]


# ── Signals ────────────────────────────────────────────────────────────────────

_COUNTERS = {'scan': 'scans', 'add': 'adds', 'pass': 'passes'}


def signal(kind: str, item=None, account=None, **detail) -> None:
    ScanSignal.objects.create(kind=kind, item=item, account=account, detail=detail)
    if item is None:
        return
    from apps.thriftplus.services.members import is_testing

    if is_testing(account):
        return  # practice taps keep the member's history but never move the item's numbers (2026-10-10)
    field = _COUNTERS.get(kind)
    if field:
        ItemReward.objects.filter(item_id=item.pk).update(**{field: F(field) + 1})
    elif kind == 'feel' and detail.get('reason'):
        state = ItemReward.objects.filter(item_id=item.pk).first()
        if state is not None:
            feedback = dict(state.feedback or {})
            feedback[detail['reason']] = int(feedback.get(detail['reason'], 0)) + 1
            ItemReward.objects.filter(item_id=item.pk).update(feedback=feedback)


# ── The member's cart ──────────────────────────────────────────────────────────

def cart_for(account) -> AppCart:
    cart, _ = AppCart.objects.get_or_create(account=account)
    return cart


def cart_payload(account) -> dict:
    """``ThriftPlusCart``: lines with their item cards and the trip totals (every ThriftBuck kept)."""
    cart = cart_for(account)
    lines = list(cart.lines.select_related('item__product__profile'))
    factor = _sale_factor()
    from apps.thriftplus.services.returns import guide

    rules_ = guide()
    cards = [(line, item_card(line.item, factor=factor, guide=rules_)) for line in lines]
    totals = trip.totals(
        [trip.TripLine(key=c['sku'], price=Decimal(c['price']), reward=Decimal(c['reward']), qty=line.qty)
         for line, c in cards if c['available']],
        member=True, choice=trip.CHOICE_BANK,
    )
    return {
        'lines': [{'item': c, 'qty': line.qty, 'added_at': line.added_at.isoformat()} for line, c in cards],
        'totals': totals.as_dict(),
    }


@transaction.atomic
def add(account, item) -> dict:
    cart = cart_for(account)
    AppCartLine.objects.get_or_create(cart=cart, item=item)  # a tag already in the cart keeps its qty
    signal('add', item, account)
    return cart_payload(account)


def set_qty(account, item, qty: int) -> dict:
    cart = cart_for(account)
    if qty <= 0:
        AppCartLine.objects.filter(cart=cart, item=item).delete()
    else:
        AppCartLine.objects.filter(cart=cart, item=item).update(qty=min(qty, 99))
    return cart_payload(account)


def clear(account) -> dict:
    """Empty the cart."""
    cart = cart_for(account)
    cart.lines.all().delete()
    return cart_payload(account)


def clear_history(account) -> list[dict]:
    """'Clear my scans' (owner 2026-10-10): the member's list starts over. The scan rows stay; they are data."""
    cart = cart_for(account)
    cart.history_cleared_at = timezone.now()
    cart.history_cleared_through = ScanSignal.objects.filter(account=account).aggregate(m=Max('pk'))['m'] or 0
    cart.save(update_fields=['history_cleared_at', 'history_cleared_through', 'updated_at'])
    return []


def history(account, limit: int = 300) -> list[dict]:
    """``ThriftPlusHistoryEntry[]``: newest first, one row per tag, with what they did."""
    rows = ScanSignal.objects.filter(account=account, kind__in=['scan', 'add', 'pass'], item__isnull=False)
    through = AppCart.objects.filter(account=account).values_list('history_cleared_through', flat=True).first()
    if through is not None:
        rows = rows.filter(pk__gt=through)  # "Clear my scans": hidden, not deleted
    rows = rows.select_related('item__product__profile').order_by('-created_at')[:2000]
    seen: dict[int, dict] = {}
    factor = _sale_factor()
    from apps.thriftplus.services.returns import guide

    rules_ = guide()
    for r in rows:
        entry = seen.get(r.item_id)
        if entry is None:
            if len(seen) >= limit:
                continue
            entry = seen[r.item_id] = {'item': item_card(r.item, factor=factor, guide=rules_),
                                       'scanned_at': r.created_at.isoformat(), 'decision': None}
        if entry['decision'] is None and r.kind in ('add', 'pass'):
            entry['decision'] = 'added' if r.kind == 'add' else 'passed'
    return list(seen.values())


def after_sale(account, sold_item_ids: list[int]) -> None:
    """The register sold these to the member: take them out of the phone cart."""
    cart = AppCart.objects.filter(account=account).first()
    if cart is None:
        return
    cart.lines.filter(item_id__in=sold_item_ids).delete()
