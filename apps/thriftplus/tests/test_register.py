"""Thrift+ at the register, the 10-12 policy (owner answers 10-14): the trip math, credit first, kept ThriftBucks used
automatically before tax (B3, B14, F3), instant redemption on what is left (B1), completing, voiding, re-ring, and
Thrift+ 3-day returns (W1-W14)."""
from __future__ import annotations

from datetime import datetime, timedelta
from datetime import timezone as dt_tz
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.thriftplus.models import Card, CartMember, Event, ItemReward, LedgerEntry, Person, RestrictedProduct, ReturnRecord
from apps.thriftplus.services import cards, ledger, members, register, returns, trip
from apps.thriftplus.services.trip import TripLine

D = Decimal
HALF = D('0.50')


class TripMathTests(SimpleTestCase):
    """Mirrors computeCartTotals in frontend/src/api/thriftPlusMock.ts. No cover (C1); instant at 50% (B1)."""

    lines = [TripLine('a', D('90.00'), D('13.00')), TripLine('b', D('20.00'), D('4.00'), qty=2)]

    def test_kept_is_the_default_and_keeps_every_thriftbuck(self):
        t = trip.totals(self.lines, member=True, choice=None, share=HALF)
        self.assertEqual((t.reward_total, t.collected, t.savings, t.to_bank, t.member_total),
                         (D('21.00'), D('21.00'), D('0.00'), D('21.00'), D('130.00')))
        self.assertNotIn('to_cover', t.as_dict())

    def test_redeemed_instantly_takes_half_off_today_rounded_up(self):
        t = trip.totals(self.lines, member=True, choice='instant', share=HALF)
        self.assertEqual((t.savings, t.to_bank, t.member_total), (D('10.50'), D('0.00'), D('119.50')))
        self.assertEqual([(s.savings, s.redeemed) for s in t.lines], [(D('6.50'), D('13.00')), (D('4.00'), D('8.00'))])
        self.assertEqual(trip.instant_part(D('0.03'), HALF), D('0.02'))  # rounded up: the member's favor
        self.assertEqual(trip.instant_part(D('0.01'), HALF), D('0.01'))

    def test_a_guest_collects_nothing_and_is_told_what_the_trip_would_have_collected(self):
        t = trip.totals(self.lines, member=False, choice='instant', share=HALF)
        self.assertEqual((t.savings, t.to_bank, t.full_value), (D('0.00'), D('0.00'), D('21.00')))
        self.assertEqual(trip.guest_line(t), 'This trip would have collected 21.00 ThriftBucks.')

    def test_a_reward_never_passes_what_was_paid(self):
        t = trip.totals([TripLine('a', D('5.00'), D('9.00'))], member=True, choice='bank', share=HALF)
        self.assertEqual(t.to_bank, D('5.00'))
        capped = trip.totals([TripLine('a', D('10.00'), D('9.00'), discount=D('5.00'))], member=True, choice='bank', share=HALF)
        self.assertEqual(capped.to_bank, D('5.00'))  # $5 off leaves $5 paid: that is all it can collect


class InstantShareSettingTests(TestCase):
    def test_the_share_is_a_setting_and_a_bad_value_falls_back_to_half(self):
        self.assertEqual(trip.instant_share(), D('0.50'))
        for raw, want in (('0.60', D('0.60')), ('1.5', D('0.50')), ('nonsense', D('0.50')), ('-0.1', D('0.50'))):
            AppSetting.objects.update_or_create(key=trip.INSTANT_KEY, defaults={'value': raw})
            self.assertEqual(trip.instant_share(), want, raw)


def _user(email, group='Employee'):
    user = User.objects.create_user(email, 'Pat', 'Clerk', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


def _at(day, hour=12):
    return mock.patch('django.utils.timezone.now', return_value=datetime(day.year, day.month, day.day, hour + 5, tzinfo=dt_tz.utc))


class RegisterBase(TestCase):
    def setUp(self):
        self.clerk = _user('clerk@example.com')
        self.manager = _user('manager@example.com', 'Manager')
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)
        location = WorkLocation.objects.create(name='Store')
        self.register = Register.objects.create(location=location, name='Test register', code='TP-T1')
        self.drawer = Drawer.objects.create(register=self.register, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        self.category = Category.objects.create(name='Lamps', slug='lamps')
        self.lamp = self._item('ITMTPLAMP', 'Brass lamp', '80.00', '35.00')  # F3: tag $80, 35 ThriftBucks
        self.vase = self._item('ITMTPVASE', 'Glass vase', '50.00', '10.00')
        batch = cards.generate_batch(3)
        self.codes = list(batch.cards.values_list('code', flat=True))
        self.account = members.create_account(first_name='Ana', phone='4025550101', id_checked=True, verified_18=True,
                                              card_code=self.codes[0])
        members.create_account(first_name='Bo', phone='4025550102', card_code=self.codes[1])  # not verified 18+
        AppSetting.objects.update_or_create(key='thrift_plus_test_registers', defaults={'value': ['TP-T1']})

    def _item(self, sku, title, price, reward, **extra):
        item = Item.objects.create(sku=sku, product=Product.objects.create(title=title, category=self.category),
                                   price=D(price), status='on_shelf', **extra)
        ItemReward.objects.create(item=item, family_key=f'p{item.product_id}', floor_date=timezone.localdate() - timedelta(days=40),
                                  starting_price=D(price), floor_price=D(price) / 10, grow_days=30, reward=D(reward),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=40, computed_on=timezone.localdate())
        return item

    def _cart(self, *skus):
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        for sku in skus or ('ITMTPLAMP',):
            r = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': sku}, format='json')
            self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _attach(self, cart_id, code=None):
        r = self.api.post('/api/thriftplus/register/attach/', {'cart': cart_id, 'code': f'TP{code or self.codes[0]}'}, format='json')
        return r

    def _choice(self, cart_id, choice):
        return self.api.post('/api/thriftplus/register/choice/', {'cart': cart_id, 'choice': choice}, format='json')

    def _complete(self, cart_id, **data):
        return self.api.post(f'/api/pos/carts/{cart_id}/complete/', {'payment_method': 'cash', 'cash_tendered': '200.00', **data}, format='json')

    def _lot(self, amount, days_ago=1, reason='sale'):
        """Kept ThriftBucks collected ``days_ago`` days ago (usable from the day after)."""
        day = timezone.localdate() - timedelta(days=days_ago)
        with _at(day):
            return LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D(amount), reason=reason)

    def _credit(self, amount):
        return LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_CREDIT, amount=D(amount), reason='return')


class RegisterTests(RegisterBase):
    def test_dark_registers_are_untouched(self):
        AppSetting.objects.filter(key='thrift_plus_test_registers').delete()
        cart = self._cart()
        self.assertIsNone(cart['thrift_plus'])
        self.assertEqual((cart['subtotal'], cart['total'], cart['thrift_credit']), ('80.00', '85.60', '0.00'))
        r = self._attach(cart['id'])
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_LIVE'))
        RestrictedProduct.objects.create(product=self.lamp.product)
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPVASE'}, format='json').status_code, 200)
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.assertFalse(LedgerEntry.objects.exists())
        self.assertFalse(CartLine.objects.filter(cart_id=cart['id'], line_kind='discount').exists())

    def test_f3_kept_is_the_default_and_redeemed_instantly_is_half_off_before_tax(self):
        cart = self._cart()
        self.assertEqual(cart['thrift_plus']['guest_line'], 'This trip would have collected 35.00 ThriftBucks.')
        self.assertEqual(cart['thrift_plus']['lines'][str(cart['lines'][0]['id'])]['mark'], 'AS IS')  # guests: all AS IS
        # ...and each line says what it would be for a member (the receipt's "Join for:" line, owner 2026-10-16).
        self.assertIn(cart['thrift_plus']['lines'][str(cart['lines'][0]['id'])]['join_mark'], ('3-day return', 'AS IS'))
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        self.assertEqual(data['total'], '85.60')  # kept (the Default): pay $85.60
        self.assertEqual((tp['member']['choice'], tp['collected'], tp['instant_offered'], tp['instant_share']),
                         ('bank', '35.00', True, '0.50'))
        self.assertEqual(tp['use_by'], (timezone.localdate() + timedelta(days=30)).isoformat())
        self.assertEqual(tp['lines'][str(data['lines'][0]['id'])], {'reward': '35.00', 'savings': '0.00', 'mark': '3-day return'})
        for gone in ('totals', 'bank_used', 'app_choice'):
            self.assertNotIn(gone, tp)
        self.assertNotIn('cover', tp['member'])
        instant = self._choice(cart['id'], 'instant').json()
        self.assertEqual((instant['lines'][0]['thrift_savings'], instant['total']), ('17.50', '66.88'))  # $17.50 off, pay $66.88
        tp = instant['thrift_plus']
        self.assertEqual((tp['instant_off'], tp['instant_bucks'], tp['amount_due']), ('17.50', '35.00', '66.88'))
        self.assertIn({'label': 'Redeemed instantly', 'amount': '17.50'}, instant['savings']['lines'])
        self.assertEqual(Event.objects.filter(action='register_choice').get().detail['choice'], 'instant')
        kept = self._choice(cart['id'], 'bank').json()
        self.assertEqual((kept['total'], kept['thrift_plus']['instant_bucks']), ('85.60', '0.00'))

    def test_f3_next_trip_kept_thriftbucks_come_off_before_tax_automatically(self):
        self._lot('35.00')  # yesterday's 35 ThriftBucks, usable today
        cart = self._cart('ITMTPVASE')
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        self.assertEqual(data['total'], '16.05')  # $50 - 35 = $15 taxed
        self.assertEqual((tp['bucks_used'], tp['bucks_available'], tp['bucks_auto']), ('35.00', '35.00', True))
        bucks = CartLine.objects.get(cart_id=cart['id'], line_kind='discount')
        self.assertEqual((tp['bucks_line_id'], bucks.meta['thrift'], bucks.line_total), (bucks.pk, 'bucks', D('-35.00')))
        self.assertIn({'label': 'ThriftBucks used', 'amount': '35.00'}, data['savings']['lines'])
        self.assertEqual(tp['lines'][str(cart['lines'][0]['id'])]['reward'], '10.00')  # items bought with ThriftBucks still collect
        off = self.api.post('/api/thriftplus/register/bucks/', {'cart': cart['id'], 'use': False}, format='json').json()
        self.assertEqual((off['total'], off['thrift_plus']['bucks_used'], off['thrift_plus']['bucks_line_id']), ('53.50', '0.00', None))
        self.assertFalse(off['thrift_plus']['bucks_auto'])
        on = self.api.post('/api/thriftplus/register/bucks/', {'cart': cart['id'], 'use': True}, format='json').json()
        self.assertEqual(on['total'], '16.05')
        self.assertEqual(self.api.post('/api/thriftplus/register/balance/', {'cart': cart['id'], 'credit': '1'}, format='json').status_code, 404)

    def test_todays_thriftbucks_wait_until_tomorrow(self):
        self._lot('35.00', days_ago=0)
        data = self._attach(self._cart('ITMTPVASE')['id']).json()
        self.assertEqual((data['total'], data['thrift_plus']['bucks_available']), ('53.50', '0.00'))
        self.assertEqual(data['thrift_plus']['balances']['bucks'], '35.00')

    def test_b14_credit_that_covers_the_total_pays_it_all_and_no_thriftbucks_are_used(self):
        self._credit('100.00')
        self._lot('35.00')
        cart = self._cart()
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        self.assertEqual((data['total'], data['thrift_credit'], tp['amount_due'], tp['bucks_used']), ('85.60', '85.60', '0.00', '0.00'))
        self.assertEqual((tp['instant_offered'], tp['instant_reason']), (False, 'Thrift+ credit pays the whole total.'))
        refused = self._choice(cart['id'], 'instant')
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'INSTANT_NOT_OFFERED'))
        done = self._complete(cart['id'], cash_tendered='0.00')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(ledger.credit_balance(self.account), D('14.40'))
        self.assertEqual(ledger.bucks_total(self.account), D('70.00'))  # today's 35 kept in full, kept ones stay kept

    def test_b14_credit_50_and_35_kept_uses_33_27_and_nothing_is_paid_in_cash(self):
        self._credit('50.00')
        self._lot('35.00')
        cart = self._cart()
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        self.assertEqual((tp['bucks_used'], data['total'], tp['credit_used'], tp['amount_due']), ('33.27', '50.00', '50.00', '0.00'))
        self.assertEqual((tp['instant_offered'], tp['instant_reason']),
                         (False, 'Thrift+ credit and kept ThriftBucks pay the whole total.'))
        done = self._complete(cart['id'], cash_tendered='0.00')
        self.assertEqual(done.status_code, 200, done.content)
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('0.00'))
        self.assertEqual(ledger.available_bucks(self.account), D('1.73'))  # 1.73 stay kept
        self.assertEqual(ledger.bucks_total(self.account), D('36.73'))      # and today's 35, from tomorrow
        self.assertEqual(ledger.credit_balance(self.account), D('0.00'))
        spend = LedgerEntry.objects.get(kind=LedgerEntry.KIND_BANK, reason='spend')
        self.assertEqual((spend.amount, spend.cart_line_id), (D('-33.27'), cart['lines'][0]['id']))  # per line
        self.assertEqual(CartMember.objects.get(cart_id=cart['id']).bank_used, D('33.27'))

    def test_instant_is_offered_only_on_what_is_left_after_the_credit(self):
        self._credit('80.00')
        cart = self._cart()
        before = self._attach(cart['id']).json()['thrift_plus']
        # The panel offers the real figure before the tap: what instant would take off, not half of what it collects.
        self.assertEqual((before['instant_offered'], before['instant_offer'], before['instant_off']), (True, '5.23', '0.00'))
        data = self._choice(cart['id'], 'instant').json()
        tp = data['thrift_plus']
        self.assertEqual((data['total'], tp['credit_used'], tp['amount_due']), ('80.00', '80.00', '0.00'))
        self.assertEqual((tp['instant_off'], tp['instant_bucks']), ('5.23', '10.46'))  # only the $5.60 left
        self.assertEqual(tp['instant_offer'], '5.23')
        self.assertEqual(self._complete(cart['id'], cash_tendered='0.00').status_code, 200)
        self.assertEqual(ledger.bucks_total(self.account), D('24.54'))  # the rest of the 35 kept

    def test_thriftbucks_never_pay_for_consignment(self):
        self._lot('35.00')
        self._item('ITMTPCON', 'Consigned chair', '50.00', '0.00', source='consignment')
        data = self._attach(self._cart('ITMTPCON')['id']).json()
        self.assertEqual((data['total'], data['thrift_plus']['bucks_used']), ('53.50', '0.00'))

    def test_completing_writes_kept_rows_and_the_line_snapshot_and_voiding_gives_it_back(self):
        cart = self._cart()
        self._attach(cart['id'])
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['thrift_plus']['use_by'], (timezone.localdate() + timedelta(days=30)).isoformat())
        line = CartLine.objects.get(cart_id=cart['id'])
        snap = line.meta['thrift_plus']
        self.assertEqual({k: snap[k] for k in ('collected', 'kept', 'instant_off', 'bucks_used', 'paid', 'tax', 'mark')},
                         {'collected': '35.00', 'kept': '35.00', 'instant_off': '0.00', 'bucks_used': '0.00',
                          'paid': '80.00', 'tax': '5.60', 'mark': '3-day return'})
        self.assertEqual(snap['use_by'], (timezone.localdate() + timedelta(days=30)).isoformat())
        state = ItemReward.objects.get(item=self.lamp)
        self.assertEqual((state.status, state.reward_at_close), (ItemReward.STATUS_CLOSED, D('35.00')))
        self.assertFalse(LedgerEntry.objects.filter(kind=LedgerEntry.KIND_COVER).exists())  # no cover (C1)
        self.assertEqual(ledger.bucks_total(self.account), D('35.00'))
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/void/").status_code, 200)
        self.assertEqual(ledger.bucks_total(self.account), D('0.00'))

    def test_spent_balances_are_checked_again_at_payment(self):
        self._credit('20.00')
        cart = self._cart()
        self.assertEqual(self._attach(cart['id']).json()['thrift_credit'], '20.00')
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_CREDIT, amount=D('-20.00'), reason='spend')
        refused = self._complete(cart['id'])
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'OVER_BALANCE'))
        self.assertEqual(Cart.objects.get(pk=cart['id']).thrift_credit, D('0.00'))  # priced again
        self.assertEqual(self._complete(cart['id']).status_code, 200)

    def test_18_plus_items_need_a_verified_card(self):
        RestrictedProduct.objects.create(product=self.lamp.product)
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        blocked = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPLAMP'}, format='json')
        self.assertEqual((blocked.status_code, blocked.json()['code']), (400, 'AGE_RESTRICTED'))
        self._attach(cart['id'], self.codes[1])  # Bo: not verified 18+
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPLAMP'}, format='json').status_code, 400)
        self._attach(cart['id'])  # Ana: verified 18+
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPLAMP'}, format='json').status_code, 200)
        self.api.post('/api/thriftplus/register/detach/', {'cart': cart['id']}, format='json')
        refused = self._complete(cart['id'])
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'AGE_RESTRICTED'))

    def test_a_store_sale_scales_the_tag_and_the_reward_alike(self):
        cart = self._cart()
        line = CartLine.objects.get(cart_id=cart['id'])
        line.sale_label, line.sale_percent = 'summer', D('20')
        line.save()
        Cart.objects.get(pk=cart['id']).recalculate()
        self._attach(cart['id'])
        data = self._choice(cart['id'], 'instant').json()
        # 20% off both: $64 tag, 28.00 ThriftBucks; half of them off today
        self.assertEqual((data['lines'][0]['line_total'], data['lines'][0]['thrift_savings']), ('50.00', '14.00'))

    def test_rering_keeps_the_trips_thriftbucks_from_tomorrow_with_no_credit(self):
        cart = self._cart()
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        r = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'code': self.codes[0]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        tp = r.json()['thrift_plus']
        self.assertTrue(CartMember.objects.get(cart_id=cart['id']).rering)
        self.assertEqual((tp['member']['rering'], tp['collected'], tp['instant_bucks'], tp['credit_used']), (True, '35.00', '0.00', '0.00'))
        self.assertEqual(ledger.credit_balance(self.account), D('0.00'))
        self.assertEqual((ledger.available_bucks(self.account), ledger.bucks_total(self.account)), (D('0.00'), D('35.00')))
        self.assertEqual(ledger.available_bucks(self.account, timezone.localdate() + timedelta(days=1)), D('35.00'))
        self.assertEqual(LedgerEntry.objects.get().reason, 'rering')
        again = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'code': self.codes[0]}, format='json')
        self.assertEqual(again.json()['code'], 'ALREADY_MEMBER')

    def test_attaching_on_the_training_register_is_logged_as_training(self):
        trainer = Register.objects.create(location=self.register.location, name='Training', code='TRAIN-X', is_training=True)
        self.drawer = Drawer.objects.create(register=trainer, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        cart = self._cart()
        self.assertEqual(self._attach(cart['id']).status_code, 200)
        self.assertTrue(Event.objects.get(action='register_attach').detail['training'])

    def test_a_failure_inside_thrift_plus_never_breaks_the_sale(self):
        cart = self._cart()
        self._attach(cart['id'])
        with mock.patch.object(register, 'plan', side_effect=RuntimeError('boom')):
            r = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPVASE'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['total'], '139.10')  # priced as a guest
        self.assertIn('error', r.json()['thrift_plus'])

    def test_p11_a_tag_we_cant_find_sells_as_marked_with_no_thriftbucks_as_is(self):
        """P11 (owner 2026-10-15, APP D14b): the scan isn't found, so the cashier rings the tag's price as a manual line.
        It collects no ThriftBucks, has no 3-day return mark of its own (the receipt prints AS IS), and can't come back."""
        cart = self._cart()  # the lamp: a 3-day return item on the same sale
        missing = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITM0051377'}, format='json')
        self.assertEqual(missing.status_code, 404, missing.content)
        r = self.api.post(f"/api/pos/carts/{cart['id']}/add-manual-line/",
                          {'description': 'Tag not found ITM0051377', 'unit_price': '20.00'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        manual = next(l for l in data['lines'] if l['line_kind'] == 'manual')
        lamp = next(l for l in data['lines'] if l['line_kind'] == 'item')
        self.assertEqual((data['total'], tp['collected']), ('107.00', '35.00'))  # $100 taxed; only the lamp collects
        self.assertEqual(tp['lines'][str(lamp['id'])]['mark'], '3-day return')
        self.assertNotIn(str(manual['id']), tp['lines'])  # nothing collected, no mark: posReceipt prints it AS IS
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        line = CartLine.objects.get(pk=manual['id'])
        snap = line.meta['thrift_plus']
        self.assertEqual((snap['collected'], snap['kept'], snap['mark']), ('0.00', '0.00', 'AS IS'))
        self.assertFalse(LedgerEntry.objects.filter(cart_line_id=line.pk, kind=LedgerEntry.KIND_BANK, amount__gt=0).exists())
        self.assertIn('Only items can come back.', returns.problems(line, self.account))


class PhoneFindTests(RegisterBase):
    """Owner 2026-10-14: there is no Thrift+ card. A member shows the QR in the Thrift+ app (``TP`` + their code, the
    scan above) or gives their phone number: the register finds the people on that membership, the cashier picks the
    person by their photo, and they go on the sale with the same rules as a scan."""

    def _find(self, phone):
        return self.api.post('/api/thriftplus/register/find/', {'phone': phone}, format='json')

    def _second(self):
        """Ana's second adult: no phone of their own, and no code yet (made when they are first put on a sale)."""
        dee = members.add_second_adult(self.account, both_present=True, primary_approves=True, first_name='Dee',
                                       last_name='lane')
        Card.objects.filter(person=dee).delete()
        return dee

    def test_any_format_finds_both_adults_primary_first_with_what_the_cashier_needs(self):
        dee = self._second()
        ana = self.account.people.get(role='primary')
        for phone in ('(402) 555-0101', '402.555.0101', '+1 402 555 0101', '555-0101'):
            r = self._find(phone)
            self.assertEqual(r.status_code, 200, r.content)
            self.assertEqual([p['person_id'] for p in r.json()['people']], [ana.pk, dee.pk], phone)
        row = self._find('4025550101').json()['people'][1]
        self.assertEqual(row, {'person_id': dee.pk, 'account_id': self.account.pk, 'first_name': 'Dee', 'last_initial': 'L',
                               'role': 'secondary', 'photo_url': None, 'verified_18': False, 'practice': False,
                               'account_status': 'active', 'selfie': False, 'signed': False})
        self.assertEqual(self._find('4025559999').json(), {'people': []})
        short = self._find('0101')
        self.assertEqual((short.status_code, short.json()['code']), (400, 'PHONE_SHORT'))
        self.assertEqual(self.api.get('/api/thriftplus/register/find/', {'phone': '4025550101'}).status_code, 405)  # never in a URL

    def test_attaching_the_person_picked_follows_the_scan_rules_and_makes_a_code_when_they_have_none(self):
        dee = self._second()
        cart = self._cart()
        r = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': dee.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        tp = r.json()['thrift_plus']
        self.assertEqual((tp['member']['person_id'], tp['member']['role'], tp['member']['choice']), (dee.pk, 'secondary', 'bank'))
        self.assertEqual(tp['member']['first_name'], 'Dee')
        member = CartMember.objects.get(cart_id=cart['id'])
        code = Card.objects.get(person=dee)
        self.assertEqual((member.person, member.card, code.status, code.batch_id), (dee, code, Card.STATUS_ACTIVE, None))
        self.assertTrue(cards.is_valid(code.code))
        event = Event.objects.get(action='register_attach')
        self.assertEqual((event.person, event.card, event.detail.get('by'), 'training' in event.detail), (dee, code, 'phone', False))
        # The other adult, picked instead, goes on with the code they have (no new one).
        ana = self.account.people.get(role='primary')
        again = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': ana.pk}, format='json')
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(CartMember.objects.get(cart_id=cart['id']).card.code, self.codes[0])
        self.assertEqual(Card.objects.filter(person=ana).count(), 1)
        # Their app QR is the same code: scanning it works as before.
        self.assertEqual(self._attach(cart['id'], code.code).json()['thrift_plus']['member']['person_id'], dee.pk)

    def test_a_practice_member_found_by_phone_is_refused_on_a_real_register(self):
        practice = members.make_practice_member(first_name='Tia')
        person = practice.people.get()
        found = self._find(person.phone).json()['people']
        self.assertEqual([(p['person_id'], p['practice']) for p in found], [(person.pk, True)])
        cart = self._cart()
        refused = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': person.pk}, format='json')
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'PRACTICE_CARD'))
        self.assertEqual(refused.json()['detail'], 'This is a practice member. Use the training register.')
        self.assertFalse(CartMember.objects.filter(cart_id=cart['id']).exists())
        trainer = Register.objects.create(location=self.register.location, name='Training', code='TRAIN-P', is_training=True)
        self.drawer = Drawer.objects.create(register=trainer, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        practice_cart = self._cart()
        ok = self.api.post('/api/thriftplus/register/attach/', {'cart': practice_cart['id'], 'person': person.pk}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertTrue(ok.json()['thrift_plus']['member']['practice'])
        self.assertTrue(Event.objects.get(action='register_attach').detail['training'])

    def test_a_real_member_found_by_phone_on_the_training_register_is_logged_as_training(self):
        trainer = Register.objects.create(location=self.register.location, name='Training', code='TRAIN-Y', is_training=True)
        self.drawer = Drawer.objects.create(register=trainer, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        cart = self._cart()
        ana = self.account.people.get(role='primary')
        self.assertEqual(self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': ana.pk},
                                       format='json').status_code, 200)
        self.assertEqual(Event.objects.get(action='register_attach').detail, {'cart': cart['id'], 'training': True, 'by': 'phone'})

    def test_not_active_unknown_and_dark_are_refused(self):
        dee = self._second()
        cart = self._cart()
        unknown = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': 999999}, format='json')
        self.assertEqual(unknown.json()['code'], 'MEMBER_UNKNOWN')
        members.remove_second_adult(dee, removed_by='self')
        self.assertEqual([p['first_name'] for p in self._find('4025550101').json()['people']], ['Ana'])  # removed: not listed
        removed = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': dee.pk}, format='json')
        self.assertEqual((removed.json()['code'], removed.json()['detail']), ('CARD_NOT_ACTIVE', 'This membership is not active.'))
        members.revoke(self.account, reason='tag switching')
        self.assertEqual(self._find('4025550101').json()['people'][0]['account_status'], 'revoked')
        ana = self.account.people.get(role='primary')
        revoked = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': ana.pk}, format='json')
        self.assertEqual(revoked.json()['code'], 'CARD_NOT_ACTIVE')
        AppSetting.objects.filter(key='thrift_plus_test_registers').delete()
        bo = Person.objects.get(first_name='Bo')
        dark = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': bo.pk}, format='json')
        self.assertEqual(dark.json()['code'], 'NOT_LIVE')

    def test_re_ring_and_returns_take_the_person_found_by_phone(self):
        ana = self.account.people.get(role='primary')
        cart = self._cart()
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        r = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'person': ana.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['thrift_plus']['member']['rering'], r.json()['thrift_plus']['collected']), (True, '35.00'))
        line_id = r.json()['lines'][0]['id']
        found = self.api.get('/api/thriftplus/returns/lookup/', {'person': ana.pk}).json()
        self.assertEqual((found['member']['name'], found['lines'][0]['cart_line']), ('Ana Member', line_id))  # one name gets "Member" (owner 2026-10-16)
        done = self.api.post('/api/thriftplus/returns/', {'person': ana.pk, 'cart_line': line_id, 'register': 'TP-T1'}, format='json')
        self.assertEqual(done.status_code, 201, done.content)
        self.assertEqual(ReturnRecord.objects.get().person, ana)
        bo = Person.objects.get(first_name='Bo')
        other = self.api.get('/api/thriftplus/returns/lookup/', {'person': bo.pk}).json()
        self.assertEqual(other['lines'], [])  # Bo's membership bought nothing

    def test_a_member_signed_up_with_no_code_is_found_by_phone_and_by_their_app_qr(self):
        made = self.api.post('/api/thriftplus/accounts/', {'first_name': 'Cy', 'last_name': 'Ng', 'phone': '402-555-0123'})
        self.assertEqual(made.status_code, 201, made.content)
        person = made.json()['people'][0]
        self.assertEqual([c['status'] for c in person['cards']], ['active'])
        code = Card.objects.get(person_id=person['id'])
        self.assertIsNone(code.batch_id)
        self.assertEqual(self._find('4025550123').json()['people'][0]['person_id'], person['id'])
        cart = self._cart()
        scanned = self._attach(cart['id'], code.code)  # the QR in the Thrift+ app: TP + the code
        self.assertEqual(scanned.json()['thrift_plus']['member']['person_id'], person['id'])


class ReturnTests(RegisterBase):
    def _buy(self, *skus, choice='bank', **pay):
        cart = self._cart(*skus)
        self._attach(cart['id'])
        if choice == 'instant':
            self._choice(cart['id'], 'instant')
        done = self._complete(cart['id'], **pay)
        self.assertEqual(done.status_code, 200, done.content)
        return done.json()

    def _return(self, line_id, **data):
        return self.api.post('/api/thriftplus/returns/', {'cart_line': line_id, 'code': self.codes[0], 'register': 'TP-T1', **data},
                             format='json')

    def test_w5_kept_85_60_gives_68_48_credit_and_takes_28_thriftbucks_back(self):
        sale = self._buy()
        line_id = sale['lines'][0]['id']
        found = self.api.get('/api/thriftplus/returns/lookup/', {'code': self.codes[0]}).json()
        row = found['lines'][0]
        self.assertEqual((row['cart_line'], row['ok'], row['mark'], row['refund'], row['bucks_take'], row['bucks_back'], row['problem']),
                         (line_id, True, '3-day return', '68.48', '28.00', '0.00', ''))
        self.assertEqual(row['deadline'], (timezone.localdate() + timedelta(days=3)).isoformat())
        self.assertNotIn('cover', found['member'])
        done = self._return(line_id)
        self.assertEqual(done.status_code, 201, done.content)
        self.assertEqual(done.json(), {'id': ReturnRecord.objects.get().pk, 'credit': '68.48', 'bucks_back': '0.00',
                                       'bucks_taken': '28.00', 'shortfall': '0.00', 'training': False})
        self.assertEqual(ledger.credit_balance(self.account), D('68.48'))
        self.assertEqual(ledger.bucks_total(self.account), D('7.00'))  # the member keeps 20%
        record = ReturnRecord.objects.get()
        self.assertEqual((record.paid, record.credit, record.taxable_back, record.tax_back), (D('68.48'), D('68.48'), D('64.00'), D('4.48')))
        again = self._return(line_id)
        self.assertIn('already returned', again.json()['detail'])

    def test_w5_redeemed_instantly_66_88_gives_53_50_and_nothing_to_take_back(self):
        sale = self._buy(choice='instant')
        self.assertEqual(sale['total'], '66.88')
        done = self._return(sale['lines'][0]['id']).json()
        self.assertEqual((done['credit'], done['bucks_taken'], done['shortfall']), ('53.50', '0.00', '0.00'))

    def test_thriftbucks_already_spent_come_off_the_credit(self):
        sale = self._buy()
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('-30.00'), reason='adjust')
        done = self._return(sale['lines'][0]['id']).json()
        self.assertEqual((done['bucks_taken'], done['shortfall'], done['credit']), ('5.00', '23.00', '45.48'))
        self.assertEqual(ledger.bucks_total(self.account), D('0.00'))

    def test_80_percent_of_thriftbucks_used_come_back_fresh(self):
        self._lot('35.00')
        sale = self._buy('ITMTPVASE')
        self.assertEqual(sale['total'], '16.05')
        line_id = next(l['id'] for l in sale['lines'] if l['line_kind'] == 'item')
        self.assertEqual(CartLine.objects.get(pk=line_id).meta['thrift_plus']['bucks_used'], '35.00')
        done = self._return(line_id).json()
        # $15 paid, tax included, 80%: 12.84; 28 ThriftBucks back (80% of 35); 8 taken back (80% of the vase's 10)
        self.assertEqual((done['credit'], done['bucks_back'], done['bucks_taken'], done['shortfall']), ('12.84', '28.00', '8.00', '0.00'))
        self.assertEqual(ledger.bucks_total(self.account), D('30.00'))  # 10 collected + 28 back - 8 taken
        self.assertEqual(ledger.available_bucks(self.account), D('28.00'))  # the 28 back are usable at once

    def test_the_training_register_works_it_out_and_writes_nothing(self):
        sale = self._buy()
        rows = LedgerEntry.objects.count()
        done = self._return(sale['lines'][0]['id'], register='TRAIN')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json(), {'id': None, 'credit': '68.48', 'bucks_back': '0.00', 'bucks_taken': '28.00',
                                       'shortfall': '0.00', 'training': True})
        self.assertFalse(ReturnRecord.objects.exists())
        self.assertEqual(LedgerEntry.objects.count(), rows)

    def test_three_calendar_days_then_only_the_owner_can_allow_it(self):
        sale = self._buy()
        line_id = sale['lines'][0]['id']
        Cart.objects.filter(pk=sale['id']).update(completed_at=timezone.now() - timedelta(days=4))
        late = self._return(line_id)
        self.assertIn('3-day return window closed', late.json()['detail'])
        row = self.api.get('/api/thriftplus/returns/lookup/', {'code': self.codes[0]}).json()['lines'][0]
        self.assertEqual((row['ok'], row['late_only']), (False, True))  # the owner may allow it at the register
        self.api.force_authenticate(self.manager)
        self.assertEqual(self._return(line_id, late_ok=True, note='closed').status_code, 403)
        owner = User.objects.create_superuser(email='owner@example.com', first_name='O', last_name='W', password='x-pass-123')
        owner.groups.add(Group.objects.get_or_create(name='Admin')[0])
        self.api.force_authenticate(owner)
        self.assertEqual(self._return(line_id, late_ok=True).json()['code'], 'SAY_WHY')
        ok = self._return(line_id, late_ok=True, note='Store closed for the storm')
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ReturnRecord.objects.get().late_ok_by, owner)
        self.assertEqual(Event.objects.get(action='return_late_ok').detail['why'], 'Store closed for the storm')

    def test_the_mark_is_frozen_at_the_sale_and_as_is_lines_cannot_come_back(self):
        self._item('ITMTPCHEAP', 'Coffee mug', '9.00', '0.00')
        sale = self._buy('ITMTPCHEAP')
        line = CartLine.objects.get(cart_id=sale['id'], line_kind='item')
        self.assertEqual(line.meta['thrift_plus']['mark'], 'AS IS')
        self.assertEqual(sale['thrift_plus']['lines'][str(line.pk)]['mark'], 'AS IS')
        refused = self._return(line.pk)
        self.assertEqual(refused.json()['code'], 'NOT_RETURNABLE')
        self.assertIn('$10.00 or less after ThriftBucks', refused.json()['detail'])

    def test_guest_sales_are_final_and_the_guide_decides_what_qualifies(self):
        guest = self._cart()
        self._complete(guest['id'])
        line = CartLine.objects.select_related('cart', 'item__product').get(cart_id=guest['id'])
        self.assertIn('It was not bought on this Thrift+ membership. Non-member sales are final.', returns.problems(line, self.account))
        bow = Item.objects.create(sku='ITMTPBOW', product=Product.objects.create(title='Compound crossbow'), price=D('150.00'))
        self.assertTrue(returns.qualifies(bow))  # crossbows are not left out as a group any more (W6)
        RestrictedProduct.objects.create(product=bow.product)
        self.assertTrue(returns.qualifies(bow))  # nor 18+ items
        island = Item.objects.create(sku='ITMTPISL', product=Product.objects.create(title='Canvas island print'), price=D('20.00'))
        self.assertTrue(returns.qualifies(island))  # whole words only: not "as is"
        self.assertFalse(returns.qualifies(island, reward=D('10.00')))  # $10 or less after ThriftBucks
        parts = Item.objects.create(sku='ITMTPPRT', product=Product.objects.create(title='Mixer, for parts'), price=D('40.00'))
        self.assertEqual(returns.why_as_is(parts), 'Marked "for parts": sold AS IS.')
        self.assertEqual(returns.deadline(timezone.localdate()), timezone.localdate() + timedelta(days=3))
