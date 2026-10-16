"""
Thrift+ at the register (the 10-12 policy; owner answers 2026-10-14).

**Dark means untouched.** Every step here runs only when Thrift+ is *live* for the sale's register:
- the ``thrift_plus_enabled`` switch is on; or
- the register's code is in ``thrift_plus_test_registers`` (the owner's test register, the staff dry run); or
- it is a training register.

Otherwise ``sync_if_live`` answers False at once, ``Cart.recalculate`` skips the post-total hook, and the POS behaves
exactly as before. Anything that goes wrong in here is logged and never raised into a sale.

**A member on a sale** (``CartMember``) is attached by scanning the member QR in their Thrift+ app in the terminal's
scan box (``TP`` + their member code), or by finding them by phone and picking the person (owner 2026-10-14: there is
no Thrift+ card).

**Joined online** (owner 2026-10-15, J8): a pending membership collects and uses nothing (J2). Its QR (attach, re-ring,
the returns lookup) answers ``MEMBER_PENDING`` with the person, and the terminal opens Finish joining: the cashier asks
the phone number and reads it back, checks the ID and takes the photo (``finish_join``); the membership is then active.

**Paying, in order (B3, B14, T1-T4):**
1. **Thrift+ credit** (refund money) first, automatically, up to the whole total: a payment after tax
   (``Cart.thrift_credit``, set by the post-total hook ``after_totals_if_live``).
2. **Kept ThriftBucks**, automatically (owner 10-14), soonest use-by first, worked out so the credit is spent in full:
   the smallest amount that brings the total with tax down to the credit. They come off **before tax** as one
   Thrift+-owned discount line (``meta={'thrift': 'bucks', ...}``, T3: a discount, never a tender), which only
   ``sync`` creates, resizes or deletes. They pay for merchandise only, never consignment (B3). The cashier can turn
   them off for the trip ("don't use them today", ``CartMember.use_bucks``).
3. **Redeemed instantly** (B1): only when the member asks, and only on what is left after 1 and 2 (owner 10-14); not
   offered when nothing is left. The trip's ThriftBucks come off today's price at ``thrift_plus_instant_share`` (50%),
   per line (``CartLine.thrift_savings``, before tax, T1). The choice is logged. Kept is the Default.

Items bought with credit or ThriftBucks still collect ThriftBucks (B3): ThriftBucks used never cut what a line collects.

**Completing** writes the ledger: per line the ThriftBucks kept (usable from tomorrow for 30 days, B5) and the
ThriftBucks used on it; the credit spent; and a snapshot of the line in ``CartLine.meta['thrift_plus']`` (collected,
kept, instant, ThriftBucks used, money paid and its tax, the 3-day return mark and the use-by date), which returns and
receipts read. **Voiding** reverses the rows. **Re-ring** (a member within 30 minutes of a sale): the trip's
ThriftBucks are kept, usable from tomorrow; no instant redemption, no credit (owner 10-14).

**18+:** products in ``RestrictedProduct`` sell only to a member verified 18+, checked when the item is added and again
when the sale completes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, ROUND_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import Account, CartMember, Card, Event, ItemReward, LedgerEntry, Person, RestrictedProduct
from apps.thriftplus.services import ledger, members, trip
from apps.thriftplus.services.members import MemberError
from apps.thriftplus.services.rewards import floor_for, rules

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
TEST_REGISTERS_KEY = 'thrift_plus_test_registers'
RERING_WINDOW = timedelta(minutes=30)
BUCKS_TAG = 'bucks'
BUCKS_LABEL = 'ThriftBucks used'
ERROR_TEXT = 'Thrift+ could not work out this sale. It is priced as a non-member sale; call a manager.'
PENDING_TEXT = 'Joined online. Finish joining first: ask the phone number, check the ID, take the photo.'
PHONE_TAKEN_TEXT = 'That phone number is on another membership. Check the ID and ask a manager.'


class RegisterError(Exception):
    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code = code
        self.extra = extra  # more for the terminal (MEMBER_PENDING: the person to finish)

    def payload(self) -> dict:
        return {**self.extra, 'detail': str(self), 'code': self.code}


# ── Live or dark ───────────────────────────────────────────────────────────────

def live_register_codes() -> set[str]:
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=TEST_REGISTERS_KEY).values_list('value', flat=True).first()
    if isinstance(raw, str):
        raw = raw.split(',')
    return {str(c).strip().upper() for c in (raw or []) if str(c).strip()}


def register_code(cart) -> str:
    from apps.pos.models import Drawer

    return (Drawer.objects.filter(pk=cart.drawer_id).values_list('register__code', flat=True).first() or '').upper()


def is_training(cart) -> bool:
    """The sale is on a training register (owner, 2026-10-10): Thrift+ as on launch day, nothing real written."""
    from apps.pos.models import Drawer

    return bool(Drawer.objects.filter(pk=cart.drawer_id).values_list('register__is_training', flat=True).first())


def is_live(cart) -> bool:
    """Thrift+ is live for this sale: the switch is on, its register is a test register, or a training register."""
    return members.is_enabled() or register_code(cart) in live_register_codes() or is_training(cart)


def sync_if_live(cart) -> bool:
    """Called by ``Cart.recalculate`` before it adds up the lines. Answers whether Thrift+ is live here, so the
    post-total hook runs only then. A problem never stops a sale: it is logged and the Thrift+ prices come off."""
    try:
        live = is_live(cart)
    except Exception:  # pragma: no cover - a settings read failing must not break the POS
        logger.exception('thrift+ live check failed for cart %s', cart.pk)
        return False
    if live:
        try:
            with transaction.atomic():  # a savepoint: a failure here leaves the sale's own transaction usable
                sync(cart)
            cart._thrift_plus_failed = False
        except Exception:
            logger.exception('thrift+ sync failed for cart %s', cart.pk)
            cart._thrift_plus_failed = True
            _clear(cart)
    return live


def after_totals_if_live(cart, *, live: bool | None = None) -> None:
    """Called by ``Cart.recalculate`` after the total: the member's Thrift+ credit pays first, up to the total (B3, a
    payment after tax). Returns at once while Thrift+ is dark here."""
    if live is None:
        try:
            live = is_live(cart)
        except Exception:  # pragma: no cover
            logger.exception('thrift+ live check failed for cart %s', cart.pk)
            return
    if not live:
        return
    try:
        with transaction.atomic():
            _after_totals(cart)
    except Exception:
        logger.exception('thrift+ credit failed for cart %s', cart.pk)


def _after_totals(cart) -> None:
    from apps.pos.models import Cart

    if cart.status != 'open':
        return  # a finished sale keeps what it was paid with
    member = member_of(cart)
    credit = ZERO
    if member is not None and not getattr(cart, '_thrift_plus_failed', False):  # after a failure: a guest sale
        credit = min(ledger.credit_balance(member.account), max(ZERO, cart.total or ZERO))
    Cart.objects.filter(pk=cart.pk).exclude(thrift_credit=credit).update(thrift_credit=credit)
    cart.thrift_credit = credit


def _clear(cart) -> None:
    """After a failure: no member prices, no ThriftBucks line, no credit. Never raises."""
    from apps.pos.models import Cart, CartLine

    try:
        with transaction.atomic():
            for line in CartLine.objects.filter(cart_id=cart.pk):
                if is_bucks_line(line):
                    line.delete()
                elif line.thrift_savings:
                    line.thrift_savings = ZERO
                    line.save()
            if cart.status == 'open':
                Cart.objects.filter(pk=cart.pk).update(thrift_credit=ZERO)
                cart.thrift_credit = ZERO
    except Exception:  # pragma: no cover
        logger.exception('thrift+ clear failed for cart %s', cart.pk)


# ── Lines ──────────────────────────────────────────────────────────────────────

def member_of(cart) -> CartMember | None:
    return CartMember.objects.filter(cart_id=cart.pk).select_related('account', 'person', 'card').first()


def is_bucks_line(line) -> bool:
    """The Thrift+ ThriftBucks discount line (only ``sync`` writes it)."""
    return line.line_kind == 'discount' and isinstance(line.meta, dict) and line.meta.get('thrift') == BUCKS_TAG


def _all_lines(cart) -> list:
    from apps.pos.models import CartLine

    return list(CartLine.objects.filter(cart_id=cart.pk).select_related('item__product__profile').order_by('pk'))


def _item_lines(cart) -> list:
    from apps.pos.models import CartLine

    return list(
        CartLine.objects.filter(cart_id=cart.pk, line_kind=CartLine.LINE_KIND_ITEM, item__isnull=False)
        .select_related('item').order_by('pk')
    )


def _is_item(line) -> bool:
    return line.line_kind == 'item' and line.item_id is not None


def _bucks_eligible(line) -> bool:
    """Merchandise ThriftBucks can pay for: items (not consignment) and manual lines (B3)."""
    if _is_item(line):
        return line.item.source != 'consignment'
    return line.line_kind == 'manual'


def tag_total(line) -> Decimal:
    """The line's total before any instant redemption (as ``CartLine.save`` works it out)."""
    if not line.thrift_savings:
        return line.line_total or ZERO
    pct = line.sale_percent or ZERO
    return (Decimal(str(line.unit_price or 0)) * int(line.quantity or 0)
            * (Decimal('1') - pct / Decimal('100'))).quantize(Decimal('0.01'))


def total_with_tax(subtotal: Decimal, rate: Decimal) -> Decimal:
    """The total for a subtotal, exactly as ``Cart.recalculate`` works it out."""
    return subtotal + (subtotal * rate).quantize(Decimal('0.01'))


def _most_within(amount: Decimal, rate: Decimal) -> Decimal:
    """The largest subtotal (to the cent) whose total with tax is at most ``amount``."""
    if amount <= 0:
        return ZERO
    s = (amount / (Decimal('1') + rate)).quantize(CENT, rounding=ROUND_DOWN)
    for _ in range(100):
        if total_with_tax(s + CENT, rate) > amount:
            break
        s += CENT
    for _ in range(100):
        if s <= 0 or total_with_tax(s, rate) <= amount:
            break
        s -= CENT
    return max(ZERO, s)


def _least_reaching(amount: Decimal, rate: Decimal) -> Decimal:
    """The smallest subtotal (to the cent) whose total with tax is at least ``amount``."""
    if amount <= 0:
        return ZERO
    s = (amount / (Decimal('1') + rate)).quantize(CENT, rounding=ROUND_UP)
    for _ in range(100):
        if s <= 0 or total_with_tax(s - CENT, rate) < amount:
            break
        s -= CENT
    for _ in range(100):
        if total_with_tax(s, rate) >= amount:
            break
        s += CENT
    return s


def _discounts(cart_id: int, item_lines: list) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
    """Per item line: the biggest percent discount that applies to it (line-scoped or cart-wide), and the dollars its
    discount lines take off (a line's own, plus its share of cart-wide ones by value). The Thrift+ ThriftBucks line
    is left out: ThriftBucks used never cut what an item collects (B3)."""
    from apps.pos.models import CartLine

    pct: dict[int, Decimal] = {}
    dollars: dict[int, Decimal] = {l.pk: ZERO for l in item_lines}
    # Split a cart-wide discount by each line's price before any rebate: line_total moves as the rebate
    # syncs, and a moving base would make the split wobble between recalculations.
    base = {
        l.pk: max(ZERO, (l.unit_price or ZERO) * (Decimal('1') - (l.sale_percent or ZERO) / Decimal('100')) * (l.quantity or 1))
        for l in item_lines
    }
    total = sum(base.values(), ZERO)
    for d in CartLine.objects.filter(cart_id=cart_id, line_kind=CartLine.LINE_KIND_DISCOUNT):
        if is_bucks_line(d):
            continue
        meta = d.meta or {}
        amount = max(ZERO, -(d.line_total or ZERO))
        target = meta.get('target_line_id')
        percent = Decimal(str(meta.get('percent') or 0)) if meta.get('mode') == 'percent' else ZERO
        if meta.get('scope') == 'line' and target is not None:
            try:
                target = int(target)
            except (TypeError, ValueError):
                continue
            if target in dollars:
                dollars[target] += amount
                pct[target] = max(pct.get(target, ZERO), percent)
            continue
        for pk, value in base.items():
            if total > 0:
                dollars[pk] += (amount * value / total).quantize(CENT, rounding=ROUND_HALF_UP)
            pct[pk] = max(pct.get(pk, ZERO), percent)
    return pct, dollars


def _rewards(item_ids: list[int], *, include_closed: bool = False) -> dict[int, Decimal]:
    qs = ItemReward.objects.filter(item_id__in=item_ids).exclude(status=ItemReward.STATUS_EXCLUDED)
    if not include_closed:
        qs = qs.exclude(status=ItemReward.STATUS_CLOSED)
    return dict(qs.values_list('item_id', 'reward'))


def trip_lines(lines: list, *, include_closed: bool = False) -> list[trip.TripLine]:
    """Each item line's price and member reward per unit, by the discount logic:
    - the reward is last night's, clipped to the line's own tag floor;
    - consignment gets none;
    - a percent sale (Labor Day, Summer) scales the tag and the reward alike, and so does a percent
      discount line (Google review), the biggest one;
    - the line's discount dollars cap what it can give back."""
    share = rules().floor_share
    rewards_by_item = _rewards([l.item_id for l in lines], include_closed=include_closed)
    pct_by_line, dollars_by_line = _discounts(lines[0].cart_id, lines) if lines else ({}, {})
    out = []
    for line in lines:
        tag = line.unit_price or ZERO
        factor = Decimal('1') - (line.sale_percent or ZERO) / Decimal('100')
        price = (tag * factor).quantize(CENT, rounding=ROUND_HALF_UP)
        reward = ZERO
        if line.item.source != 'consignment' and tag > 0:
            reward = min(rewards_by_item.get(line.item_id, ZERO), max(ZERO, tag - floor_for(tag, share)))
            reward = (reward * factor).quantize(CENT, rounding=ROUND_DOWN)
            extra = pct_by_line.get(line.pk, ZERO)
            if extra > 0:
                reward = (reward * (Decimal('1') - extra / Decimal('100'))).quantize(CENT, rounding=ROUND_DOWN)
        out.append(trip.TripLine(key=str(line.pk), price=price, reward=reward, qty=line.quantity or 1,
                                 discount=dollars_by_line.get(line.pk, ZERO)))
    return out


def split_bucks(lines: list, amount: Decimal) -> dict[int, Decimal]:
    """The ThriftBucks discount line split over the merchandise it paid for, by line value (the last line takes the
    cents left), so each line knows the ThriftBucks used on it (returns give 80% of them back, W3)."""
    eligible = [l for l in lines if not is_bucks_line(l) and _bucks_eligible(l) and (l.line_total or ZERO) > 0]
    out: dict[int, Decimal] = {}
    if amount <= 0 or not eligible:
        return out
    weight = sum((l.line_total for l in eligible), ZERO)
    left = amount
    for i, line in enumerate(eligible):
        part = left if i == len(eligible) - 1 else min(left, (amount * line.line_total / weight).quantize(CENT, rounding=ROUND_HALF_UP))
        out[line.pk] = part
        left -= part
    return out


def paid_by_line(lines: list, bucks_by_line: dict[int, Decimal]) -> dict[int, Decimal]:
    """The money paid for each line before tax: its total less its own discounts, its share of cart-wide discounts
    (by value) and the ThriftBucks used on it. Never below zero."""
    positive = [l for l in lines if l.line_kind != 'discount']
    own: dict[int, Decimal] = {}
    cart_wide = ZERO
    for d in lines:
        if d.line_kind != 'discount' or is_bucks_line(d):
            continue
        meta = d.meta if isinstance(d.meta, dict) else {}
        amount = max(ZERO, -(d.line_total or ZERO))
        target = meta.get('target_line_id')
        if meta.get('scope') == 'line' and target is not None:
            try:
                own[int(target)] = own.get(int(target), ZERO) + amount
                continue
            except (TypeError, ValueError):
                pass
        cart_wide += amount
    weight = sum((max(ZERO, l.line_total or ZERO) for l in positive), ZERO)
    out = {}
    for line in positive:
        value = max(ZERO, line.line_total or ZERO)
        share = (cart_wide * value / weight).quantize(CENT, rounding=ROUND_HALF_UP) if weight > 0 else ZERO
        out[line.pk] = max(ZERO, value - share - own.get(line.pk, ZERO) - bucks_by_line.get(line.pk, ZERO))
    return out


# ── The trip's plan: credit, kept ThriftBucks, instant ─────────────────────────


@dataclass
class Plan:
    member: CartMember | None
    trip: trip.TripTotals
    share: Decimal
    subtotal_at_tag: Decimal = ZERO
    total_at_tag: Decimal = ZERO
    eligible: Decimal = ZERO
    credit_available: Decimal = ZERO
    credit_used: Decimal = ZERO
    bucks_auto: bool = True
    bucks_available: Decimal = ZERO
    bucks_used: Decimal = ZERO
    instant_offered: bool = False
    instant_reason: str = ''
    choice: str = CartMember.CHOICE_BANK
    instant_offer: Decimal = ZERO  # dollars off today if they choose instant (what the panel offers)
    total: Decimal = ZERO
    collected: dict[int, Decimal] = field(default_factory=dict)  # line → ThriftBucks collected (full value)
    savings: dict[int, Decimal] = field(default_factory=dict)  # line → dollars off today (instant)
    redeemed: dict[int, Decimal] = field(default_factory=dict)  # line → ThriftBucks redeemed instantly
    lots: list = field(default_factory=list)

    @property
    def collected_total(self) -> Decimal:
        return sum(self.collected.values(), ZERO)

    @property
    def instant_off(self) -> Decimal:
        return sum(self.savings.values(), ZERO)

    @property
    def instant_bucks(self) -> Decimal:
        return sum(self.redeemed.values(), ZERO)


def plan(cart, member: CartMember | None, *, lines: list | None = None, include_closed: bool = False,
         on: date | None = None) -> Plan:
    """What this trip does, in the B3 order: credit first (after tax), then kept ThriftBucks (before tax, so the credit
    is spent in full), then an instant redemption on what is left. Reads only; ``sync`` writes it."""
    lines = _all_lines(cart) if lines is None else lines
    others = [l for l in lines if not is_bucks_line(l)]
    item_lines = [l for l in others if _is_item(l)]
    rate = cart.tax_rate or ZERO
    share = trip.instant_share()
    t = trip.totals(trip_lines(item_lines, include_closed=include_closed), member=member is not None,
                    choice=trip.CHOICE_BANK, share=share)
    p = Plan(member=member, trip=t, share=share)
    p.subtotal_at_tag = sum((tag_total(l) for l in others), ZERO)
    p.total_at_tag = total_with_tax(p.subtotal_at_tag, rate)
    p.eligible = sum((tag_total(l) for l in others if _bucks_eligible(l)), ZERO)
    p.total = p.total_at_tag
    if member is None:
        p.instant_reason = 'No Thrift+ member on this sale.'
        return p
    p.collected = {int(s.key): s.collected for s in t.lines}
    on = on or timezone.localdate()
    p.lots = ledger.lots(member.account)
    p.credit_available = ledger.credit_balance(member.account)
    p.bucks_available = ledger.available_bucks(member.account, on, of=p.lots)
    p.bucks_auto = bool(member.use_bucks)
    credit = p.credit_available
    subtotal = p.subtotal_at_tag

    # 2. Kept ThriftBucks: the least that brings the total down to the credit (B14), within what is usable today
    #    and the merchandise they can pay for.
    if p.bucks_auto and p.bucks_available > 0 and credit < p.total_at_tag:
        needed = max(ZERO, subtotal - _most_within(credit, rate))
        p.bucks_used = max(ZERO, min(p.bucks_available, p.eligible, needed))
    after_bucks = subtotal - p.bucks_used
    total_after_bucks = total_with_tax(after_bucks, rate)
    credit_after_bucks = min(credit, max(ZERO, total_after_bucks))
    left = total_after_bucks - credit_after_bucks

    # 3. Instant: only on what is left (owner 10-14).
    if member.rering:
        p.instant_reason = 'No instant redemption on a re-ring.'
    elif t.full_value <= 0:
        p.instant_reason = 'This trip collects no ThriftBucks.'
    elif credit >= p.total_at_tag:
        p.instant_reason = 'Thrift+ credit pays the whole total.'
    elif left <= 0:
        p.instant_reason = 'Thrift+ credit and kept ThriftBucks pay the whole total.'
    else:
        p.instant_offered = True
    p.choice = CartMember.CHOICE_INSTANT if (member.reward_choice == CartMember.CHOICE_INSTANT and p.instant_offered) \
        else CartMember.CHOICE_BANK
    if p.instant_offered:
        # Worked out whichever they chose, so the panel offers the real figure (capped at what is left) before the tap.
        savings: dict[int, Decimal] = {}
        redeemed: dict[int, Decimal] = {}
        room = max(ZERO, min(after_bucks - _least_reaching(credit_after_bucks, rate), p.eligible - p.bucks_used))
        for s in t.lines:
            full = trip.instant_part(s.collected, share)
            take = min(full, room)
            if take <= 0:
                continue
            key = int(s.key)
            savings[key] = take
            if take == full:
                redeemed[key] = s.collected
            else:  # only part of what is left: redeem just enough, rounded in the member's favor
                redeemed[key] = min(s.collected, (take / share).quantize(CENT, rounding=ROUND_DOWN)) if share > 0 else ZERO
            room -= take
        p.instant_offer = sum(savings.values(), ZERO)
        if p.choice == CartMember.CHOICE_INSTANT:
            p.savings, p.redeemed = savings, redeemed
    p.total = total_with_tax(subtotal - p.bucks_used - p.instant_off, rate)
    p.credit_used = min(credit, max(ZERO, p.total))
    return p


def sync(cart) -> None:
    """Put the plan on the sale: each item line's instant savings, and the one ThriftBucks discount line (or neither,
    for a guest). A finished sale keeps what it was sold at."""
    if cart.status != 'open':
        return
    lines = _all_lines(cart)
    member = member_of(cart)
    savings: dict[int, Decimal] = {}
    bucks = ZERO
    if member is not None:
        p = plan(cart, member, lines=lines)
        if p.choice != member.reward_choice:  # instant is no longer offered: back to kept (the Default)
            member.reward_choice = p.choice
            member.save(update_fields=['reward_choice'])
        savings, bucks = p.savings, p.bucks_used
    for line in lines:
        if is_bucks_line(line):
            continue
        new = savings.get(line.pk, ZERO)
        if line.thrift_savings != new:
            line.thrift_savings = new
            line.save()
    _put_bucks_line(cart, [l for l in lines if is_bucks_line(l)], bucks)


def _put_bucks_line(cart, existing: list, amount: Decimal) -> None:
    from apps.pos.models import CartLine

    if amount <= 0:
        for line in existing:
            line.delete()
        return
    for extra in existing[1:]:
        extra.delete()
    line = existing[0] if existing else CartLine(cart_id=cart.pk, item=None, line_kind=CartLine.LINE_KIND_DISCOUNT)
    meta = {'thrift': BUCKS_TAG, 'reason': BUCKS_LABEL}
    if line.pk and line.unit_price == -amount and line.quantity == 1 and line.meta == meta and not line.sale_percent:
        return
    line.description, line.quantity, line.unit_price, line.meta = BUCKS_LABEL, 1, -amount, meta
    line.sale_label, line.sale_percent, line.thrift_savings = '', ZERO, ZERO
    line.save()


def bucks_line(cart):
    from apps.pos.models import CartLine

    return next((l for l in CartLine.objects.filter(cart_id=cart.pk, line_kind=CartLine.LINE_KIND_DISCOUNT)
                 if is_bucks_line(l)), None)


def bucks_used(cart) -> Decimal:
    line = bucks_line(cart)
    return max(ZERO, -(line.line_total or ZERO)) if line is not None else ZERO


# ── 18+ ────────────────────────────────────────────────────────────────────────

def is_restricted(item) -> bool:
    return RestrictedProduct.objects.filter(product_id=item.product_id).exists()


def check_item(cart, item) -> None:
    """Before an item goes on a live sale: an 18+ item needs a member verified 18+ on the sale."""
    if not is_restricted(item) or not is_live(cart):  # one query for the usual, unmarked item
        return
    member = member_of(cart)
    if member is None or not member.person.verified_18:
        raise RegisterError(
            'AGE_RESTRICTED',
            'This item is 18+. It sells only to a Thrift+ member who was ID-checked as 18 or older.',
        )


def restricted_lines(cart) -> list[int]:
    lines = _item_lines(cart)
    marked = set(RestrictedProduct.objects.filter(product_id__in=[l.item.product_id for l in lines]).values_list('product_id', flat=True))
    return [l.pk for l in lines if l.item.product_id in marked]


# ── Attach, the choice, ThriftBucks on or off ──────────────────────────────────

def _card(code: str) -> Card:
    """The member code scanned (the QR in the Thrift+ app, or a printed blank's), checked."""
    try:
        card = members.card_by_code(code)
    except MemberError as exc:
        raise RegisterError('CARD_UNKNOWN', str(exc)) from exc
    if card.status != Card.STATUS_ACTIVE or card.person is None:
        raise RegisterError('CARD_NOT_ACTIVE', 'This membership is not active. Sign them up, or find them by phone.')
    _check_ready(card.person)
    return card


def _check_ready(person: Person) -> None:
    """A person who can go on a sale: on the membership, and the membership active. Joined online and not finished:
    ``MEMBER_PENDING`` with the person, so the terminal opens Finish joining (J2: it collects and uses nothing)."""
    if person.removed_at is None and person.account.status == Account.STATUS_PENDING:
        raise RegisterError('MEMBER_PENDING', PENDING_TEXT, **pending_person(person))
    if person.removed_at is not None or person.account.status != Account.STATUS_ACTIVE:
        raise RegisterError('CARD_NOT_ACTIVE', 'This membership is not active.')


def _person(person_id) -> Person:
    """The person the cashier picked after finding them by phone (owner 2026-10-14), checked like a scan."""
    try:
        person = Person.objects.select_related('account').get(pk=int(person_id))
    except (Person.DoesNotExist, TypeError, ValueError):
        raise RegisterError('MEMBER_UNKNOWN', 'That member is not in the system. Find them by phone again.') from None
    _check_ready(person)
    return person


def found(code: str = '', person=None) -> tuple[Person, Card | None]:
    """Who is at the register: the member QR scanned (``code``), or the person found by phone (``person``, an id).
    Answers the person and the code scanned (None when found by phone)."""
    if person not in (None, ''):
        return _person(person), None
    card = _card(code)
    return card.person, card


def attach(cart, code: str = '', *, person=None, user=None) -> CartMember:
    """Put a member on an open sale: their member QR scanned, or found by phone (``person``). It replaces any member
    already on it. Kept is the Default (B1)."""
    if cart.status != 'open':
        raise RegisterError('CART_NOT_OPEN', 'This sale is finished. Use re-ring to put the member on it.')
    if not is_live(cart):
        raise RegisterError('NOT_LIVE', 'Thrift+ is not on at this register yet.')
    who, card = found(code, person)
    training = is_training(cart)
    if who.account.is_practice and not training:
        raise RegisterError('PRACTICE_CARD', 'This is a practice member. Use the training register.')
    with transaction.atomic():
        detail = {'cart': cart.pk}
        if training:  # a real member put on the training register is practice: the Event says so (2026-10-14)
            detail['training'] = True
        if card is None:  # found by phone: their code (made when they have none), and the Event says how
            card = members.member_code(who, user=user)
            detail['by'] = 'phone'
        before = member_of(cart)
        defaults = {'account': who.account, 'person': who, 'card': card, 'attached_by': user}
        if before is None or before.account_id != who.account_id:
            defaults.update(reward_choice=CartMember.CHOICE_BANK, use_bucks=True)
        member, _ = CartMember.objects.update_or_create(cart=cart, defaults=defaults)
        members.log('register_attach', account=member.account, person=member.person, card=card, actor=user, **detail)
        cart.recalculate()
    return member


def detach(cart, *, user=None) -> None:
    if cart.status != 'open':
        raise RegisterError('CART_NOT_OPEN', 'This sale is finished.')
    member = member_of(cart)
    if member is None:
        return
    with transaction.atomic():
        members.log('register_detach', account=member.account, person=member.person, card=member.card, actor=user, cart=cart.pk)
        member.delete()
        cart.thrift_credit = ZERO
        cart.save(update_fields=['thrift_credit'])
        cart.recalculate()


def _open_member(cart) -> CartMember:
    if cart.status != 'open':
        raise RegisterError('CART_NOT_OPEN', 'This sale is finished.')
    member = member_of(cart)
    if member is None:
        raise RegisterError('NO_MEMBER', "Scan the member's QR or find them by phone first.")
    return member


def set_choice(cart, choice: str, *, user=None) -> CartMember:
    """Kept (the Default) or redeemed instantly, for the whole trip (B1). Refused when instant isn't offered. Logged."""
    if choice not in (CartMember.CHOICE_BANK, CartMember.CHOICE_INSTANT):
        raise RegisterError('BAD_CHOICE', 'Keep the ThriftBucks, or redeem them instantly.')
    member = _open_member(cart)
    if choice == CartMember.CHOICE_INSTANT:
        p = plan(cart, member)
        if not p.instant_offered:
            raise RegisterError('INSTANT_NOT_OFFERED', p.instant_reason or 'Redeeming instantly is not offered on this sale.')
    with transaction.atomic():
        member.reward_choice = choice
        member.save(update_fields=['reward_choice'])
        members.log('register_choice', account=member.account, person=member.person, card=member.card, actor=user,
                    cart=cart.pk, choice=choice)
        cart.recalculate()
    return member


def set_bucks(cart, use: bool, *, user=None) -> CartMember:
    """Use the member's kept ThriftBucks on this trip automatically (the Default), or not today (owner 10-14)."""
    member = _open_member(cart)
    with transaction.atomic():
        member.use_bucks = bool(use)
        member.save(update_fields=['use_bucks'])
        members.log('register_bucks', account=member.account, person=member.person, card=member.card, actor=user,
                    cart=cart.pk, use=bool(use))
        cart.recalculate()
    return member


def amount_due(cart) -> Decimal:
    """What cash or card covers: the total less the Thrift+ credit."""
    return max(ZERO, (cart.total or ZERO) - (cart.thrift_credit or ZERO))


# ── Complete and void (called from the POS views) ──────────────────────────────

def touches(cart) -> bool:
    """Whether completing or voiding this sale has Thrift+ work: a member, spent credit, or a live register."""
    return bool(cart.thrift_credit) or member_of(cart) is not None or is_live(cart)


def before_complete(cart) -> None:
    """Checks that can refuse the sale: 18+ lines need a member verified 18+, and the credit and ThriftBucks on the
    sale must still be there (the other adult may have spent them since). When they aren't, the sale is priced again.
    Anything unexpected refuses with a message (never a server error)."""
    try:
        _before_complete(cart)
    except RegisterError:
        raise
    except Exception as exc:
        logger.exception('thrift+ check before completing cart %s failed', cart.pk)
        raise RegisterError('THRIFT_ERROR', 'Thrift+ could not check this sale. Take the Thrift+ member off the sale, '
                                            'then take payment.') from exc


def _before_complete(cart) -> None:
    member = member_of(cart)
    if restricted_lines(cart) and (member is None or not member.person.verified_18):
        raise RegisterError('AGE_RESTRICTED', 'An 18+ item is on this sale. It needs a Thrift+ member verified 18+, or take it off.')
    line = bucks_line(cart)
    if member is None:
        if cart.thrift_credit:
            cart.thrift_credit = ZERO
            cart.save(update_fields=['thrift_credit'])
        if line is not None:
            line.delete()
            cart.recalculate()
            raise RegisterError('THRIFT_CHANGED', 'The Thrift+ amounts changed. Check the new total, then take payment.')
        return
    used = max(ZERO, -(line.line_total or ZERO)) if line is not None else ZERO
    credit = cart.thrift_credit or ZERO
    if credit > ledger.credit_balance(member.account) or used > ledger.available_bucks(member.account):
        cart.recalculate()
        raise RegisterError('OVER_BALANCE', 'The member no longer has that much Thrift+ credit or ThriftBucks. '
                                            'Check the new total, then take payment.')
    if credit > (cart.total or ZERO):
        cart.recalculate()
        raise RegisterError('THRIFT_CHANGED', 'The Thrift+ amounts changed. Check the new total, then take payment.')


def _snapshot(line, *, collected: Decimal, redeemed: Decimal, bucks: Decimal, paid: Decimal, rate: Decimal,
              use_by: date, rules_=None) -> dict:
    """What a line was sold at, for returns and receipts (W11): frozen at the sale."""
    from apps.thriftplus.services.returns import line_price, mark_for

    kept = max(ZERO, collected - redeemed)
    qty = line.quantity or 1
    mark, why = mark_for(line.item if _is_item(line) else None, price=line_price(line),
                         reward=(collected / qty).quantize(CENT), rules=rules_)
    return {
        'collected': str(collected), 'kept': str(kept), 'instant_off': str(line.thrift_savings or ZERO),
        'instant_bucks': str(redeemed), 'bucks_used': str(bucks), 'paid': str(paid),
        'tax': str((paid * rate).quantize(CENT, rounding=ROUND_HALF_UP)), 'mark': mark, 'why': why,
        'use_by': use_by.isoformat() if kept > 0 else None,
    }


def _save_snapshot(line, snap: dict) -> None:
    from apps.pos.models import CartLine

    meta = dict(line.meta) if isinstance(line.meta, dict) else {}
    meta['thrift_plus'] = snap
    CartLine.objects.filter(pk=line.pk).update(meta=meta)
    line.meta = meta


def after_complete(cart, *, user=None) -> None:
    """The completed sale's ledger rows, each line's snapshot, and each item's reward at sale. Runs inside the POS's
    completion transaction; a failure in the member's part is logged and never stops the sale."""
    member = member_of(cart)
    lines = _all_lines(cart)
    item_lines = [l for l in lines if _is_item(l)]
    now = timezone.now()
    applied: dict[int, Decimal] = {}
    if member is not None:
        try:
            with transaction.atomic():
                applied = _member_sale(cart, member, lines, item_lines, user=user)
        except Exception:
            logger.exception('thrift+ ledger for completed cart %s failed', cart.pk)
            applied = {}
    for line in item_lines:
        ItemReward.objects.filter(item_id=line.item_id).exclude(status=ItemReward.STATUS_CLOSED).update(
            status=ItemReward.STATUS_CLOSED, reason='left_floor_sold', closed_at=now, closed_status='sold',
            reward_at_close=applied.get(line.item_id, ZERO), updated_at=now,
        )


def _member_sale(cart, member: CartMember, lines: list, item_lines: list, *, user=None) -> dict[int, Decimal]:
    """A member's completed sale: kept and spent rows per line, the credit spent, the snapshots. Answers each item's
    reward at sale."""
    from apps.thriftplus.services.returns import guide

    from apps.thriftplus.services.scanner import after_sale

    applied: dict[int, Decimal] = {}
    account = member.account
    use_by = timezone.localdate() + timedelta(days=ledger.REWARD_DAYS)
    p = plan(cart, member, lines=lines)
    rewards_by_line = {int(s.key): s.reward for s in p.trip.lines}
    used = bucks_used(cart)
    bucks_by_line = split_bucks(lines, used)
    paid = paid_by_line(lines, bucks_by_line)
    rate = cart.tax_rate or ZERO
    rules_ = guide()
    kept_total = redeemed_total = ZERO
    for line in lines:
        if not (_is_item(line) or line.line_kind == 'manual'):
            continue
        collected = p.collected.get(line.pk, ZERO)
        redeemed = min(collected, p.redeemed.get(line.pk, collected)) if line.thrift_savings else ZERO
        kept = collected - redeemed
        bucks = bucks_by_line.get(line.pk, ZERO)
        ledger.record(account, LedgerEntry.KIND_BANK, kept, 'sale', cart=cart, line=line, actor=user)
        ledger.record(account, LedgerEntry.KIND_BANK, -bucks, 'spend', cart=cart, line=line, actor=user)
        _save_snapshot(line, _snapshot(line, collected=collected, redeemed=redeemed, bucks=bucks,
                                       paid=paid.get(line.pk, ZERO), rate=rate, use_by=use_by, rules_=rules_))
        kept_total += kept
        redeemed_total += redeemed
        if _is_item(line):
            applied[line.item_id] = (rewards_by_line.get(line.pk, ZERO) / (line.quantity or 1)).quantize(CENT)
    credit = cart.thrift_credit or ZERO
    ledger.record(account, LedgerEntry.KIND_CREDIT, -credit, 'spend', cart=cart, actor=user)
    CartMember.objects.filter(pk=member.pk).update(credit_used=credit, bank_used=used)
    members.log('register_sale', account=account, person=member.person, card=member.card, actor=user,
                cart=cart.pk, choice=member.reward_choice, collected=str(p.collected_total),
                kept=str(kept_total), instant_bucks=str(redeemed_total),
                instant_off=str(sum((l.thrift_savings or ZERO for l in item_lines), ZERO)),
                bucks_used=str(used), credit_used=str(credit))
    after_sale(account, [line.item_id for line in item_lines])
    return applied


def after_void(cart, *, user=None) -> None:
    """A voided sale gives back what it wrote to the ledger."""
    if LedgerEntry.objects.filter(cart=cart).exists():
        ledger.reverse_cart(cart, 'void', user)


# ── Joined online: finish joining at the register (owner 2026-10-15, J8) ────────

def pending_person(person: Person) -> dict:
    """One pending join, for the cashier to pick and finish. ``qr`` is their member QR (staff screens only): the
    terminal shows it so the Finalize phone can scan it off the screen (owner 2026-10-16)."""
    card = (Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).order_by('-issued_at', '-pk')
            .values_list('code', flat=True).first())
    return {
        'person_id': person.pk, 'account_id': person.account_id, 'first_name': person.first_name,
        'last_name': person.last_name, 'email': person.email, 'joined_at': person.account.created_at,
        'code_last4': card[-4:] if card else None, 'qr': f'TP{card}' if card else None,
    }


def pending(query: str = '', *, limit: int = 10, rows=None) -> list[dict]:
    """Pending joins by name, email or member code (their QR), newest first; with nothing typed, the newest."""
    from django.db.models import Q

    from apps.thriftplus.services.cards import parse

    q = (query or '').strip()
    people = Person.objects.select_related('account').filter(account__status=Account.STATUS_PENDING, removed_at__isnull=True)
    code = parse(q) if q else ''
    if code:
        people = people.filter(cards__code=code)
    elif q:
        for word in q.split():
            people = people.filter(Q(first_name__icontains=word) | Q(last_name__icontains=word) | Q(email__icontains=word))
    return [(rows or pending_person)(p) for p in people.distinct().order_by('-account__created_at', '-pk')[:limit]]


# Finalize Thrift+'s list before anything is typed (owner 2026-10-16): the newest online joins, scrollable.
RECENT_JOINS = 50


def recent_joins(limit: int = RECENT_JOINS) -> list[dict]:
    """The newest online joins, newest first, up to ``limit``: the ones still to finish and the ones already finished
    (``status`` ``pending`` or ``active``), so a cashier sees at a glance whether someone is done."""
    joined = Event.objects.filter(action='joined_online', account__isnull=False).values('account_id')
    people = (Person.objects.select_related('account', 'phone_verified_by')
              .filter(account_id__in=joined, role=Person.ROLE_PRIMARY, removed_at__isnull=True,
                      account__status__in=[Account.STATUS_PENDING, Account.STATUS_ACTIVE])
              .order_by('-account__created_at', '-pk')[:limit])
    return [finalize_row(p) for p in people]


def _who(user) -> str:
    return (user.full_name or user.email) if user else ''


def finalize_row(person: Person) -> dict:
    """One person on Finalize (owner 2026-10-16): the card's line (name, member number, phone's last 4, when they
    joined) and everything the panel shows when it is tapped. Staff screens only."""
    from django.utils import timezone

    from apps.thriftplus.services.cards import display

    row = pending_person(person)
    code = row['qr'][2:] if row.get('qr') else ''
    return {
        **row, 'status': person.account.status, 'code_display': display(code) if code else '',
        'phone_last4': person.phone[-4:] if person.phone else None,
        'email_verified': person.email_verified_at is not None,
        'id_checked': person.id_checked, 'verified_18': person.verified_18,
        'photo_url': person.photo.url if person.photo else None,
        'signed_at': person.signed_at, 'finished_at': person.phone_verified_at,
        'finished_by': _who(person.phone_verified_by),
        'app_signed_in': person.sessions.filter(expires_at__gt=timezone.now()).exists(),
    }


def code_member(query: str) -> dict | None:
    """A scanned member QR that is not a pending join (Finalize Thrift+): who it is and where the membership stands, so
    the cashier is told "already a member" instead of "not found". None when the text is not a member code."""
    from apps.thriftplus.services.cards import parse

    code = parse((query or '').strip())
    if not code:
        return None
    card = Card.objects.select_related('person__account').filter(code=code).first()
    person = card.person if card is not None else None
    if person is None:
        return {'status': 'unknown', 'first_name': ''}
    status = 'removed' if person.removed_at is not None else person.account.status
    return {'status': status, 'first_name': person.first_name}


# J5: the words the customer signs under, and the terms version they cover (ecothrift.us/terms, "Version: October 15,
# 2026"). A new terms version changes this.
SIGNATURE_WORDS = 'I agree to the Thrift+ terms and photo release. I can read them at ecothrift.us/terms.'
TERMS_VERSION = '2026-10-15'
SIGNATURE_MAX_BYTES = 1_000_000


def _check_signature(signature) -> None:
    """A PNG drawing, under 1 MB."""
    if getattr(signature, 'size', 0) > SIGNATURE_MAX_BYTES:
        raise RegisterError('SIGNATURE_BAD', 'The signature did not save. Clear it and sign again.')
    head = signature.read(8)
    signature.seek(0)
    if head != b'\x89PNG\r\n\x1a\n':
        raise RegisterError('SIGNATURE_BAD', 'The signature did not save. Clear it and sign again.')


def finish_join(person_id, *, phone: str, id_checked: bool = False, verified_18: bool = False, photo=None,
                signature=None, require_signature: bool = False, user=None) -> Person:
    """Finish joining at the register (J8): the phone the cashier read back (10 digits, unique among active and pending
    people), then the ID check, 18+ and the photo as at a register sign-up. The phone is verified in person (who and
    when); the membership becomes active.

    ``signature`` (J5, owner 2026-10-16): a PNG of the customer's signature, stored with when and the terms version.
    ``require_signature`` (Finalize Thrift+ on a phone): the signature and the ID check are both required."""
    try:
        pk = int(person_id)
    except (TypeError, ValueError):
        raise RegisterError('MEMBER_UNKNOWN', 'That member is not in the system. Find them again.') from None
    digits = members.normalize_phone(phone)
    if len(digits) != 10:
        raise RegisterError('PHONE_BAD', 'Type the 10-digit phone number.')
    if require_signature and not id_checked:
        raise RegisterError('ID_NEEDED', 'Check their photo ID first.')
    if require_signature and not signature:
        raise RegisterError('SIGNATURE_NEEDED', 'The customer signs before you finish.')
    if signature:
        _check_signature(signature)
    with transaction.atomic():
        person = Person.objects.select_for_update().select_related('account').filter(pk=pk).first()
        if person is None:
            raise RegisterError('MEMBER_UNKNOWN', 'That member is not in the system. Find them again.')
        if person.removed_at is not None or person.account.status == Account.STATUS_REVOKED:
            raise RegisterError('CARD_NOT_ACTIVE', 'This membership is not active.')
        if person.account.status != Account.STATUS_PENDING:
            raise RegisterError('NOT_PENDING', 'They already finished joining. Scan their QR or find them by phone.')
        taken = Person.objects.filter(
            phone=digits, removed_at__isnull=True, account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING),
        ).exclude(pk=person.pk).exists()
        if taken:
            raise RegisterError('PHONE_TAKEN', PHONE_TAKEN_TEXT)
        now = timezone.now()
        person.phone = digits
        person.phone_verified_at, person.phone_verified_by = now, user
        if person.email and person.email_verified_at is None:
            person.email_verified_at = now  # finalized in person (owner 2026-10-16): nobody stuck on the email
        if id_checked:
            person.id_checked, person.verified_18 = True, bool(verified_18)
            person.verified_at, person.verified_by = now, user
        if photo:
            person.photo = photo
        if signature:
            signature.name = f'person-{person.pk}-{now:%Y%m%d%H%M%S}.png'
            person.signature = signature
            person.signed_at, person.signed_terms_version = now, TERMS_VERSION
        person.save()
        account = person.account
        account.status = Account.STATUS_ACTIVE
        account.save(update_fields=['status', 'updated_at'])
        members.log('finished_joining', account=account, person=person, actor=user, id_checked=person.id_checked,
                    verified_18=person.verified_18, photo=bool(photo), signed=bool(signature))
        members.member_code(person, user=user)
    return person


# ── Re-ring ────────────────────────────────────────────────────────────────────

def rering(cart, code: str = '', *, person=None, user=None) -> CartMember:
    """Sign-up before leaving: put a member (their QR scanned, or found by phone) on a sale completed in the last 30
    minutes. The trip's ThriftBucks are kept, usable from tomorrow; no instant redemption and no Thrift+ credit (owner
    10-14)."""
    from apps.thriftplus.services.returns import guide

    if cart.status != 'completed' or not cart.completed_at:
        raise RegisterError('NOT_COMPLETED', 'Only a completed sale can be re-rung.')
    if timezone.now() - cart.completed_at > RERING_WINDOW:
        raise RegisterError('TOO_LATE', 'Re-ring works for 30 minutes after the sale.')
    if not is_live(cart):
        raise RegisterError('NOT_LIVE', 'Thrift+ is not on at this register yet.')
    if member_of(cart) is not None:
        raise RegisterError('ALREADY_MEMBER', 'This sale already has a Thrift+ member.')
    who, card = found(code, person)
    if who.account.is_practice:
        raise RegisterError('PRACTICE_CARD', 'This is a practice member. Use the training register.')
    with transaction.atomic():
        card = card or members.member_code(who, user=user)
        member = CartMember.objects.create(
            cart=cart, account=who.account, person=who, card=card, attached_by=user,
            rering=True, reward_choice=CartMember.CHOICE_BANK,
        )
        lines = _all_lines(cart)
        item_lines = [l for l in lines if _is_item(l)]
        t = trip.totals(trip_lines(item_lines, include_closed=True), member=True, choice=trip.CHOICE_BANK)
        by_key = {int(s.key): s for s in t.lines}
        use_by = timezone.localdate() + timedelta(days=ledger.REWARD_DAYS)
        paid = paid_by_line(lines, split_bucks(lines, bucks_used(cart)))
        rate = cart.tax_rate or ZERO
        rules_ = guide()
        for line in lines:
            if not (_is_item(line) or line.line_kind == 'manual'):
                continue
            s = by_key.get(line.pk)
            collected = s.collected if s is not None else ZERO
            ledger.record(member.account, LedgerEntry.KIND_BANK, collected, 'rering', cart=cart, line=line, actor=user)
            _save_snapshot(line, _snapshot(line, collected=collected, redeemed=ZERO, bucks=ZERO,
                                           paid=paid.get(line.pk, ZERO), rate=rate, use_by=use_by, rules_=rules_))
            if s is not None:
                ItemReward.objects.filter(item_id=line.item_id).update(
                    reward_at_close=(s.reward / (line.quantity or 1)).quantize(CENT))
        members.log('register_rering', account=member.account, person=member.person, card=card, actor=user,
                    cart=cart.pk, collected=str(t.full_value))
    return member


# ── What the terminal and the receipt show (workspace/register-contract.md) ────

def cart_block(cart) -> dict | None:
    """``ThriftPlusCartBlock``: the Thrift+ part of a sale for the terminal and the receipt. None when Thrift+ is dark
    here and no member was ever on the sale. Never raises: a failure answers a guest-priced block with ``error``."""
    member = member_of(cart)
    live = is_live(cart)
    if member is None and not live:
        return None  # dark here: exactly as before
    try:
        return _cart_block(cart, member, live)
    except Exception:
        logger.exception('thrift+ cart block failed for cart %s', cart.pk)
        try:
            block = _empty_block(cart, live=live, lines=[], share=trip.DEFAULT_INSTANT_SHARE)
            block['error'] = ERROR_TEXT
            return block
        except Exception:  # pragma: no cover
            return None


def _money(value) -> str:
    return str((value or ZERO).quantize(CENT))


def _empty_block(cart, *, live: bool, lines: list, share: Decimal) -> dict:
    line = next((l for l in lines if is_bucks_line(l)), None)
    return {
        'live': live, 'member': None, 'instant_offered': False, 'instant_reason': '', 'instant_share': _money(share),
        'collected': '0.00', 'use_by': None, 'instant_bucks': '0.00', 'instant_off': '0.00', 'instant_offer': '0.00', 'bucks_auto': True,
        'bucks_available': '0.00', 'bucks_used': '0.00', 'credit_available': '0.00', 'credit_used': '0.00',
        'balances': {'bucks': '0.00', 'bucks_use_by': None, 'credit': '0.00'}, 'guest_line': '', 'lines': {},
        'bucks_line_id': line.pk if line is not None else None, 'restricted_line_ids': [],
        'amount_due': _money(amount_due(cart)),
    }


def _cart_block(cart, member: CartMember | None, live: bool) -> dict:
    from apps.thriftplus.services.returns import MARK_AS_IS, guide, line_price, mark_for, needs_photo

    lines = _all_lines(cart)
    item_lines = [l for l in lines if _is_item(l)]
    share = trip.instant_share()
    block = _empty_block(cart, live=live, lines=lines, share=share)
    block['restricted_line_ids'] = restricted_lines(cart)
    if member is None:
        t = trip.totals(trip_lines(item_lines), member=False, choice=None, share=share)
        block['instant_reason'] = 'No Thrift+ member on this sale.'
        block['guest_line'] = trip.guest_line(t)
        # A non-member's lines are all AS IS; ``join_mark`` is what the line would be for a member, so the receipt can
        # say "Join for: 3-day return · +9.60 ThriftBucks" (owner 2026-10-16).
        by_key = {str(l.pk): l for l in item_lines}
        rules_ = guide()
        block['lines'] = {}
        for s in t.lines:
            line = by_key.get(str(s.key))
            join_mark = MARK_AS_IS
            if line is not None:
                join_mark, _ = mark_for(line.item, price=line_price(line),
                                        reward=(s.collected / (line.quantity or 1)).quantize(CENT), rules=rules_)
            block['lines'][s.key] = {'reward': _money(s.collected), 'savings': '0.00', 'mark': MARK_AS_IS,
                                     'join_mark': join_mark}
        return block

    account = member.account
    today = timezone.localdate()
    found = ledger.lots(account)
    used = bucks_used(cart)
    snaps = {l.pk: l.meta['thrift_plus'] for l in lines
             if isinstance(l.meta, dict) and isinstance(l.meta.get('thrift_plus'), dict)}
    rules_ = guide()
    per_line: dict[str, dict] = {}
    if cart.status == 'open':
        p = plan(cart, member, lines=lines, on=today)
        collected_total, instant_bucks = p.collected_total, p.instant_bucks if p.choice == CartMember.CHOICE_INSTANT else ZERO
        kept_total = collected_total - instant_bucks
        use_by = today + timedelta(days=ledger.REWARD_DAYS) if kept_total > 0 else None
        offered, reason = p.instant_offered, p.instant_reason
        block['instant_offer'] = _money(p.instant_offer)
        for line in item_lines:
            collected = p.collected.get(line.pk, ZERO)
            mark, _ = mark_for(line.item, price=line_price(line), reward=(collected / (line.quantity or 1)).quantize(CENT),
                               rules=rules_)
            per_line[str(line.pk)] = {'reward': _money(collected), 'savings': _money(line.thrift_savings), 'mark': mark}
        credit_available, bucks_available = p.credit_available, p.bucks_available
    else:
        # A finished sale as it was recorded: the line snapshots (or, before them, the trip worked out again).
        fallback = {}
        if any(l.pk not in snaps for l in item_lines):
            t = trip.totals(trip_lines(item_lines, include_closed=True), member=True, choice=trip.CHOICE_BANK, share=share)
            fallback = {int(s.key): s.collected for s in t.lines}
        collected_total = instant_bucks = kept_total = ZERO
        use_by = None
        for line in item_lines:
            snap = snaps.get(line.pk)
            if snap:
                collected = Decimal(str(snap.get('collected') or '0'))
                redeemed = Decimal(str(snap.get('instant_bucks') or '0'))
                mark = snap.get('mark') or MARK_AS_IS
                if snap.get('use_by'):
                    use_by = max(use_by, date.fromisoformat(snap['use_by'])) if use_by else date.fromisoformat(snap['use_by'])
            else:
                collected = fallback.get(line.pk, ZERO)
                redeemed = collected if line.thrift_savings else ZERO
                mark, _ = mark_for(line.item, price=line_price(line),
                                   reward=(collected / (line.quantity or 1)).quantize(CENT), rules=rules_)
            collected_total += collected
            instant_bucks += redeemed
            kept_total += collected - redeemed
            per_line[str(line.pk)] = {'reward': _money(collected), 'savings': _money(line.thrift_savings), 'mark': mark}
        if use_by is None and kept_total > 0:
            sold_on = timezone.localdate(cart.completed_at) if cart.completed_at else today
            use_by = sold_on + timedelta(days=ledger.REWARD_DAYS)
        offered, reason = False, 'This sale is finished.'
        credit_available = ledger.credit_balance(account)
        bucks_available = ledger.available_bucks(account, today, of=found)

    person = member.person
    soonest = ledger.soonest_use_by(account, today, of=found)
    block.update({
        'member': {
            'account_id': member.account_id, 'person_id': person.pk, 'name': f'{person.first_name} {person.last_name}'.strip(),
            'first_name': person.first_name,  # the receipt prints the first name only (owner 2026-10-14)
            'role': person.role, 'photo_url': person.photo.url if person.photo else None, 'verified_18': person.verified_18,
            'card_last4': member.card.code[-4:], 'practice': bool(account.is_practice), 'choice': member.reward_choice,
            'rering': member.rering,
        },
        'instant_offered': offered, 'instant_reason': '' if offered else reason,
        'collected': _money(collected_total), 'use_by': use_by.isoformat() if use_by else None,
        'instant_bucks': _money(instant_bucks), 'instant_off': _money(sum((l.thrift_savings or ZERO for l in item_lines), ZERO)),
        'bucks_auto': bool(member.use_bucks), 'bucks_available': _money(bucks_available), 'bucks_used': _money(used),
        'credit_available': _money(credit_available), 'credit_used': _money(cart.thrift_credit),
        'balances': {'bucks': _money(ledger.bucks_total(account, today, of=found)),
                     'bucks_use_by': soonest.isoformat() if soonest else None,
                     'credit': _money(ledger.credit_balance(account))},
        'lines': per_line,
        'photo_line_ids': [l.pk for l in item_lines if needs_photo(l)],
    })
    if member.reward_choice != CartMember.CHOICE_INSTANT:
        block['instant_bucks'] = '0.00'
    return block
