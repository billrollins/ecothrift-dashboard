"""Hard-control tests for Online Sales holds / policy cutover."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File, WorkLocation
from apps.inventory.models import Item, Product
from apps.pos.models import Drawer, Register
from apps.webstore.models import Reservation, WebListing, WebListingImage
from apps.webstore.services.reservations import create_hold, release_reservation


def _manager_user(email='os-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email,
        first_name='Online',
        last_name='Manager',
        password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _published_listing(**kwargs):
    defaults = dict(
        title='Hold Test Lamp',
        slug=kwargs.pop('slug', 'hold-test-lamp'),
        price=Decimal('25.00'),
        on_hand=1,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    defaults.update(kwargs)
    listing = WebListing.objects.create(**defaults)
    s3 = S3File.objects.create(
        key=f'test/{listing.id}.jpg',
        filename='t.jpg',
        size=10,
        content_type='image/jpeg',
    )
    # Ensure publish readiness has a photo when needed
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


class HoldRaceTests(TransactionTestCase):
    def test_concurrent_qty1_hold_only_one_succeeds(self):
        listing = _published_listing(slug='race-lamp', on_hand=1)

        def attempt(i):
            # Each thread needs its own DB connection
            try:
                create_hold(
                    listing=listing,
                    quantity=1,
                    customer_name=f'Buyer {i}',
                    email=f'buyer{i}@example.com',
                )
                return 'ok'
            except Exception:
                return 'fail'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, range(2)))

        listing.refresh_from_db()
        self.assertEqual(results.count('ok'), 1)
        self.assertEqual(results.count('fail'), 1)
        self.assertEqual(listing.reserved, 1)
        self.assertEqual(Reservation.objects.filter(listing=listing).count(), 1)


class HoldReleaseTests(TestCase):
    def test_expire_releases_reserved_qty(self):
        listing = _published_listing(slug='expire-lamp', on_hand=2)
        reservation = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Pat',
            email='pat@example.com',
        )
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 1)
        release_reservation(reservation, 'expired')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, 'expired')

    def test_cancel_releases_reserved_qty(self):
        listing = _published_listing(slug='cancel-lamp', on_hand=1)
        reservation = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Sam',
            email='sam@example.com',
        )
        release_reservation(reservation, 'cancelled')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)


class PolicyRejectTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _published_listing(slug='policy-lamp')

    def test_checkout_disabled(self):
        r = self.client.post(
            '/api/webstore/checkout/',
            {
                'customer_name': 'A',
                'email': 'a@example.com',
                'items': [{'slug': 'policy-lamp', 'qty': 1}],
                'fulfillment': 'pickup',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 410)
        self.assertEqual(r.json().get('code'), 'CHECKOUT_DISABLED')

    def test_holds_disabled_when_online_sales_parked(self):
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'A',
                'email': 'a@example.com',
                'slug': 'policy-lamp',
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 410)
        self.assertEqual(r.json().get('code'), 'HOLDS_DISABLED')

    def test_catalog_disabled_when_online_sales_parked(self):
        r = self.client.get('/api/webstore/catalog/')
        self.assertEqual(r.status_code, 410)
        self.assertEqual(r.json().get('code'), 'ONLINE_SALES_DISABLED')

    def test_config_reports_flag(self):
        r = self.client.get('/api/webstore/config/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json().get('online_sales_enabled'))

    @override_settings(ONLINE_SALES_ENABLED=True)
    def test_config_and_catalog_when_enabled(self):
        r = self.client.get('/api/webstore/config/')
        self.assertTrue(r.json().get('online_sales_enabled'))
        cat = self.client.get('/api/webstore/catalog/')
        self.assertEqual(cat.status_code, 200)
        self.assertGreaterEqual(cat.json().get('count', 0), 1)

    @override_settings(ONLINE_SALES_ENABLED=True)
    def test_ship_rejected_on_hold(self):
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'A',
                'email': 'a@example.com',
                'slug': 'policy-lamp',
                'quantity': 1,
                'fulfillment': 'ship',
                'ship_address1': '1 Main',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get('code'), 'SHIP_REJECTED')

    @override_settings(ONLINE_SALES_ENABLED=True)
    def test_payment_rejected_on_hold(self):
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'A',
                'email': 'a@example.com',
                'slug': 'policy-lamp',
                'quantity': 1,
                'payment_method': 'card',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get('code'), 'PAY_REJECTED')


class HoldTokenPrivacyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        listing = _published_listing(slug='token-lamp')
        self.reservation = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Secret Customer',
            email='secret@example.com',
            phone='555-0100',
        )

    def test_random_token_status_works_minimal_fields(self):
        r = self.client.get(f'/api/webstore/holds/{self.reservation.status_token}/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body['status_token'], self.reservation.status_token)
        self.assertNotIn('email', body)
        self.assertNotIn('phone', body)
        self.assertNotIn('customer_name', body)

    def test_legacy_etw_order_status_denied(self):
        r = self.client.get('/api/webstore/order-status/ETW00001/')
        self.assertEqual(r.status_code, 410)
        self.assertEqual(r.json().get('code'), 'ORDER_STATUS_DISABLED')


class PosHoldGuardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = _manager_user('pos-hold-mgr@example.com')
        self.client.force_authenticate(user=self.manager)

        self.location = WorkLocation.objects.create(name='OS Hold Loc')
        self.register = Register.objects.create(
            location=self.location, name='R1', code='OS-H1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.manager,
            opened_by=self.manager,
            opened_at=timezone.now(),
            status='open',
        )
        product = Product.objects.create(title='Held Widget')
        self.item = Item.objects.create(
            sku='OS-HOLD-1',
            product=product,
            price=Decimal('12.00'),
            status='on_shelf',
        )
        self.listing = _published_listing(
            slug='held-widget',
            item=self.item,
            sku='OS-HOLD-1',
            on_hand=1,
        )
        self.reservation = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Hold Buyer',
            email='holdbuyer@example.com',
        )

    def _open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()['id']

    def test_held_item_blocked_without_match_or_override(self):
        # Force requested status so auto-match (confirmed/ready only) does not apply.
        self.reservation.status = 'requested'
        self.reservation.save(update_fields=['status'])
        cid = self._open_cart()
        r = self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'OS-HOLD-1'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get('code'), 'ITEM_ON_HOLD')

    def test_manager_override_allows_add(self):
        self.reservation.status = 'requested'
        self.reservation.save(update_fields=['status'])
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {
                'sku': 'OS-HOLD-1',
                'override_hold': True,
                'override_reason': 'Customer bought on floor; cancel hold',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, 'cancelled')

    def test_matching_reservation_completes_on_cart_complete(self):
        from apps.webstore.services.reservations import confirm_reservation, stage_reservation

        confirm_reservation(self.reservation, user=self.manager)
        stage_reservation(self.reservation, user=self.manager)
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'OS-HOLD-1', 'reservation_id': self.reservation.id},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        r2 = self.client.post(
            f'/api/pos/carts/{cid}/complete/',
            {'payment_method': 'cash', 'cash_tendered': '20.00'},
            format='json',
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, 'completed')
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.on_hand, 0)
