"""Ready / released hold emails."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import WebListing, WebListingImage
from apps.webstore.services.reservations import (
    confirm_reservation,
    release_reservation,
    stage_reservation,
)
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='ready-email-lamp'):
    listing = WebListing.objects.create(
        title='Ready Email Lamp',
        slug=slug,
        price=Decimal('25.00'),
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


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='ready-mgr@example.com', first_name='R', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    ONLINE_SALES_EMAIL_FROM='retail@ecothrift.us',
    ONLINE_SALES_EMAIL_DISPLAY_NAME='Eco-Thrift',
    ONLINE_SALES_EMAIL_REPLY_TO='retail@ecothrift.us',
    ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us',
    ONLINE_SALES_ENABLED=True,
)
class HoldLifecycleEmailTests(TestCase):
    def setUp(self):
        self.mgr = _manager()

    def test_stage_sends_ready_email(self):
        res = make_verified_hold(
            listing=_listing(),
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
        )
        confirm_reservation(res, user=self.mgr)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            stage_reservation(res, user=self.mgr)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('bagged', msg.subject.lower())
        self.assertIn('bagged', msg.body.lower())
        self.assertIn('/hold/', msg.body)
        self.assertTrue(res.pickup_code)
        self.assertIn(res.pickup_code, msg.body)

    def test_decline_sends_released_email_with_reason(self):
        res = make_verified_hold(
            listing=_listing('decl-email'),
            quantity=1,
            customer_name='Bill',
            email='bill@example.com',
        )
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            release_reservation(
                res, 'declined', user=self.mgr, reason='Item sold on the floor',
            )
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('declined', msg.subject.lower())
        self.assertIn('Item sold on the floor', msg.body)
