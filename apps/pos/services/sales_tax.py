"""
The sales tax report (owner 2026-10-13: "I file"): what the Nebraska sales tax return needs for a period, on the
owner's Reports page.

**Where the numbers come from.** Completed register sales (``Cart``), the one place a sale is taxed: online holds are
paid at the register, and the old web checkout is closed. History imported from the old systems is in the same table,
so earlier months work too. Days are store days (America/Chicago), by when the sale was completed.

- **Left out:** open carts, training-register "sales", and voided sales. Voided sales with a completed time in the
  period are counted on their own line, so a void after filing is easy to spot.
- **Taxable sales** are the sales' subtotals: merchandise after sale prices, less discount lines, plus delivery and
  assembly fees (the register taxes the whole subtotal). No sale at the register is tax-exempt, so exempt sales are 0.
- **Tax collected** is the sales' own tax, rounded on each receipt. **Tax at the rate** is taxable sales × the rate,
  split into Nebraska's state rate (5.5%) and the local rest; the small gap to tax collected is rounding.
- **Not sales:** the CardX card surcharge (record only, not revenue, not taxed). Thrift+ credit spent is a payment, so
  that sale is taxed in full; it is shown for information. Kept ThriftBucks used are a discount line before tax (T3),
  so they are already in the discounts part.
- **Thrift+ 3-day returns** (T4, W11; for the CPA to see): a return refunds 80% of what was paid, tax included, as
  Thrift+ credit, settled on the return day. The pre-tax part and the tax part are listed by return day, apart from
  the sales; the original sale and its tax are never changed. Practice memberships are left out. The report also
  gives taxable sales and tax collected less what returns gave back (critic review NUM-01), beside the gross figures,
  for the CPA to choose from.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

CENT = Decimal('0.01')
ZERO = Decimal('0')
STATE_RATE = Decimal('0.055')  # Nebraska's state sales tax rate; the rest of the store's rate is local

KIND_GROUPS = {
    'item': 'merchandise',
    'manual': 'merchandise',
    'discount': 'discounts',
    'delivery': 'delivery_fees',
    'assembly': 'assembly',
}


def _money(value) -> str:
    return str((value or ZERO).quantize(CENT))


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Store-time midnight on ``start`` to midnight after ``end`` (``end`` is included)."""
    tz = timezone.get_current_timezone()
    return (timezone.make_aware(datetime.combine(start, time.min), tz),
            timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz))


def report(start: date, end: date) -> dict:
    from apps.pos.models import Cart, CartLine

    lo, hi = _bounds(start, end)
    sales = Cart.objects.filter(status='completed', completed_at__gte=lo, completed_at__lt=hi)
    totals = sales.aggregate(
        count=Count('id'), taxable=Sum('subtotal'), tax=Sum('tax_amount'), total=Sum('total'),
        surcharge=Sum('card_surcharge_amount'), thrift_credit=Sum('thrift_credit'),
    )
    taxable = totals['taxable'] or ZERO
    tax = totals['tax'] or ZERO

    parts = {'merchandise': ZERO, 'discounts': ZERO, 'delivery_fees': ZERO, 'assembly': ZERO}
    for row in CartLine.objects.filter(cart__in=sales).values('line_kind').annotate(amount=Sum('line_total')):
        key = KIND_GROUPS.get(row['line_kind'], 'merchandise')
        parts[key] += row['amount'] or ZERO
    other = taxable - sum(parts.values(), ZERO)  # sales whose lines don't add up to their subtotal (none expected)

    rates = []
    for row in sales.values('tax_rate').annotate(count=Count('id'), taxable=Sum('subtotal'), tax=Sum('tax_amount')).order_by('tax_rate'):
        rate = row['tax_rate'] or ZERO
        base = row['taxable'] or ZERO
        at_rate = (base * rate).quantize(CENT)
        state = (base * min(rate, STATE_RATE)).quantize(CENT)
        rates.append({
            'rate': str(rate), 'count': row['count'], 'taxable': _money(base), 'tax_collected': _money(row['tax']),
            'tax_at_rate': _money(at_rate), 'state_rate': str(min(rate, STATE_RATE)), 'state_tax': _money(state),
            'local_rate': str(max(ZERO, rate - STATE_RATE)), 'local_tax': _money(at_rate - state),
        })
    at_rate_total = sum((Decimal(r['tax_at_rate']) for r in rates), ZERO)

    days = [
        {'day': row['day'].isoformat(), 'count': row['count'], 'taxable': _money(row['taxable']), 'tax': _money(row['tax'])}
        for row in sales.annotate(day=TruncDate('completed_at')).values('day')
        .annotate(count=Count('id'), taxable=Sum('subtotal'), tax=Sum('tax_amount')).order_by('day')
    ]
    payments = [
        {'method': row['payment_method'], 'count': row['count'], 'total': _money(row['total'])}
        for row in sales.values('payment_method').annotate(count=Count('id'), total=Sum('total')).order_by('-total')
    ]
    voided = Cart.objects.filter(status='voided', completed_at__gte=lo, completed_at__lt=hi).aggregate(
        count=Count('id'), taxable=Sum('subtotal'), tax=Sum('tax_amount'))
    returns = _thrift_plus_returns(lo, hi)

    return {
        'start': start.isoformat(),
        'end': end.isoformat(),
        'sales': totals['count'],
        'gross_sales': _money(taxable),
        'exempt_sales': _money(ZERO),
        'taxable_sales': _money(taxable),
        'parts': {k: _money(v) for k, v in parts.items()} | ({'other': _money(other)} if other else {}),
        'tax_collected': _money(tax),
        'tax_at_rate': _money(at_rate_total),
        'rounding': _money(tax - at_rate_total),
        'rates': rates,
        'days': days,
        'payments': payments,
        'card_surcharge': _money(totals['surcharge']),
        'thrift_credit': _money(totals['thrift_credit']),
        'collected_total': _money(totals['total']),
        'voided': {'count': voided['count'], 'taxable': _money(voided['taxable']), 'tax': _money(voided['tax'])},
        'thrift_plus_returns': returns,
        'taxable_sales_less_returns': _money(taxable - Decimal(returns['taxable_back'])),
        'tax_collected_less_returns': _money(tax - Decimal(returns['tax_back'])),
    }


def _thrift_plus_returns(lo: datetime, hi: datetime) -> dict:
    """Thrift+ 3-day returns in the period, by return day: the pre-tax part and the tax part of each refund (T4)."""
    from apps.thriftplus.models import ReturnRecord

    rows = ReturnRecord.objects.filter(created_at__gte=lo, created_at__lt=hi).exclude(account__is_practice=True)
    totals = rows.aggregate(count=Count('id'), taxable_back=Sum('taxable_back'), tax_back=Sum('tax_back'),
                            refund=Sum('paid'), credit=Sum('credit'))
    days = [
        {'day': row['day'].isoformat(), 'count': row['count'], 'taxable_back': _money(row['taxable_back']),
         'tax_back': _money(row['tax_back'])}
        for row in rows.annotate(day=TruncDate('created_at')).values('day')
        .annotate(count=Count('id'), taxable_back=Sum('taxable_back'), tax_back=Sum('tax_back')).order_by('day')
    ]
    return {
        'count': totals['count'], 'taxable_back': _money(totals['taxable_back']), 'tax_back': _money(totals['tax_back']),
        'refund': _money(totals['refund']), 'credit': _money(totals['credit']), 'days': days,
        'note': 'For the CPA: Thrift+ 3-day returns refund 80% of the price and its tax as Thrift+ credit, on the return day.',
    }
