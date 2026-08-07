"""Walk-up path: requested → completed with no staging; rail stays coherent."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.webstore.models import WebListing
from apps.webstore.services.hold_status import customer_view
from apps.webstore.services.reservations import complete_reservation
from apps.webstore.tests.helpers import make_verified_hold


def _listing():
    listing = WebListing.objects.create(
        title='Walkup Candle',
        slug='walkup-candle',
        price=Decimal('17.99'),
        on_hand=1,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(ONLINE_SALES_ENABLED=True)
class HoldWalkupTests(TestCase):
    def test_requested_to_completed_skips_ready(self):
        listing = _listing()
        group, _ = Group.objects.get_or_create(name='Manager')
        mgr = User.objects.create_user(
            email='walk@example.com', first_name='W', last_name='M', password='x',
        )
        mgr.groups.add(group)

        res = make_verified_hold(
            listing=listing, quantity=1, customer_name='Walk Up',
            email='walkup@example.com',
        )
        before_code = res.pickup_code
        before_expires = res.expires_at
        self.assertEqual(res.status, 'requested')

        complete_reservation(res, user=mgr)
        res.refresh_from_db()
        self.assertEqual(res.status, 'completed')
        self.assertEqual(res.pickup_code, before_code)
        self.assertEqual(res.expires_at, before_expires)
        self.assertIsNone(res.staged_at)

        view = customer_view(res)
        self.assertEqual(view['stage'], 4)
        ready = next(s for s in view['stages'] if s['key'] == 'ready')
        self.assertEqual(ready['state'], 'done')
