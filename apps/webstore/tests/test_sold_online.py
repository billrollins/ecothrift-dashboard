"""E5: items sold online leave inventory, with a channel on every sale."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, ItemHistory, Product
from apps.webstore.models import Reservation, WebListing
from apps.webstore.tests.helpers import make_verified_hold

User = get_user_model()


class SoldOnlineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = User.objects.create_user(email='online-mgr@example.com', first_name='Ona', last_name='Line', password='pw')
        self.mgr.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(self.mgr)
        self.product = Product.objects.create(title='Teak lamp')
        self.item = Item.objects.create(product=self.product, price=Decimal('40.00'), status='on_shelf', location='online_sales')

    def _record(self, **body):
        data = {'sku': self.item.sku, 'sold_for': '35.00', 'channel': 'facebook', **body}
        return self.client.post('/api/webstore/sold-online/', data, format='json')

    def test_record_takes_the_item_out_with_history_and_lists_it(self):
        listing = WebListing.objects.create(title='Teak lamp', slug='teak-lamp', price=Decimal('40.00'), on_hand=1,
                                            status='published', item=self.item, return_policy='final_sale')
        r = self._record(note='Marketplace, cash')
        self.assertEqual(r.status_code, 201, r.data)
        self.item.refresh_from_db()
        self.assertEqual((self.item.status, self.item.sold_for, self.item.sale_channel), ('sold', Decimal('35.00'), 'facebook'))
        self.assertIsNotNone(self.item.sold_at)
        h = ItemHistory.objects.get(item=self.item, event_type='sold')
        self.assertIn('Facebook', h.note)
        self.assertIn('Marketplace, cash', h.note)
        listing.refresh_from_db()
        self.assertEqual((listing.status, listing.on_hand), ('sold', 0))
        row = r.data['results'][0]
        self.assertEqual((row['sku'], row['sold_for'], row['paid_at_register'], row['recorded_by']),
                         (self.item.sku, '35.00', False, 'Ona Line'))

    def test_refusals(self):
        self.assertEqual(self._record(channel='store').status_code, 400)
        self.assertEqual(self._record(sku='ITM9999999').status_code, 404)
        self.assertEqual(self._record(sold_for='').status_code, 400)
        consigned = Item.objects.create(product=self.product, price=Decimal('5'), status='on_shelf', source='consignment')
        self.assertEqual(self._record(sku=consigned.sku).status_code, 400)
        self.assertEqual(self._record().status_code, 201)
        self.assertEqual(self._record().status_code, 400)  # already sold

    def test_item_on_an_active_hold_must_go_through_the_register(self):
        listing = WebListing.objects.create(title='Teak lamp', slug='teak-lamp-2', price=Decimal('40.00'), on_hand=1,
                                            status='published', item=self.item, return_policy='final_sale')
        hold = make_verified_hold(listing=listing, quantity=1, customer_name='Pat', email='pat@example.com')
        Reservation.objects.filter(pk=hold.pk).update(item=self.item)
        r = self._record()
        self.assertEqual(r.status_code, 400)
        self.assertIn('register', r.data['detail'])

    def test_undo_puts_it_back(self):
        self._record()
        r = self.client.post(f'/api/webstore/sold-online/{self.item.pk}/undo/')
        self.assertEqual(r.status_code, 200, r.data)
        self.item.refresh_from_db()
        self.assertEqual((self.item.status, self.item.sold_at, self.item.sale_channel), ('on_shelf', None, ''))
        self.assertEqual(r.data['results'], [])

    def test_listing_mark_sold_takes_its_item_out(self):
        listing = WebListing.objects.create(title='Teak lamp', slug='teak-lamp-3', price=Decimal('40.00'), on_hand=1,
                                            status='published', item=self.item, return_policy='final_sale',
                                            fb_posted_url='https://facebook.com/marketplace/item/1')
        r = self.client.post(f'/api/webstore/listings/{listing.id}/mark-sold/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual((self.item.status, self.item.sold_for, self.item.sale_channel), ('sold', Decimal('40.00'), 'facebook'))
        listing.refresh_from_db()
        self.assertEqual(listing.status, 'sold')

    def test_staff_cannot_record(self):
        staff = User.objects.create_user(email='emp@example.com', first_name='E', last_name='M', password='pw')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        c = APIClient()
        c.force_authenticate(staff)
        r = c.post('/api/webstore/sold-online/', {'sku': self.item.sku, 'sold_for': '1', 'channel': 'facebook'}, format='json')
        self.assertEqual(r.status_code, 403)


from apps.pos.tests.test_cart_card_surcharge import _CartCardSurchargeFixtures  # noqa: E402


class RegisterSaleChannelTests(_CartCardSurchargeFixtures, TestCase):
    def test_a_register_sale_is_in_store(self):
        cid, _ = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': 100.0})
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual((self.item.status, self.item.sale_channel), ('sold', 'store'))
