"""Sales log filters, reservation detail payload, and ReservationEvent history."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Reservation, ReservationEvent, WebListing, WebListingImage
from apps.webstore.services.reservations import (
    complete_reservation,
    confirm_reservation,
    create_hold,
    record_event,
    release_reservation,
    stage_reservation,
    verify_hold,
)
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='sales-lamp', on_hand=3):
    listing = WebListing.objects.create(
        title='Sales Lamp',
        slug=slug,
        price=Decimal('40.00'),
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


def _manager(email='sales-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email, first_name='Sales', last_name='Mgr', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(ONLINE_SALES_ENABLED=True)
class ReservationEventTests(TestCase):
    def setUp(self):
        self.listing = _listing()
        self.mgr = _manager()

    def test_lifecycle_records_events_with_actors(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='A',
            email='a@example.com',
        )
        kinds = list(res.events.values_list('kind', flat=True))
        self.assertEqual(kinds, ['requested'])

        confirm_reservation(res, user=self.mgr)
        stage_reservation(res, user=self.mgr)
        complete_reservation(res, user=self.mgr, pos_cart=None)

        kinds = list(
            ReservationEvent.objects.filter(reservation=res)
            .order_by('created_at', 'id')
            .values_list('kind', flat=True)
        )
        self.assertEqual(kinds, ['requested', 'confirmed', 'staged', 'completed'])
        confirmed = ReservationEvent.objects.get(reservation=res, kind='confirmed')
        self.assertEqual(confirmed.actor_id, self.mgr.pk)
        self.assertEqual(confirmed.to_status, 'confirmed')

    def test_verify_and_release_events(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='P',
            email='p@example.com',
            verified=False,
        )
        self.assertEqual(res.events.get().to_status, 'pending_verification')
        verify_hold(res)
        self.assertTrue(res.events.filter(kind='verified', to_status='requested').exists())

        res2 = make_verified_hold(
            listing=_listing('rel-lamp'),
            quantity=1,
            customer_name='R',
            email='r@example.com',
        )
        release_reservation(res2, 'declined')
        terminal = ReservationEvent.objects.filter(reservation=res2, kind='declined').get()
        self.assertEqual(terminal.to_status, 'declined')

    def test_failing_event_write_does_not_roll_back_transition(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='F',
            email='f@example.com',
        )
        with patch(
            'apps.webstore.services.reservations.ReservationEvent.objects.create',
            side_effect=RuntimeError('db down'),
        ):
            confirm_reservation(res, user=self.mgr)
        res.refresh_from_db()
        self.assertEqual(res.status, 'confirmed')

    def test_record_event_helper_is_fail_soft(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='S',
            email='s@example.com',
        )
        with patch(
            'apps.webstore.services.reservations.ReservationEvent.objects.create',
            side_effect=RuntimeError('boom'),
        ):
            record_event(res, 'extended', actor=self.mgr)  # must not raise


@override_settings(ONLINE_SALES_ENABLED=True)
class SalesLogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('sl-api@example.com')
        self.listing = _listing('api-lamp')
        Group.objects.get_or_create(name='Customer')
        self.customer = User.objects.create_user(
            email='cust-sl@example.com', first_name='C', last_name='U', password='x',
        )
        self.customer.groups.add(Group.objects.get(name='Customer'))

        self.done = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='Bill',
            email='bill@example.com',
        )
        confirm_reservation(self.done, user=self.mgr)
        complete_reservation(self.done, user=self.mgr)
        Reservation.objects.filter(pk=self.done.pk).update(
            completed_at=timezone.now() - timedelta(days=2),
        )

        recent = make_verified_hold(
            listing=_listing('recent-lamp', on_hand=2),
            quantity=1,
            customer_name='Recent',
            email='recent@example.com',
        )
        confirm_reservation(recent, user=self.mgr)
        complete_reservation(recent, user=self.mgr)

    def test_sales_log_days_and_search(self):
        self.client.force_authenticate(self.mgr)
        all_rows = self.client.get('/api/webstore/sales-log/')
        self.assertEqual(all_rows.status_code, 200)
        self.assertGreaterEqual(len(all_rows.json()['results']), 2)

        today = self.client.get('/api/webstore/sales-log/', {'days': '0'})
        titles = [r['listing_title'] for r in today.json()['results']]
        self.assertIn('Sales Lamp', titles)  # recent-lamp title is also Sales Lamp from helper
        # The 2-day-old completion should be excluded from calendar today.
        ids = [r['id'] for r in today.json()['results']]
        self.assertNotIn(self.done.pk, ids)

        search = self.client.get('/api/webstore/sales-log/', {'search': 'bill@'})
        self.assertEqual(search.status_code, 200)
        self.assertTrue(any(r['email'] == 'bill@example.com' for r in search.json()['results']))

    def test_detail_action_manager_only(self):
        anon = self.client.get(f'/api/webstore/reservations/{self.done.pk}/detail/')
        self.assertIn(anon.status_code, (401, 403))

        self.client.force_authenticate(self.customer)
        forbidden = self.client.get(f'/api/webstore/reservations/{self.done.pk}/detail/')
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(self.mgr)
        ok = self.client.get(f'/api/webstore/reservations/{self.done.pk}/detail/')
        self.assertEqual(ok.status_code, 200)
        body = ok.json()
        self.assertEqual(body['reservation']['id'], self.done.pk)
        self.assertTrue(any(e['kind'] == 'completed' for e in body['events']))
        self.assertIn('thread', body)

    def test_extend_records_event(self):
        listing = _listing('ext-lamp')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='E', email='e@example.com',
        )
        confirm_reservation(res, user=self.mgr)
        self.client.force_authenticate(self.mgr)
        r = self.client.post(f'/api/webstore/reservations/{res.pk}/extend/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(
            ReservationEvent.objects.filter(reservation=res, kind='extended').exists()
        )

    def test_decline_requires_reason(self):
        listing = _listing('reason-lamp')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='R', email='reason@example.com',
        )
        self.client.force_authenticate(self.mgr)
        missing = self.client.post(f'/api/webstore/reservations/{res.pk}/decline/', {}, format='json')
        self.assertEqual(missing.status_code, 400)

        ok = self.client.post(
            f'/api/webstore/reservations/{res.pk}/decline/',
            {'reason': 'Damaged in transit'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)
        res.refresh_from_db()
        self.assertEqual(res.status, 'declined')
        self.assertEqual(res.release_reason, 'Damaged in transit')
        event = ReservationEvent.objects.get(reservation=res, kind='declined')
        self.assertEqual(event.note, 'Damaged in transit')
        self.assertEqual(event.actor_id, self.mgr.pk)

    def test_cancel_requires_reason(self):
        listing = _listing('cancel-reason')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='C', email='cancel@example.com',
        )
        confirm_reservation(res, user=self.mgr)
        self.client.force_authenticate(self.mgr)
        missing = self.client.post(f'/api/webstore/reservations/{res.pk}/cancel/', {}, format='json')
        self.assertEqual(missing.status_code, 400)
        ok = self.client.post(
            f'/api/webstore/reservations/{res.pk}/cancel/',
            {'reason': 'Customer asked to cancel'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)
        res.refresh_from_db()
        self.assertEqual(res.release_reason, 'Customer asked to cancel')

    def test_notes_endpoint_appends_and_is_manager_gated(self):
        listing = _listing('notes-lamp')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='N', email='notes@example.com',
        )
        anon = self.client.post(
            f'/api/webstore/reservations/{res.pk}/notes/',
            {'note': 'secret'},
            format='json',
        )
        self.assertIn(anon.status_code, (401, 403))

        self.client.force_authenticate(self.customer)
        forbidden = self.client.post(
            f'/api/webstore/reservations/{res.pk}/notes/',
            {'note': 'secret'},
            format='json',
        )
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(self.mgr)
        empty = self.client.post(
            f'/api/webstore/reservations/{res.pk}/notes/',
            {'note': '  '},
            format='json',
        )
        self.assertEqual(empty.status_code, 400)

        ok = self.client.post(
            f'/api/webstore/reservations/{res.pk}/notes/',
            {'note': 'Left voicemail'},
            format='json',
        )
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.json()['kind'], 'note')
        self.assertEqual(ok.json()['note'], 'Left voicemail')
        self.assertTrue(
            ReservationEvent.objects.filter(
                reservation=res, kind='note', note='Left voicemail',
            ).exists()
        )
