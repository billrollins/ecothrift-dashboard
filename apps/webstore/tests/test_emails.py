"""System email tests — mail.outbox + fail-soft behavior."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.emails import send_hold_confirmed, send_sign_in_link, send_you_have_a_reply
from apps.webstore.models import Conversation, WebListing, WebListingImage
from apps.webstore.services.conversations import open_inquiry, post_message
from apps.webstore.tests.helpers import make_verified_hold
from apps.webstore.services.reservations import confirm_reservation


def _listing(slug='email-lamp'):
    listing = WebListing.objects.create(
        title='Email Lamp',
        slug=slug,
        price=Decimal('22.00'),
        on_hand=1,
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
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    ONLINE_SALES_EMAIL_FROM='retail@ecothrift.us',
    ONLINE_SALES_EMAIL_DISPLAY_NAME='Eco-Thrift',
    ONLINE_SALES_EMAIL_REPLY_TO='retail@ecothrift.us',
    ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us',
)
class SystemEmailTests(TestCase):
    def test_sign_in_link_email(self):
        ok = send_sign_in_link(email='cust@example.com', magic_link='https://ecothrift.us/sign-in?t=abc')
        self.assertTrue(ok)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('sign-in', msg.subject.lower())
        self.assertIn('https://ecothrift.us/sign-in?t=abc', msg.body)
        self.assertEqual(msg.to, ['cust@example.com'])
        self.assertIn('retail@ecothrift.us', msg.from_email)

    def test_verify_hold_sends_hold_confirmed(self):
        from apps.webstore.services.reservations import create_hold, verify_hold

        listing = _listing()
        res = create_hold(
            listing=listing, quantity=1, customer_name='Ada', email='ada@example.com',
            verified=False,
        )
        mail.outbox.clear()
        # Email is scheduled with transaction.on_commit — execute callbacks here.
        with self.captureOnCommitCallbacks(execute=True):
            verify_hold(res)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('Ada', msg.body)
        self.assertIn('/hold/', msg.body)

    def test_staff_reply_sends_you_have_a_reply(self):
        listing = _listing('reply-lamp')
        conv = open_inquiry(
            listing=listing,
            name='Guest',
            email='guest@example.com',
            body='Still available?',
            verified=True,
        )
        mail.outbox.clear()
        group, _ = Group.objects.get_or_create(name='Manager')
        mgr = User.objects.create_user(
            email='em-mgr@example.com', first_name='E', last_name='M', password='x',
        )
        mgr.groups.add(group)
        client = APIClient()
        client.force_authenticate(mgr)
        r = client.post(
            f'/api/webstore/conversations/{conv.id}/reply/',
            {'body': 'Yes — come by tomorrow.'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('New reply', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['guest@example.com'])

    def test_mail_failure_does_not_block_confirm(self):
        listing = _listing('fail-lamp')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='B', email='b@example.com',
        )
        with patch('apps.webstore.emails.EmailMessage.send', side_effect=RuntimeError('smtp down')):
            confirmed = confirm_reservation(res)
        confirmed.refresh_from_db()
        self.assertEqual(confirmed.status, 'confirmed')

    def test_direct_helpers_use_retail_from(self):
        listing = _listing('direct-lamp')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='C', email='c@example.com',
        )
        res = confirm_reservation(res)
        # clear confirm mail then call helper again for assertion on headers
        mail.outbox.clear()
        send_hold_confirmed(res)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('retail@ecothrift.us', mail.outbox[0].from_email)
        self.assertEqual(mail.outbox[0].reply_to, ['retail@ecothrift.us'])

        conv = Conversation.objects.get(reservation=res)
        mail.outbox.clear()
        post_message(conv, author_kind='staff', body='Ready')
        send_you_have_a_reply(conv)
        self.assertEqual(len(mail.outbox), 1)
