"""Hold confirmation - 6-digit code + prefetch-safe link token."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, User
from apps.webstore.models import HoldConfirmation, Reservation, WebListing
from apps.webstore.services.hold_confirmations import (
    MAX_ATTEMPTS,
    _digest,
    confirm_with_token,
    issue_confirmation,
)
from apps.webstore.services.hours import confirmed_expiry
from apps.webstore.services.reservations import create_hold, release_reservation


def _listing(slug='confirm-lamp', on_hand=2):
    listing = WebListing.objects.create(
        title='Confirm Lamp',
        slug=slug,
        price=Decimal('22.00'),
        on_hand=on_hand,
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
class HoldConfirmationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Group.objects.get_or_create(name='Customer')
        self.listing = _listing()

    def _pending(self, email='cust@example.com', **kwargs):
        return create_hold(
            listing=kwargs.pop('listing', self.listing),
            quantity=1,
            customer_name=kwargs.pop('customer_name', 'Cust'),
            email=email,
            verified=False,
            **kwargs,
        )

    def test_code_success_extends_and_sets_via(self):
        hold = self._pending()
        row, code, _token = issue_confirmation(hold)
        before = hold.expires_at
        r = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirm/',
            {'code': code},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        hold.refresh_from_db()
        row.refresh_from_db()
        self.assertEqual(hold.status, 'requested')
        self.assertEqual(row.confirmed_via, 'code')
        self.assertIsNotNone(row.confirmed_at)
        self.assertIsNotNone(r.json().get('held_until'))
        # Extended to confirmed_expiry window (strictly later than provisional).
        self.assertGreater(hold.expires_at, before)
        expected = confirmed_expiry()
        self.assertEqual(hold.expires_at, expected)
        user = User.objects.get(email='cust@example.com')
        self.assertIsNotNone(CustomerProfile.objects.get(user=user).email_verified_at)

    def test_mismatch_increments_attempts_before_compare(self):
        hold = self._pending(email='miss@example.com')
        row, _code, _token = issue_confirmation(hold)
        r = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirm/',
            {'code': '000000'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['attempts_remaining'], MAX_ATTEMPTS - 1)
        row.refresh_from_db()
        self.assertEqual(row.attempts, 1)
        self.assertIsNone(row.confirmed_at)

    def test_fifth_miss_locks_resend_clears(self):
        hold = self._pending(email='lock@example.com')
        row, _code, _token = issue_confirmation(hold)
        for i in range(MAX_ATTEMPTS):
            r = self.client.post(
                f'/api/webstore/holds/{hold.status_token}/confirm/',
                {'code': '111111'},
                format='json',
            )
            if i < MAX_ATTEMPTS - 1:
                self.assertEqual(r.status_code, 400)
            else:
                self.assertEqual(r.status_code, 429)
                self.assertTrue(r.json().get('locked'))
        # Further tries stay locked until resend.
        again = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirm/',
            {'code': '111111'},
            format='json',
        )
        self.assertEqual(again.status_code, 429)

        HoldConfirmation.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(seconds=61),
        )
        mail.outbox.clear()
        resend = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirmations/',
            {},
            format='json',
        )
        self.assertEqual(resend.status_code, 201, resend.content)
        self.assertEqual(resend.json()['attempts_remaining'], MAX_ATTEMPTS)
        self.assertEqual(len(mail.outbox), 1)

        new_row = HoldConfirmation.objects.filter(
            reservation=hold, confirmed_at__isnull=True,
        ).order_by('-created_at').first()
        self.assertIsNotNone(new_row)
        self.assertEqual(new_row.attempts, 0)
        self.assertNotEqual(new_row.pk, row.pk)

    def test_cooldown_returns_retry_after(self):
        hold = self._pending(email='cool@example.com')
        issue_confirmation(hold)
        r = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirmations/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 429)
        self.assertIn('retry_after_seconds', r.json())
        self.assertGreater(r.json()['retry_after_seconds'], 0)
        self.assertEqual(r['Retry-After'], str(r.json()['retry_after_seconds']))

    def test_link_get_twice_extends_once(self):
        hold = self._pending(email='link@example.com')
        _row, _code, token = issue_confirmation(hold)
        url = f'/api/webstore/holds/confirm/?t={token}'
        first = self.client.get(url)
        self.assertEqual(first.status_code, 302)
        self.assertIn(f'/hold/{hold.status_token}?confirmed=1', first['Location'])
        hold.refresh_from_db()
        self.assertEqual(hold.status, 'requested')
        expires = hold.expires_at

        second = self.client.get(url)
        self.assertEqual(second.status_code, 302)
        self.assertIn('confirmed=1', second['Location'])
        hold.refresh_from_db()
        self.assertEqual(hold.expires_at, expires)
        self.assertEqual(
            HoldConfirmation.objects.filter(reservation=hold, confirmed_via='link').count(),
            1,
        )

    def test_already_confirmed_link_still_succeeds(self):
        hold = self._pending(email='again@example.com')
        row, _code, token = issue_confirmation(hold)
        result = confirm_with_token(token)
        self.assertEqual(result.kind, 'success')
        again = confirm_with_token(token)
        self.assertEqual(again.kind, 'already_confirmed')
        r = self.client.get(f'/api/webstore/holds/confirm/?t={token}')
        self.assertEqual(r.status_code, 302)
        self.assertIn('confirmed=1', r['Location'])

    def test_expired_and_unknown_token_redirects(self):
        hold = self._pending(email='exp@example.com')
        row, _code, token = issue_confirmation(hold)
        HoldConfirmation.objects.filter(pk=row.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        expired = self.client.get(f'/api/webstore/holds/confirm/?t={token}')
        self.assertEqual(expired.status_code, 302)
        self.assertIn(f'/hold/{hold.status_token}?link=expired', expired['Location'])

        unknown = self.client.get('/api/webstore/holds/confirm/?t=' + ('ab' * 32))
        self.assertEqual(unknown.status_code, 302)
        self.assertTrue(unknown['Location'].endswith('/hold-link-expired'))

    def test_confirmation_status_shape(self):
        hold = self._pending(email='stat@example.com')
        r = self.client.get(
            f'/api/webstore/holds/{hold.status_token}/confirmation-status/',
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body['confirmed'])
        self.assertIsNotNone(body['held_until'])
        row, code, _t = issue_confirmation(hold)
        self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirm/',
            {'code': code},
            format='json',
        )
        hold.refresh_from_db()
        r2 = self.client.get(
            f'/api/webstore/holds/{hold.status_token}/confirmation-status/',
        )
        self.assertTrue(r2.json()['confirmed'])
        self.assertIsNotNone(r2.json()['held_until'])
        # Same instant as the hold expiry (timezone string form may vary).
        self.assertEqual(
            timezone.datetime.fromisoformat(r2.json()['held_until']),
            hold.expires_at,
        )

    def test_db_stores_neither_plaintext_code_nor_token(self):
        hold = self._pending(email='hash@example.com')
        row, code, token = issue_confirmation(hold)
        row.refresh_from_db()
        self.assertNotEqual(row.code_hash, code)
        self.assertNotEqual(row.token_hash, token)
        self.assertEqual(row.code_hash, _digest(code))
        self.assertEqual(row.token_hash, _digest(token))
        # Raw secrets must not appear as column values.
        dumped = list(
            HoldConfirmation.objects.filter(pk=row.pk).values('code_hash', 'token_hash')
        )[0]
        self.assertNotIn(code, dumped.values())
        self.assertNotIn(token, dumped.values())

    def test_released_hold_rejects_code(self):
        hold = self._pending(email='gone@example.com')
        _row, code, _token = issue_confirmation(hold)
        release_reservation(hold, 'expired', reason='Unconfirmed hold released')
        r = self.client.post(
            f'/api/webstore/holds/{hold.status_token}/confirm/',
            {'code': code},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('ended', r.json()['detail'].lower())

    def test_email_contains_code_and_confirm_link_not_magic_verify(self):
        hold = self._pending(email='mail@example.com')
        mail.outbox.clear()
        _row, code, token = issue_confirmation(hold)
        from apps.webstore.emails import send_hold_verification
        send_hold_verification(
            hold,
            confirm_link=f'https://ecothrift.us/api/webstore/holds/confirm/?t={token}',
            code=code,
        )
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        self.assertIn(code, body)
        self.assertIn('/api/webstore/holds/confirm/?t=', body)
        self.assertNotIn('/verify?token=', body)

    def test_create_on_hold_request_issues_confirmation(self):
        mail.outbox.clear()
        r = self.client.post(
            '/api/webstore/holds/',
            {
                'customer_name': 'G',
                'email': 'guest-conf@example.com',
                'slug': self.listing.slug,
                'quantity': 1,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        hold = Reservation.objects.get(status_token=r.json()['status_token'])
        self.assertTrue(
            HoldConfirmation.objects.filter(reservation=hold).exists()
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertRegex(mail.outbox[0].body, r'\b\d{6}\b')
