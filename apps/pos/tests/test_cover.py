"""Cover (Bill, 2026-10-21, digest point 3): the person stepping in types their own register PIN once; sales log to
them; it ends with Back and the drawer's own cashier's PIN, after 10 idle minutes, or when the drawer changes hands."""
from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services.register_pin import set_pin
from apps.pos.models import Cart, DrawerCover

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

CASHIER_PIN = '2468'
COVER_PIN = '3579'


class _CoverFixtures(_CartCardSurchargeFixtures):
    def setUp(self):
        super().setUp()
        cache.clear()
        set_pin(self.user, CASHIER_PIN)
        self.dee = User.objects.create_user(email='cover-dee@example.com', first_name='Dee', last_name='Next',
                                            password='x-pass-123')
        self.dee.groups.add(Group.objects.get(name='Employee'))
        set_pin(self.dee, COVER_PIN)

    def _cover(self, pin=COVER_PIN):
        return self.client.post(f'/api/pos/drawers/{self.drawer.id}/cover/', {'pin': pin, 'accept': True}, format='json')

    def _back(self, pin=CASHIER_PIN):
        return self.client.post(f'/api/pos/drawers/{self.drawer.id}/cover-back/', {'pin': pin}, format='json')

    def _sell(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total'], 'change_given': '0'})
        self.assertEqual(r.status_code, 200, r.content)
        self.item.status = 'on_shelf'
        self.item.save(update_fields=['status'])
        return r.json()


class CoverTests(_CoverFixtures, TestCase):
    def test_cover_shows_who_and_their_sales_are_theirs(self):
        r = self._cover()
        self.assertEqual(r.status_code, 200, r.content)
        cover = r.json()['cover']
        self.assertEqual((cover['user_name'], cover['cashier_name']), ('Dee Next', 'Pos Card'))
        sale = self._sell()
        self.assertEqual((sale['cashier'], sale['covering_for_name']), (self.dee.pk, 'Pos Card'))
        self.assertEqual(Cart.objects.get(pk=sale['id']).cover.user, self.dee)

    def test_back_takes_the_drawers_own_cashiers_pin(self):
        self._cover()
        wrong = self._back(COVER_PIN)  # Dee's PIN is real, but not this drawer's cashier's
        self.assertEqual((wrong.status_code, wrong.json()['code'], wrong.json()['tries_left']), (403, 'PIN_WRONG', 4))
        self.assertIsNotNone(self.client.get(f'/api/pos/drawers/{self.drawer.id}/').json()['cover'])
        ok = self._back()
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertIsNone(ok.json()['cover'])
        self.assertEqual(DrawerCover.objects.get().ended_how, DrawerCover.END_BACK)
        sale = self._sell()
        self.assertEqual((sale['cashier'], sale['covering_for_name']), (self.user.pk, None))

    def test_ten_idle_minutes_end_it(self):
        self._cover()
        DrawerCover.objects.update(last_activity_at=timezone.now() - timedelta(minutes=11))
        self.assertIsNone(self.client.get(f'/api/pos/drawers/{self.drawer.id}/').json()['cover'])
        sale = self._sell()
        self.assertEqual(sale['cashier'], self.user.pk)
        cover = DrawerCover.objects.get()
        self.assertEqual(cover.ended_how, DrawerCover.END_IDLE)
        self.assertEqual(cover.ended_at, cover.last_activity_at + timedelta(minutes=10))

    def test_selling_keeps_it_going(self):
        self._cover()
        DrawerCover.objects.update(last_activity_at=timezone.now() - timedelta(minutes=9))
        self._sell()
        self.assertIsNotNone(self.client.get(f'/api/pos/drawers/{self.drawer.id}/').json()['cover'])

    def test_a_sale_started_under_a_cover_that_ended_is_the_person_finishing_it(self):
        self._cover()
        cid, cart = self._open_cart_with_item()
        self.assertEqual(Cart.objects.get(pk=cid).cashier, self.dee)
        self._back()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total'], 'change_given': '0'})
        self.assertEqual((r.json()['cashier'], r.json()['cover']), (self.user.pk, None))

    def test_own_drawer_and_wrong_pins(self):
        own = self._cover(CASHIER_PIN)
        self.assertEqual((own.status_code, own.json()['code']), (400, 'OWN_DRAWER'))
        wrong = self._cover('9173')
        self.assertEqual((wrong.status_code, wrong.json()['code']), (403, 'PIN_WRONG'))
        self.assertFalse(DrawerCover.objects.exists())

    def test_someone_else_covering_takes_it_over(self):
        self._cover()
        eve = User.objects.create_user(email='cover-eve@example.com', first_name='Eve', last_name='Third',
                                       password='x-pass-123')
        eve.groups.add(Group.objects.get(name='Employee'))
        set_pin(eve, '8642')
        r = self._cover('8642')
        self.assertEqual(r.json()['cover']['user_name'], 'Eve Third')
        self.assertEqual(sorted(DrawerCover.objects.values_list('ended_how', flat=True)), ['', DrawerCover.END_REPLACED])

    def test_a_handoff_or_close_ends_it(self):
        self._cover()
        manager = User.objects.create_user(email='cover-mgr@example.com', first_name='M', last_name='G',
                                           password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        r = self.client.post(f'/api/pos/drawers/{self.drawer.id}/handoff/',
                             {'incoming_cashier': manager.id, 'count': {}, 'counted_total': '0'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(DrawerCover.objects.get().ended_how, DrawerCover.END_HANDOFF)

    def test_back_with_no_cover(self):
        r = self._back()
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_COVERED'))

    def test_a_closed_drawer_takes_no_cover(self):
        self.drawer.status = 'closed'
        self.drawer.save(update_fields=['status'])
        r = self._cover()
        self.assertEqual((r.status_code, r.json()['code']), (400, 'DRAWER_CLOSED'))


class SpotCheckTests(_CoverFixtures, TestCase):
    """Retail 4 step 4 (2026-11-02): after a cover, count just the bills and coins it moved."""

    def setUp(self):
        super().setUp()
        from apps.pos.models import Drawer
        Drawer.objects.filter(pk=self.drawer.pk).update(contents={'twenties': 5, 'tens': 5, 'ones': 20, 'quarters': 20},
                                                        date=timezone.localdate())
        self.drawer.refresh_from_db()

    def _covered_sale(self):
        self.assertEqual(self._cover().status_code, 200)
        cid, _cart = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'hundreds': 2}})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _check(self, data):
        return self.client.post(f'/api/pos/drawers/{self.drawer.id}/spot-check/', data, format='json')

    def test_back_says_what_the_cover_moved_and_the_check_counts_only_that(self):
        sale = self._covered_sale()
        back = self._back().json()
        moved = back['cover_report']['changed']
        self.assertGreater(moved['hundreds'], 0)
        expected_keys = set(moved)
        self.assertTrue(expected_keys >= {'hundreds'})
        self.assertNotIn('fifties', moved)
        self.drawer.refresh_from_db()
        right = {k: self.drawer.contents[k] for k in expected_keys}
        r = self._check({'cover': back['cover_report']['cover'], 'count': {**right, 'fifties': 9},
                         'keys': ['fifties']})
        self.assertEqual(r.status_code, 200, r.content)
        check = r.json()['count_check']
        self.assertEqual({row['key'] for row in check['rows']}, expected_keys)  # the screen's keys are ignored
        self.assertEqual(check['difference_total'], '0.00')
        from apps.pos.models import RegisterEvent
        ev = RegisterEvent.objects.get(kind='spot_check')
        self.assertEqual((ev.amount, ev.cover_id), (0, back['cover_report']['cover']))
        again = self._check({'cover': back['cover_report']['cover'], 'count': right})
        self.assertEqual((again.status_code, again.json()['code']), (400, 'ALREADY_CHECKED'))
        self.assertTrue(sale['cash_received'])

    def test_a_cover_with_no_cash_offers_nothing_and_the_difference_is_blind_on_the_timeline(self):
        self.assertEqual(self._cover().status_code, 200)
        self.assertEqual(self._back().json()['cover_report']['changed'], {})  # no cash moved: nothing to count
        self._covered_sale()
        back = self._back().json()
        r = self._check({'cover': back['cover_report']['cover'], 'count': {'hundreds': 50}})
        self.assertNotEqual(r.json()['count_check']['difference_total'], '0.00')
        card = self.client.get(f'/api/pos/drawers/{self.drawer.id}/card/').json()
        spot = next(e for e in card['journey'] if e['kind'] == 'spot_check')
        self.assertIsNone(spot['variance'])  # a cashier, drawer open

    def test_only_the_drawers_cashier_or_a_manager_checks(self):
        self._covered_sale()
        cover = self._back().json()['cover_report']['cover']
        self.client.force_authenticate(self.dee)
        self.assertEqual(self._check({'cover': cover, 'count': {'twenties': 7}}).status_code, 403)

    def test_a_cover_that_ended_any_other_way_is_not_checked(self):
        self._covered_sale()
        cover = DrawerCover.objects.get(drawer=self.drawer, ended_at__isnull=True)
        DrawerCover.objects.filter(pk=cover.pk).update(ended_at=timezone.now(), ended_how=DrawerCover.END_IDLE)
        r = self._check({'cover': cover.pk, 'count': {'hundreds': 1}})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_COVER'))

    def test_the_one_covering_takes_the_drawer_on(self):
        # Cash Drops #70 (Bill 2026-11-04): they "accept responsibility for it".
        r = self.client.post(f'/api/pos/drawers/{self.drawer.id}/cover/', {'pin': COVER_PIN}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ACCEPT_NEEDED'))
        self.assertFalse(DrawerCover.objects.exists())

    def test_back_shows_the_cash_moved_and_the_cashier_accepts_the_drawer_once(self):
        from apps.pos.models import RegisterEvent

        self._covered_sale()
        report = self._back().json()['cover_report']
        self.assertEqual(len(report['sales']), 1)
        self.assertEqual(report['covered_by'], self.dee.full_name)
        self.assertTrue(report['sales'][0]['receipt'])
        url = f'/api/pos/drawers/{self.drawer.id}/cover-accept/'
        self.client.force_authenticate(self.dee)
        self.assertEqual(self.client.post(url, {'cover': report['cover']}, format='json').status_code, 403)
        self.client.force_authenticate(self.user)
        ok = self.client.post(url, {'cover': report['cover']}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.client.post(url, {'cover': report['cover']}, format='json')
        self.assertEqual(RegisterEvent.objects.filter(kind='cover_accepted', cover_id=report['cover']).count(), 1)
