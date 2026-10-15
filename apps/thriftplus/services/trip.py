"""
A trip's Thrift+ math (the 10-12 policy): what each line collects, and whether the trip keeps it or redeems it
instantly. It mirrors ``computeCartTotals`` in the scanner app (``frontend/src/api/thriftPlusMock.ts``).

- **reward total:** Σ reward × qty, from the reward engine (``rewards.member_price``).
- **collected:** the ThriftBucks each line collects, at full value: its reward, never more than was paid for it
  after its discounts (**banked never exceeds spent**, owner 2026-09-25).
- **kept** (the Default, B1): the member keeps every ThriftBuck collected, usable from the next day for 30 days.
- **redeemed instantly** (B1, F1): when the member tells the cashier, the trip's ThriftBucks come off today's price
  at ``thrift_plus_instant_share`` of their value (0.50), rounded up to the cent (the member's favor), never more
  than the ThriftBucks themselves. The setting can't go above 1; a bad value falls back to 0.50 and never stops a sale.
- **member total:** the tag total less the instant savings, before tax.

Guests collect nothing: their trip is shown only as what it would have collected. There is no monthly cover (C1,
owner 2026-10-12). The rules: ``.ai/extended/thrift-plus-decisions.md``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_UP, Decimal

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
CHOICE_BANK = 'bank'
CHOICE_INSTANT = 'instant'
INSTANT_KEY = 'thrift_plus_instant_share'
DEFAULT_INSTANT_SHARE = Decimal('0.50')


def instant_share() -> Decimal:
    """The share of a trip's ThriftBucks an instant redemption takes off today (0.50). Never raises."""
    try:
        from apps.core.models import AppSetting

        raw = AppSetting.objects.filter(key=INSTANT_KEY).values_list('value', flat=True).first()
        value = Decimal(str(raw)) if raw not in (None, '') else DEFAULT_INSTANT_SHARE
    except Exception:  # a bad setting never stops a sale
        return DEFAULT_INSTANT_SHARE
    return value if Decimal('0') <= value <= Decimal('1') else DEFAULT_INSTANT_SHARE


def instant_part(past: Decimal, share: Decimal | None = None) -> Decimal:
    """What redeeming these ThriftBucks instantly takes off: the share of them, rounded up to the cent (the member's
    favor), never more than the ThriftBucks themselves."""
    share = instant_share() if share is None else share
    return min(past, (past * share).quantize(CENT, rounding=ROUND_UP))


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
    reward: Decimal  # reward × qty, clipped to the price
    collected: Decimal = ZERO  # ThriftBucks the line collects, at full value (never more than was paid)
    savings: Decimal = ZERO  # dollars off the price today (an instant redemption)
    redeemed: Decimal = ZERO  # ThriftBucks redeemed instantly for those savings
    to_bank: Decimal = ZERO  # ThriftBucks kept


@dataclass
class TripTotals:
    item_count: int
    price_total: Decimal
    reward_total: Decimal
    savings: Decimal
    to_bank: Decimal
    member_total: Decimal
    lines: list[LineSplit] = field(default_factory=list)
    full_value: Decimal = ZERO  # ThriftBucks the trip collects (kept: all of them)
    instant_value: Decimal = ZERO  # what redeeming all of them instantly would take off today

    @property
    def collected(self) -> Decimal:
        return self.full_value

    @property
    def redeemed(self) -> Decimal:
        return sum((s.redeemed for s in self.lines), ZERO)

    def as_dict(self) -> dict:
        return {
            'item_count': self.item_count, 'price_total': str(self.price_total), 'reward_total': str(self.reward_total),
            'collected': str(self.full_value), 'savings': str(self.savings), 'to_bank': str(self.to_bank),
            'member_total': str(self.member_total),
            'full_value': str(self.full_value), 'instant_value': str(self.instant_value),
        }


def totals(lines: list[TripLine], *, member: bool, choice: str | None, share: Decimal | None = None) -> TripTotals:
    """The trip's split. A member keeps everything unless they chose to redeem instantly (kept is the Default, B1).
    A guest collects nothing; ``full_value`` still says what the trip would have collected."""
    share = instant_share() if share is None else share
    instant = member and choice == CHOICE_INSTANT
    splits, units, price_total = [], 0, ZERO
    full_value = instant_value = ZERO
    for line in lines:
        units += line.qty
        price_total += line.price * line.qty
        reward = max(ZERO, min(line.reward, line.price)) * line.qty  # never more than was spent
        paid = max(ZERO, line.price * line.qty - max(ZERO, line.discount))  # the line's take at the tag
        past = min(reward, paid)
        full_value += past
        instant_value += instant_part(past, share)
        if not member:
            split = LineSplit(key=line.key, reward=reward, collected=past)
        elif instant:
            split = LineSplit(key=line.key, reward=reward, collected=past, savings=instant_part(past, share),
                              redeemed=past)
        else:
            split = LineSplit(key=line.key, reward=reward, collected=past, to_bank=past)
        splits.append(split)
    reward_total = sum((s.reward for s in splits), ZERO)
    savings = sum((s.savings for s in splits), ZERO)
    return TripTotals(
        item_count=units, price_total=price_total, reward_total=reward_total, savings=savings,
        to_bank=sum((s.to_bank for s in splits), ZERO), member_total=price_total - savings, lines=splits,
        full_value=full_value, instant_value=instant_value,
    )


def guest_line(t: TripTotals) -> str:
    """The guest receipt's line: what the trip would have collected (the 10-12 policy has no cover)."""
    if t.full_value <= 0:
        return ''
    return f'This trip would have collected {tb_text(t.full_value)}.'


def tb_text(amount: Decimal) -> str:
    """ThriftBucks in plain text (owner 2026-10-10): \"11.00 ThriftBucks\", never \"$\"."""
    return f'{amount:.2f} ThriftBuck' if amount == 1 else f'{amount:.2f} ThriftBucks'
