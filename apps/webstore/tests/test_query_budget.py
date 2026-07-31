"""Query-budget pins for list endpoints (G5)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Conversation, WebListing, WebListingImage
from apps.webstore.services.conversations import open_inquiry
from apps.webstore.services.reservations import create_hold


def _mgr():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='qb-mgr@example.com', first_name='Q', last_name='B', password='x',
    )
    user.groups.add(group)
    return user


def _listing(i):
    listing = WebListing.objects.create(
        title=f'QB {i}', slug=f'qb-{i}', price=Decimal('10.00'),
        on_hand=2, reserved=0, status='published', return_policy='final_sale',
    )
    s3 = S3File.objects.create(
        key=f'test/qb-{listing.id}.jpg', filename='t.jpg', size=10, content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(ONLINE_SALES_ENABLED=True)
class QueryBudgetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _mgr()
        self.listings = [_listing(i) for i in range(5)]
        for i, listing in enumerate(self.listings):
            create_hold(
                listing=listing,
                quantity=1,
                customer_name=f'C{i}',
                email=f'c{i}@example.com',
            )
            open_inquiry(
                listing=listing,
                name=f'G{i}',
                email=f'g{i}@example.com',
                body=f'Question {i}',
            )

    def test_staff_listings_query_budget(self):
        self.client.force_authenticate(self.mgr)
        # Pinned after overnight: count + page + images + s3 + channels (+ role groups).
        with self.assertNumQueries(6):
            r = self.client.get('/api/webstore/listings/')
        self.assertEqual(r.status_code, 200)

    def test_staff_reservations_query_budget(self):
        self.client.force_authenticate(self.mgr)
        with self.assertNumQueries(3):
            r = self.client.get('/api/webstore/reservations/')
        self.assertEqual(r.status_code, 200)

    def test_staff_conversations_query_budget(self):
        self.client.force_authenticate(self.mgr)
        # List omits messages — no prefetch; pin against N+1 if serializer grows.
        with self.assertNumQueries(3):
            r = self.client.get('/api/webstore/conversations/')
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(Conversation.objects.count(), 5)
        results = r.json().get('results', r.json())
        self.assertNotIn('messages', results[0])
