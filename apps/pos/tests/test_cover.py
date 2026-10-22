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
        return self.client.post(f'/api/pos/drawers/{self.drawer.id}/cover/', {'pin': pin}, format='json')

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
