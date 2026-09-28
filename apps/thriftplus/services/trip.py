"""
A trip's Thrift+ math (thrift_plus_rewards Phase 3): the monthly cover first, then an instant rebate
or banking. It mirrors ``computeCartTotals`` in the scanner app (``frontend/src/api/thriftPlusMock.ts``)
cent for cent, so the phone's estimate and the register agree.

- **reward total:** Σ reward × qty, from the reward engine (``rewards.member_price``).
- **to cover:** the part of the reward total that fills what is left of this month's cover
  ($10; the ``thrift_plus_cover_amount`` setting). For a guest it is shown as a new member's would be.
- **the rest:** it comes off the price (**instant**), or it is added to the member's banked rewards
  (**bank**, the member's choice for the trip). Guests are shown the instant rebate.
- **member total:** the tag total less the instant savings, before tax.

The cover and the bank are split across the lines in scan order: earlier lines fill the cover first.
A return then reverses exactly what that item put into the cover and the bank.

**Banked never exceeds spent** (owner, 2026-09-25): a line's reward is clipped to its price here, even
if the engine sent more. The cover plus the bank (bonus included) for a line is never more than was
paid for it, after its discounts.

**Banking pays a bonus:** the part past the cover is banked × (1 + ``thrift_plus_bank_bonus``, 5%).
The rules for every discount are in ``.ai/extended/discount-logic.md``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_DOWN, Decimal

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
DEFAULT_COVER = Decimal('10.00')
COVER_KEY = 'thrift_plus_cover_amount'
BONUS_KEY = 'thrift_plus_bank_bonus'
DEFAULT_BONUS = Decimal('0.05')
CHOICE_BANK = 'bank'
CHOICE_INSTANT = 'instant'


def cover_amount() -> Decimal:
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=COVER_KEY).values_list('value', flat=True).first()
    try:
        value = Decimal(str(raw)).quantize(Decimal('0.01')) if raw not in (None, '') else DEFAULT_COVER
    except Exception:  # a bad setting never stops a sale
        return DEFAULT_COVER
    return value if value >= 0 else DEFAULT_COVER


def bank_bonus() -> Decimal:
    """The banking bonus as a share (0.05 = 5%); a bad setting falls back to 5%, never above 10%."""
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=BONUS_KEY).values_list('value', flat=True).first()
    try:
        value = Decimal(str(raw)) if raw not in (None, '') else DEFAULT_BONUS
    except Exception:  # a bad setting never stops a sale
        return DEFAULT_BONUS
    return value if Decimal('0') <= value <= Decimal('0.10') else DEFAULT_BONUS


@dataclass(frozen=True)
class TripLine:
    key: str  # the register's line id, or the tag, for matching the split back
    price: Decimal  # the price per unit after any percent sale (what a guest pays)
    reward: Decimal  # the member reward per unit, after the same percent
    qty: int = 1
    discount: Decimal = ZERO  # dollars the line's discount lines take off (for the never-more-than-paid cap)


@dataclass(frozen=True)
class LineSplit:
    key: str
    reward: Decimal  # reward × qty
    to_cover: Decimal
    savings: Decimal  # off the price today
    to_bank: Decimal  # banked, bonus included
    bank_bonus: Decimal = ZERO  # the bonus part of to_bank


@dataclass
class TripTotals:
    item_count: int
    price_total: Decimal
    reward_total: Decimal
    to_cover: Decimal
    savings: Decimal
    to_bank: Decimal
    member_total: Decimal
    lines: list[LineSplit] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'item_count': self.item_count, 'price_total': str(self.price_total), 'reward_total': str(self.reward_total),
            'to_cover': str(self.to_cover), 'savings': str(self.savings), 'to_bank': str(self.to_bank),
            'member_total': str(self.member_total),
        }


def totals(lines: list[TripLine], *, cover_left: Decimal, member: bool, choice: str | None,
           bonus: Decimal = ZERO) -> TripTotals:
    """The trip's split. ``cover_left`` is what is left of this month's cover (the full cover
    for a guest). Banking only applies to a member who chose it, and ``bonus`` (a share, like
    0.05) is added to what is banked."""
    banking = member and choice == CHOICE_BANK
    left = max(ZERO, cover_left)
    splits, units, price_total = [], 0, ZERO
    for line in lines:
        units += line.qty
        price_total += line.price * line.qty
        reward = max(ZERO, min(line.reward, line.price)) * line.qty  # never more than was spent
        paid = max(ZERO, line.price * line.qty - max(ZERO, line.discount))  # the line's take at the tag
        to_cover = min(left, reward, paid)
        left -= to_cover
        room = paid - to_cover  # what the line can still give back without passing what was paid
        past = min(reward - to_cover, room)
        if banking:
            extra = min((past * bonus).quantize(CENT, rounding=ROUND_DOWN), room - past)
            split = LineSplit(key=line.key, reward=reward, to_cover=to_cover, savings=ZERO, to_bank=past + extra,
                              bank_bonus=extra)
        else:
            split = LineSplit(key=line.key, reward=reward, to_cover=to_cover, savings=past, to_bank=ZERO)
        splits.append(split)
    reward_total = sum((s.reward for s in splits), ZERO)
    savings = sum((s.savings for s in splits), ZERO)
    return TripTotals(
        item_count=units, price_total=price_total, reward_total=reward_total,
        to_cover=sum((s.to_cover for s in splits), ZERO), savings=savings,
        to_bank=sum((s.to_bank for s in splits), ZERO), member_total=price_total - savings, lines=splits,
    )


def guest_line(t: TripTotals, cover: Decimal) -> str:
    """The guest receipt's line (owner's copy): over the cover, what they lost; under, what they'd earn."""
    if t.reward_total <= 0:
        return ''
    if t.reward_total > cover:
        return f'No Thrift+ card today. You lost ${t.reward_total - cover:.2f}'
    return f'This trip would have earned ${t.reward_total:.2f}'
