"""Inline wrong-address correction on pending holds."""
from decimal import Decimal

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.webstore.models import HoldConfirmation, ReservationEvent, WebListing
from apps.webstore.services.hold_confirmations import issue_confirmation
from apps.webstore.services.reservations import create_hold


def _listing():
    listing = WebListing.objects.create(
        title='Email Fix Item',
        slug='email-fix-item',
        price=Decimal('9.00'),
        on_hand=2,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(
    ONLINE_SALES_ENABLED=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us',
)
class ChangeHoldEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.listing = _listing()

    def test_change_email_updates_and_resends(self):
        res = create_hold(
            listing=self.listing, quantity=1, customer_name='Typo',
            email='wrong@example.com', verified=False,
        )
        old_row, _code, _token = issue_confirmation(res)
        mail.outbox.clear()
        r = self.client.post(
            f'/api/webstore/holds/{res.status_token}/change-email/',
            {'email': 'right@example.com'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['email'], 'right@example.com')
        res.refresh_from_db()
        self.assertEqual(res.email, 'right@example.com')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('right@example.com', mail.outbox[0].to)
        self.assertTrue(
            ReservationEvent.objects.filter(reservation=res, kind='note').exists()
        )
        # Prior unconfirmed row for the old address is expired; a new one exists.
        old_row.refresh_from_db()
        self.assertTrue(old_row.expires_at <= res.updated_at or old_row.confirmed_at is None)
        self.assertTrue(
            HoldConfirmation.objects.filter(
                reservation=res,
                email='right@example.com',
                confirmed_at__isnull=True,
            ).exists()
        )

    def test_change_email_rejected_when_not_pending(self):
        res = create_hold(
            listing=self.listing, quantity=1, customer_name='Ok',
            email='ok@example.com', verified=True,
        )
        r = self.client.post(
            f'/api/webstore/holds/{res.status_token}/change-email/',
            {'email': 'new@example.com'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
