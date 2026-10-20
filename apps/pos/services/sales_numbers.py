"""How sales are counted (owner 10-20): item sales, returns, Thrift+ revenue, tax, fees and how it was paid.

One place for the Dash dashboard, the Transactions page totals and the AI brief. Definitions (``.ai/extended/pos-system.md``,
"Sales numbers"):

- **Item sales** (a completed, non-training sale, on the day it completed): each item's price after markdowns (and any
  discount lines) less the *full* ThriftBucks the line collected, kept or redeemed instantly. ThriftBucks a member uses
  from earlier trips (the ThriftBucks discount line) do not reduce item sales: they pay from what the store owes.
  The delivery and assembly fees are not item sales; they are fees customers paid.
- **Returns** (Thrift+ 3-day returns, on the return day, negative): the credit given before tax, plus the ThriftBucks
  given back for earlier ThriftBucks used, less the ThriftBucks taken back (shortfall counted as taken: it came off the
  credit). That whole amount is taken back from the sale; the share of it that is the line's instant-redemption Thrift+
  revenue comes off Thrift+ revenue, and the rest is Returns. So Returns is 80% of the item's item sales (the W5 kept
  lamp: 64.00 - 28.00 = 36.00 of 45.00; the instant lamp: 50.00 less 14.00 = 36.00, and Thrift+ revenue -14.00).
- **Net item sales** = item sales + returns. The Sales number on Dash.
- **Thrift+ revenue**: the half of the ThriftBucks not given when a member redeems instantly (on the sale day), plus kept
  ThriftBucks that expired unused (on the day they expire), less the return share of an instant sale's revenue (on the
  return day). ThriftBucks taken back on a return are not revenue.
- **Tax**: tax on completed sales less the tax refunded on returns.
- **Fees**: what customers paid (card surcharge, delivery and assembly fees) and what we pay (a setting, 1% of debit
  card charges). A card sale with no card type is shown as "card type not set", never guessed.
- **Paid with**: cash, card (debit, credit, not set), payroll deduction, Thrift+ credit used, ThriftBucks from earlier
  visits. For sales it reconciles: money in = item sales + Thrift+ revenue from instant redemptions + ThriftBucks newly
  owed (kept) + tax + fees customers paid.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable

from django.db.models import Case, DecimalField, ExpressionWrapper, F, Q, Sum, Value, When
from django.db.models.fields.json import KT, KeyTextTransform, KeyTransform
from django.db.models.functions import Cast, Coalesce, TruncDate
from django.utils import timezone

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
DEBIT_FEE_KEY = 'debit_card_fee_rate'  # AppSetting: a fraction (0.01 = 1% of debit card charges)
DEFAULT_DEBIT_FEE_RATE = Decimal('0.01')
EXPIRY_LAG_DAYS = 31  # a lot collected on day D is good through D+30 and expires on D+31 (thriftplus.services.ledger)
MERCHANDISE = ('item', 'manual')
_DEC = DecimalField(max_digits=14, decimal_places=2)
_ZERO_V = Value(Decimal('0.00'), output_field=_DEC)

# Every number a day (or a whole filter) carries. Money, positive unless noted.
KEYS = (
    'item_sales', 'returns', 'thriftplus_revenue_returned', 'thriftplus_revenue_instant', 'thriftplus_revenue_expired', 'bucks_kept',
    'tax_collected', 'tax_refunded', 'fees_surcharge', 'fees_delivery', 'fees_debit',
    'debit_charged', 'card_unset',
    'paid_cash', 'paid_card_debit', 'paid_card_credit', 'paid_card_unset', 'paid_payroll', 'paid_credit',
    'paid_earlier_bucks', 'count',
)


def _empty() -> dict[str, Decimal]:
    return {k: ZERO for k in KEYS}


def _d(value: Any) -> Decimal:
    return value if value is not None else ZERO


def debit_fee_rate() -> Decimal:
    """What we pay on a debit card charge (a setting, default 1%). A bad value falls back to the default."""
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=DEBIT_FEE_KEY).values_list('value', flat=True).first()
    try:
        rate = Decimal(str(raw)) if raw not in (None, '') else DEFAULT_DEBIT_FEE_RATE
    except Exception:
        return DEFAULT_DEBIT_FEE_RATE
    return rate if Decimal('0') <= rate <= Decimal('0.5') else DEFAULT_DEBIT_FEE_RATE


def _snap(key: str):
    """A number from the line's Thrift+ snapshot (``meta['thrift_plus']``), NULL where the line has none."""
    return Cast(KT(f'meta__thrift_plus__{key}'), _DEC)


def _cart_aggregates() -> dict[str, Any]:
    due = ExpressionWrapper(F('total') - F('thrift_credit'), output_field=_DEC)
    split_card = Coalesce('card_amount', _ZERO_V, output_field=_DEC)
    card_base = Case(
        When(payment_method='card', then=due),
        When(payment_method='split', then=split_card),
        default=_ZERO_V, output_field=_DEC,
    )
    cash = Case(
        When(payment_method='cash', then=due),
        When(payment_method='split', then=ExpressionWrapper(due - split_card, output_field=_DEC)),
        default=_ZERO_V, output_field=_DEC,
    )
    payroll = Case(When(payment_method='payroll', then=due), default=_ZERO_V, output_field=_DEC)
    charged = ExpressionWrapper(card_base + F('card_surcharge_amount'), output_field=_DEC)
    return {
        'a_count': Sum(Value(1)),
        'a_tax': Sum('tax_amount'),
        'a_credit': Sum('thrift_credit'),
        'a_surcharge': Sum('card_surcharge_amount'),
        'a_cash': Sum(cash),
        'a_payroll': Sum(payroll),
        'a_card_debit': Sum(charged, filter=Q(card_type='debit')),
        'a_card_credit': Sum(charged, filter=Q(card_type='credit')),
        'a_card_unset': Sum(charged, filter=~Q(card_type__in=('debit', 'credit')) & Q(payment_method__in=('card', 'split'))),
    }


def _line_aggregates() -> dict[str, Any]:
    merch = Q(line_kind__in=MERCHANDISE)
    bucks = Q(line_kind='discount', meta__thrift='bucks')
    return {
        'a_price': Sum(ExpressionWrapper(F('line_total') + F('thrift_savings'), output_field=_DEC), filter=merch),
        'a_discounts': Sum('line_total', filter=Q(line_kind='discount')),
        'a_bucks_line': Sum('line_total', filter=bucks),
        'a_delivery': Sum('line_total', filter=Q(line_kind__in=('delivery', 'assembly'))),
        'a_collected': Sum(_snap('collected'), filter=merch),
        'a_instant_bucks': Sum(_snap('instant_bucks'), filter=merch),
        'a_instant_off': Sum('thrift_savings', filter=merch),
    }


def _fold_carts(into: dict[str, Decimal], row: dict) -> None:
    into['count'] += Decimal(row['a_count'] or 0)
    into['tax_collected'] += _d(row['a_tax'])
    into['paid_credit'] += _d(row['a_credit'])
    into['fees_surcharge'] += _d(row['a_surcharge'])
    into['paid_cash'] += _d(row['a_cash'])
    into['paid_payroll'] += _d(row['a_payroll'])
    into['paid_card_debit'] += _d(row['a_card_debit'])
    into['paid_card_credit'] += _d(row['a_card_credit'])
    into['paid_card_unset'] += _d(row['a_card_unset'])


def _fold_lines(into: dict[str, Decimal], row: dict) -> None:
    bucks_line = _d(row['a_bucks_line'])  # negative
    discounts = _d(row['a_discounts']) - bucks_line  # the markdown-style discount lines (negative)
    into['item_sales'] += _d(row['a_price']) + discounts - _d(row['a_collected'])
    into['paid_earlier_bucks'] += -bucks_line
    into['fees_delivery'] += _d(row['a_delivery'])
    instant_off = _d(row['a_instant_off'])
    into['thriftplus_revenue_instant'] += _d(row['a_instant_bucks']) - instant_off
    into['bucks_kept'] += _d(row['a_collected']) - _d(row['a_instant_bucks'])


def _fold_returns(into: dict[str, Decimal], row: dict, share: Decimal) -> None:
    taken_back = _d(row['a_taxable_back']) + _d(row['a_bucks_back']) - _d(row['a_bucks_taken']) - _d(row['a_shortfall'])
    # The return share of the instant redemptions' Thrift+ revenue on the lines returned (80% of it, like everything
    # else a return gives back); Returns keeps exactly the share of the item sales.
    revenue_back = (share * (_d(row['a_instant_bucks']) - _d(row['a_instant_off']))).quantize(CENT, rounding=ROUND_HALF_UP)
    into['thriftplus_revenue_returned'] -= revenue_back
    into['returns'] -= taken_back - revenue_back
    into['tax_refunded'] += _d(row['a_tax_back'])


def _return_aggregates() -> dict[str, Any]:
    return {
        'a_taxable_back': Sum('taxable_back'), 'a_bucks_back': Sum('bucks_back'), 'a_bucks_taken': Sum('bucks_taken'),
        'a_shortfall': Sum('shortfall'), 'a_tax_back': Sum('tax_back'),
        'a_instant_bucks': Sum(Cast(KeyTextTransform('instant_bucks', KeyTransform('thrift_plus', 'cart_line__meta')), _DEC)),
        'a_instant_off': Sum('cart_line__thrift_savings'),
    }


def _day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    return (timezone.make_aware(datetime.combine(start, time.min), tz),
            timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz))


def expired_bucks_by_day(start: date, end: date) -> dict[date, Decimal]:
    """Kept ThriftBucks that expired unused, by the day they expire (the day after their use-by date). Read from the
    ledger's ``expire`` rows (one per lot, linked to the lot, written by the nightly run), dated by the lot rather than
    by the night the run happened to write them."""
    from apps.thriftplus.models import LedgerEntry
    from apps.thriftplus.services.ledger import EXPIRE_REASON

    # The lot was collected EXPIRY_LAG_DAYS before its expiry day; a day of slack either side covers the time zone.
    first_lot = start - timedelta(days=EXPIRY_LAG_DAYS + 1)
    last_lot = end - timedelta(days=EXPIRY_LAG_DAYS - 1)
    lot_from, lot_to = _day_bounds(first_lot, first_lot)[0], _day_bounds(last_lot, last_lot)[1]
    rows = (
        LedgerEntry.objects.filter(kind=LedgerEntry.KIND_BANK, reason=EXPIRE_REASON, amount__lt=0,
                                   reverses__created_at__gte=lot_from, reverses__created_at__lt=lot_to,
                                   account__is_practice=False)
        .values_list('amount', 'reverses__created_at')
    )
    out: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for amount, lot_at in rows:
        day = timezone.localtime(lot_at).date() + timedelta(days=EXPIRY_LAG_DAYS)
        if start <= day <= end:
            out[day] += -amount
    return dict(out)


def _finish(raw: dict[str, Decimal], rate: Decimal) -> dict[str, Any]:
    """Derived numbers and the reconciliation, as money strings."""
    r = raw
    item_sales = r['item_sales']
    returns = r['returns']
    revenue = r['thriftplus_revenue_instant'] + r['thriftplus_revenue_expired'] + r['thriftplus_revenue_returned']
    fees_customers = r['fees_surcharge'] + r['fees_delivery']
    debit_fee = (r['paid_card_debit'] * rate).quantize(CENT, rounding=ROUND_HALF_UP)
    card = r['paid_card_debit'] + r['paid_card_credit'] + r['paid_card_unset']
    money_in = r['paid_cash'] + card + r['paid_payroll'] + r['paid_credit'] + r['paid_earlier_bucks']
    accounted = item_sales + r['thriftplus_revenue_instant'] + r['bucks_kept'] + r['tax_collected'] + fees_customers

    def s(x: Decimal) -> str:
        return str(x.quantize(CENT, rounding=ROUND_HALF_UP))

    return {
        'item_sales': s(item_sales),
        'returns': s(returns),
        'net_item_sales': s(item_sales + returns),
        'thriftplus_revenue': s(revenue),
        'thriftplus_revenue_instant': s(r['thriftplus_revenue_instant']),
        'thriftplus_revenue_returned': s(r['thriftplus_revenue_returned']),
        'thriftplus_revenue_expired': s(r['thriftplus_revenue_expired']),
        'tax': s(r['tax_collected'] - r['tax_refunded']),
        'tax_collected': s(r['tax_collected']),
        'tax_refunded': s(r['tax_refunded']),
        'fees_customers_paid': s(fees_customers),
        'fees_card_surcharge': s(r['fees_surcharge']),
        'fees_delivery': s(r['fees_delivery']),
        'fees_we_pay': s(debit_fee),
        'fees_we_pay_percent': str((rate * 100).normalize()),
        'debit_charged': s(r['paid_card_debit']),
        'card_type_not_set': s(r['paid_card_unset']),
        'paid_with': {
            'cash': s(r['paid_cash']),
            'card': s(card),
            'card_debit': s(r['paid_card_debit']),
            'card_credit': s(r['paid_card_credit']),
            'card_type_not_set': s(r['paid_card_unset']),
            'payroll': s(r['paid_payroll']),
            'thriftplus_credit': s(r['paid_credit']),
            'earlier_thriftbucks': s(r['paid_earlier_bucks']),
        },
        'thriftbucks_owed_new': s(r['bucks_kept']),
        'sales_count': int(r['count']),
        'reconciles': {'money_in': s(money_in), 'accounted_for': s(accounted), 'difference': s(money_in - accounted)},
    }


def by_day(start: date, end: date) -> dict[date, dict[str, Any]]:
    """Every number for each day in ``[start, end]`` that has any (the dashboard). A few grouped queries: sales,
    their lines, returns and expiries; no per-sale loops."""
    from apps.pos.models import Cart, CartLine
    from apps.thriftplus.models import ReturnRecord
    from apps.thriftplus.services.returns import credit_share

    start_dt, end_dt = _day_bounds(start, end)
    raw: dict[date, dict[str, Decimal]] = defaultdict(_empty)
    carts = Cart.objects.filter(status='completed', completed_at__gte=start_dt, completed_at__lt=end_dt)
    for row in carts.order_by().annotate(day=TruncDate('completed_at')).values('day').annotate(**_cart_aggregates()):
        _fold_carts(raw[row['day']], row)
    lines = CartLine.objects.filter(cart__status='completed', cart__completed_at__gte=start_dt, cart__completed_at__lt=end_dt)
    for row in (lines.order_by().annotate(day=TruncDate('cart__completed_at')).values('day')
                .annotate(**_line_aggregates())):
        _fold_lines(raw[row['day']], row)
    share = credit_share()
    returns = ReturnRecord.objects.filter(created_at__gte=start_dt, created_at__lt=end_dt)
    for row in returns.order_by().annotate(day=TruncDate('created_at')).values('day').annotate(**_return_aggregates()):
        _fold_returns(raw[row['day']], row, share)
    for day, amount in expired_bucks_by_day(start, end).items():
        raw[day]['thriftplus_revenue_expired'] += amount
    rate = debit_fee_rate()
    return {day: _finish(values, rate) for day, values in raw.items()}


def for_carts(carts, returns=None, *, expired: tuple[date, date] | None = None) -> dict[str, Any]:
    """Every number for a filtered set of sales (the Transactions page): ``carts`` is the page's filtered queryset
    (only its completed sales count), ``returns`` the ``ReturnRecord`` rows to count (by return day). ``expired`` is a
    (from, to) range of days whose expired ThriftBucks count as Thrift+ revenue (None: none)."""
    from apps.pos.models import CartLine

    from apps.thriftplus.services.returns import credit_share

    raw = _empty()
    done = carts.filter(status='completed').order_by()
    _fold_carts(raw, done.aggregate(**_cart_aggregates()))
    lines = CartLine.objects.filter(cart__in=done.values('pk')).order_by()
    _fold_lines(raw, lines.aggregate(**_line_aggregates()))
    if returns is not None:
        _fold_returns(raw, returns.order_by().aggregate(**_return_aggregates()), credit_share())
    if expired:
        raw['thriftplus_revenue_expired'] += sum(expired_bucks_by_day(*expired).values(), ZERO)
    return _finish(raw, debit_fee_rate())


def net_item_sales_by_day(start: date, end: date) -> dict[date, Decimal]:
    return {day: Decimal(n['net_item_sales']) for day, n in by_day(start, end).items()}


def sum_days(numbers: Iterable[dict[str, Any]], key: str) -> Decimal:
    return sum((Decimal(n[key]) for n in numbers), ZERO)
