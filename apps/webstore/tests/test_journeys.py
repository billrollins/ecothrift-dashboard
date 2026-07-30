"""End-to-end Online Sales journeys (G2)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import S3File
from apps.webstore.models import Reservation, WebListing, WebListingImage
from apps.webstore.services.reservations import (
    complete_reservation,
    confirm_reservation,
    create_hold,
    release_reservation,
)


def _listing(**kwargs):
    defaults = dict(
        title='Journey Lamp', slug='journey-lamp', price=Decimal('40.00'),
        on_hand=2, reserved=0, status='published', return_policy='final_sale',
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


@override_settings(ONLINE_SALES_ENABLED=True, ONLINE_SALES_INQUIRIES_ENABLED=True)
class JourneyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.mgr = User.objects.create_user(
            email='j-mgr@example.com', first_name='J', last_name='M', password='x',
        )
        self.mgr.groups.add(group)

    def test_guest_ask_to_staff_reply(self):
        listing = _listing(slug='journey-ask')
        ask = self.client.post(
            f'/api/webstore/catalog/{listing.slug}/ask/',
            {'name': 'Ada', 'email': 'ada@example.com', 'body': 'Dimensions?'},
            format='json',
        )
        self.assertEqual(ask.status_code, 201)
        self.client.force_authenticate(self.mgr)
        convs = self.client.get('/api/webstore/conversations/?state=needs_reply')
        self.assertEqual(convs.status_code, 200)
        results = convs.json().get('results', convs.json())
        conv_id = results[0]['id']
        reply = self.client.post(
            f'/api/webstore/conversations/{conv_id}/reply/',
            {'body': 'About 24 inches tall.'},
            format='json',
        )
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.json()['state'], 'waiting_on_customer')

    def test_hold_confirm_complete(self):
        listing = _listing(slug='journey-hold', on_hand=1)
        res = create_hold(
            listing=listing, quantity=1, customer_name='Bill', email='bill@example.com',
        )
        confirm_reservation(res)
        complete_reservation(res)
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)
        self.assertEqual(listing.on_hand, 0)
        self.assertEqual(Reservation.objects.get(pk=res.pk).status, 'completed')

    def test_expiry_releases_qty(self):
        listing = _listing(slug='journey-exp', on_hand=1)
        res = create_hold(
            listing=listing, quantity=1, customer_name='E', email='e@example.com',
        )
        confirm_reservation(res)
        release_reservation(res, 'expired')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)
        self.assertEqual(listing.on_hand, 1)

    def test_decline_releases_qty(self):
        listing = _listing(slug='journey-dec', on_hand=1)
        res = create_hold(
            listing=listing, quantity=1, customer_name='D', email='d@example.com',
        )
        release_reservation(res, 'declined')
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)

    def test_partial_multi_qty(self):
        listing = _listing(slug='journey-multi', on_hand=3)
        create_hold(
            listing=listing, quantity=2, customer_name='M', email='m@example.com',
        )
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 2)
        self.assertEqual(listing.available, 1)

    def test_unlinked_listing_hold(self):
        listing = _listing(slug='journey-unlinked', on_hand=1)
        self.assertIsNone(listing.item_id)
        res = create_hold(
            listing=listing, quantity=1, customer_name='U', email='u@example.com',
        )
        self.assertEqual(res.status, 'requested')
