"""Short pickup codes - generation, uniqueness, staff search, public gating."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.webstore.models import WebListing, generate_pickup_code
from apps.webstore.serializers import ReservationPublicSerializer
from apps.webstore.services.reservations import create_hold
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='code-item'):
    listing = WebListing.objects.create(
        title='Code Item',
        slug=slug,
        price=Decimal('12.00'),
        on_hand=3,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='code-mgr@example.com', first_name='C', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


@override_settings(ONLINE_SALES_ENABLED=True)
class PickupCodeTests(TestCase):
    def test_alphabet_unambiguous(self):
        for _ in range(40):
            code = generate_pickup_code()
            self.assertEqual(len(code), 5)
            self.assertTrue(code.isupper())
            for bad in 'IOL01':
                self.assertNotIn(bad, code)

    def test_create_hold_assigns_unique_code(self):
        listing = _listing()
        a = create_hold(
            listing=listing, quantity=1, customer_name='A', email='a@example.com',
        )
        b = create_hold(
            listing=listing, quantity=1, customer_name='B', email='b@example.com',
        )
        self.assertTrue(a.pickup_code)
        self.assertTrue(b.pickup_code)
        self.assertNotEqual(a.pickup_code, b.pickup_code)

    def test_public_hides_code_while_pending(self):
        listing = _listing('pending-code')
        pending = create_hold(
            listing=listing, quantity=1, customer_name='P', email='p@example.com',
            verified=False,
        )
        data = ReservationPublicSerializer(pending).data
        self.assertIsNone(data['pickup_code'])

        verified = make_verified_hold(
            listing=_listing('verified-code'),
            quantity=1, customer_name='V', email='v@example.com',
        )
        data = ReservationPublicSerializer(verified).data
        self.assertEqual(data['pickup_code'], verified.pickup_code)

    def test_staff_search_by_code_and_phone_digits(self):
        listing = _listing('search-code')
        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='Casey Jones',
            email='casey@example.com', phone='(402) 881-9861',
        )
        mgr = _manager()
        client = APIClient()
        client.force_authenticate(user=mgr)

        by_code = client.get('/api/webstore/reservations/', {'search': res.pickup_code})
        self.assertEqual(by_code.status_code, 200)
        ids = [r['id'] for r in by_code.json()['results']]
        self.assertIn(res.id, ids)

        by_phone = client.get('/api/webstore/reservations/', {'search': '4028819861'})
        self.assertEqual(by_phone.status_code, 200)
        ids = [r['id'] for r in by_phone.json()['results']]
        self.assertIn(res.id, ids)

        by_name = client.get('/api/webstore/reservations/', {'search': 'Jones'})
        self.assertEqual(by_name.status_code, 200)
        ids = [r['id'] for r in by_name.json()['results']]
        self.assertIn(res.id, ids)
