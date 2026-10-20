"""POS: one tag on more than one unit rings the next unsold unit, never the same item twice (2026-10-20)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, ItemCheckIn, Product, PurchaseOrder, Vendor
from apps.pos.models import CartLine, Drawer, Register


class NextUnitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-next@example.com', first_name='Pos', last_name='Next', password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)
        location = WorkLocation.objects.create(name='POS Next Location')
        register = Register.objects.create(location=location, name='Register N', code='POS-N1')
        self.drawer = Drawer.objects.create(
            register=register, date=timezone.now().date(), current_cashier=self.user,
            opened_by=self.user, opened_at=timezone.now(), status='open',
        )
        self.category = Category.objects.create(name='POS Next Cat', slug='pos-next-cat')
        self.product = Product.objects.create(title='Twin Lamp', brand='QA', category=self.category)
        order = PurchaseOrder.objects.create(
            vendor=Vendor.objects.create(name='Next Vendor', code='NXV'), order_number='PO-NEXT-1',
            ordered_date='2026-10-01', purchase_cost=Decimal('10.00'), retail_value=Decimal('100.00'),
            status='processing',
        )
        self.check_in = ItemCheckIn.objects.create(
            purchase_order=order, product=self.product, quantity=3, origin=ItemCheckIn.ORIGIN_MANUAL,
        )
        self.units = [self._unit(f'NEXT-{i}') for i in (1, 2, 3)]

    def _unit(self, sku, **extra):
        fields = dict(
            sku=sku, product=self.product, purchase_order=self.check_in.purchase_order, check_in=self.check_in,
            price=Decimal('12.00'), status='on_shelf', checked_in_at=timezone.now(),
        )
        fields.update(extra)
        return Item.objects.create(**fields)

    def _cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()['id']

    def _scan(self, cid, sku):
        return self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': sku}, format='json')

    def _items_on(self, cid):
        return list(CartLine.objects.filter(cart_id=cid).order_by('pk').values_list('item__sku', 'quantity'))

    def test_the_same_tag_twice_rings_the_next_unit_on_its_own_line(self):
        cid = self._cart()
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1), ('NEXT-2', 1)])
        self.assertEqual(r.json()['unit_swapped'], {'scanned_sku': 'NEXT-1', 'added_sku': 'NEXT-2'})

    def test_a_third_scan_takes_the_third_unit_and_a_fourth_is_refused(self):
        cid = self._cart()
        for _ in range(3):
            self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1), ('NEXT-2', 1), ('NEXT-3', 1)])
        r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'ITEM_ALREADY_IN_CART')
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1), ('NEXT-2', 1), ('NEXT-3', 1)])

    def test_a_tag_with_no_other_unit_is_never_bumped_to_quantity_two(self):
        alone = Item.objects.create(
            sku='NEXT-ALONE', product=self.product, price=Decimal('5.00'), status='on_shelf',
        )
        cid = self._cart()
        self.assertEqual(self._scan(cid, alone.sku).status_code, 200)
        r = self._scan(cid, alone.sku)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'ITEM_ALREADY_IN_CART')
        self.assertEqual(self._items_on(cid), [('NEXT-ALONE', 1)])

    def test_a_sold_tag_with_an_unsold_unit_left_rings_that_unit(self):
        Item.objects.filter(pk=self.units[0].pk).update(status='sold')
        cid = self._cart()
        r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self._items_on(cid), [('NEXT-2', 1)])
        # nothing was moved: the sold unit stays sold and no new item was made
        self.assertEqual(Item.objects.get(sku='NEXT-1').status, 'sold')
        self.assertEqual(Item.objects.count(), 3)
        self.assertEqual(r.json()['unit_swapped']['scanned_sku'], 'NEXT-1')

    def test_a_sold_tag_with_every_unit_sold_still_gets_the_old_handling(self):
        Item.objects.filter(check_in=self.check_in).update(status='sold')
        cid = self._cart()
        r = self._scan(cid, 'NEXT-1')
        # no unit left: the sold tag in hand is real and its old sale moves to a new item (v2.x, 2026-10-06)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1)])
        self.assertTrue(Item.objects.filter(notes__startswith='SALE_MOVED_FROM:NEXT-1').exists())

    def test_sold_tag_that_a_person_must_sort_out_shows_the_dialog_when_no_unit_is_left(self):
        from unittest.mock import patch

        Item.objects.filter(check_in=self.check_in).update(status='sold')
        cid = self._cart()
        with patch('apps.inventory.services.duplicate_tag.why_not', return_value='consignment'):
            r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'ITEM_ALREADY_SOLD')

    def test_units_with_a_different_price_or_on_another_open_sale_are_not_picked(self):
        Item.objects.filter(pk=self.units[1].pk).update(price=Decimal('15.00'))
        other = self._cart()
        self.assertEqual(self._scan(other, 'NEXT-3').status_code, 200)
        cid = self._cart()
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'ITEM_ALREADY_IN_CART')

    def test_a_unit_on_a_suspended_sale_is_not_picked(self):
        from apps.pos.models import Cart

        Item.objects.filter(pk=self.units[1].pk).update(price=Decimal('15.00'))
        other = self._cart()
        self.assertEqual(self._scan(other, 'NEXT-3').status_code, 200)
        Cart.objects.filter(pk=other).update(status='suspended')  # set aside: it still holds NEXT-3
        cid = self._cart()
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        r = self._scan(cid, 'NEXT-1')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'ITEM_ALREADY_IN_CART')

    def test_a_held_online_unit_is_not_picked(self):
        from apps.webstore.models import WebListing

        WebListing.objects.create(item=self.units[1], slug='next-2', title='Twin Lamp', price=Decimal('12.00'))
        cid = self._cart()
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        self.assertEqual(self._scan(cid, 'NEXT-1').json().get('unit_swapped', {}).get('added_sku'), 'NEXT-3')

    def test_raising_a_line_quantity_adds_the_next_units_as_their_own_lines(self):
        cid = self._cart()
        added = self._scan(cid, 'NEXT-1').json()
        line_id = added['lines'][0]['id']
        r = self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', {'quantity': 3}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1), ('NEXT-2', 1), ('NEXT-3', 1)])
        self.assertEqual(Decimal(r.json()['subtotal']), Decimal('36.00'))

    def test_raising_a_line_quantity_past_the_units_on_hand_changes_nothing(self):
        cid = self._cart()
        line_id = self._scan(cid, 'NEXT-1').json()['lines'][0]['id']
        r = self.client.patch(
            f'/api/pos/carts/{cid}/lines/{line_id}/', {'quantity': 4, 'unit_price': 99}, format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], 'NOT_ENOUGH_UNITS')
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1)])
        self.assertEqual(CartLine.objects.get(pk=line_id).unit_price, Decimal('12.00'))

    def test_lowering_a_quantity_and_a_bad_quantity(self):
        cid = self._cart()
        line_id = self._scan(cid, 'NEXT-1').json()['lines'][0]['id']
        bad = self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', {'quantity': 'abc'}, format='json')
        self.assertEqual(bad.status_code, 400, bad.content)
        self.assertEqual(bad.json()['code'], 'INVALID_QUANTITY')
        same = self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', {'quantity': 1}, format='json')
        self.assertEqual(same.status_code, 200, same.content)
        self.assertEqual(self._items_on(cid), [('NEXT-1', 1)])

    def test_paying_marks_each_unit_sold_once(self):
        cid = self._cart()
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        self.assertEqual(self._scan(cid, 'NEXT-1').status_code, 200)
        done = self.client.post(
            f'/api/pos/carts/{cid}/complete/', {'payment_method': 'cash', 'cash_tendered': '100.00'}, format='json',
        )
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(
            list(Item.objects.filter(check_in=self.check_in).order_by('sku').values_list('sku', 'status')),
            [('NEXT-1', 'sold'), ('NEXT-2', 'sold'), ('NEXT-3', 'on_shelf')],
        )
