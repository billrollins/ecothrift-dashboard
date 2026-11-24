"""Black Friday (owner 2026-11-24, Dash Update #220, rulebook F5): one price for everyone, our tag less the bigger of
the item's ThriftBucks and 10% of the tag, never below the floor. Guests and members alike; a member may build (pay
the tag, keep the ThriftBucks). The discount is a Black Friday sale on the line, never Thrift+ revenue."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.models import AppSetting
from apps.pos.models import Cart, CartLine
from apps.pos.services import black_friday, sales_numbers
from apps.thriftplus.models import CartMember, LedgerEntry
from apps.thriftplus.tests.test_register import RegisterBase

D = Decimal


def _window(start_hours: float = -1, end_hours: float = 2, bucks_days: int = 0, **extra):
    """The register charges from start to end; the ThriftBucks of ``bucks_days`` from today set the price."""
    from apps.pos.services import black_friday as bf

    bf.forget()
    now = timezone.localtime()
    AppSetting.objects.update_or_create(key=black_friday.WINDOW_KEY, defaults={'value': {
        'start': (now + timedelta(hours=start_hours)).strftime('%Y-%m-%dT%H:%M:%S'),
        'end': (now + timedelta(hours=end_hours)).strftime('%Y-%m-%dT%H:%M:%S'),
        'bucks_on': (timezone.localdate() + timedelta(days=bucks_days)).isoformat(), **extra,
    }})


class PriceRuleTests(TestCase):
    def test_the_saturday_thriftbucks_with_the_ten_percent_switch_never_below_the_floor(self):
        share = D('0.05')
        self.assertEqual(black_friday.unit_price(D('80.00'), D('3.00'), share, ten_min=False), D('77.00'))
        self.assertEqual(black_friday.unit_price(D('80.00'), D('35.00'), share), D('45.00'))  # ThriftBucks win
        self.assertEqual(black_friday.unit_price(D('80.00'), D('3.00'), share), D('72.00'))  # 10% wins
        self.assertEqual(black_friday.unit_price(D('7.99'), D('0'), share), D('7.19'))  # no ThriftBucks: 10%
        self.assertEqual(black_friday.unit_price(D('10.00'), D('9.90'), share), D('0.50'))  # the 5% floor
        self.assertEqual(black_friday.unit_price(D('0'), D('0'), share), D('0.00'))

    def test_the_window_turns_on_and_off_by_itself_and_a_bad_setting_is_off(self):
        self.assertFalse(black_friday.is_on())
        _window(-1, 1)
        self.assertTrue(black_friday.is_on())
        self.assertTrue(black_friday.payload()['on'])
        _window(-3, -1)
        self.assertFalse(black_friday.is_on())
        _window(1, 3)
        self.assertFalse(black_friday.is_on())
        for raw in ('on', {'start': 'soon'}, {'start': '2026-11-26T00:00'}, [], 5):
            AppSetting.objects.update_or_create(key=black_friday.WINDOW_KEY, defaults={'value': raw})
            self.assertFalse(black_friday.is_on(), raw)
        # The website shows it from show_from (Thursday); the register charges it from the start (Friday).
        _window(1, 3, show_from=(timezone.localtime() - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S'))
        self.assertEqual((black_friday.shown(), black_friday.is_on()), (True, False))
        # Store time, with or without an offset.
        AppSetting.objects.update_or_create(key=black_friday.WINDOW_KEY, defaults={'value': {
            'start': '2026-11-26T00:00', 'end': '2026-11-28T18:00-06:00'}})
        start, end = black_friday.window()
        self.assertEqual((start.isoformat(), end.isoformat()), ('2026-11-26T00:00:00-06:00', '2026-11-28T18:00:00-06:00'))


class BlackFridayRegisterTests(RegisterBase):
    def setUp(self):
        super().setUp()
        AppSetting.objects.update_or_create(key='thrift_plus_floor_share', defaults={'value': '0.05'})
        self.mug = self._item('ITMTPMUG', 'Mug', '7.99', '0.00')  # no ThriftBucks yet: 10% off
        _window()

    def test_the_price_is_the_thriftbucks_the_item_would_show_on_saturday(self):
        from apps.thriftplus.models import ItemReward
        from apps.thriftplus.services import scanner

        growing = self._item('ITMTPGROW', 'Chair', '90.00', '30.00')  # 30 growth days: $1.00 a day on a $90 tag
        ItemReward.objects.filter(item=growing).update(grow_days=30, day=41)
        _window(bucks_days=3)  # three more nights to Saturday: 33.00 ThriftBucks
        self.assertEqual(black_friday.black_friday_price(growing), D('57.00'))
        self.assertEqual(scanner.item_card(growing)['price'], '57.00')
        cart = self._cart('ITMTPGROW')
        self.assertEqual(cart['subtotal'], '57.00')
        # An item still waiting on Saturday has none: 10% off while the switch is on, the tag without it.
        waiting = self._item('ITMTPWAIT', 'Lamp shade', '20.00', '0.00')
        ItemReward.objects.filter(item=waiting).update(status=ItemReward.STATUS_WAITING, day=1, grow_days=0,
                                                       floor_date=timezone.localdate())
        self.assertEqual(black_friday.black_friday_price(waiting), D('18.00'))
        _window(bucks_days=3, ten_percent_min=False)
        self.assertEqual(black_friday.black_friday_price(waiting), D('20.00'))

    def test_a_sold_item_is_priced_as_if_it_never_left_the_shelf(self):
        # Owner 2026-11-24: "sold is a system mistake ... sold items are simply that status but their price is still normal".
        from apps.pos.models import BlackFridayPrice
        from apps.thriftplus.models import ItemReward

        chair = self._item('ITMTPSOLD', 'Chair', '90.00', '30.00')
        ItemReward.objects.filter(item=chair).update(grow_days=30, day=41)
        _window(bucks_days=3)
        self.assertEqual(black_friday.black_friday_price(chair), D('57.00'))
        BlackFridayPrice.objects.all().delete()
        black_friday.forget()
        type(chair).objects.filter(pk=chair.pk).update(status='sold')
        ItemReward.objects.filter(item=chair).update(status=ItemReward.STATUS_CLOSED)
        chair.refresh_from_db()
        self.assertEqual(black_friday.black_friday_price(chair), D('57.00'))

    def test_the_number_is_frozen_once_it_is_worked_out(self):
        from apps.pos.models import BlackFridayPrice
        from apps.thriftplus.models import ItemReward

        growing = self._item('ITMTPFRZ', 'Stool', '90.00', '30.00')
        ItemReward.objects.filter(item=growing).update(grow_days=30, day=41)
        _window(bucks_days=3)
        self.assertEqual(black_friday.black_friday_price(growing), D('57.00'))
        row = BlackFridayPrice.objects.get(item=growing)
        self.assertEqual((row.tag, row.bucks), (D('90.00'), D('33.00')))
        # Whatever happens to the item's ThriftBucks afterwards (a held night, a sale of its product), the price stays.
        ItemReward.objects.filter(item=growing).update(reward=D('10.00'), grow_days=10)
        black_friday.forget()
        self.assertEqual(black_friday.black_friday_price(growing), D('57.00'))
        self.assertEqual(self._cart('ITMTPFRZ')['subtotal'], '57.00')
        # A new tag on the item works it out again: a markdown resets the ThriftBucks (P3a), so 10% off the new tag.
        growing.price = D('60.00')
        growing.save(update_fields=['price'])
        black_friday.forget()
        self.assertEqual(black_friday.black_friday_price(growing), D('54.00'))
        self.assertEqual(BlackFridayPrice.objects.get(item=growing).tag, D('60.00'))
        # The whole floor at once (the command's --freeze).
        self.assertEqual(black_friday.freeze(), 4)
        self.assertEqual(BlackFridayPrice.objects.count(), 4)

    def test_the_training_register_charges_it_before_friday_and_a_real_register_does_not(self):
        _window(24, 48)  # the register's days start tomorrow
        self.assertEqual(self._cart('ITMTPLAMP')['subtotal'], '80.00')
        self.register.is_training = True
        self.register.save(update_fields=['is_training'])
        cart = self._cart('ITMTPLAMP')
        self.assertEqual((cart['subtotal'], cart['lines'][0]['sale_label']), ('45.00', 'black_friday'))
        _window(-48, -24)  # after the end: nobody
        self.assertEqual(self._cart('ITMTPVASE')['subtotal'], '50.00')

    def test_drinks_stay_at_their_price_and_a_pink_tag_gets_the_ten_percent(self):
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        CartLine.objects.create(cart_id=cart['id'], description='Pop', quantity=1, unit_price=D('1.50'), line_total=D('1.50'),
                                line_kind='manual', meta={'category': 'drinks'})
        CartLine.objects.create(cart_id=cart['id'], description='Pink tag', quantity=1, unit_price=D('10.00'),
                                line_total=D('10.00'), line_kind='manual')
        Cart.objects.get(pk=cart['id']).recalculate()
        lines = self._lines(cart['id'])
        self.assertEqual((lines['Pop'].sale_label, lines['Pop'].line_total), ('', D('1.50')))
        self.assertEqual((lines['Pink tag'].sale_label, lines['Pink tag'].line_total), ('black_friday', D('9.00')))

    def test_the_scan_limit_is_raised_for_the_shared_guest_wifi_and_members_are_told_the_day(self):
        from rest_framework.test import APIClient

        from apps.thriftplus.public_views import ScanThrottle

        self.assertEqual(ScanThrottle().get_rate(), '3000/minute')
        _window(-48, -24)
        self.assertNotEqual(ScanThrottle().get_rate(), '3000/minute')

    def _lines(self, cart_id):
        return {l.description: l for l in CartLine.objects.filter(cart_id=cart_id)}

    def test_a_guest_pays_the_black_friday_price_with_no_thriftbucks_words(self):
        cart = self._cart('ITMTPLAMP', 'ITMTPMUG')
        lamp, mug = self._lines(cart['id'])['Brass lamp'], self._lines(cart['id'])['Mug']
        self.assertEqual((lamp.sale_label, lamp.sale_off, lamp.line_total), ('black_friday', D('35.00'), D('45.00')))
        self.assertEqual((mug.sale_off, mug.line_total), (D('0.80'), D('7.19')))
        self.assertEqual((cart['subtotal'], cart['total']), ('52.19', '55.84'))
        tp = cart['thrift_plus']
        self.assertEqual((tp['guest_line'], tp['collected']), ('', '0.00'))  # nothing missed, nothing collected
        self.assertEqual({v['reward'] for v in tp['lines'].values()}, {'0.00'})
        self.assertEqual(cart['savings']['lines'], [])  # the receipt shows the retail and the price paid, no tag
        self.assertEqual({l['sale_display'] for l in cart['lines']}, {'Black Friday'})
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        self.assertFalse(LedgerEntry.objects.exists())
        nums = sales_numbers.for_carts(Cart.objects.filter(pk=cart['id']))
        self.assertEqual((D(nums['item_sales']), D(nums['thriftplus_revenue'])), (D('52.19'), D('0.00')))

    def test_a_member_gets_the_same_price_and_keeps_nothing_by_default(self):
        cart = self._cart('ITMTPLAMP')
        data = self._attach(cart['id']).json()
        tp = data['thrift_plus']
        self.assertEqual((data['subtotal'], tp['collected'], tp['instant_offered']), ('45.00', '0.00', False))
        self.assertEqual(tp['black_friday'], {'on': True, 'builds': False, 'build_bucks': '35.00', 'build_more': '35.00'})
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.assertFalse(LedgerEntry.objects.filter(account=self.account, amount__gt=0).exists())
        nums = sales_numbers.for_carts(Cart.objects.filter(pk=cart['id']))
        self.assertEqual((D(nums['item_sales']), D(nums['thriftplus_revenue'])), (D('45.00'), D('0.00')))

    def test_a_member_who_builds_pays_the_tag_and_keeps_the_thriftbucks(self):
        cart = self._cart('ITMTPLAMP')
        self._attach(cart['id'])
        r = self.api.post('/api/thriftplus/register/build/', {'cart': cart['id'], 'build': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        tp = data['thrift_plus']
        self.assertEqual((data['subtotal'], tp['collected'], tp['black_friday']['builds'], tp['instant_offered']),
                         ('80.00', '35.00', True, False))
        self.assertEqual(self._lines(cart['id'])['Brass lamp'].sale_label, '')
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        kept = [e.amount for e in LedgerEntry.objects.filter(account=self.account, kind=LedgerEntry.KIND_BANK, amount__gt=0)]
        self.assertEqual(kept, [D('35.00')])
        # And back to the Black Friday price.
        cart2 = self._cart('ITMTPVASE')
        self._attach(cart2['id'])
        self.api.post('/api/thriftplus/register/build/', {'cart': cart2['id'], 'build': True}, format='json')
        back = self.api.post('/api/thriftplus/register/build/', {'cart': cart2['id'], 'build': False}, format='json').json()
        self.assertEqual(back['subtotal'], '40.00')

    def test_kept_thriftbucks_still_spend_on_the_black_friday_price(self):
        self._lot('30.00')
        cart = self._cart('ITMTPLAMP')
        data = self._attach(cart['id']).json()
        self.assertEqual((data['thrift_plus']['bucks_used'], data['subtotal']), ('30.00', '15.00'))

    def test_outside_the_window_the_tag_comes_back_and_building_is_refused(self):
        cart = self._cart('ITMTPLAMP')
        self.assertEqual(cart['subtotal'], '45.00')
        _window(-3, -1)
        again = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPMUG'}, format='json').json()
        self.assertEqual(again['subtotal'], '87.99')
        self.assertEqual({l['sale_label'] for l in again['lines']}, {''})
        self._attach(cart['id'])
        r = self.api.post('/api/thriftplus/register/build/', {'cart': cart['id'], 'build': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_BLACK_FRIDAY'))
        self.assertFalse(CartMember.objects.get(cart_id=cart['id']).builds)

    def test_the_scanner_shows_the_black_friday_price_and_no_thriftbucks(self):
        from apps.thriftplus.services import scanner

        item = scanner.item_card(self.lamp)
        self.assertEqual((item['price'], item['reward'], item['member_price'], item['black_friday']),
                         ('45.00', '0.00', '45.00', True))
        self.assertEqual(scanner.item_card(self.mug)['price'], '7.19')
        _window(-3, -1)
        item = scanner.item_card(self.lamp)
        self.assertEqual((item['price'], item['reward']), ('80.00', '35.00'))
        self.assertNotIn('black_friday', item)


class BlackFridayWebsiteTests(TestCase):
    def test_the_website_shows_the_black_friday_price_and_no_thriftbucks_and_the_theme_turns_on(self):
        from apps.storefront.services import rules as R

        AppSetting.objects.update_or_create(key='thrift_plus_floor_share', defaults={'value': '0.05'})
        self.assertEqual(R.load_settings().day, 'normal')
        _window()
        s = R.load_settings()
        self.assertEqual((s.day, s.black_friday), ('bf', True))
        self.assertEqual(R.priced(D('80.00'), D('35.00'), s, D('35.00')), (D('45.00'), D('0.00')))
        self.assertEqual(R.priced(D('7.99'), D('0'), s, None), (D('7.19'), D('0.00')))

    def test_a_signed_out_scanner_is_told_it_is_black_friday(self):
        from rest_framework.test import APIClient

        AppSetting.objects.update_or_create(key='thrift_plus_enabled', defaults={'value': True})
        api = APIClient()
        self.assertNotIn('black_friday', api.get('/api/thriftplus/public/session/').json())
        _window()
        body = api.get('/api/thriftplus/public/session/').json()
        self.assertTrue(body.get('black_friday'), body)
