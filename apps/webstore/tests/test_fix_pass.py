"""Regression tests for the post-overnight fix pass."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Conversation, Reservation, WebListing, WebListingImage
from django.db import transaction

from apps.webstore.services.conversations import post_message
from apps.webstore.services.reservations import (
    create_hold,
    expire_due_reservations,
    release_reservation,
)


def _listing(slug='fix-lamp', on_hand=3):
    listing = WebListing.objects.create(
        title='Fix Lamp',
        slug=slug,
        price=Decimal('25.00'),
        on_hand=on_hand,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    s3 = S3File.objects.create(
        key=f'test/{listing.id}.jpg', filename='t.jpg', size=10, content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


def _customer(email='cust@example.com'):
    Group.objects.get_or_create(name='Customer')
    user = User.objects.create_user(
        email=email, first_name='C', last_name='Ust', password='x',
    )
    user.groups.add(Group.objects.get(name='Customer'))
    return user


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='fix-mgr@example.com', first_name='F', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(ONLINE_SALES_ENABLED=True)
class UnreadSurvivesGetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.listing = _listing('unread-lamp')
        self.res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
            customer_note='Hi',
        )
        self.conv = Conversation.objects.get(reservation=self.res)
        with transaction.atomic():
            post_message(self.conv, author_kind='staff', body='We have it ready.', author_user=None)
        self.conv.refresh_from_db()
        self.assertGreater(self.conv.customer_unread, 0)

    def test_hold_status_get_does_not_clear_unread(self):
        r = self.client.get(f'/api/webstore/holds/{self.res.status_token}/')
        self.assertEqual(r.status_code, 200)
        self.assertGreater(r.json()['thread']['customer_unread'], 0)
        self.conv.refresh_from_db()
        self.assertGreater(self.conv.customer_unread, 0)

    def test_explicit_read_clears_unread(self):
        r = self.client.post(f'/api/webstore/threads/{self.conv.public_token}/read/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['customer_unread'], 0)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.customer_unread, 0)


@override_settings(ONLINE_SALES_ENABLED=True)
class MyHoldsListPayloadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = _customer('holder@example.com')
        self.listings = [_listing(f'myhold-{i}', on_hand=2) for i in range(3)]
        for listing in self.listings:
            create_hold(
                listing=listing,
                quantity=1,
                customer_name='Holder',
                email='holder@example.com',
                customer_note='note',
            )

    def test_my_holds_omits_messages_and_stays_under_query_ceiling(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.client.force_authenticate(self.customer)
        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get('/api/webstore/my/holds/')
        self.assertEqual(r.status_code, 200)
        self.assertLessEqual(len(ctx), 8, f'Expected <=8 queries, got {len(ctx)}')
        rows = r.json()
        self.assertEqual(len(rows), 3)
        for row in rows:
            self.assertIn('thread', row)
            thread = row['thread']
            self.assertIsNotNone(thread)
            self.assertNotIn('messages', thread)

    def test_staff_conversation_list_omits_messages(self):
        mgr = _manager()
        self.client.force_authenticate(mgr)
        r = self.client.get('/api/webstore/conversations/')
        self.assertEqual(r.status_code, 200)
        results = r.json().get('results', r.json())
        self.assertGreaterEqual(len(results), 1)
        self.assertNotIn('messages', results[0])


@override_settings(ONLINE_SALES_ENABLED=True)
class Throttle429Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.listing = _listing('throttle-lamp', on_hand=10)
        from django.core.cache.backends.locmem import LocMemCache
        self._cache = LocMemCache(f'os-throttle-{id(self)}', {})
        self._cache_patcher = patch.object(SimpleRateThrottle, 'cache', self._cache)
        self._rates_patcher = patch.object(SimpleRateThrottle, 'THROTTLE_RATES', {
            **(SimpleRateThrottle.THROTTLE_RATES or {}),
            'online_hold': '2/minute',
            'online_message': '2/minute',
        })
        self._cache_patcher.start()
        self._rates_patcher.start()

    def tearDown(self):
        self._rates_patcher.stop()
        self._cache_patcher.stop()

    def test_hold_endpoint_returns_429(self):
        payload = {
            'slug': self.listing.slug,
            'quantity': 1,
            'customer_name': 'T',
            'email': 't@example.com',
        }
        self.assertEqual(self.client.post('/api/webstore/holds/', payload, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/webstore/holds/', payload, format='json').status_code, 201)
        r = self.client.post('/api/webstore/holds/', payload, format='json')
        self.assertEqual(r.status_code, 429)

    def test_message_endpoint_returns_429(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='T',
            email='t@example.com',
        )
        token = Conversation.objects.get(reservation=res).public_token
        url = f'/api/webstore/threads/{token}/messages/'
        self.assertEqual(self.client.post(url, {'body': 'one'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(url, {'body': 'two'}, format='json').status_code, 201)
        r = self.client.post(url, {'body': 'three'}, format='json')
        self.assertEqual(r.status_code, 429)


@override_settings(ONLINE_SALES_ENABLED=True)
class IdempotencyAfterDeclineTests(TestCase):
    def test_retry_after_decline_creates_new_active_hold(self):
        listing = _listing('idem-decline', on_hand=2)
        key = 'reuse-after-decline'
        first = create_hold(
            listing=listing,
            quantity=1,
            customer_name='A',
            email='a@example.com',
            idempotency_key=key,
        )
        release_reservation(first, 'declined')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)

        second = create_hold(
            listing=listing,
            quantity=1,
            customer_name='A',
            email='a@example.com',
            idempotency_key=key,
        )
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(second.status, 'requested')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 1)

    def test_idempotency_does_not_return_other_email(self):
        listing = _listing('idem-email', on_hand=2)
        key = 'shared-key'
        a = create_hold(
            listing=listing,
            quantity=1,
            customer_name='A',
            email='a@example.com',
            idempotency_key=key,
        )
        b = create_hold(
            listing=listing,
            quantity=1,
            customer_name='B',
            email='b@example.com',
            idempotency_key=key,
        )
        self.assertNotEqual(a.pk, b.pk)
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 2)


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_REQUEST_TRIAGE_HOURS=48)
class RequestTriageExpiryTests(TestCase):
    def test_stale_requested_hold_expires_and_releases_qty(self):
        listing = _listing('stale-req', on_hand=1)
        res = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Z',
            email='z@example.com',
        )
        Reservation.objects.filter(pk=res.pk).update(
            created_at=timezone.now() - timedelta(hours=49),
        )
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 1)

        n = expire_due_reservations()
        self.assertEqual(n, 1)
        res.refresh_from_db()
        self.assertEqual(res.status, 'expired')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)

    def test_fresh_requested_hold_is_not_expired(self):
        listing = _listing('fresh-req', on_hand=1)
        res = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Y',
            email='y@example.com',
        )
        n = expire_due_reservations()
        self.assertEqual(n, 0)
        res.refresh_from_db()
        self.assertEqual(res.status, 'requested')
