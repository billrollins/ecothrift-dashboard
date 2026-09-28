"""
Thrift+ at the register (thrift_plus_rewards Phase 3).

**Dark means untouched.** Every step here runs only when Thrift+ is *live* for the sale's register:
- the ``thrift_plus_enabled`` switch is on; or
- the register's code is in ``thrift_plus_test_registers``, for the owner's test register and the
  staff dry run.

Otherwise ``sync_if_live`` returns at once, and the POS behaves exactly as before.

**A member on a sale** (``CartMember``) is attached by scanning the card in the terminal's scan box.

**Pricing:**
- ``sync`` prices each item line through the trip math (``trip.totals``): this month's cover
  first, then an instant rebate (stored as ``CartLine.thrift_savings``, which ``CartLine.save``
  takes off ``line_total``) or the bank.
- ``Cart.recalculate`` calls it after every change.
- **Discounts use the true price** (tag - reward; ``.ai/extended/discount-logic.md``): a percent
  sale or percent discount scales the tag and the reward alike, and no line gives back more than was
  paid for it.

**18+:** products in ``RestrictedProduct`` sell only to a member whose card holder is verified 18+.
It is checked when the item is added and again when the sale completes.

**Money:**
- **Completing** writes the ledger: cover and bank rows per line, and credit or bank spent. It
  also records each item's reward at sale.
- **Voiding** reverses the ledger rows.
- **Re-ring:** a card attached within 30 minutes of a completed sale gets the member split. The
  instant part is paid as store credit, so no cash leaves the drawer.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import AppCart, CartMember, Card, ItemReward, LedgerEntry, RestrictedProduct
from apps.thriftplus.services import ledger, members, trip
from apps.thriftplus.services.members import MemberError
from apps.thriftplus.services.rewards import floor_for, rules

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
TEST_REGISTERS_KEY = 'thrift_plus_test_registers'
RERING_WINDOW = timedelta(minutes=30)


class RegisterError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


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


def is_live(cart) -> bool:
    """Thrift+ is live for this sale: the switch is on, or its register is a test register."""
    return members.is_enabled() or register_code(cart) in live_register_codes()


def sync_if_live(cart) -> None:
    """Called by ``Cart.recalculate``. A problem deciding live-or-dark never stops a sale."""
    try:
        live = is_live(cart)
    except Exception:  # pragma: no cover - a settings read failing must not break the POS
        logger.exception('thrift+ live check failed for cart %s', cart.pk)
        return
    if live:
        sync(cart)


# ── Pricing ────────────────────────────────────────────────────────────────────

def member_of(cart) -> CartMember | None:
    return CartMember.objects.filter(cart_id=cart.pk).select_related('account', 'person', 'card').first()


def _rewards(item_ids: list[int], *, include_closed: bool = False) -> dict[int, Decimal]:
    qs = ItemReward.objects.filter(item_id__in=item_ids).exclude(status=ItemReward.STATUS_EXCLUDED)
    if not include_closed:
        qs = qs.exclude(status=ItemReward.STATUS_CLOSED)
    return dict(qs.values_list('item_id', 'reward'))


def _item_lines(cart) -> list:
    from apps.pos.models import CartLine

    return list(
        CartLine.objects.filter(cart_id=cart.pk, line_kind=CartLine.LINE_KIND_ITEM, item__isnull=False)
        .select_related('item').order_by('pk')
    )


def _discounts(cart_id: int, item_lines: list) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
    """Per item line: the biggest percent discount that applies to it (line-scoped or cart-wide), and
    the dollars its discount lines take off (a line's own, plus its share of cart-wide ones by value)."""
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


def split(cart, member: CartMember | None = None, *, lines: list | None = None, include_closed: bool = False) -> trip.TripTotals:
    """The trip for this cart: as the member's (their cover left and their choice) or as a guest's."""
    lines = _item_lines(cart) if lines is None else lines
    if member is None:
        return trip.totals(trip_lines(lines), cover_left=trip.cover_amount(), member=False, choice=None)
    return trip.totals(
        trip_lines(lines, include_closed=include_closed), cover_left=ledger.cover_left(member.account),
        member=True, choice=member.reward_choice, bonus=trip.bank_bonus(),
    )


def sync(cart) -> None:
    """Put the member's instant rebate on each item line (or clear it for a guest)."""
    from apps.pos.models import CartLine

    member = member_of(cart)
    want: dict[str, Decimal] = {}
    if member is not None and cart.status == 'open':
        want = {s.key: s.savings for s in split(cart, member).lines}
    elif member is not None:
        return  # a completed sale keeps what it was sold at
    for line in CartLine.objects.filter(cart_id=cart.pk):
        new = want.get(str(line.pk), ZERO)
        if line.thrift_savings != new:
            line.thrift_savings = new
            line.save()


# ── 18+ ────────────────────────────────────────────────────────────────────────

def is_restricted(item) -> bool:
    return RestrictedProduct.objects.filter(product_id=item.product_id).exists()


def check_item(cart, item) -> None:
    """Before an item goes on a live sale: an 18+ item needs a verified 18+ card on the sale."""
    if not is_restricted(item) or not is_live(cart):  # one query for the usual, unmarked item
        return
    member = member_of(cart)
    if member is None or not member.person.verified_18:
        raise RegisterError(
            'AGE_RESTRICTED',
            'This item is 18+. It sells only to a Thrift+ card whose holder was ID-checked as 18 or older.',
        )


def restricted_lines(cart) -> list[int]:
    lines = _item_lines(cart)
    marked = set(RestrictedProduct.objects.filter(product_id__in=[l.item.product_id for l in lines]).values_list('product_id', flat=True))
    return [l.pk for l in lines if l.item.product_id in marked]


# ── Attach, choice, credit ─────────────────────────────────────────────────────

def _card(code: str) -> Card:
    try:
        card = members.card_by_code(code)
    except MemberError as exc:
        raise RegisterError('CARD_UNKNOWN', str(exc)) from exc
    if card.status != Card.STATUS_ACTIVE or card.person is None:
        raise RegisterError('CARD_NOT_ACTIVE', 'This card is not active. Sign the customer up, or look them up by phone.')
    if card.person.removed_at is not None or card.person.account.status != 'active':
        raise RegisterError('CARD_NOT_ACTIVE', 'This membership is not active.')
    return card


def attach(cart, code: str, *, user=None) -> CartMember:
    """Scan a member's card onto an open sale. It replaces any member already on it."""
    if cart.status != 'open':
        raise RegisterError('CART_NOT_OPEN', 'This sale is finished. Use re-ring to apply a card to it.')
    if not is_live(cart):
        raise RegisterError('NOT_LIVE', 'Thrift+ is not on at this register yet.')
    card = _card(code)
    with transaction.atomic():
        member, _ = CartMember.objects.update_or_create(
            cart=cart, defaults={'account': card.person.account, 'person': card.person, 'card': card, 'attached_by': user},
        )
        app_choice = AppCart.objects.filter(account=member.account).values_list('reward_choice', flat=True).first()
        if app_choice in (CartMember.CHOICE_BANK, CartMember.CHOICE_INSTANT):
            member.reward_choice = app_choice  # the member answered in the scanner app; the panel shows it
            member.save(update_fields=['reward_choice'])
        members.log('register_attach', account=member.account, person=member.person, card=card, actor=user, cart=cart.pk)
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


def set_choice(cart, choice: str) -> CartMember:
    if choice not in (CartMember.CHOICE_BANK, CartMember.CHOICE_INSTANT):
        raise RegisterError('BAD_CHOICE', 'Choose bank or instant.')
    member = _open_member(cart)
    member.reward_choice = choice
    member.save(update_fields=['reward_choice'])
    cart.recalculate()
    return member


def _open_member(cart) -> CartMember:
    if cart.status != 'open':
        raise RegisterError('CART_NOT_OPEN', 'This sale is finished.')
    member = member_of(cart)
    if member is None:
        raise RegisterError('NO_MEMBER', 'Scan the member\'s card first.')
    return member


def use_balance(cart, *, credit: Decimal, bank: Decimal) -> CartMember:
    """Spend store credit and banked rewards on this sale (each up to its balance and the total)."""
    member = _open_member(cart)
    credit, bank = max(ZERO, credit).quantize(CENT), max(ZERO, bank).quantize(CENT)
    if credit > ledger.balance(member.account, LedgerEntry.KIND_CREDIT):
        raise RegisterError('OVER_BALANCE', 'That is more store credit than the member has.')
    if bank > ledger.balance(member.account, LedgerEntry.KIND_BANK):
        raise RegisterError('OVER_BALANCE', 'That is more banked rewards than the member has.')
    if credit + bank > cart.total:
        raise RegisterError('OVER_TOTAL', 'That is more than the sale total.')
    member.credit_used, member.bank_used = credit, bank
    member.save(update_fields=['credit_used', 'bank_used'])
    cart.thrift_credit = credit + bank
    cart.save(update_fields=['thrift_credit'])
    return member


def amount_due(cart) -> Decimal:
    return max(ZERO, cart.total - (cart.thrift_credit or ZERO))


# ── Complete and void (called from the POS views) ──────────────────────────────

def touches(cart) -> bool:
    """Whether completing or voiding this sale has Thrift+ work: a member, spent balances, or a live register."""
    return bool(cart.thrift_credit) or member_of(cart) is not None or is_live(cart)


def before_complete(cart) -> None:
    """Checks that can refuse the sale: 18+ lines need a verified card, and spent balances must
    still be there and fit the total (which may have changed since they were applied)."""
    member = member_of(cart)
    if restricted_lines(cart) and (member is None or not member.person.verified_18):
        raise RegisterError('AGE_RESTRICTED', 'An 18+ item is on this sale. It needs a Thrift+ card verified 18+, or take it off.')
    if member is None:
        if cart.thrift_credit:
            cart.thrift_credit = ZERO
            cart.save(update_fields=['thrift_credit'])
        return
    credit = min(member.credit_used, cart.total)
    bank = min(member.bank_used, cart.total - credit)
    if credit > ledger.balance(member.account, LedgerEntry.KIND_CREDIT) or bank > ledger.balance(member.account, LedgerEntry.KIND_BANK):
        raise RegisterError('OVER_BALANCE', 'The member no longer has that much credit or banked rewards. Apply it again.')
    if (credit, bank) != (member.credit_used, member.bank_used):
        use_balance(cart, credit=credit, bank=bank)


def after_complete(cart, *, user=None) -> None:
    """The completed sale's ledger rows and each item's reward at sale. Runs inside the POS's
    completion transaction."""
    member = member_of(cart)
    lines = _item_lines(cart)
    now = timezone.now()
    applied: dict[int, Decimal] = {}
    if member is not None:
        t = split(cart, member, lines=lines)
        by_key = {s.key: s for s in t.lines}
        # No bonus on the part paid with Thrift+ money (discount logic, rule 8).
        cash_share = (amount_due(cart) / cart.total) if cart.total and cart.total > 0 else Decimal('1')
        for line in lines:
            s = by_key.get(str(line.pk))
            if s is None:
                continue
            bonus_kept = (s.bank_bonus * cash_share).quantize(CENT, rounding=ROUND_DOWN)
            banked = s.to_bank - s.bank_bonus + bonus_kept
            ledger.record(member.account, LedgerEntry.KIND_COVER, s.to_cover, 'sale', cart=cart, line=line, actor=user)
            ledger.record(member.account, LedgerEntry.KIND_BANK, banked, 'sale', cart=cart, line=line, actor=user)
            applied[line.item_id] = (s.reward / (line.quantity or 1)).quantize(CENT)
        ledger.record(member.account, LedgerEntry.KIND_CREDIT, -member.credit_used, 'spend', cart=cart, actor=user)
        ledger.record(member.account, LedgerEntry.KIND_BANK, -member.bank_used, 'spend', cart=cart, actor=user)
        members.log('register_sale', account=member.account, person=member.person, card=member.card, actor=user,
                    cart=cart.pk, **{k: str(v) for k, v in t.as_dict().items() if k != 'item_count'})
        from apps.thriftplus.services.scanner import after_sale
        after_sale(member.account, [line.item_id for line in lines])
    for line in lines:
        ItemReward.objects.filter(item_id=line.item_id).exclude(status=ItemReward.STATUS_CLOSED).update(
            status=ItemReward.STATUS_CLOSED, reason='left_floor_sold', closed_at=now, closed_status='sold',
            reward_at_close=applied.get(line.item_id, ZERO), updated_at=now,
        )


def after_void(cart, *, user=None) -> None:
    """A voided sale gives back what it wrote to the ledger."""
    if LedgerEntry.objects.filter(cart=cart).exists():
        ledger.reverse_cart(cart, 'void', user)


# ── Re-ring ────────────────────────────────────────────────────────────────────

def rering(cart, code: str, *, user=None) -> CartMember:
    """Sign-up before leaving: apply a card to a sale completed in the last 30 minutes. The member
    split is recorded (the cover first), and the instant part is paid as store credit."""
    if cart.status != 'completed' or not cart.completed_at:
        raise RegisterError('NOT_COMPLETED', 'Only a completed sale can be re-rung.')
    if timezone.now() - cart.completed_at > RERING_WINDOW:
        raise RegisterError('TOO_LATE', 'Re-ring works for 30 minutes after the sale.')
    if not is_live(cart):
        raise RegisterError('NOT_LIVE', 'Thrift+ is not on at this register yet.')
    if member_of(cart) is not None:
        raise RegisterError('ALREADY_MEMBER', 'This sale already has a Thrift+ card.')
    card = _card(code)
    with transaction.atomic():
        member = CartMember.objects.create(
            cart=cart, account=card.person.account, person=card.person, card=card, attached_by=user,
            rering=True, reward_choice=CartMember.CHOICE_INSTANT,
        )
        lines = _item_lines(cart)
        t = split(cart, member, lines=lines, include_closed=True)
        by_key = {s.key: s for s in t.lines}
        for line in lines:
            s = by_key.get(str(line.pk))
            if s is None:
                continue
            ledger.record(member.account, LedgerEntry.KIND_COVER, s.to_cover, 'rering', cart=cart, line=line, actor=user)
            ledger.record(member.account, LedgerEntry.KIND_CREDIT, s.savings, 'rering', cart=cart, line=line, actor=user)
            ItemReward.objects.filter(item_id=line.item_id).update(reward_at_close=(s.reward / (line.quantity or 1)).quantize(CENT))
        members.log('register_rering', account=member.account, person=member.person, card=card, actor=user,
                    cart=cart.pk, credit=str(t.savings), to_cover=str(t.to_cover))
    return member


# ── What the terminal and the receipt show ─────────────────────────────────────

def cart_block(cart) -> dict | None:
    """The Thrift+ part of a sale for the terminal and the receipt. None when Thrift+ is dark here
    and no member was ever on the sale."""
    member = member_of(cart)
    live = is_live(cart)
    if member is None and not live:
        return None
    lines = _item_lines(cart)
    per_line: dict[str, dict] = {}
    if member is None:
        t = split(cart, None, lines=lines)
        block = {'live': live, 'member': None, 'guest_line': trip.guest_line(t, trip.cover_amount())}
    else:
        if cart.status == 'open':
            t = split(cart, member, lines=lines)
        else:
            t = _recorded(cart, member, lines)
        person = member.person
        block = {
            'live': live,
            'member': {
                'account_id': member.account_id, 'person_id': person.pk, 'name': f'{person.first_name} {person.last_name}'.strip(),
                'role': person.role, 'photo_url': person.photo.url if person.photo else None, 'verified_18': person.verified_18,
                'card_last4': member.card.code[-4:], 'choice': member.reward_choice, 'rering': member.rering,
                **ledger.balances(member.account),
            },
            'credit_used': str(member.credit_used), 'bank_used': str(member.bank_used), 'guest_line': '',
            'photo_line_ids': [l.pk for l in lines if _needs_photo(l)],
            'app_choice': AppCart.objects.filter(account=member.account).values_list('reward_choice', flat=True).first() or None,
        }
    for s in t.lines:
        per_line[s.key] = {'reward': str(s.reward), 'to_cover': str(s.to_cover), 'savings': str(s.savings), 'to_bank': str(s.to_bank)}
    block.update({
        'totals': t.as_dict(), 'lines': per_line, 'restricted_line_ids': restricted_lines(cart),
        'amount_due': str(amount_due(cart)),
    })
    return block


def _needs_photo(line) -> bool:
    from apps.thriftplus.services.returns import needs_photo

    return needs_photo(line)


def _recorded(cart, member: CartMember, lines: list) -> trip.TripTotals:
    """A finished sale as it was recorded (the ledger and the line rebates), not as tonight's rewards would price it."""
    rows = LedgerEntry.objects.filter(cart=cart, reverses__isnull=True, reason__in=('sale', 'rering'))
    by_line: dict[str, dict[str, Decimal]] = {}
    for r in rows:
        if r.cart_line_id is None:
            continue
        slot = by_line.setdefault(str(r.cart_line_id), {'cover': ZERO, 'bank': ZERO, 'credit': ZERO})
        slot[r.kind] = slot.get(r.kind, ZERO) + r.amount
    splits, price_total = [], ZERO
    for line in lines:
        b = by_line.get(str(line.pk), {})
        savings = (line.thrift_savings or ZERO) + b.get('credit', ZERO)
        to_cover, to_bank = b.get('cover', ZERO), b.get('bank', ZERO)
        price_total += (line.line_total or ZERO) + (line.thrift_savings or ZERO)
        splits.append(trip.LineSplit(key=str(line.pk), reward=to_cover + to_bank + savings, to_cover=to_cover,
                                     savings=savings, to_bank=to_bank))
    savings = sum((s.savings for s in splits), ZERO)
    return trip.TripTotals(
        item_count=sum((l.quantity or 1) for l in lines), price_total=price_total,
        reward_total=sum((s.reward for s in splits), ZERO), to_cover=sum((s.to_cover for s in splits), ZERO),
        savings=savings, to_bank=sum((s.to_bank for s in splits), ZERO), member_total=price_total - savings, lines=splits,
    )
