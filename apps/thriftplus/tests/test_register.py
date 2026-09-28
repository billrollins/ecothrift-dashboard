"""Thrift+ Phase 3: the trip math, the ledger, and the register (live vs dark, member price, 18+, complete, void, credit, re-ring)."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.thriftplus.models import Account, CartMember, ItemReward, LedgerEntry, RestrictedProduct
from apps.thriftplus.services import cards, ledger, members, trip
from apps.thriftplus.services.trip import TripLine

D = Decimal


class TripMathTests(SimpleTestCase):
    """Mirrors computeCartTotals in frontend/src/api/thriftPlusMock.ts."""

    lines = [TripLine('a', D('90.00'), D('13.00')), TripLine('b', D('20.00'), D('4.00'), qty=2)]

    def test_the_cover_fills_first_in_scan_order_then_the_rest_comes_off(self):
        t = trip.totals(self.lines, cover_left=D('10.00'), member=True, choice='instant')
        self.assertEqual((t.reward_total, t.to_cover, t.savings, t.to_bank, t.member_total),
                         (D('21.00'), D('10.00'), D('11.00'), D('0.00'), D('119.00')))
        self.assertEqual([(s.to_cover, s.savings) for s in t.lines], [(D('10.00'), D('3.00')), (D('0.00'), D('8.00'))])

    def test_banking_keeps_the_price_and_banks_the_rest(self):
        t = trip.totals(self.lines, cover_left=D('4.00'), member=True, choice='bank')
        self.assertEqual((t.to_cover, t.savings, t.to_bank, t.member_total), (D('4.00'), D('0.00'), D('17.00'), D('130.00')))

    def test_a_guest_is_shown_the_instant_rebate_and_never_banks(self):
        t = trip.totals(self.lines, cover_left=D('10.00'), member=False, choice='bank')
        self.assertEqual((t.to_bank, t.savings), (D('0.00'), D('11.00')))
        self.assertEqual(trip.guest_line(t, D('10.00')), 'No Thrift+ card today. You lost $11.00')
        small = trip.totals([TripLine('a', D('20.00'), D('4.00'))], cover_left=D('10.00'), member=False, choice=None)
        self.assertEqual(trip.guest_line(small, D('10.00')), 'This trip would have earned $4.00')

    def test_a_reward_never_passes_the_price(self):
        t = trip.totals([TripLine('a', D('5.00'), D('9.00'))], cover_left=D('0'), member=True, choice='bank')
        self.assertEqual(t.to_bank, D('5.00'))  # banked never exceeds what was spent

    def test_banking_adds_the_bonus_but_never_past_what_was_paid(self):
        t = trip.totals(self.lines, cover_left=D('4.00'), member=True, choice='bank', bonus=D('0.05'))
        self.assertEqual((t.to_cover, t.to_bank), (D('4.00'), D('17.85')))  # (9 + 8) x 1.05
        coats = trip.totals([TripLine('red', D('20.00'), D('5.00'))], cover_left=D('0'), member=True, choice='bank', bonus=D('0.05'))
        self.assertEqual(coats.to_bank, D('5.25'))  # the owner's red coat: 1.05 x $5
        capped = trip.totals([TripLine('a', D('10.00'), D('9.00'), discount=D('5.00'))], cover_left=D('0'), member=True,
                             choice='bank', bonus=D('0.05'))
        self.assertEqual(capped.to_bank, D('5.00'))  # $5 off leaves $5 paid: that is all it can bank


def _employee(email, group='Employee'):
    user = User.objects.create_user(email, 'Pat', 'Clerk', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class RegisterTests(TestCase):
    def setUp(self):
        self.clerk = _employee('clerk@example.com')
        self.manager = _employee('manager@example.com', 'Manager')
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)
        location = WorkLocation.objects.create(name='Store')
        self.register = Register.objects.create(location=location, name='Test register', code='TP-T1')
        self.drawer = Drawer.objects.create(register=self.register, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        category = Category.objects.create(name='Lamps', slug='lamps')
        self.lamp = Item.objects.create(sku='ITMTPREG1', product=Product.objects.create(title='Brass lamp', category=category),
                                        price=D('90.00'), status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key=f'p{self.lamp.product_id}', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())
        batch = cards.generate_batch(3)
        self.codes = list(batch.cards.values_list('code', flat=True))
        self.account = members.create_account(first_name='Ana', phone='4025550101', id_checked=True, verified_18=True, card_code=self.codes[0])
        members.create_account(first_name='Bo', phone='4025550102', card_code=self.codes[1])  # not verified 18+

    def _live(self):
        AppSetting.objects.update_or_create(key='thrift_plus_test_registers', defaults={'value': ['TP-T1']})

    def _cart(self, sku='ITMTPREG1'):
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        r = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': sku}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _attach(self, cart_id, code=None):
        return self.api.post('/api/thriftplus/register/attach/', {'cart': cart_id, 'code': f'TP{code or self.codes[0]}'}, format='json')

    def _complete(self, cart_id, **data):
        return self.api.post(f'/api/pos/carts/{cart_id}/complete/', {'payment_method': 'cash', 'cash_tendered': '200.00', **data}, format='json')

    def test_dark_registers_are_untouched(self):
        cart = self._cart()
        self.assertIsNone(cart['thrift_plus'])
        self.assertEqual((cart['subtotal'], cart['total']), ('90.00', '96.30'))
        r = self._attach(cart['id'])
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_LIVE'))
        RestrictedProduct.objects.create(product=self.lamp.product)
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPREG1'}, format='json').status_code, 200)
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.assertFalse(LedgerEntry.objects.exists())

    def test_a_member_pays_the_member_price_after_the_cover(self):
        self._live()
        cart = self._cart()
        self.assertEqual(cart['thrift_plus']['guest_line'], 'No Thrift+ card today. You lost $3.00')
        data = self._attach(cart['id']).json()
        line = data['lines'][0]
        self.assertEqual((line['thrift_savings'], line['line_total']), ('3.00', '87.00'))  # $13: $10 to the cover, $3 off
        self.assertEqual(data['total'], '93.09')
        self.assertEqual(data['thrift_plus']['member']['name'], 'Ana')
        self.assertEqual(data['thrift_plus']['totals']['to_cover'], '10.00')
        self.assertIn({'label': 'Thrift+ rewards', 'amount': '3.00'}, data['savings']['lines'])
        banked = self.api.post('/api/thriftplus/register/choice/', {'cart': cart['id'], 'choice': 'bank'}, format='json').json()
        self.assertEqual((banked['lines'][0]['line_total'], banked['thrift_plus']['totals']['to_bank']), ('90.00', '3.15'))  # 1.05 x $3

    def test_completing_writes_the_ledger_and_voiding_gives_it_back(self):
        self._live()
        cart = self._cart()
        self._attach(cart['id'])
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.sold_for, D('87.00'))
        self.assertEqual(ledger.cover(self.account)['covered'], '10.00')
        state = ItemReward.objects.get(item=self.lamp)
        self.assertEqual((state.status, state.reward_at_close), (ItemReward.STATUS_CLOSED, D('13.00')))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('93.09'))
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/void/").status_code, 200)
        self.assertEqual(ledger.cover(self.account)['covered'], '0.00')
        self.assertEqual(LedgerEntry.objects.filter(reverses__isnull=False).count(), 1)

    def test_store_credit_lowers_what_cash_must_cover(self):
        self._live()
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_CREDIT, amount=D('5.00'), reason='adjust')
        cart = self._cart()
        self._attach(cart['id'])
        over = self.api.post('/api/thriftplus/register/balance/', {'cart': cart['id'], 'credit': '6.00'}, format='json')
        self.assertEqual(over.json()['code'], 'OVER_BALANCE')
        data = self.api.post('/api/thriftplus/register/balance/', {'cart': cart['id'], 'credit': '5.00'}, format='json').json()
        self.assertEqual((data['thrift_credit'], data['thrift_plus']['amount_due']), ('5.00', '88.09'))
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('88.09'))
        self.assertEqual(ledger.balance(self.account, LedgerEntry.KIND_CREDIT), D('0.00'))

    def test_18_plus_items_need_a_verified_card(self):
        self._live()
        RestrictedProduct.objects.create(product=self.lamp.product)
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        blocked = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPREG1'}, format='json')
        self.assertEqual((blocked.status_code, blocked.json()['code']), (400, 'AGE_RESTRICTED'))
        self._attach(cart['id'], self.codes[1])  # Bo: not verified 18+
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPREG1'}, format='json').status_code, 400)
        self._attach(cart['id'])  # Ana: verified 18+
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPREG1'}, format='json').status_code, 200)
        self.api.post('/api/thriftplus/register/detach/', {'cart': cart['id']}, format='json')
        refused = self._complete(cart['id'])
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'AGE_RESTRICTED'))

    def test_a_store_sale_scales_the_tag_and_the_reward_alike(self):
        self._live()
        cart = self._cart()
        line = CartLine.objects.get(cart_id=cart['id'])
        line.sale_label, line.sale_percent = 'summer', D('20')
        line.save()
        Cart.objects.get(pk=cart['id']).recalculate()
        data = self._attach(cart['id']).json()
        # 20% off both: $72 tag, $10.40 reward; $10 to the cover, $0.40 off
        self.assertEqual((data['lines'][0]['line_total'], data['lines'][0]['thrift_savings']), ('71.60', '0.40'))

    def test_rering_pays_the_rebate_as_store_credit(self):
        self._live()
        cart = self._cart()
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        r = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'code': self.codes[0]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(CartMember.objects.get(cart_id=cart['id']).rering)
        self.assertEqual(ledger.balance(self.account, LedgerEntry.KIND_CREDIT), D('3.00'))
        self.assertEqual(ledger.cover(self.account)['covered'], '10.00')
        self.assertEqual(r.json()['thrift_plus']['totals']['savings'], '3.00')
        again = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'code': self.codes[0]}, format='json')
        self.assertEqual(again.json()['code'], 'ALREADY_MEMBER')


    def test_a_member_return_within_the_window_is_store_credit_and_takes_the_rewards_back(self):
        self._live()
        cart = self._cart()
        self._attach(cart['id'])
        self._complete(cart['id'])
        line_id = cart['lines'][0]['id']
        found = self.api.get('/api/thriftplus/returns/lookup/', {'code': self.codes[0]}).json()
        self.assertEqual([(l['cart_line'], l['ok']) for l in found['lines']], [(line_id, True)])
        unconfirmed = self.api.post('/api/thriftplus/returns/', {'cart_line': line_id, 'code': self.codes[0]}, format='json')
        self.assertEqual(unconfirmed.json()['code'], 'NOT_PRIMARY')
        done = self.api.post('/api/thriftplus/returns/', {'cart_line': line_id, 'code': self.codes[0], 'confirmed': True,
                                                          'note': 'Will not light'}, format='json')
        self.assertEqual(done.status_code, 201, done.content)
        self.assertEqual(done.json()['credit'], '82.65')  # 95% of the $87 paid, before tax
        self.assertEqual(ledger.balance(self.account, LedgerEntry.KIND_CREDIT), D('82.65'))
        self.assertEqual(ledger.cover(self.account)['covered'], '0.00')  # its $10 toward the cover comes back out
        again = self.api.post('/api/thriftplus/returns/', {'cart_line': line_id, 'code': self.codes[0], 'confirmed': True}, format='json')
        self.assertIn('already returned', again.json()['detail'])

    def test_guest_sales_old_sales_and_excluded_items_are_final(self):
        self._live()
        from apps.thriftplus.services import returns
        guest = self._cart()
        self._complete(guest['id'])
        line = CartLine.objects.select_related('cart', 'item__product').get(cart_id=guest['id'])
        self.assertIn('It was not bought on this Thrift+ membership. Guest sales are final.', returns.problems(line, self.account))
        Cart.objects.filter(pk=guest['id']).update(completed_at=timezone.now() - timedelta(days=30))
        line = CartLine.objects.select_related('cart', 'item__product').get(cart_id=guest['id'])
        self.assertTrue(any('window closed' in p for p in returns.problems(line, self.account)))
        bow = Item.objects.create(sku='ITMTPBOW', product=Product.objects.create(title='Compound crossbow'), price=D('150.00'))
        self.assertIn('crossbow', returns.excluded(bow))
        self.assertEqual(returns.excluded(self.lamp), '')
        island = Item.objects.create(sku='ITMTPISL', product=Product.objects.create(title='Canvas island print'), price=D('20.00'))
        self.assertEqual(returns.excluded(island), '')  # whole words only


class LedgerTests(TestCase):
    def test_the_cover_is_per_calendar_month(self):
        account = Account.objects.create()
        LedgerEntry.objects.create(account=account, kind=LedgerEntry.KIND_COVER, amount=D('7.00'), month='2026-10', reason='sale')
        self.assertEqual(ledger.cover(account, date(2026, 10, 30))['remaining'], '3.00')
        november = ledger.cover(account, date(2026, 11, 1))
        self.assertEqual((november['remaining'], november['resets_on']), ('10.00', '2026-12-01'))
