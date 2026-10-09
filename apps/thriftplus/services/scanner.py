"""
The scanner app's server side (thrift_plus_rewards Phase 4). It mirrors the contract in
``frontend/src/api/thriftPlusMock.ts``, so the phone swaps the mock for the real API one-to-one.

- **The item card** for a tag: a short title (28 characters, cut at a whole word, never an
  ellipsis), a category icon key, details, the retail struck through, and the price. Also:
  - the member reward and member price, from the engine and scaled by a store sale like the register
    (``.ai/extended/discount-logic.md``);
  - the 18+ and returnable flags;
  - whether the item can go in a cart.
- **The member's cart** (``AppCart``) is an estimate; the register is the source of truth. Its
  totals come from the same trip math as the register: this month's cover first, then an instant
  rebate or banking at 1.05×.
- **Signals** (scan, add, pass, a price feel, the trip's choice) are kept per event
  (``ScanSignal``) and counted on the item's reward (``ItemReward``) for the engine's
  scans-to-adds check.
"""
from __future__ import annotations

import re
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.thriftplus.models import AppCart, AppCartLine, ItemReward, ScanSignal
from apps.thriftplus.services import ledger, trip
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


def item_card(item, *, factor: Decimal | None = None) -> dict:
    """``ThriftPlusItemCard`` for one item."""
    from apps.thriftplus.services.returns import excluded
    from apps.thriftplus.models import RestrictedProduct

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
        'reward_banked': _money(reward),  # saved in full (form 5)
        'reward_instant': _money(trip.instant_part(reward)),  # used today: 80%
        'age_restricted': restricted, 'returnable': not excluded(item), 'available': item.status == 'on_shelf',
    }


def find_item(sku: str):
    from apps.inventory.models import Item

    code = (sku or '').strip()
    return Item.objects.select_related('product__profile').filter(sku__iexact=code).first() if code else None


# ── Signals ────────────────────────────────────────────────────────────────────

_COUNTERS = {'scan': 'scans', 'add': 'adds', 'pass': 'passes'}


def signal(kind: str, item=None, account=None, **detail) -> None:
    ScanSignal.objects.create(kind=kind, item=item, account=account, detail=detail)
    if item is None:
        return
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
    """``ThriftPlusCart``: lines with their item cards, the choice, and the trip totals."""
    cart = cart_for(account)
    lines = list(cart.lines.select_related('item__product__profile'))
    factor = _sale_factor()
    cards = [(line, item_card(line.item, factor=factor)) for line in lines]
    totals = trip.totals(
        [trip.TripLine(key=c['sku'], price=Decimal(c['price']), reward=Decimal(c['reward']), qty=line.qty)
         for line, c in cards if c['available']],
        cover_left=ledger.cover_left(account), member=True, choice=cart.reward_choice or None, bonus=trip.bank_bonus(),
    )
    return {
        'lines': [{'item': c, 'qty': line.qty, 'added_at': line.added_at.isoformat()} for line, c in cards],
        'reward_choice': cart.reward_choice or None,
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
    """Empty the cart; the trip's bank-or-instant answer is asked again."""
    cart = cart_for(account)
    cart.lines.all().delete()
    cart.reward_choice, cart.choice_at = '', None
    cart.save(update_fields=['reward_choice', 'choice_at', 'updated_at'])
    return cart_payload(account)


def set_choice(account, choice: str) -> dict:
    if choice not in (trip.CHOICE_BANK, trip.CHOICE_INSTANT):
        raise ValueError('Choose bank or instant.')
    cart = cart_for(account)
    cart.reward_choice, cart.choice_at = choice, timezone.now()
    cart.save(update_fields=['reward_choice', 'choice_at', 'updated_at'])
    signal('choice', None, account, choice=choice)
    return cart_payload(account)


def history(account, limit: int = 300) -> list[dict]:
    """``ThriftPlusHistoryEntry[]``: newest first, one row per tag, with what they did."""
    rows = (
        ScanSignal.objects.filter(account=account, kind__in=['scan', 'add', 'pass'], item__isnull=False)
        .select_related('item__product__profile').order_by('-created_at')[:2000]
    )
    seen: dict[int, dict] = {}
    factor = _sale_factor()
    for r in rows:
        entry = seen.get(r.item_id)
        if entry is None:
            if len(seen) >= limit:
                continue
            entry = seen[r.item_id] = {'item': item_card(r.item, factor=factor), 'scanned_at': r.created_at.isoformat(), 'decision': None}
        if entry['decision'] is None and r.kind in ('add', 'pass'):
            entry['decision'] = 'added' if r.kind == 'add' else 'passed'
    return list(seen.values())


def after_sale(account, sold_item_ids: list[int]) -> None:
    """The register sold these to the member: take them out of the phone cart, and ask the choice again."""
    cart = AppCart.objects.filter(account=account).first()
    if cart is None:
        return
    cart.lines.filter(item_id__in=sold_item_ids).delete()
    if not cart.lines.exists():
        cart.reward_choice, cart.choice_at = '', None
        cart.save(update_fields=['reward_choice', 'choice_at', 'updated_at'])
