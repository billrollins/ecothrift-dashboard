"""Record-only credit-card surcharge (CardX). Never added to Cart.total."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from apps.core.models import AppSetting

SETTING_KEY_CARD_SURCHARGE = 'pos.card_surcharge'
DEFAULT_SURCHARGE_PERCENT = Decimal('3')
CARD_TYPE_FIX_WINDOW_MINUTES = 15
MONEY = Decimal('0.01')
RATE = Decimal('0.0001')


class CardSurchargeError(ValueError):
    """Invalid card tender / surcharge payload for cart complete."""


def _as_decimal(value: Any) -> Decimal | None:
    if value is None or value == '':
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


# Room in the money columns (max_digits=10, decimal_places=2): 8 dollar digits and cents.
MAX_MONEY = Decimal('99999999.99')
_PLAIN_NUMBER = re.compile(r'^[+-]?(\d+\.?\d*|\.\d+)$')


def parse_money(value: Any, label: str, *, required: bool = False) -> Decimal | None:
    """A dollar amount from a request body, or CardSurchargeError with a plain message.

    Takes a number or a numeric string. Refuses anything else (text, NaN, Infinity, booleans, lists),
    a negative, more than two decimals, or an amount too big for the books. Blank is None, or an error when
    ``required``. A float's binary noise (65.60000000000001) is rounded off; a real third decimal is refused.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise CardSurchargeError(f'{label} is required.')
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise CardSurchargeError(f'{label} must be a dollar amount like 20.00.')
    try:
        if isinstance(value, float):
            if value != value or value in (float('inf'), float('-inf')):
                raise InvalidOperation
            amount = Decimal(repr(value))
            if amount <= MAX_MONEY:
                rounded = amount.quantize(MONEY, rounding=ROUND_HALF_UP)
                if abs(float(rounded) - value) < 1e-6:
                    amount = rounded
        elif isinstance(value, str):
            if not _PLAIN_NUMBER.match(value.strip()):
                raise InvalidOperation
            amount = Decimal(value.strip())
        else:
            amount = Decimal(value)
        if not amount.is_finite():
            raise InvalidOperation
        if amount < 0:
            raise CardSurchargeError(f'{label} cannot be negative.')
        if amount > MAX_MONEY:
            raise CardSurchargeError(f'{label} is too large.')
        if amount != amount.quantize(MONEY, rounding=ROUND_HALF_UP):
            raise CardSurchargeError(f'{label} can have at most two decimal places.')
        return amount.quantize(MONEY)
    except (InvalidOperation, ValueError, OverflowError) as exc:
        if isinstance(exc, CardSurchargeError):
            raise
        raise CardSurchargeError(f'{label} must be a dollar amount like 20.00.') from None


def get_card_surcharge_setting() -> dict[str, Any]:
    """Return ``{enabled, percent, rate}``. ``percent`` is 3 for 3%; ``rate`` is 0.0300."""
    enabled = True
    percent = DEFAULT_SURCHARGE_PERCENT
    try:
        raw = AppSetting.objects.get(key=SETTING_KEY_CARD_SURCHARGE).value
    except AppSetting.DoesNotExist:
        raw = None
    if isinstance(raw, dict):
        if 'enabled' in raw:
            enabled = bool(raw['enabled'])
        parsed = _as_decimal(raw.get('percent'))
        if parsed is not None and Decimal('0') <= parsed <= Decimal('50'):
            percent = parsed
    rate = (percent / Decimal('100')).quantize(RATE)
    return {
        'enabled': enabled,
        'percent': percent,
        'rate': rate,
    }


def surcharge_for(card_base: Decimal, rate: Decimal) -> Decimal:
    return (card_base * rate).quantize(MONEY, rounding=ROUND_HALF_UP)


def expected_card_totals(card_base: Decimal) -> dict[str, Any]:
    setting = get_card_surcharge_setting()
    base = card_base.quantize(MONEY)
    extra = surcharge_for(base, setting['rate']) if setting['enabled'] else Decimal('0.00')
    return {
        'enabled': setting['enabled'],
        'percent': setting['percent'],
        'rate': setting['rate'],
        'card_base': base,
        'no_surcharge': base,
        'surcharge_amount': extra,
        'with_surcharge': (base + extra).quantize(MONEY),
    }


def resolve_card_base(
    *,
    payment_method: str,
    cart_total: Decimal,
    card_amount: Any,
) -> Decimal:
    parsed = _as_decimal(card_amount)
    total = cart_total.quantize(MONEY)
    if payment_method == 'card':
        return parsed.quantize(MONEY) if parsed is not None else total
    if payment_method == 'split':
        if parsed is None:
            raise CardSurchargeError('card_amount is required for split tenders.')
        return parsed.quantize(MONEY)
    return Decimal('0.00')


def apply_card_surcharge(
    *,
    payment_method: str,
    card_type: str,
    cart_total: Decimal,
    card_amount: Any,
    client_charged_total: Any = None,
) -> dict[str, Any]:
    """Return surcharge fields to store on the cart. Raises CardSurchargeError."""
    blank = {
        'card_type': '',
        'card_surcharge_rate': Decimal('0.0000'),
        'card_surcharge_amount': Decimal('0.00'),
        'card_charged_total': None,
    }
    if payment_method in ('cash', 'payroll', 'thrift'):  # payroll deduction, Thrift+: no card, nothing in the drawer
        if card_type:
            raise CardSurchargeError('card_type is not allowed on cash, payroll or Thrift+ tenders.')
        return blank

    if card_type not in ('credit', 'debit'):
        raise CardSurchargeError('card_type must be credit or debit for card tenders.')

    totals = expected_card_totals(
        resolve_card_base(
            payment_method=payment_method,
            cart_total=cart_total,
            card_amount=card_amount,
        ),
    )
    apply_credit = card_type == 'credit' and totals['enabled']
    surcharge = totals['surcharge_amount'] if apply_credit else Decimal('0.00')
    rate = totals['rate'] if apply_credit else Decimal('0.0000')
    charged = (totals['card_base'] + surcharge).quantize(MONEY)

    client = _as_decimal(client_charged_total)
    if client is not None and client.quantize(MONEY) != charged:
        raise CardSurchargeError(
            'card_charged_total does not match the server surcharge total.',
        )

    return {
        'card_type': card_type,
        'card_surcharge_rate': rate,
        'card_surcharge_amount': surcharge,
        'card_charged_total': charged,
    }


def preview_payload(card_base: Decimal) -> dict[str, Any]:
    totals = expected_card_totals(card_base)
    return {
        'enabled': totals['enabled'],
        'percent': str(totals['percent']),
        'rate': str(totals['rate']),
        'card_base': str(totals['card_base']),
        'no_surcharge': str(totals['no_surcharge']),
        'with_surcharge': str(totals['with_surcharge']),
        'surcharge_amount': str(totals['surcharge_amount']),
    }


def card_type_fix_deadline(cart) -> datetime | None:
    """``completed_at + 15 min`` for completed card/split sales; else None."""
    if getattr(cart, 'status', None) != 'completed':
        return None
    if getattr(cart, 'payment_method', None) not in ('card', 'split'):
        return None
    completed_at = getattr(cart, 'completed_at', None)
    if completed_at is None:
        return None
    return completed_at + timedelta(minutes=CARD_TYPE_FIX_WINDOW_MINUTES)


def drawer_card_totals(drawer) -> dict[str, Decimal]:
    """Completed-cart card sales and credit surcharges on a drawer (not cash)."""
    from django.db.models import Sum

    from apps.pos.models import Cart

    rows = Cart.objects.filter(drawer=drawer, status='completed')
    card_sales = rows.filter(payment_method__in=('card', 'split')).aggregate(
        s=Sum('card_amount'),
    )['s']
    surcharge = rows.aggregate(s=Sum('card_surcharge_amount'))['s']
    return {
        'card_sales_total': (card_sales or Decimal('0')).quantize(MONEY),
        'card_surcharge_total': (surcharge or Decimal('0')).quantize(MONEY),
    }
