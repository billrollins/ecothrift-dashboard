"""Reopening a released hold: availability guard, note requirement, customer view."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Reservation, WebListing, WebListingImage
from apps.webstore.services import hold_status
from apps.webstore.services.reservations import (
    complete_reservation,
    release_reservation,
    reopen_reservation,
    stage_reservation,
)
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='reopen-lamp', on_hand=1):
    listing = WebListing.objects.create(
        title='Reopen Lamp',
        slug=slug,
        price=Decimal('30.00'),
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


def _manager(email='reopen-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email, first_name='R', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us',
    ONLINE_SALES_ENABLED=True,
)
class ReopenReservationTests(TestCase):
    def setUp(self):
        self.mgr = _manager()

    def _cancelled_hold(self, listing=None, **kwargs):
        res = make_verified_hold(
            listing=listing or _listing(**kwargs),
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
        )
        release_reservation(res, 'cancelled', user=self.mgr, reason='Item needs cleaning')
        return res

    def test_reopen_restores_approved_and_rereserves_stock(self):
        res = self._cancelled_hold()
        listing = res.listing
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)

        reopened = reopen_reservation(res, user=self.mgr, note='Cleaned and back on hold')

        self.assertEqual(reopened.status, 'confirmed')
        self.assertEqual(reopened.release_reason, '')
        self.assertIsNotNone(reopened.expires_at)
        self.assertIsNone(reopened.staged_at)
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 1)

    def test_reopen_lands_on_approved_not_ready(self):
        """Staff must physically pull the item again, so Ready is not restored."""
        res = make_verified_hold(
            listing=_listing('reopen-was-ready'),
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
        )
        stage_reservation(res, user=self.mgr)
        release_reservation(res, 'expired', user=self.mgr, reason='No-show')

        reopened = reopen_reservation(res, user=self.mgr, note='Customer called back')

        self.assertEqual(reopened.status, 'confirmed')
        self.assertIsNone(reopened.staged_by_id)

    def test_reopen_requires_a_note(self):
        res = self._cancelled_hold()
        with self.assertRaises(ValidationError):
            reopen_reservation(res, user=self.mgr, note='   ')

    def test_reopen_blocked_when_the_only_unit_sold(self):
        """Selling the last unit marks the listing sold, so reopen is refused."""
        listing = _listing('reopen-sold-out', on_hand=1)
        res = self._cancelled_hold(listing=listing)

        other = make_verified_hold(
            listing=listing, quantity=1, customer_name='Bo', email='bo@example.com',
        )
        complete_reservation(other, user=self.mgr)

        with self.assertRaises(ValidationError) as ctx:
            reopen_reservation(res, user=self.mgr, note='Trying anyway')
        self.assertIn('sold', str(ctx.exception).lower())

        res.refresh_from_db()
        self.assertEqual(res.status, 'cancelled')

    def test_reopen_blocked_when_not_enough_left(self):
        """Listing is still published but short of what this hold needs."""
        listing = _listing('reopen-partial', on_hand=2)
        res = make_verified_hold(
            listing=listing, quantity=2, customer_name='Ada', email='ada@example.com',
        )
        release_reservation(res, 'cancelled', user=self.mgr, reason='Changed mind')

        other = make_verified_hold(
            listing=listing, quantity=1, customer_name='Bo', email='bo@example.com',
        )
        complete_reservation(other, user=self.mgr)
        listing.refresh_from_db()
        self.assertEqual(listing.status, 'published')
        self.assertEqual(listing.available, 1)

        with self.assertRaises(ValidationError) as ctx:
            reopen_reservation(res, user=self.mgr, note='Trying anyway')
        message = str(ctx.exception).lower()
        self.assertIn('only 1 available', message)
        self.assertIn('needs 2', message)

        res.refresh_from_db()
        self.assertEqual(res.status, 'cancelled')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)

    def test_reopen_blocked_when_listing_unpublished(self):
        listing = _listing('reopen-paused')
        res = self._cancelled_hold(listing=listing)
        listing.status = 'paused'
        listing.save(update_fields=['status'])

        with self.assertRaises(ValidationError) as ctx:
            reopen_reservation(res, user=self.mgr, note='Trying anyway')
        self.assertIn('republish', str(ctx.exception).lower())

    def test_completed_sale_cannot_be_reopened(self):
        res = make_verified_hold(
            listing=_listing('reopen-completed'),
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
        )
        complete_reservation(res, user=self.mgr)
        with self.assertRaises(ValidationError) as ctx:
            reopen_reservation(res, user=self.mgr, note='Undo the sale')
        self.assertIn('completed', str(ctx.exception).lower())

    def test_reopen_emails_customer_and_posts_system_message(self):
        res = self._cancelled_hold(slug='reopen-email')
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            reopen_reservation(res, user=self.mgr, note='Back on hold')

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('reopened', mail.outbox[0].subject.lower())
        self.assertIn('active again', mail.outbox[0].body.lower())

        res.refresh_from_db()
        bodies = [m.body for m in res.conversation.messages.filter(author_kind='system')]
        self.assertTrue(any('active again' in b for b in bodies))

    def test_reopen_note_never_reaches_the_customer(self):
        res = self._cancelled_hold(slug='reopen-privacy')
        secret = 'INTERNAL: comped for a Google review'
        reopen_reservation(res, user=self.mgr, note=secret)

        res.refresh_from_db()
        timeline = hold_status.public_timeline(res)
        keys = [row['key'] for row in timeline]
        self.assertIn('reopened', keys)
        self.assertNotIn(secret, str(timeline))

        labels = {row['key']: row['label'] for row in timeline}
        self.assertEqual(labels['reopened'], 'Hold reopened')

        view = hold_status.customer_view(res)
        self.assertEqual(view['customer_status'], 'Confirmed')
        self.assertTrue(view['can_pickup'])
        self.assertNotIn(secret, str(view))


@override_settings(ONLINE_SALES_ENABLED=True)
class ReopenEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('reopen-api-mgr@example.com')
        self.res = make_verified_hold(
            listing=_listing('reopen-api'),
            quantity=1,
            customer_name='Ada',
            email='ada@example.com',
        )
        release_reservation(self.res, 'declined', user=self.mgr, reason='Wrong size')

    def test_reopen_requires_note(self):
        self.client.force_authenticate(self.mgr)
        r = self.client.post(f'/api/webstore/reservations/{self.res.id}/reopen/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.res.refresh_from_db()
        self.assertEqual(self.res.status, 'declined')

    def test_reopen_with_note_succeeds_and_records_event(self):
        self.client.force_authenticate(self.mgr)
        r = self.client.post(
            f'/api/webstore/reservations/{self.res.id}/reopen/',
            {'note': 'Found the right size'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], 'confirmed')

        event = self.res.events.filter(kind='reopened').first()
        self.assertIsNotNone(event)
        self.assertEqual(event.actor_id, self.mgr.id)
        self.assertEqual(event.note, 'Found the right size')
        self.assertEqual(event.from_status, 'declined')
        self.assertEqual(event.to_status, 'confirmed')

    def test_reopen_is_staff_gated(self):
        r = self.client.post(
            f'/api/webstore/reservations/{self.res.id}/reopen/',
            {'note': 'Anonymous attempt'},
            format='json',
        )
        self.assertIn(r.status_code, (401, 403))
        self.res.refresh_from_db()
        self.assertEqual(self.res.status, 'declined')


class ReopenModelChoiceTests(TestCase):
    def test_reopened_is_a_valid_event_kind(self):
        kinds = dict(Reservation.events.rel.related_model.KIND_CHOICES)
        self.assertEqual(kinds['reopened'], 'Reopened')
