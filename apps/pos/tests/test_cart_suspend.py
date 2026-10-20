"""Suspend (owner 2026-10-20): set a sale aside, ring another, bring it back; its items stay held."""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.thriftplus.services import cards, members

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal


class _Suspend(_CartCardSurchargeFixtures):
    def setUp(self):
        super().setUp()
        cat = Category.objects.get(slug='pos-surcharge-cat')
        self.item2 = Item.objects.create(
            sku='POSTESTSURCH2', product=Product.objects.create(title='Second Item', brand='QA', category=cat),
            price=D('40.00'), status='on_shelf',
        )

    def _new_cart(self, drawer=None, client=None):
        r = (client or self.client).post('/api/pos/carts/', {'drawer': (drawer or self.drawer).id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def _add(self, cid, sku, client=None):
        return (client or self.client).post(f'/api/pos/carts/{cid}/add-item/', {'sku': sku}, format='json')

    def _suspend(self, cid):
        return self.client.post(f'/api/pos/carts/{cid}/suspend/')

    def _tabs(self, drawer=None):
        r = self.client.get('/api/pos/carts/suspended/', {'drawer': (drawer or self.drawer).id})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()['results']


class SuspendFlowTests(_Suspend, TestCase):
    def test_suspend_sets_the_sale_aside_and_it_shows_as_a_tab(self):
        cid, _ = self._open_cart_with_item()
        res = self._suspend(cid)
        self.assertEqual(res.status_code, 200, res.content)
        cart = Cart.objects.get(pk=cid)
        self.assertEqual(cart.status, 'suspended')
        self.assertIsNotNone(cart.suspended_at)
        tabs = self._tabs()
        self.assertEqual([t['id'] for t in tabs], [cid])
        self.assertEqual((tabs[0]['item_count'], tabs[0]['total'], tabs[0]['member_first_name']), (1, '100.00', ''))
        # Nothing was sold: the item is still on the shelf, and no cash moved.
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'on_shelf')

    def test_an_empty_sale_cannot_be_suspended_and_neither_can_a_finished_one(self):
        empty = self._new_cart()
        self.assertEqual(self._suspend(empty).status_code, 400)
        self.assertEqual(self._suspend(empty).json()['code'], 'EMPTY_SALE')
        cid, cart = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        self.assertEqual(self._suspend(cid).json()['code'], 'NOT_OPEN')

    def test_suspend_then_new_sale_then_resume_swaps_them(self):
        first, _ = self._open_cart_with_item()
        self.assertEqual(self._suspend(first).status_code, 200)
        second = self._new_cart()
        self.assertEqual(self._add(second, self.item2.sku).status_code, 200)
        res = self.client.post(f'/api/pos/carts/{first}/resume/', {'current': second}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['status'], 'open')
        self.assertEqual(len(res.json()['lines']), 1)
        self.assertEqual(Cart.objects.get(pk=first).status, 'open')
        self.assertIsNone(Cart.objects.get(pk=first).suspended_at)
        # The sale that was on screen is now the one set aside in its place.
        self.assertEqual(Cart.objects.get(pk=second).status, 'suspended')
        self.assertEqual([t['id'] for t in self._tabs()], [second])
        # The brought-back sale completes as any sale.
        done = self._complete(first, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual(done.status_code, 200, done.content)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'sold')

    def test_resume_with_an_empty_current_sale_drops_that_empty_sale(self):
        first, _ = self._open_cart_with_item()
        self._suspend(first)
        empty = self._new_cart()
        res = self.client.post(f'/api/pos/carts/{first}/resume/', {'current': empty}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Cart.objects.get(pk=empty).status, 'voided')
        self.assertEqual(self._tabs(), [])

    def test_resume_only_a_set_aside_sale(self):
        cid, _ = self._open_cart_with_item()
        res = self.client.post(f'/api/pos/carts/{cid}/resume/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'NOT_SUSPENDED')

    def test_resume_refuses_when_an_item_sold_meanwhile(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        Item.objects.filter(pk=self.item.pk).update(status='sold')
        res = self.client.post(f'/api/pos/carts/{cid}/resume/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'ITEM_SOLD')
        self.assertEqual(Cart.objects.get(pk=cid).status, 'suspended')

    def test_a_set_aside_sale_cannot_be_changed(self):
        cid, cart = self._open_cart_with_item()
        self._suspend(cid)
        self.assertEqual(self._add(cid, self.item2.sku).json()['code'], 'SALE_SET_ASIDE')
        line_id = CartLine.objects.get(cart_id=cid).pk
        self.assertEqual(self.client.delete(f'/api/pos/carts/{cid}/lines/{line_id}/').status_code, 400)
        self.assertEqual(self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'}).status_code, 400)

    def test_the_restore_list_does_not_show_set_aside_sales_as_open(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        res = self.client.get('/api/pos/carts/', {'drawer': self.drawer.id, 'status': 'open'})
        self.assertEqual(res.json()['results'], [])
        res = self.client.get('/api/pos/carts/', {'drawer': self.drawer.id, 'status': 'all'})
        self.assertEqual(res.json()['results'], [])  # Transactions "All" is paid and voided sales only


class SuspendHoldsItemsTests(_Suspend, TestCase):
    def test_deleting_a_set_aside_sale_voids_it_and_the_item_is_free_again(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        res = self.client.post(f'/api/pos/carts/{cid}/delete-suspended/')  # a plain cashier, not a manager
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Cart.objects.get(pk=cid).status, 'voided')
        self.assertEqual(self._tabs(), [])
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'on_shelf')
        again = self._new_cart()
        self.assertEqual(self._add(again, self.item.sku).status_code, 200)

    def test_delete_suspended_refuses_an_open_or_finished_sale(self):
        cid, _ = self._open_cart_with_item()
        res = self.client.post(f'/api/pos/carts/{cid}/delete-suspended/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Cart.objects.get(pk=cid).status, 'open')

    def test_the_same_register_cannot_ring_a_set_aside_item_in_a_new_sale(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        other = self._new_cart()
        res = self._add(other, self.item.sku)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'ITEM_SET_ASIDE')
        self.assertFalse(CartLine.objects.filter(cart_id=other).exists())

    def test_another_register_cannot_sell_a_set_aside_sales_item(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        register2 = Register.objects.create(location=self.location, name='Register D', code='POS-D1')
        other_user = User.objects.create_user('second-cashier@example.com', 'Sam', 'Second', password='test-pass-123')
        other_user.groups.set(self.user.groups.all())
        drawer2 = Drawer.objects.create(register=register2, date=timezone.now().date(), current_cashier=other_user,
                                        opened_by=other_user, opened_at=timezone.now(), status='open')
        api2 = APIClient()
        api2.force_authenticate(other_user)
        cart2 = self._new_cart(drawer2, api2)
        res = self._add(cart2, self.item.sku, api2)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'ITEM_SET_ASIDE')
        self.assertIn('Register C', res.json()['detail'])
        # Once the first sale is deleted, the other register can sell it.
        self.client.post(f'/api/pos/carts/{cid}/delete-suspended/')
        self.assertEqual(self._add(cart2, self.item.sku, api2).status_code, 200)

    def test_an_open_sale_that_already_holds_the_item_cannot_complete_once_it_is_set_aside_elsewhere(self):
        """Two open sales both had the item (a slow register); one is set aside. The other cannot be paid."""
        a, _ = self._open_cart_with_item()
        b, _ = self._open_cart_with_item()
        self._suspend(a)
        res = self._complete(b, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'ITEM_SET_ASIDE')

    def test_a_practice_sale_neither_holds_nor_is_held(self):
        train_reg = Register.objects.create(location=self.location, name='Training', code='TRAIN-S', is_training=True)
        train_drawer = Drawer.objects.create(register=train_reg, date=timezone.now().date(), current_cashier=self.user,
                                             opened_by=self.user, opened_at=timezone.now(), status='open')
        t1 = self._new_cart(train_drawer)
        self.assertEqual(self._add(t1, self.item.sku).status_code, 200)
        self.assertEqual(self._suspend(t1).status_code, 200)
        real = self._new_cart()
        self.assertEqual(self._add(real, self.item.sku).status_code, 200)  # a practice sale holds nothing real
        # ...and a real set-aside sale does not stop practice.
        self._suspend(real)
        t2 = self._new_cart(train_drawer)
        self.assertEqual(self._add(t2, self.item.sku).status_code, 200)


class SuspendDrawerCloseTests(_Suspend, TestCase):
    def _close(self, extra=None):
        body = {'closing_count': {}, 'closing_total': '0.00', **(extra or {})}
        return self.client.post(f'/api/pos/drawers/{self.drawer.id}/close/', body, format='json')

    def test_closing_with_sales_set_aside_warns_and_closes_nothing(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        res = self._close()
        self.assertEqual(res.status_code, 409, res.content)
        data = res.json()
        self.assertEqual((data['code'], data['suspended_count']), ('SUSPENDED_SALES', 1))
        self.assertEqual(data['suspended'][0]['id'], cid)
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.status, 'open')
        self.assertEqual(Cart.objects.get(pk=cid).status, 'suspended')

    def test_closing_again_with_the_ok_voids_them_and_frees_the_items(self):
        cid, _ = self._open_cart_with_item()
        self._suspend(cid)
        res = self._close({'void_suspended': True})
        self.assertEqual(res.status_code, 200, res.content)
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.status, 'closed')
        self.assertEqual(Cart.objects.get(pk=cid).status, 'voided')
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'on_shelf')

    def test_closing_without_any_set_aside_sales_is_as_before(self):
        self.assertEqual(self._close().status_code, 200)

    def test_voiding_and_completing_still_work_next_to_a_set_aside_sale(self):
        held, _ = self._open_cart_with_item()
        self._suspend(held)
        cid = self._new_cart()
        self._add(cid, self.item2.sku)
        done = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '40.00'})
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(Cart.objects.get(pk=cid).status, 'completed')
        self.assertEqual(Cart.objects.get(pk=held).status, 'suspended')


class SuspendMemberTabTests(_Suspend, TestCase):
    def test_the_tab_carries_the_members_first_name_and_resume_gives_fresh_member_data(self):
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        code = cards.generate_batch(1).cards.values_list('code', flat=True).first()
        members.create_account(first_name='Ana', phone='4025550101', id_checked=True, verified_18=True, card_code=code)
        cid, _ = self._open_cart_with_item()
        attached = self.client.post('/api/thriftplus/register/attach/', {'cart': cid, 'code': f'TP{code}'}, format='json')
        self.assertEqual(attached.status_code, 200, attached.content)
        self._suspend(cid)
        self.assertEqual(self._tabs()[0]['member_first_name'], 'Ana')
        res = self.client.post(f'/api/pos/carts/{cid}/resume/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['thrift_plus']['member']['first_name'], 'Ana')
