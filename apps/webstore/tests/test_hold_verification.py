"""Verified-email gate for holds and questions."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.accounts.services.magic_link import consume_magic_link
from apps.core.models import S3File
from apps.inventory.models import Item, Product
from apps.webstore.models import (
    Conversation,
    HoldConfirmation,
    Reservation,
    WebListing,
    WebListingImage,
)
from apps.webstore.services.reservations import (
    active_holds_for_item,
    confirm_reservation,
    create_hold,
    expire_due_reservations,
)
from apps.webstore.tests.helpers import make_verified_hold
from rest_framework.exceptions import ValidationError


def _listing(slug='verify-lamp', on_hand=2, **kwargs):
    defaults = dict(
        title='Verify Lamp',
        slug=slug,
        price=Decimal('30.00'),
        on_hand=on_hand,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    defaults.update(kwargs)
    listing = WebListing.objects.create(**defaults)
    s3 = S3File.objects.create(
        key=f'test/{listing.id}.jpg', filename='t.jpg', size=10, content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='vh-mgr@example.com', first_name='V', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(
    ONLINE_SALES_ENABLED=True,
    ONLINE_SALES_INQUIRIES_ENABLED=True,
    ONLINE_SALES_ACCOUNTS_ENABLED=True,
    ONLINE_SALES_VERIFY_MINUTES=30,
    ONLINE_SALES_INQUIRY_VERIFY_HOURS=24,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEBUG=True,
)
class HoldVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Group.objects.get_or_create(name='Customer')
        self.mgr = _manager()
        self.listing = _listing()

    def test_guest_hold_pending_reserves_stock_hidden_from_staff_sends_mail(self):
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'Guest',
                'email': 'guest-hold@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['status'], 'pending_verification')
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.reserved, 1)
        self.assertIsNone(r.json().get('thread'))

        self.client.force_authenticate(self.mgr)
        staff = self.client.get('/api/webstore/reservations/')
        self.assertEqual(staff.status_code, 200)
        results = staff.json().get('results', staff.json())
        # Pending holds are visible - stock is already reserved on the listing.
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['status'], 'pending_verification')
        self.assertEqual(results[0]['email'], 'guest-hold@example.com')

        res = Reservation.objects.get(status_token=r.json()['status_token'])
        self.assertTrue(
            HoldConfirmation.objects.filter(reservation=res).exists()
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('keep your hold', mail.outbox[0].subject.lower())
        self.assertRegex(mail.outbox[0].body, r'\b\d{6}\b')

    def test_verify_promotes_stamps_verified(self):
        from apps.webstore.services.hold_confirmations import issue_confirmation

        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'Pat Customer',
                'email': 'pat@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        res = Reservation.objects.get(status_token=r.json()['status_token'])
        # Hold create already issued a confirmation - force a re-issue after
        # clearing the cooldown window so we know the plaintext code.
        HoldConfirmation.objects.filter(reservation=res).update(
            created_at=timezone.now() - timedelta(seconds=61),
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        _row, code, _token = issue_confirmation(res)
        confirm = self.client.post(
            f'/api/webstore/holds/{res.status_token}/confirm/',
            {'code': code},
            format='json',
        )
        self.assertEqual(confirm.status_code, 200, confirm.content)
        res.refresh_from_db()
        self.assertEqual(res.status, 'requested')
        self.assertIsNotNone(res.expires_at)
        user = User.objects.get(email='pat@example.com')
        self.assertEqual(user.first_name, 'Pat')
        profile = CustomerProfile.objects.get(user=user)
        self.assertIsNotNone(profile.email_verified_at)

        self.client.force_authenticate(self.mgr)
        staff = self.client.get('/api/webstore/reservations/')
        results = staff.json().get('results', staff.json())
        self.assertEqual(len(results), 1)

    def test_legacy_magic_link_still_verifies_in_flight_emails(self):
        """In-flight PURPOSE_VERIFY_HOLD magic links remain consumable."""
        from apps.accounts.services.magic_link import issue_magic_link

        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'Legacy',
                'email': 'legacy@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        row = issue_magic_link(
            email='legacy@example.com',
            purpose=MagicLinkToken.PURPOSE_VERIFY_HOLD,
            hold_token=r.json()['status_token'],
        )
        result = consume_magic_link(token=row.token)
        res = Reservation.objects.get(status_token=r.json()['status_token'])
        self.assertEqual(res.status, 'requested')
        self.assertEqual(result.redirect_to, f'/hold/{res.status_token}')

    def test_lapsed_pending_releases_by_command_and_opportunistically(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Late',
            email='late@example.com',
            verified=False,
        )
        Reservation.objects.filter(pk=res.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.reserved, 1)

        released = expire_due_reservations()
        self.assertEqual(released, 1)
        res.refresh_from_db()
        self.assertEqual(res.status, 'expired')
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.reserved, 0)

        # Opportunistic: create_hold clears lapsed pending before availability check.
        listing2 = _listing(slug='opp-lamp', on_hand=1)
        pending = create_hold(
            listing=listing2,
            quantity=1,
            customer_name='Opp',
            email='opp@example.com',
            verified=False,
        )
        Reservation.objects.filter(pk=pending.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        next_hold = create_hold(
            listing=listing2,
            quantity=1,
            customer_name='Next',
            email='next@example.com',
            verified=True,
        )
        self.assertEqual(next_hold.status, 'requested')
        pending.refresh_from_db()
        self.assertEqual(pending.status, 'expired')

    def test_verified_signed_in_skips_email_unverified_does_not(self):
        Group.objects.get_or_create(name='Customer')
        verified = User.objects.create_user(
            email='verified@example.com', first_name='V', last_name='C', password='secret1',
        )
        verified.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=verified,
            customer_number=CustomerProfile.generate_customer_number(),
            email_verified_at=timezone.now(),
        )
        self.client.force_authenticate(verified)
        mail.outbox.clear()
        ok = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'V C',
                'email': 'verified@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.json()['status'], 'requested')
        self.assertEqual(len(mail.outbox), 0)

        unverified = User.objects.create_user(
            email='unverified@example.com', first_name='U', last_name='C', password='secret1',
        )
        unverified.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=unverified,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        listing2 = _listing(slug='unv-lamp')
        self.client.force_authenticate(unverified)
        mail.outbox.clear()
        pending = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'U C',
                'email': 'unverified@example.com',
                'slug': listing2.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(pending.status_code, 201)
        self.assertEqual(pending.json()['status'], 'pending_verification')
        self.assertEqual(len(mail.outbox), 1)

    def test_confirm_refuses_pending_pos_guard_still_blocks(self):
        product = Product.objects.create(title='Held Item')
        item = Item.objects.create(
            sku='VH-1',
            product=product,
            price=Decimal('10.00'),
            status='on_shelf',
        )
        listing = _listing(slug='pos-lamp', on_hand=1, item=item, sku='VH-1')
        res = create_hold(
            listing=listing,
            quantity=1,
            customer_name='P',
            email='p@example.com',
            verified=False,
        )
        with self.assertRaises(ValidationError):
            confirm_reservation(res)
        self.assertTrue(active_holds_for_item(item.id).filter(pk=res.pk).exists())

    def test_resend_verification(self):
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'R',
                'email': 'resend@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        token = r.json()['status_token']
        # Immediate resend is rate-limited to one per 60s per hold.
        cool = self.client.post(
            f'/api/webstore/holds/{token}/resend-verification/',
            {},
            format='json',
        )
        self.assertEqual(cool.status_code, 429)
        HoldConfirmation.objects.filter(reservation__status_token=token).update(
            created_at=timezone.now() - timedelta(seconds=61),
        )
        mail.outbox.clear()
        again = self.client.post(
            f'/api/webstore/holds/{token}/resend-verification/',
            {},
            format='json',
        )
        self.assertEqual(again.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)

    def test_unverified_question_invisible_then_appears(self):
        ask = self.client.post(
            f'/api/webstore/catalog/{self.listing.slug}/ask/',
            {'name': 'Q', 'email': 'q@example.com', 'body': 'Still available?'},
            format='json',
        )
        self.assertEqual(ask.status_code, 201)
        self.assertTrue(ask.json()['needs_verification'])
        conv = Conversation.objects.get(public_token=ask.json()['public_token'])
        self.assertEqual(conv.state, 'pending_verification')
        self.assertEqual(conv.staff_unread, 0)

        self.client.force_authenticate(self.mgr)
        empty = self.client.get('/api/webstore/conversations/')
        self.assertEqual(empty.json().get('count', len(empty.json().get('results', []))), 0)

        tok = MagicLinkToken.objects.get(
            email='q@example.com', purpose=MagicLinkToken.PURPOSE_VERIFY_THREAD,
        ).token
        consume_magic_link(token=tok)
        conv.refresh_from_db()
        self.assertEqual(conv.state, 'needs_reply')
        self.assertGreaterEqual(conv.staff_unread, 1)
        visible = self.client.get('/api/webstore/conversations/')
        self.assertGreaterEqual(
            visible.json().get('count', len(visible.json().get('results', []))),
            1,
        )

    def test_expire_command_sweeps_pending_and_inquiries(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Sweep',
            email='sweep@example.com',
            verified=False,
        )
        Reservation.objects.filter(pk=res.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        ask = self.client.post(
            f'/api/webstore/catalog/{self.listing.slug}/ask/',
            {'name': 'Old', 'email': 'oldq@example.com', 'body': 'Hi'},
            format='json',
        )
        Conversation.objects.filter(public_token=ask.json()['public_token']).update(
            created_at=timezone.now() - timedelta(hours=25),
        )
        call_command('expire_online_holds')
        res.refresh_from_db()
        self.assertEqual(res.status, 'expired')
        self.assertFalse(
            Conversation.objects.filter(guest_email='oldq@example.com').exists()
        )

    def test_verify_hold_works_when_accounts_disabled(self):
        from apps.webstore.services.hold_confirmations import issue_confirmation

        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'Kill',
                'email': 'killswitch@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        res = Reservation.objects.get(status_token=r.json()['status_token'])
        HoldConfirmation.objects.filter(reservation=res).update(
            created_at=timezone.now() - timedelta(seconds=61),
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        _row, code, _token = issue_confirmation(res)
        with override_settings(ONLINE_SALES_ACCOUNTS_ENABLED=False):
            confirm = self.client.post(
                f'/api/webstore/holds/{res.status_token}/confirm/',
                {'code': code},
                format='json',
            )
        self.assertEqual(confirm.status_code, 200)
        self.assertEqual(
            Reservation.objects.get(status_token=r.json()['status_token']).status,
            'requested',
        )

    def test_make_verified_hold_helper(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Helper',
            email='helper@example.com',
        )
        self.assertEqual(res.status, 'requested')
