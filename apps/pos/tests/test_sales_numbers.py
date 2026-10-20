"""How sales are counted (owner 10-20): item sales, returns, Thrift+ revenue, tax, fees, paid with, and that it reconciles.

The rulebook's W5 lamp ($80 tag, 35 ThriftBucks, 7% tax) is the worked example."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.core.models import AppSetting
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.pos.services import sales_numbers
from apps.thriftplus.models import LedgerEntry, ReturnRecord
from apps.thriftplus.services import ledger
from apps.thriftplus.tests.test_register import RegisterBase, _at

D = Decimal


class SalesNumbersBase(RegisterBase):
    def _sale(self, *skus, member=True, choice='bank', **pay):
        cart = self._cart(*skus)
        if member:
            self._attach(cart['id'])
            if choice == 'instant':
                self._choice(cart['id'], 'instant')
        done = self._complete(cart['id'], **pay)
        self.assertEqual(done.status_code, 200, done.content)
        return done.json()

    def _return(self, line_id):
        r = self.api.post('/api/thriftplus/returns/', {'cart_line': line_id, 'code': self.codes[0], 'register': 'TP-T1'},
                          format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def today(self):
        return sales_numbers.by_day(timezone.localdate(), timezone.localdate()).get(timezone.localdate()) or {}

    def totals(self, **kw):
        return sales_numbers.for_carts(Cart.objects.all(), ReturnRecord.objects.all(), **kw)

    def assertReconciles(self, numbers):
        self.assertEqual(numbers['reconciles']['difference'], '0.00', numbers['reconciles'])


class W5Tests(SalesNumbersBase):
    def test_kept_lamp_item_sales_45_owed_35_tax_5_60(self):
        sale = self._sale()
        self.assertEqual(sale['total'], '85.60')
        n = self.today()
        self.assertEqual((n['item_sales'], n['thriftplus_revenue'], n['thriftbucks_owed_new'], n['tax']),
                         ('45.00', '0.00', '35.00', '5.60'))
        self.assertEqual((n['returns'], n['net_item_sales']), ('0.00', '45.00'))
        self.assertEqual(n['paid_with']['cash'], '85.60')
        self.assertReconciles(n)

    def test_instant_lamp_pays_62_50_plus_tax_item_sales_45_thriftplus_revenue_17_50(self):
        sale = self._sale(choice='instant')
        self.assertEqual(sale['total'], '66.88')  # 62.50 + 4.38 tax
        n = self.today()
        self.assertEqual((n['item_sales'], n['thriftplus_revenue'], n['thriftplus_revenue_instant'], n['thriftbucks_owed_new']),
                         ('45.00', '17.50', '17.50', '0.00'))
        self.assertEqual((n['tax'], n['paid_with']['cash']), ('4.38', '66.88'))
        self.assertReconciles(n)

    def test_return_of_the_kept_lamp_is_minus_36_with_4_48_tax_back(self):
        sale = self._sale()
        done = self._return(sale['lines'][0]['id'])
        self.assertEqual((done['credit'], done['bucks_taken']), ('68.48', '28.00'))
        n = self.today()
        self.assertEqual((n['item_sales'], n['returns'], n['net_item_sales']), ('45.00', '-36.00', '9.00'))  # 80% of 45 back
        self.assertEqual((n['tax_collected'], n['tax_refunded'], n['tax']), ('5.60', '4.48', '1.12'))
        self.assertReconciles(n)

    def test_return_of_the_instant_lamp_is_80_percent_of_item_sales_and_80_percent_of_thriftplus_revenue(self):
        sale = self._sale(choice='instant')
        done = self._return(sale['lines'][0]['id'])  # 53.50 credit, nothing to take back: 50.00 before tax
        self.assertEqual((done['credit'], done['bucks_taken']), ('53.50', '0.00'))
        n = self.today()
        # 50.00 comes back in all: 36.00 (80% of the 45.00 item sales) is Returns, 14.00 (80% of 17.50) is Thrift+ revenue
        self.assertEqual((n['item_sales'], n['returns'], n['net_item_sales']), ('45.00', '-36.00', '9.00'))
        self.assertEqual((n['thriftplus_revenue_instant'], n['thriftplus_revenue_returned'], n['thriftplus_revenue']),
                         ('17.50', '-14.00', '3.50'))
        self.assertEqual(n['tax_refunded'], '3.50')
        # kept: 9.00 + 3.50 = 12.50 = 62.50 paid - 50.00 given back
        self.assertEqual(Decimal(n['net_item_sales']) + Decimal(n['thriftplus_revenue']), D('62.50') - D('50.00'))

    def test_a_return_on_another_day_counts_on_the_return_day(self):
        sale = self._sale()
        later = timezone.localdate() + timedelta(days=2)
        with _at(later):
            self._return(sale['lines'][0]['id'])
        days = sales_numbers.by_day(timezone.localdate(), later)
        self.assertEqual((days[timezone.localdate()]['returns'], days[timezone.localdate()]['net_item_sales']), ('0.00', '45.00'))
        self.assertEqual((days[later]['returns'], days[later]['net_item_sales'], days[later]['sales_count']),
                         ('-36.00', '-36.00', 0))

    def test_a_guest_sale_is_the_price_after_markdowns(self):
        sale = self._sale(member=False)
        self.assertEqual(sale['total'], '85.60')
        n = self.today()
        self.assertEqual((n['item_sales'], n['thriftplus_revenue'], n['thriftbucks_owed_new'], n['tax']),
                         ('80.00', '0.00', '0.00', '5.60'))
        self.assertReconciles(n)

    def test_markdown_percent_lowers_item_sales_and_the_thriftbucks_it_collects(self):
        cart = self._cart()
        line = CartLine.objects.get(cart_id=cart['id'])
        line.sale_label, line.sale_percent = 'summer', D('20')
        line.save()
        Cart.objects.get(pk=cart['id']).recalculate()
        self._attach(cart['id'])
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        n = self.today()
        self.assertEqual(n['item_sales'], '36.00')  # $64 after 20% off, less 28.00 ThriftBucks
        self.assertEqual(n['thriftbucks_owed_new'], '28.00')
        self.assertReconciles(n)

    def test_earlier_thriftbucks_are_not_a_cut_in_item_sales(self):
        self._lot('35.00')
        sale = self._sale('ITMTPVASE')
        self.assertEqual(sale['total'], '16.05')  # $50 less 35 ThriftBucks, taxed
        n = self.today()
        # item sales: $50 less the 10 the vase collected; the 35 used is a payment from what we owe
        self.assertEqual((n['item_sales'], n['thriftbucks_owed_new'], n['tax']), ('40.00', '10.00', '1.05'))
        self.assertEqual((n['paid_with']['earlier_thriftbucks'], n['paid_with']['cash']), ('35.00', '16.05'))
        self.assertReconciles(n)
        # the return: $15 paid -> $12 before tax, 28 ThriftBucks back, 8 taken back: 12 + 28 - 8 = 32 = 80% of 40
        self._return(next(l['id'] for l in sale['lines'] if l['line_kind'] == 'item'))
        n = self.today()
        self.assertEqual((n['returns'], n['net_item_sales']), ('-32.00', '8.00'))

    def test_thriftbucks_that_could_not_be_taken_back_still_count_as_taken(self):
        sale = self._sale()
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('-30.00'), reason='adjust')
        done = self._return(sale['lines'][0]['id'])
        self.assertEqual((done['bucks_taken'], done['shortfall'], done['credit']), ('5.00', '23.00', '45.48'))
        self.assertEqual(self.today()['returns'], '-36.00')  # 64.00 - (5.00 taken + 23.00 off the credit)


class FeesAndPaymentTests(SalesNumbersBase):
    def test_delivery_fee_is_a_fee_not_item_sales(self):
        cart = self._cart('ITMTPVASE')
        CartLine.objects.create(cart_id=cart['id'], line_kind='delivery', description='Delivery', quantity=1,
                                unit_price=D('25.00'), line_total=D('25.00'), meta={})
        Cart.objects.get(pk=cart['id']).recalculate()
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        n = self.today()
        self.assertEqual((n['item_sales'], n['fees_delivery'], n['fees_customers_paid']), ('50.00', '25.00', '25.00'))
        self.assertEqual(n['tax'], '5.25')  # the delivery fee is taxed with the sale
        self.assertReconciles(n)

    def test_credit_card_surcharge_is_a_fee_customers_pay_and_debit_costs_us_one_percent(self):
        credit = self._sale('ITMTPVASE', member=False, payment_method='card', card_amount='53.50', card_type='credit')
        self.assertEqual(credit['card_surcharge_amount'], '1.61')
        debit = self._sale('ITMTPLAMP', member=False, payment_method='card', card_amount='85.60', card_type='debit')
        self.assertEqual(debit['card_surcharge_amount'], '0.00')
        n = self.today()
        self.assertEqual((n['fees_card_surcharge'], n['fees_customers_paid']), ('1.61', '1.61'))
        self.assertEqual((n['debit_charged'], n['fees_we_pay'], n['fees_we_pay_percent']), ('85.60', '0.86', '1'))
        self.assertEqual((n['paid_with']['card_credit'], n['paid_with']['card_debit'], n['paid_with']['card']),
                         ('55.11', '85.60', '140.71'))
        self.assertEqual(n['paid_with']['cash'], '0.00')
        self.assertReconciles(n)

    def test_the_debit_fee_is_a_setting(self):
        AppSetting.objects.update_or_create(key=sales_numbers.DEBIT_FEE_KEY, defaults={'value': '0.02'})
        self._sale('ITMTPLAMP', member=False, payment_method='card', card_amount='85.60', card_type='debit')
        n = self.today()
        self.assertEqual((n['fees_we_pay'], n['fees_we_pay_percent']), ('1.71', '2'))
        AppSetting.objects.filter(key=sales_numbers.DEBIT_FEE_KEY).update(value='nonsense')
        self.assertEqual(self.today()['fees_we_pay_percent'], '1')

    def test_a_card_sale_with_no_card_type_is_shown_as_not_set_and_has_no_fee_guessed(self):
        sale = self._sale('ITMTPLAMP', member=False, payment_method='card', card_amount='85.60', card_type='debit')
        Cart.objects.filter(pk=sale['id']).update(card_type='')
        n = self.today()
        self.assertEqual((n['card_type_not_set'], n['fees_we_pay'], n['debit_charged']), ('85.60', '0.00', '0.00'))
        self.assertEqual(n['paid_with']['card_type_not_set'], '85.60')
        self.assertReconciles(n)

    def test_split_cash_and_card_and_thriftplus_credit(self):
        self._credit('50.00')
        sale = self._sale('ITMTPLAMP', payment_method='split', cash_tendered='20.00', card_amount='15.60', card_type='debit')
        self.assertEqual(sale['thrift_credit'], '50.00')
        n = self.today()
        self.assertEqual((n['paid_with']['thriftplus_credit'], n['paid_with']['card_debit'], n['paid_with']['cash']),
                         ('50.00', '15.60', '20.00'))
        self.assertReconciles(n)

    def test_training_register_sales_are_left_out(self):
        trainer = Register.objects.create(location=self.register.location, name='Training', code='TRAIN-X', is_training=True)
        self.drawer = Drawer.objects.create(register=trainer, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        cart = self._cart()
        self._attach(cart['id'])
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(Cart.objects.get(pk=cart['id']).status, 'training')
        self.assertEqual(self.today(), {})
        self.assertEqual(self.totals()['item_sales'], '0.00')

    def test_voided_sales_are_left_out(self):
        sale = self._sale()
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.post(f"/api/pos/carts/{sale['id']}/void/").status_code, 200)
        self.assertEqual(self.today(), {})


class ThriftPlusRevenueTests(SalesNumbersBase):
    def test_kept_thriftbucks_that_expire_unused_are_revenue_on_the_day_they_expire(self):
        collected = timezone.localdate() - timedelta(days=40)
        with _at(collected):
            LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('35.00'), reason='sale')
        spent_lot = timezone.localdate() - timedelta(days=40)
        with _at(spent_lot):
            LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('10.00'), reason='sale')
        with _at(spent_lot + timedelta(days=5)):
            LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('-10.00'), reason='spend')
        ledger.expire_lots()
        expires_on = collected + timedelta(days=31)  # good through day 30, gone on day 31
        days = sales_numbers.by_day(expires_on - timedelta(days=2), timezone.localdate())
        self.assertEqual(days[expires_on]['thriftplus_revenue_expired'], '35.00')  # the 10 spent first: 35 + 10 - 10
        self.assertEqual(days[expires_on]['thriftplus_revenue'], '35.00')
        self.assertEqual(days[expires_on]['net_item_sales'], '0.00')
        self.assertNotIn(timezone.localdate(), days)
        self.assertEqual(self.totals(expired=(expires_on, expires_on))['thriftplus_revenue'], '35.00')

    def test_thriftbucks_taken_back_on_a_return_are_not_revenue(self):
        sale = self._sale()
        self._return(sale['lines'][0]['id'])
        self.assertEqual(self.today()['thriftplus_revenue'], '0.00')


class ReconcileAndPageTests(SalesNumbersBase):
    def test_a_mixed_day_reconciles_by_day_and_in_the_page_totals(self):
        self._lot('35.00')
        self._credit('20.00')
        self._sale('ITMTPVASE')  # earlier ThriftBucks and credit
        self._sale('ITMTPLAMP', choice='instant')
        self._sale('ITMTPLAMP', member=False, payment_method='card', card_amount='85.60', card_type='credit')
        self.assertReconciles(self.today())
        n = self.totals(expired=(timezone.localdate() - timedelta(days=60), timezone.localdate()))
        self.assertReconciles(n)
        self.assertEqual(n['sales_count'], 3)

    def test_returns_of_an_instant_and_a_kept_sale_still_reconcile_and_the_page_agrees_with_the_dashboard(self):
        instant = self._sale(choice='instant')
        kept = self._sale('ITMTPVASE')  # (the lamp's ThriftBucks are spent on its first sale)
        self._return(instant['lines'][0]['id'])
        self._return(kept['lines'][0]['id'])
        by_day, page = self.today(), self.totals()
        for n in (by_day, page):
            self.assertReconciles(n)
            self.assertEqual((n['item_sales'], n['returns'], n['net_item_sales']), ('85.00', '-68.00', '17.00'))
            self.assertEqual((n['thriftplus_revenue'], n['thriftplus_revenue_returned']), ('3.50', '-14.00'))
            self.assertEqual((n['tax_collected'], n['tax_refunded'], n['tax']), ('7.88', '6.30', '1.58'))

    def test_the_transactions_summary_carries_the_block_and_follows_the_filters(self):
        sale = self._sale()
        self._return(sale['lines'][0]['id'])
        self._sale('ITMTPVASE', member=False, payment_method='card', card_amount='53.50', card_type='debit')
        self.api.force_authenticate(self.manager)
        today = timezone.localdate().isoformat()
        r = self.api.get('/api/pos/carts/summary/', {'status': 'all', 'date_from': today, 'date_to': today})
        self.assertEqual(r.status_code, 200, r.content)
        n = r.json()['sales_numbers']
        self.assertEqual((n['item_sales'], n['returns'], n['net_item_sales']), ('95.00', '-36.00', '59.00'))
        self.assertEqual(n['paid_with']['card_debit'], '53.50')
        self.assertEqual(r.json()['total'], '139.10')  # the old keys stay
        # a day with no sales has no returns either: returns are counted by their own day
        past = (timezone.localdate() - timedelta(days=5)).isoformat()
        r = self.api.get('/api/pos/carts/summary/', {'status': 'all', 'date_from': past, 'date_to': past})
        self.assertEqual((r.json()['sales_numbers']['item_sales'], r.json()['sales_numbers']['returns']), ('0.00', '0.00'))
        # how it was paid narrows the sales and the returns together
        r = self.api.get('/api/pos/carts/summary/', {'status': 'all', 'card_type': 'debit'})
        n = r.json()['sales_numbers']
        self.assertEqual((n['item_sales'], n['returns']), ('50.00', '0.00'))
