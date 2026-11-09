"""Fix a price (owner only, Bill 2026-11-09), owner use-by dates and Undo on adjustments."""
from __future__ import annotations

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from apps.pos.models import Cart, CartLine
from apps.pos.services import sales_numbers, sales_tax
from apps.thriftplus.models import Account, LedgerEntry, PriceFix, ReturnRecord
from apps.thriftplus.services import ledger
from apps.thriftplus.tests.test_returns_page import ReturnsPageBase

D = Decimal
CENT = D('0.01')
URL = '/api/thriftplus/price-fix/'


class PriceFixTests(ReturnsPageBase):
    def _line(self, sale):
        return CartLine.objects.select_related('cart').get(pk=self._item_lines(sale)[0])

    def _fix(self, line, price, **extra):
        return self.api.post(URL, {'cart_line': line.pk, 'unit_price': price, **extra}, format='json')

    def test_only_the_owner_can_fix_a_price(self):
        line = self._line(self._sell('ITMTPLAMP'))
        self.api.force_authenticate(self.manager)
        self.assertEqual(self._fix(line, '1.00').status_code, 403)

    def test_a_member_gets_the_difference_and_its_tax_as_credit_and_reports_count_it(self):
        sale = self._sell('ITMTPLAMP', days_ago=40)  # any past sale, while it is the owner
        line = self._line(sale)
        account = Account.objects.get(people__pk=line.cart.thrift_member.person_id)
        old = line.unit_price
        new = (old / 2).quantize(CENT)
        self.api.force_authenticate(self.owner)
        shown = self._fix(line, str(new)).json()
        self.assertTrue(shown['ok'], shown)
        self.assertFalse(PriceFix.objects.exists())  # a look only
        credit_before = ledger.credit_balance(account)
        r = self._fix(line, str(new), confirm=True, note='old QR on the box')
        self.assertEqual(r.status_code, 201, r.content)
        fix = PriceFix.objects.get()
        rate = line.cart.tax_rate or D('0')
        self.assertEqual(fix.tax_back, (fix.taxable_back * rate).quantize(CENT, rounding=ROUND_HALF_UP))
        self.assertEqual((fix.back_as, fix.account_id, fix.new_unit_price), ('credit', account.pk, new))
        self.assertEqual(ledger.credit_balance(account) - credit_before, fix.taxable_back + fix.tax_back)
        # One per line.
        self.assertEqual(self._fix(line, '0.50', confirm=True).status_code, 400)
        # Counted with returns on the day fixed, and its tax refunded.
        today = timezone.localdate()
        day = sales_numbers.by_day(today, today)[today]
        self.assertEqual(D(day['returns']), -(fix.taxable_back + fix.bucks_back))
        self.assertEqual(D(day['tax_refunded']), fix.tax_back)
        lo, hi = sales_tax._day_bounds(today, today) if hasattr(sales_tax, '_day_bounds') else (None, None)
        if lo is not None:
            self.assertEqual(sales_tax._thrift_plus_returns(lo, hi)['price_fixes']['count'], 1)
        # The sale's window lists it.
        card = self.api.get(f'/api/pos/carts/{line.cart_id}/card/').json()
        self.assertEqual(card['price_fixes'][0]['new_unit_price'], f'{new:.2f}')

    def test_a_fixed_line_returns_on_its_fixed_price_and_a_returned_line_cant_be_fixed(self):
        from apps.thriftplus.services.returns import refund_parts

        line = self._line(self._sell('ITMTPLAMP'))
        before = refund_parts(line)['paid']
        self.api.force_authenticate(self.owner)
        self.assertEqual(self._fix(line, str((line.unit_price / 2).quantize(CENT)), confirm=True).status_code, 201)
        fix = PriceFix.objects.get()
        self.assertEqual(refund_parts(line)['paid'], before - fix.taxable_back)

        other = self._line(self._sell('ITMTPVASE'))
        ReturnRecord.objects.create(account=fix.account, person=other.cart.thrift_member.person, cart_line=other,
                                    item=other.item, paid=D('1.00'))
        r = self._fix(other, '0.01')
        self.assertFalse(r.json()['ok'])

    def test_a_non_member_sale_goes_back_as_cash_or_card(self):
        line = self._line(self._sell('ITMTPLAMP', member=False))
        self.api.force_authenticate(self.owner)
        self.assertEqual(self._fix(line, '0.01', confirm=True).status_code, 400)  # credit needs a member
        r = self._fix(line, '0.01', confirm=True, back_as='cash')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((PriceFix.objects.get().back_as, PriceFix.objects.get().account_id), ('cash', None))
        self.assertFalse(LedgerEntry.objects.filter(reason='pricefix').exists())

    def test_the_owner_gives_thriftbucks_with_a_use_by_and_undoes_an_adjustment(self):
        sale = self._sell('ITMTPLAMP')
        account = Account.objects.get(people__pk=Cart.objects.get(pk=sale['id']).thrift_member.person_id)
        url = f'/api/thriftplus/accounts/{account.pk}/adjust/'
        use_by = (timezone.localdate() + timedelta(days=60)).isoformat()
        self.api.force_authenticate(self.manager)
        r = self.api.post(url, {'kind': 'bank', 'amount': '5.00', 'note': 'sorry', 'use_by': use_by}, format='json')
        self.assertEqual(r.status_code, 403)
        self.api.force_authenticate(self.owner)
        r = self.api.post(url, {'kind': 'bank', 'amount': '5.00', 'note': 'sorry', 'use_by': use_by}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        entry = LedgerEntry.objects.get(reason='adjust')
        self.assertEqual(entry.use_by.isoformat(), use_by)
        self.assertIn(use_by, [l['use_by'] for l in ledger.reward_lots(account)])
        r = self.api.post(f'/api/thriftplus/accounts/{account.pk}/undo/', {'entry': entry.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sum(e.amount for e in LedgerEntry.objects.filter(reason='adjust')), 0)
        again = self.api.post(f'/api/thriftplus/accounts/{account.pk}/undo/', {'entry': entry.pk}, format='json')
        self.assertEqual(again.status_code, 400)
