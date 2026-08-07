"""Customer magic-link account tests."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import MagicLinkToken, User
from apps.accounts.permissions import IsCustomer, IsStaff
from apps.core.models import S3File
from apps.webstore.models import Conversation, WebListing, WebListingImage
from apps.webstore.services.conversations import open_inquiry
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='ml-lamp'):
    listing = WebListing.objects.create(
        title='Magic Lamp',
        slug=slug,
        price=Decimal('18.00'),
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


@override_settings(
    ONLINE_SALES_ACCOUNTS_ENABLED=True,
    ONLINE_SALES_ENABLED=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEBUG=False,
)
class MagicLinkTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Group.objects.get_or_create(name='Customer')
        Group.objects.get_or_create(name='Manager')

    def test_customer_role_lowest_priority(self):
        user = User.objects.create_user(
            email='cust@example.com', first_name='C', last_name='U', password='x',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        self.assertEqual(user.role, 'Customer')
        self.assertEqual(user.roles, ['Customer'])
        self.assertTrue(IsCustomer().has_permission(
            type('R', (), {'user': user})(), None,
        ))
        self.assertFalse(IsStaff().has_permission(
            type('R', (), {'user': user})(), None,
        ))

    def test_request_never_echoes_token_when_debug_false(self):
        r = self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'new@example.com'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('token', r.json())
        self.assertNotIn('debug_token', r.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('sign in', mail.outbox[0].body.lower())
        self.assertTrue(MagicLinkToken.objects.filter(email='new@example.com').exists())

    def test_consume_single_use_and_issues_jwt(self):
        self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'once@example.com'},
            format='json',
        )
        tok = MagicLinkToken.objects.get(email='once@example.com').token
        r = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.json())
        self.assertEqual(r.json()['user']['role'], 'Customer')
        self.assertNotIn(tok, str(r.json()))

        again = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_expired_token_rejected(self):
        row = MagicLinkToken.objects.create(
            email='exp@example.com',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        r = self.client.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_claims_guest_conversation(self):
        listing = _listing()
        open_inquiry(
            listing=listing,
            name='Guest',
            email='claim@example.com',
            body='Hello?',
        )
        make_verified_hold(
            listing=listing,
            quantity=1,
            customer_name='Guest',
            email='claim@example.com',
        )
        self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'claim@example.com'},
            format='json',
        )
        tok = MagicLinkToken.objects.filter(email='claim@example.com').order_by('-id').first().token
        r = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.assertEqual(r.status_code, 200)
        user = User.objects.get(email='claim@example.com')
        self.assertTrue(Conversation.objects.filter(customer=user).exists())

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
        mine = self.client.get('/api/webstore/my/conversations/')
        self.assertEqual(mine.status_code, 200)
        self.assertGreaterEqual(len(mine.json()), 1)

    def test_customer_cannot_list_staff_conversations(self):
        self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'nosnoop@example.com'},
            format='json',
        )
        tok = MagicLinkToken.objects.get(email='nosnoop@example.com').token
        r = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
        forbidden = self.client.get('/api/webstore/conversations/')
        self.assertIn(forbidden.status_code, (403, 401))

    def test_customer_cannot_see_other_email_holds(self):
        listing = _listing('iso-lamp')
        make_verified_hold(
            listing=listing, quantity=1, customer_name='Other', email='other@example.com',
        )
        self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'me@example.com'},
            format='json',
        )
        tok = MagicLinkToken.objects.get(email='me@example.com').token
        r = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
        mine = self.client.get('/api/webstore/my/holds/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.json()), 0)

    def test_staff_email_cannot_use_magic_link(self):
        mgr = User.objects.create_user(
            email='mgr@example.com', first_name='M', last_name='G', password='x',
        )
        mgr.groups.add(Group.objects.get(name='Manager'))
        self.client.post(
            '/api/auth/magic-link/request/',
            {'email': 'mgr@example.com'},
            format='json',
        )
        tok = MagicLinkToken.objects.filter(email='mgr@example.com').order_by('-id').first().token
        r = self.client.post('/api/auth/magic-link/consume/', {'token': tok}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_accounts_disabled_410(self):
        with override_settings(ONLINE_SALES_ACCOUNTS_ENABLED=False):
            r = self.client.post(
                '/api/auth/magic-link/request/',
                {'email': 'x@example.com'},
                format='json',
            )
        self.assertEqual(r.status_code, 410)

    def test_verify_hold_used_token_already_verified(self):
        from apps.webstore.services.reservations import create_hold
        from apps.accounts.services.magic_link import issue_magic_link

        listing = _listing('used-hold')
        hold = create_hold(
            listing=listing, quantity=1, customer_name='U', email='usedhold@example.com',
            verified=False,
        )
        row = issue_magic_link(
            email=hold.email,
            purpose=MagicLinkToken.PURPOSE_VERIFY_HOLD,
            hold_token=hold.status_token,
        )
        first = self.client.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertIn('access', first.json())

        again = self.client.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(again.status_code, 200)
        body = again.json()
        self.assertEqual(body['code'], 'ALREADY_VERIFIED')
        self.assertNotIn('access', body)
        self.assertIn(f'/hold/{hold.status_token}', body['redirect_to'])

    def test_verify_hold_expired_token_refreshes_link(self):
        from apps.webstore.models import HoldConfirmation
        from apps.webstore.services.reservations import create_hold
        from apps.accounts.services.magic_link import issue_magic_link

        listing = _listing('exp-hold')
        hold = create_hold(
            listing=listing, quantity=1, customer_name='E', email='exphold@example.com',
            verified=False,
        )
        row = issue_magic_link(
            email=hold.email,
            purpose=MagicLinkToken.PURPOSE_VERIFY_HOLD,
            hold_token=hold.status_token,
        )
        MagicLinkToken.objects.filter(pk=row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        mail.outbox.clear()
        r = self.client.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body['code'], 'LINK_REFRESHED')
        self.assertNotIn('access', body)
        self.assertIn('relinked=1', body['redirect_to'])
        # Refresh now mints a HoldConfirmation (code + prefetch-safe link).
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(
            HoldConfirmation.objects.filter(reservation=hold).exists()
        )
        self.assertIn('/api/webstore/holds/confirm/', mail.outbox[0].body)
