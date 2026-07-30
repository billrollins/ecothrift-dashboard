"""Concurrency stress + idempotency checks (G3 / G6)."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings

from apps.core.models import S3File
from apps.webstore.models import Reservation, WebListing, WebListingImage
from apps.webstore.services.reservations import (
    complete_reservation,
    confirm_reservation,
    create_hold,
    release_reservation,
)


def _listing(slug, on_hand=1):
    listing = WebListing.objects.create(
        title='Stress Lamp', slug=slug, price=Decimal('15.00'),
        on_hand=on_hand, reserved=0, status='published', return_policy='final_sale',
    )
    s3 = S3File.objects.create(
        key=f'test/{listing.id}.jpg', filename='t.jpg', size=10, content_type='image/jpeg',
    )
    WebListingImage.objects.create(listing=listing, s3_file=s3, position=0)
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


class ConcurrencyStressTests(TransactionTestCase):
    def test_hammer_create_hold_qty_invariant(self):
        listing = _listing('stress-race', on_hand=1)

        def attempt(i):
            try:
                create_hold(
                    listing=listing,
                    quantity=1,
                    customer_name=f'Buyer {i}',
                    email=f'stress{i}@example.com',
                )
                return 'ok'
            except Exception:
                return 'fail'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(attempt, range(4)))

        listing.refresh_from_db()
        self.assertEqual(results.count('ok'), 1)
        self.assertEqual(listing.reserved, 1)
        self.assertEqual(listing.available, 0)
        self.assertEqual(Reservation.objects.filter(listing=listing, status='requested').count(), 1)

    def test_interleave_confirm_expire_complete_invariant(self):
        listing = _listing('stress-life', on_hand=2)
        a = create_hold(
            listing=listing, quantity=1, customer_name='A', email='a@example.com',
        )
        b = create_hold(
            listing=listing, quantity=1, customer_name='B', email='b@example.com',
        )
        confirm_reservation(a)
        release_reservation(b, 'expired')
        complete_reservation(a)
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 0)
        self.assertEqual(listing.on_hand, 1)
        self.assertGreaterEqual(listing.available, 0)
        self.assertEqual(listing.on_hand, listing.reserved + listing.available)


@override_settings(ONLINE_SALES_ENABLED=True)
class IdempotencyTests(TestCase):
    def test_duplicate_hold_idempotency_key(self):
        listing = _listing('idem-hold', on_hand=2)
        key = 'same-key-123'
        r1 = create_hold(
            listing=listing, quantity=1, customer_name='A', email='a@example.com',
            idempotency_key=key,
        )
        r2 = create_hold(
            listing=listing, quantity=1, customer_name='A', email='a@example.com',
            idempotency_key=key,
        )
        self.assertEqual(r1.pk, r2.pk)
        listing.refresh_from_db()
        self.assertEqual(listing.reserved, 1)

    def test_double_complete_is_noop(self):
        listing = _listing('idem-complete', on_hand=1)
        res = create_hold(
            listing=listing, quantity=1, customer_name='C', email='c@example.com',
        )
        confirm_reservation(res)
        complete_reservation(res)
        complete_reservation(res)
        listing.refresh_from_db()
        self.assertEqual(listing.on_hand, 0)
        self.assertEqual(listing.reserved, 0)
