"""Paid with Thrift+ (Bill, 2026-10-21, R-20261020-009): Thrift+ money that covers the whole sale is not cash."""
from decimal import Decimal as D

from apps.core.models import AppSetting
from apps.core.services import approval_requests
from apps.pos.approval_kinds import thrift_paid_as_other
from apps.pos.models import Cart
from apps.pos.services import sales_numbers
from apps.thriftplus.tests.test_register import RegisterBase


class ThriftPaidTests(RegisterBase):
    def _paid(self, **data):
        cart = self._cart()
        self._attach(cart['id'])
        done = self._complete(cart['id'], **data)
        self.assertEqual(done.status_code, 200, done.content)
        return done.json()

    def test_credit_that_covers_the_sale_is_paid_with_thrift_whatever_the_screen_sent(self):
        self._credit('100.00')
        sale = self._paid(cash_tendered='0.00')  # an old screen: "cash", $0 handed over
        self.assertEqual((sale['payment_method'], sale['cash_tendered'], sale['change_given']), ('thrift', None, None))
        self.assertEqual(sale['thrift_credit'], '85.60')
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('0.00'))

    def test_the_register_sends_thrift_with_nothing_else(self):
        self._credit('100.00')
        sale = self._paid(payment_method='thrift', cash_tendered=None)
        self.assertEqual(sale['payment_method'], 'thrift')

    def test_thriftbucks_alone_that_cover_it_are_thrift_too(self):
        self._lot('100.00')
        sale = self._paid(payment_method='card', card_type='debit', card_amount='0.00', cash_tendered=None)
        self.assertEqual((sale['payment_method'], sale['total'], sale['card_type']), ('thrift', '0.00', ''))

    def test_thrift_with_money_still_due_is_refused(self):
        self._credit('20.00')
        cart = self._cart()
        self._attach(cart['id'])
        r = self._complete(cart['id'], payment_method='thrift', cash_tendered=None)
        self.assertEqual((r.status_code, r.json()['code']), (400, 'THRIFT_DOES_NOT_COVER'))
        self.assertIn('65.60', r.json()['detail'])

    def test_part_thrift_part_cash_stays_cash(self):
        self._credit('20.00')
        sale = self._paid(cash_tendered='70.00')
        self.assertEqual((sale['payment_method'], sale['change_given']), ('cash', '4.40'))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('65.60'))

    def test_a_zero_sale_without_thrift_is_not_thrift(self):
        """Nothing due because of a 100% discount (a manager's OK), not Thrift+: what the screen sent."""
        AppSetting.objects.filter(key='thrift_plus_test_registers').delete()  # Thrift+ dark here
        cart = self._cart()
        Cart.objects.filter(pk=cart['id']).update(total=D('0.00'), subtotal=D('0.00'), tax_amount=D('0.00'))
        r = self._complete(cart['id'], cash_tendered='0.00')
        self.assertEqual((r.status_code, r.json()['payment_method']), (200, 'cash'))

    def test_sales_numbers_count_no_cash_for_it(self):
        self._credit('100.00')
        sale = self._paid(payment_method='thrift', cash_tendered=None)
        nums = sales_numbers.for_carts(Cart.objects.filter(pk=sale['id']))
        self.assertEqual(nums['paid_with']['cash'], '0.00')
        self.assertEqual(nums['paid_with']['thriftplus_credit'], '85.60')
        self.assertEqual(nums['reconciles']['difference'], '0.00')


class ThriftPaidRequestTests(RegisterBase):
    def _old_style_sale(self):
        """A sale from before 10-21: Thrift+ credit paid it all, recorded as cash ($0 tendered)."""
        self._credit('100.00')
        cart = self._cart()
        self._attach(cart['id'])
        self.assertEqual(self._complete(cart['id'], payment_method='thrift', cash_tendered=None).status_code, 200)
        Cart.objects.filter(pk=cart['id']).update(payment_method='cash', cash_tendered=D('0.00'))
        return cart['id']

    def test_stage_finds_it_apply_fixes_it_undo_puts_it_back(self):
        cid = self._old_style_sale()
        self.assertEqual(list(thrift_paid_as_other().values_list('pk', flat=True)), [cid])
        req = approval_requests.stage('pos.thrift_paid', title='Thrift+ paid sales')
        self.assertEqual(req.preview['counts'], {'Sales paid in full with Thrift+ but recorded as cash or card': 1})
        self.assertEqual(req.preview['sample'][0]['recorded_as'], 'cash')
        self.assertEqual(req.params['ids'], [cid])
        self.assertEqual(Cart.objects.get(pk=cid).payment_method, 'cash')  # staging changes nothing

        kind = approval_requests.get_kind('pos.thrift_paid')
        result = kind.apply(req, approval_requests.Progress(req))
        self.assertEqual(result['marked_thrift'], 1)
        c = Cart.objects.get(pk=cid)
        self.assertEqual((c.payment_method, c.cash_tendered), ('thrift', None))
        self.assertFalse(thrift_paid_as_other().exists())
        self.assertEqual(kind.apply(req, approval_requests.Progress(req))['marked_thrift'], 0)  # again: nothing to do

        req.result = result
        self.assertEqual(kind.undo(req), {'put_back': 1})
        c.refresh_from_db()
        self.assertEqual((c.payment_method, c.cash_tendered), ('cash', D('0.00')))

    def test_a_cash_sale_with_money_due_is_left_alone(self):
        self._credit('20.00')
        cart = self._cart()
        self._attach(cart['id'])
        self._complete(cart['id'], cash_tendered='70.00')
        self.assertFalse(thrift_paid_as_other().exists())
