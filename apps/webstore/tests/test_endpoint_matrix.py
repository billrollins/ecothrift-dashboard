"""Endpoint × role matrix for Online Sales (G1)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import WebListing, WebListingImage
from apps.webstore.tests.helpers import make_verified_hold


def _user(email, group_name, *, is_staff=False):
    group, _ = Group.objects.get_or_create(name=group_name)
    user = User.objects.create_user(
        email=email, first_name='T', last_name=group_name, password='pass-12345',
    )
    if is_staff:
        user.is_staff = True
        user.save(update_fields=['is_staff'])
    user.groups.add(group)
    return user


def _listing(slug='matrix-lamp'):
    listing = WebListing.objects.create(
        title='Matrix Lamp', slug=slug, price=Decimal('30.00'),
        on_hand=3, reserved=0, status='published', return_policy='final_sale',
    )
    s3 = S3File.objects.create(
        key=f'test/{listing.id}.jpg', filename='t.jpg', size=10, content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class EndpointMatrixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.listing = _listing()
        cls.admin = _user('mx-admin@example.com', 'Admin', is_staff=True)
        cls.manager = _user('mx-mgr@example.com', 'Manager', is_staff=True)
        cls.employee = _user('mx-emp@example.com', 'Employee', is_staff=True)
        cls.customer = _user('mx-cust@example.com', 'Customer')
        Group.objects.get_or_create(name='Customer')
        cls.customer.groups.add(Group.objects.get(name='Customer'))

    def _client(self, user=None):
        c = APIClient()
        if user:
            c.force_authenticate(user)
        return c

    def test_config_allow_any(self):
        r = self._client().get('/api/webstore/config/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn('online_sales_enabled', body)
        self.assertIn('hours', body)
        self.assertIn('label', body['hours'])

    def test_catalog_roles(self):
        for user, expected in [
            (None, 200),
            (self.employee, 200),
            (self.manager, 200),
            (self.customer, 200),
        ]:
            r = self._client(user).get('/api/webstore/catalog/')
            self.assertEqual(r.status_code, expected, user)

    def test_staff_listings_permissions(self):
        self.assertIn(self._client().get('/api/webstore/listings/').status_code, (401, 403))
        self.assertEqual(self._client(self.employee).get('/api/webstore/listings/').status_code, 403)
        self.assertEqual(self._client(self.customer).get('/api/webstore/listings/').status_code, 403)
        self.assertEqual(self._client(self.manager).get('/api/webstore/listings/').status_code, 200)
        self.assertEqual(self._client(self.admin).get('/api/webstore/listings/').status_code, 200)

    def test_reservations_staff_only(self):
        self.assertIn(self._client().get('/api/webstore/reservations/').status_code, (401, 403))
        self.assertEqual(self._client(self.customer).get('/api/webstore/reservations/').status_code, 403)
        self.assertEqual(self._client(self.manager).get('/api/webstore/reservations/').status_code, 200)

    def test_conversations_staff_only(self):
        self.assertEqual(self._client(self.customer).get('/api/webstore/conversations/').status_code, 403)
        self.assertEqual(self._client(self.manager).get('/api/webstore/conversations/').status_code, 200)

    def test_hold_create_and_status(self):
        r = self._client().post(
            '/api/webstore/holds/',
            {
                'customer_name': 'A',
                'email': 'a@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['status'], 'pending_verification')
        token = r.json()['status_token']
        st = self._client().get(f'/api/webstore/holds/{token}/')
        self.assertEqual(st.status_code, 200)
        # Thread stays hidden until email is verified.
        self.assertIsNone(st.json().get('thread'))

    def test_hold_oversell_409_or_400(self):
        listing = _listing('matrix-one')
        listing.on_hand = 1
        listing.sync_stock_mirror()
        listing.save()
        make_verified_hold(
            listing=listing, quantity=1, customer_name='X', email='x@example.com',
        )
        r = self._client().post(
            '/api/webstore/holds/',
            {
                'customer_name': 'Y',
                'email': 'y@example.com',
                'slug': listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertIn(r.status_code, (400, 409))

    def test_ask_and_thread_message(self):
        ask = self._client().post(
            f'/api/webstore/catalog/{self.listing.slug}/ask/',
            {'name': 'G', 'email': 'g@example.com', 'body': 'Hi?'},
            format='json',
        )
        self.assertEqual(ask.status_code, 201)
        token = ask.json()['public_token']
        msg = self._client().post(
            f'/api/webstore/threads/{token}/messages/',
            {'body': 'Still there?'},
            format='json',
        )
        self.assertEqual(msg.status_code, 201)

    def test_my_endpoints_customer_only(self):
        self.assertEqual(self._client(self.manager).get('/api/webstore/my/holds/').status_code, 403)
        self.assertEqual(self._client(self.customer).get('/api/webstore/my/holds/').status_code, 200)
        self.assertEqual(self._client(self.customer).get('/api/webstore/my/conversations/').status_code, 200)

    @override_settings(ONLINE_SALES_ENABLED=False)
    def test_flag_off_catalog_and_holds_410(self):
        self.assertEqual(self._client().get('/api/webstore/catalog/').status_code, 410)
        self.assertEqual(
            self._client().post(
                '/api/webstore/holds/',
                {
                    'customer_name': 'A',
                    'email': 'a@example.com',
                    'slug': self.listing.slug,
                    'quantity': 1,
                },
                format='json',
            ).status_code,
            410,
        )

    def test_detail_404(self):
        r = self._client().get('/api/webstore/catalog/does-not-exist-slug/')
        self.assertEqual(r.status_code, 404)
