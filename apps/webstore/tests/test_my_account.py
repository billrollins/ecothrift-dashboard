"""Customer account portal APIs: my/holds + my/conversations(+detail)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import WebListing, WebListingImage
from apps.webstore.models import Conversation
from apps.webstore.services.conversations import open_inquiry, post_message
from apps.webstore.services.reservations import complete_reservation
from apps.webstore.tests.helpers import make_verified_hold


def _customer(email='acct@example.com'):
    group, _ = Group.objects.get_or_create(name='Customer')
    user = User.objects.create_user(
        email=email,
        first_name='Acct',
        last_name='Cust',
        password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='acct-mgr@example.com',
        first_name='Acct',
        last_name='Mgr',
        password='test-pass-123',
        is_staff=True,
    )
    user.groups.add(group)
    return user


def _listing(slug='acct-lamp', on_hand=3):
    listing = WebListing.objects.create(
        title=f'Acct {slug}',
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
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0, alt='thumb')
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class MyHoldsPayloadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = _customer()
        self.listing = _listing()

    def test_my_holds_includes_listing_image_and_slug(self):
        make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Acct',
            email=self.customer.email,
            customer_note='hi',
        )
        self.client.force_authenticate(self.customer)
        r = self.client.get('/api/webstore/my/holds/')
        self.assertEqual(r.status_code, 200)
        rows = r.json()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['listing_slug'], self.listing.slug)
        self.assertIsNotNone(row['listing_image'])
        self.assertIn('/api/webstore/images/', row['listing_image']['url'])
        self.assertNotIn('messages', (row.get('thread') or {}))

    def test_my_holds_query_ceiling_with_many_holds(self):
        listings = [_listing(f'acct-bulk-{i}', on_hand=2) for i in range(12)]
        for listing in listings:
            make_verified_hold(
                listing=listing,
                quantity=1,
                customer_name='Acct',
                email=self.customer.email,
                customer_note='bulk',
            )
        self.client.force_authenticate(self.customer)
        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get('/api/webstore/my/holds/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 12)
        # Prefetch events + images keeps this flat as hold count grows.
        self.assertLessEqual(len(ctx), 12, f'Expected <=12 queries, got {len(ctx)}')


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class MyHoldCustomerArchiveTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = _customer('archive@example.com')
        self.other = _customer('other-archive@example.com')
        self.listing = _listing('archive-lamp')
        self.hold = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Archive',
            email=self.customer.email,
        )
        complete_reservation(self.hold)
        self.hold.refresh_from_db()
        self.client.force_authenticate(self.customer)

    def test_archive_and_unarchive_finished_hold(self):
        token = self.hold.status_token
        r = self.client.post(f'/api/webstore/my/holds/{token}/archive/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.json()['customer_archived_at'])
        self.hold.refresh_from_db()
        self.assertIsNotNone(self.hold.customer_archived_at)

        listed = self.client.get('/api/webstore/my/holds/').json()
        row = next(x for x in listed if x['status_token'] == token)
        self.assertIsNotNone(row['customer_archived_at'])

        r2 = self.client.post(f'/api/webstore/my/holds/{token}/unarchive/')
        self.assertEqual(r2.status_code, 200)
        self.assertIsNone(r2.json()['customer_archived_at'])
        self.hold.refresh_from_db()
        self.assertIsNone(self.hold.customer_archived_at)

    def test_cannot_archive_active_hold(self):
        active = make_verified_hold(
            listing=_listing('archive-active', on_hand=2),
            quantity=1,
            customer_name='Archive',
            email=self.customer.email,
        )
        r = self.client.post(f'/api/webstore/my/holds/{active.status_token}/archive/')
        self.assertEqual(r.status_code, 400)
        active.refresh_from_db()
        self.assertIsNone(active.customer_archived_at)

    def test_cannot_archive_someone_elses_hold(self):
        other_hold = make_verified_hold(
            listing=_listing('archive-other', on_hand=2),
            quantity=1,
            customer_name='Other',
            email=self.other.email,
        )
        complete_reservation(other_hold)
        r = self.client.post(
            f'/api/webstore/my/holds/{other_hold.status_token}/archive/',
        )
        self.assertEqual(r.status_code, 404)
        other_hold.refresh_from_db()
        self.assertIsNone(other_hold.customer_archived_at)

    def test_idempotent_archive(self):
        token = self.hold.status_token
        first = self.client.post(f'/api/webstore/my/holds/{token}/archive/')
        self.assertEqual(first.status_code, 200)
        stamped = first.json()['customer_archived_at']
        second = self.client.post(f'/api/webstore/my/holds/{token}/archive/')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()['customer_archived_at'], stamped)


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class MyConversationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = _customer('inbox@example.com')
        self.other = _customer('other@example.com')
        self.manager = _manager()
        self.listing = _listing('inbox-lamp')

    def test_list_includes_preview_fields(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Inbox',
            email=self.customer.email,
            customer_note='First question about pickup',
        )
        conv = res.conversation
        post_message(conv, author_kind='staff', body='We have it ready for you tomorrow.')
        self.client.force_authenticate(self.customer)
        r = self.client.get('/api/webstore/my/conversations/')
        self.assertEqual(r.status_code, 200)
        rows = r.json()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['public_token'], conv.public_token)
        self.assertEqual(row['listing_slug'], self.listing.slug)
        self.assertEqual(row['last_message_author'], 'staff')
        self.assertIn('ready for you', row['last_message_preview'])
        self.assertNotIn('messages', row)

    def test_detail_owner_ok_other_404_staff_403_anon_401(self):
        conv = open_inquiry(
            listing=self.listing,
            name='Inbox',
            email=self.customer.email,
            body='Is this still available?',
            verified=True,
        )
        url = f'/api/webstore/my/conversations/{conv.public_token}/'

        anon = self.client.get(url)
        self.assertIn(anon.status_code, (401, 403))

        self.client.force_authenticate(self.manager)
        staff = self.client.get(url)
        self.assertEqual(staff.status_code, 403)

        self.client.force_authenticate(self.other)
        other = self.client.get(url)
        self.assertEqual(other.status_code, 404)

        self.client.force_authenticate(self.customer)
        mine = self.client.get(url)
        self.assertEqual(mine.status_code, 200)
        data = mine.json()
        self.assertEqual(data['public_token'], conv.public_token)
        self.assertEqual(data['listing_slug'], self.listing.slug)
        self.assertEqual(len(data['messages']), 1)
        self.assertEqual(data['messages'][0]['body'], 'Is this still available?')

    def test_detail_unknown_token_404(self):
        self.client.force_authenticate(self.customer)
        r = self.client.get('/api/webstore/my/conversations/not-a-real-token/')
        self.assertEqual(r.status_code, 404)

    def test_soft_delete_hides_from_customer_keeps_for_staff(self):
        conv = open_inquiry(
            listing=self.listing,
            name='Inbox',
            email=self.customer.email,
            body='Please delete me later',
            verified=True,
        )
        self.client.force_authenticate(self.customer)
        deleted = self.client.post(
            f'/api/webstore/my/conversations/{conv.public_token}/delete/',
        )
        self.assertEqual(deleted.status_code, 200)

        listed = self.client.get('/api/webstore/my/conversations/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json(), [])

        detail = self.client.get(
            f'/api/webstore/my/conversations/{conv.public_token}/',
        )
        self.assertEqual(detail.status_code, 404)

        conv.refresh_from_db()
        self.assertIsNotNone(conv.customer_deleted_at)
        self.assertEqual(conv.customer_unread, 0)
        # Row is still there for staff - soft delete only.
        self.assertTrue(Conversation.objects.filter(pk=conv.pk).exists())
        staff = self.client
        staff.force_authenticate(self.manager)
        staff_list = staff.get('/api/webstore/conversations/')
        self.assertEqual(staff_list.status_code, 200)
        tokens = [row['public_token'] for row in staff_list.json()['results']]
        self.assertIn(conv.public_token, tokens)

    def test_mark_unread_and_staff_reply_resurfaces_deleted(self):
        conv = open_inquiry(
            listing=self.listing,
            name='Inbox',
            email=self.customer.email,
            body='Mark me unread',
            verified=True,
        )
        self.client.force_authenticate(self.customer)
        # Opening path marks read via public thread endpoint; start from unread=0.
        conv.customer_unread = 0
        conv.save(update_fields=['customer_unread'])

        unread = self.client.post(
            f'/api/webstore/my/conversations/{conv.public_token}/unread/',
        )
        self.assertEqual(unread.status_code, 200)
        self.assertEqual(unread.json()['customer_unread'], 1)
        conv.refresh_from_db()
        self.assertEqual(conv.customer_unread, 1)

        self.client.post(f'/api/webstore/my/conversations/{conv.public_token}/delete/')
        conv.refresh_from_db()
        self.assertIsNotNone(conv.customer_deleted_at)

        post_message(conv, author_kind='staff', body='Still here from the store.')
        conv.refresh_from_db()
        self.assertIsNone(conv.customer_deleted_at)
        self.assertGreaterEqual(conv.customer_unread, 1)

        listed = self.client.get('/api/webstore/my/conversations/')
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]['public_token'], conv.public_token)

