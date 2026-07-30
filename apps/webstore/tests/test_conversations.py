"""Messages / Conversation API and service tests."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Conversation, Message, Reservation, WebListing, WebListingImage
from apps.webstore.services.reservations import confirm_reservation, create_hold, release_reservation


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='msg-mgr@example.com',
        first_name='Msg',
        last_name='Mgr',
        password='test-pass-123',
    )
    user.groups.add(group)
    return user


def _listing(slug='msg-lamp'):
    listing = WebListing.objects.create(
        title='Message Lamp',
        slug=slug,
        price=Decimal('40.00'),
        on_hand=2,
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


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class ConversationServiceTests(TestCase):
    def test_create_hold_opens_thread_with_note(self):
        listing = _listing()
        res = create_hold(
            listing=listing,
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
            customer_note='Can I pick up Saturday?',
        )
        conv = Conversation.objects.get(reservation=res)
        self.assertEqual(conv.guest_email, 'ada@example.com')
        self.assertEqual(conv.state, 'needs_reply')
        self.assertEqual(conv.staff_unread, 1)
        self.assertEqual(conv.messages.count(), 1)
        self.assertEqual(conv.messages.first().body, 'Can I pick up Saturday?')

    def test_confirm_emits_system_message(self):
        listing = _listing('sys-lamp')
        res = create_hold(
            listing=listing, quantity=1, customer_name='B', email='b@example.com',
        )
        confirm_reservation(res)
        conv = Conversation.objects.get(reservation=res)
        kinds = list(conv.messages.values_list('author_kind', flat=True))
        self.assertIn('system', kinds)
        self.assertTrue(any('confirmed' in m.body.lower() for m in conv.messages.filter(author_kind='system')))

    def test_release_emits_system_message(self):
        listing = _listing('rel-lamp')
        res = create_hold(
            listing=listing, quantity=1, customer_name='C', email='c@example.com',
        )
        release_reservation(res, 'declined')
        conv = Conversation.objects.get(reservation=res)
        self.assertTrue(any('declined' in m.body.lower() for m in conv.messages.filter(author_kind='system')))


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class ConversationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.listing = _listing('api-lamp')
        self.manager = _manager()

    def test_hold_status_includes_thread(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
            customer_note='Hello',
        )
        r = self.client.get(f'/api/webstore/holds/{res.status_token}/')
        self.assertEqual(r.status_code, 200)
        thread = r.json().get('thread')
        self.assertIsNotNone(thread)
        self.assertEqual(thread['public_token'], res.conversation.public_token)
        self.assertEqual(len(thread['messages']), 1)
        # Public payload must not leak guest email
        self.assertNotIn('guest_email', r.json())
        self.assertNotIn('email', r.json())

    def test_guest_can_reply_on_thread_token(self):
        res = create_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='ada@example.com',
        )
        token = res.conversation.public_token
        r = self.client.post(
            f'/api/webstore/threads/{token}/messages/',
            {'body': 'Thanks!'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(
            Message.objects.filter(conversation=res.conversation, author_kind='customer').count(),
            1,
        )
        self.assertTrue(
            Message.objects.filter(
                conversation=res.conversation, author_kind='customer', body='Thanks!',
            ).exists(),
        )
        self.assertEqual(r.json()['state'], 'needs_reply')

    def test_ask_about_item_opens_inquiry(self):
        r = self.client.post(
            f'/api/webstore/catalog/{self.listing.slug}/ask/',
            {
                'name': 'Guest',
                'email': 'guest@example.com',
                'body': 'Is this still available?',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json().get('public_token'))
        conv = Conversation.objects.get(public_token=r.json()['public_token'])
        self.assertIsNone(conv.reservation_id)
        self.assertEqual(conv.listing_id, self.listing.id)

    def test_ask_disabled_returns_410(self):
        with override_settings(ONLINE_SALES_INQUIRIES_ENABLED=False):
            r = self.client.post(
                f'/api/webstore/catalog/{self.listing.slug}/ask/',
                {'name': 'G', 'email': 'g@example.com', 'body': 'Hi'},
                format='json',
            )
        self.assertEqual(r.status_code, 410)

    def test_staff_list_reply_assign_resolve(self):
        res = create_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='ada@example.com',
            customer_note='Need help',
        )
        self.client.force_authenticate(self.manager)
        r = self.client.get('/api/webstore/conversations/?state=needs_reply')
        self.assertEqual(r.status_code, 200)
        results = r.json().get('results') or r.json()
        if isinstance(results, dict):
            results = results.get('results', [])
        # Unpaginated list may be a bare list
        if isinstance(r.json(), list):
            results = r.json()
        else:
            results = r.json().get('results', r.json())
        self.assertGreaterEqual(len(results), 1)
        conv_id = res.conversation.id

        reply = self.client.post(
            f'/api/webstore/conversations/{conv_id}/reply/',
            {'body': 'We can hold it until Tuesday.'},
            format='json',
        )
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.json()['state'], 'waiting_on_customer')

        assigned = self.client.post(f'/api/webstore/conversations/{conv_id}/assign/')
        self.assertEqual(assigned.status_code, 200)
        self.assertEqual(assigned.json()['staff_owner'], self.manager.id)

        resolved = self.client.post(f'/api/webstore/conversations/{conv_id}/resolve/')
        self.assertEqual(resolved.status_code, 200)
        self.assertEqual(resolved.json()['state'], 'resolved')

        reopened = self.client.post(f'/api/webstore/conversations/{conv_id}/reopen/')
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()['state'], 'needs_reply')

    def test_anonymous_cannot_list_conversations(self):
        r = self.client.get('/api/webstore/conversations/')
        self.assertIn(r.status_code, (401, 403))
