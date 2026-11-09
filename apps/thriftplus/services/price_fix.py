"""Fix a price (owner only, Bill 2026-11-09): a line rang at the wrong price is made right on the day it is fixed.

- **What goes back:** the difference between what the line was charged and the right price, in the share it was paid:
  money (pre-tax) and its tax at 100%; ThriftBucks used on the line come back in the same share, fresh 30 days. The
  ThriftBucks the line collected stay: a line earns the item's own reward, not a share of the price charged.
- **How:** a member gets the money as Thrift+ credit (B2), unless the owner pays it back as cash or a card refund;
  anyone else gets cash or a card refund (Bill 11-09: "as super I need to be able to do all"). Cash and card refunds
  are recorded here; the money itself goes out the way the owner chose.
- **Settled the W11 way:** a ``PriceFix`` record today; the receipt never changes. Sales numbers and the sales tax
  report count it with returns, on the day fixed. One per line; a returned line can't be fixed, and a fixed line comes
  back (3-day return) on its fixed price (``returns.refund_parts``).
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from apps.thriftplus.models import Account, CartMember, LedgerEntry, PriceFix, ReturnRecord
from apps.thriftplus.services import ledger, members
from apps.thriftplus.services.register import RegisterError

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
ONE = Decimal('1')


def _money(value) -> Decimal:
    try:
        return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except Exception as exc:  # noqa: BLE001
        raise RegisterError('BAD_PRICE', 'Type the right price in dollars, like 12.00.') from exc


def _problems(line, new_unit: Decimal) -> list[str]:
    out = []
    if line.line_kind not in ('item', 'manual'):
        out.append('Only an item line can have its price fixed.')
    if line.cart.status != 'completed':
        out.append('Only a completed sale can have a price fixed.')
    if PriceFix.objects.filter(cart_line_id=line.pk).exists():
        out.append('This line\'s price was already fixed.')
    if ReturnRecord.objects.filter(cart_line_id=line.pk).exists():
        out.append('This line was returned.')
    old = line.unit_price or ZERO
    if new_unit < 0:
        out.append('The price can\'t be below zero.')
    elif new_unit >= old:
        out.append(f'The right price must be below what it rang at (${old}).')
    return out


def work_out(line, new_unit) -> dict:
    """What a fix of this line to ``new_unit`` (the right price for one) gives back. Nothing is written."""
    from apps.thriftplus.services.returns import refund_parts

    new_unit = _money(new_unit)
    issues = _problems(line, new_unit)
    old = line.unit_price or ZERO
    parts = refund_parts(line, share=ONE, after_fix=False)
    paid, bucks_used = parts['paid'], parts['bucks_used']
    rate = ZERO if (line.tax_exempt or line.cart.tax_exempt_at) else (line.cart.tax_rate or ZERO)
    diff = max(ZERO, old - new_unit)
    taxable_back = (paid * diff / old).quantize(CENT, rounding=ROUND_HALF_UP) if old else ZERO
    tax_back = (taxable_back * rate).quantize(CENT, rounding=ROUND_HALF_UP)
    bucks_back = (bucks_used * diff / old).quantize(CENT, rounding=ROUND_HALF_UP) if old else ZERO
    member = CartMember.objects.filter(cart_id=line.cart_id).select_related('account').first()
    return {
        'cart_line': line.pk, 'description': line.description, 'quantity': line.quantity,
        'old_unit_price': str(old), 'new_unit_price': str(new_unit),
        'taxable_back': str(taxable_back), 'tax_back': str(tax_back), 'money_back': str(taxable_back + tax_back),
        'bucks_back': str(bucks_back),
        'member': ({'account_id': member.account_id} if member else None),
        'ok': not issues, 'problems': issues,
    }


def apply(line, new_unit, *, back_as: str = '', note: str = '', user=None) -> PriceFix:
    """Fix the line's price: the record, and for a member the ledger rows (credit, ThriftBucks back)."""
    shown = work_out(line, new_unit)
    if not shown['ok']:
        raise RegisterError('NOT_FIXABLE', ' '.join(shown['problems']))
    member = CartMember.objects.filter(cart_id=line.cart_id).select_related('account').first()
    account: Account | None = member.account if member else None
    back_as = back_as or (PriceFix.BACK_CREDIT if account else '')
    if back_as not in dict(PriceFix.BACK_CHOICES):
        raise RegisterError('BACK_AS', 'Say how the money goes back: cash or a card refund.')
    if back_as == PriceFix.BACK_CREDIT and account is None:
        raise RegisterError('BACK_AS', 'Thrift+ credit needs a member on the sale. Pay it back as cash or a card refund.')
    money_back = Decimal(shown['money_back'])
    bucks_back = Decimal(shown['bucks_back']) if account else ZERO
    note = (note or '').strip()
    words = f'Price fixed: {line.description[:60]} ${shown["old_unit_price"]} -> ${shown["new_unit_price"]}'
    with transaction.atomic():
        if account is not None:
            Account.objects.select_for_update().filter(pk=account.pk).first()
        if PriceFix.objects.filter(cart_line_id=line.pk).exists():
            raise RegisterError('NOT_FIXABLE', 'This line\'s price was already fixed.')
        fix = PriceFix.objects.create(
            cart_line=line, account=account, item=line.item, old_unit_price=Decimal(shown['old_unit_price']),
            new_unit_price=Decimal(shown['new_unit_price']), taxable_back=Decimal(shown['taxable_back']),
            tax_back=Decimal(shown['tax_back']), bucks_back=bucks_back, back_as=back_as, note=note[:300], fixed_by=user,
        )
        if account is not None:
            if back_as == PriceFix.BACK_CREDIT:
                ledger.record(account, LedgerEntry.KIND_CREDIT, money_back, 'pricefix', cart=line.cart, line=line,
                              actor=user, note=(note or words)[:200])
            ledger.record(account, LedgerEntry.KIND_BANK, bucks_back, 'pricefix', cart=line.cart, line=line,
                          actor=user, note='ThriftBucks back on a price fix')
            members.log('price_fix', account=account, actor=user, cart=line.cart_id, cart_line=line.pk,
                        old=shown['old_unit_price'], new=shown['new_unit_price'], money_back=str(money_back),
                        back_as=back_as, bucks_back=str(bucks_back), note=note[:200])
    return fix


def as_row(fix: PriceFix) -> dict:
    by = fix.fixed_by
    return {
        'id': fix.pk, 'line': fix.cart_line_id, 'description': fix.cart_line.description,
        'old_unit_price': str(fix.old_unit_price), 'new_unit_price': str(fix.new_unit_price),
        'money_back': str(fix.money_back), 'tax_back': str(fix.tax_back), 'bucks_back': str(fix.bucks_back),
        'back_as': fix.back_as, 'note': fix.note, 'at': fix.created_at,
        'by': (by.full_name or by.email) if by else None,
    }
