"""Customer hold vocabulary contract — stages, invisible confirm, public timeline."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import ReservationEvent, WebListing, WebListingImage
from apps.webstore.serializers import ReservationPublicSerializer
from apps.webstore.services.hold_status import customer_view, public_timeline
from apps.webstore.services.reservations import (
    add_staff_note,
    complete_reservation,
    confirm_reservation,
    create_hold,
    release_reservation,
    stage_reservation,
    verify_hold,
)
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='status-lamp'):
    listing = WebListing.objects.create(
        title='Status Lamp',
        slug=slug,
        price=Decimal('30.00'),
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
        email='status-mgr@example.com', first_name='S', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(ONLINE_SALES_ENABLED=True)
class HoldStatusContractTests(TestCase):
    def setUp(self):
        self.listing = _listing()
        self.mgr = _manager()

    def test_customer_view_stages_and_can_pickup(self):
        res = make_verified_hold(
            listing=self.listing,
            quantity=1,
            customer_name='A',
            email='a@example.com',
        )
        view = customer_view(res)
        self.assertEqual(view['stage'], 2)
        self.assertEqual(view['customer_status'], 'Confirmed')
        self.assertTrue(view['can_pickup'])
        self.assertIn('code', view['next_step'].lower())
        self.assertTrue(view['pickup_code'])

        before = dict(view)
        confirm_reservation(res, user=self.mgr)
        res.refresh_from_db()
        after = customer_view(res)
        # Invisible internal confirm: identical customer payload.
        for key in (
            'stage', 'customer_status', 'headline', 'next_step',
            'can_pickup', 'pickup_code', 'expires_label', 'expires_kind',
        ):
            self.assertEqual(before[key], after[key], key)

        stage_reservation(res, user=self.mgr)
        res.refresh_from_db()
        view = customer_view(res)
        self.assertEqual(view['stage'], 3)
        self.assertEqual(view['customer_status'], 'Ready')
        self.assertTrue(view['can_pickup'])
        self.assertIn('bagged', view['headline'].lower())

        complete_reservation(res, user=self.mgr)
        res.refresh_from_db()
        view = customer_view(res)
        self.assertEqual(view['stage'], 4)
        self.assertEqual(view['customer_status'], 'Picked up')
        self.assertFalse(view['can_pickup'])
        # Walk-up-safe rail: Ready marked done even after staging path.
        ready = next(s for s in view['stages'] if s['key'] == 'ready')
        self.assertEqual(ready['state'], 'done')

    def test_pending_has_preview_no_code(self):
        res = create_hold(
            listing=self.listing,
            quantity=1,
            customer_name='P',
            email='p@example.com',
            verified=False,
        )
        view = customer_view(res)
        self.assertEqual(view['stage'], 1)
        self.assertIn('Enter the code we emailed', view['customer_status'])
        self.assertIn("We're holding it until", view['headline'])
        self.assertNotIn('One tap', view['next_step'])
        self.assertNotIn('Tap the email', view['headline'])
        self.assertTrue(view.get('do_nothing_label'))
        self.assertTrue(view.get('if_confirmed_label'))
        self.assertIsNotNone(view['confirmed_until_preview'])
        self.assertIsNone(view['pickup_code'])
        data = ReservationPublicSerializer(res).data
        self.assertIsNone(data['pickup_code'])
        self.assertTrue(data['confirmed_until_preview'])
        self.assertTrue(data['do_nothing_label'])
        self.assertTrue(data['if_confirmed_label'])

    def test_declined_shows_reason(self):
        res = make_verified_hold(
            listing=_listing('decl-lamp'),
            quantity=1,
            customer_name='D',
            email='d@example.com',
        )
        release_reservation(res, 'declined', user=self.mgr, reason='Sold on floor')
        res.refresh_from_db()
        view = customer_view(res)
        self.assertEqual(view['stage'], 0)
        self.assertEqual(view['customer_status'], 'Released')
        self.assertIn('Sold on floor', view['next_step'])

    def test_public_timeline_hides_staff_notes(self):
        res = make_verified_hold(
            listing=_listing('note-lamp'),
            quantity=1,
            customer_name='N',
            email='n@example.com',
        )
        add_staff_note(res, self.mgr, 'Internal only — never show')
        ReservationEvent.objects.create(
            reservation=res, kind='verified', from_status='pending_verification',
            to_status='requested',
        )
        kinds = {ev['key'] for ev in public_timeline(res)}
        self.assertIn('verified', kinds)
        self.assertNotIn('note', kinds)
        data = ReservationPublicSerializer(res).data
        for ev in data['timeline']:
            self.assertNotEqual(ev['key'], 'note')
            self.assertNotIn('Internal', str(ev))

    def test_hold_status_api_exposes_new_fields(self):
        res = make_verified_hold(
            listing=_listing('api-lamp'),
            quantity=1,
            customer_name='Api',
            email='api@example.com',
        )
        client = APIClient()
        resp = client.get(f'/api/webstore/holds/{res.status_token}/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['stage'], 2)
        self.assertEqual(len(body['stages']), 4)
        self.assertTrue(body['pickup_code'])
        self.assertIn(body['expires_kind'], ('day', 'countdown'))
