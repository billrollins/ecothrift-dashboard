"""Provisional / confirmed expiry helpers and expire_due_reservations."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.webstore.models import WebListing
from apps.webstore.services.hours import confirmed_expiry, provisional_expiry
from apps.webstore.services.reservations import (
    create_hold,
    expire_due_reservations,
    verify_hold,
)


TZ = ZoneInfo('America/Chicago')


def _aware(y, m, d, hh=12, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), TZ)


def _listing(slug='exp-item'):
    listing = WebListing.objects.create(
        title='Expiry Item',
        slug=slug,
        price=Decimal('10.00'),
        on_hand=5,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )
    listing.sync_stock_mirror()
    listing.save(update_fields=['stock'])
    return listing


@override_settings(
    ONLINE_SALES_ENABLED=True,
    ONLINE_SALES_PROVISIONAL_GRACE_MINUTES=30,
)
class HoldExpiryRulesTests(TestCase):
    def test_provisional_today_close_midday(self):
        # Thu Aug 6 2026 midday → today 6 PM
        moment = _aware(2026, 8, 6, 12, 0)
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [6],
        }):
            exp = provisional_expiry(moment)
        self.assertEqual(exp, _aware(2026, 8, 6, 18, 0))

    def test_provisional_rolls_near_close(self):
        # Within 30 min of close → next open day
        moment = _aware(2026, 8, 6, 17, 45)
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [6],
        }):
            exp = provisional_expiry(moment)
        self.assertEqual(exp, _aware(2026, 8, 7, 18, 0))

    def test_provisional_monday_rolls_to_tuesday(self):
        moment = _aware(2026, 8, 10, 12, 0)  # Monday
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [0, 6],
        }):
            exp = provisional_expiry(moment)
        self.assertEqual(exp, _aware(2026, 8, 11, 18, 0))

    def test_provisional_sunday_rolls_to_monday(self):
        moment = _aware(2026, 8, 9, 12, 0)  # Sunday
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [6],
        }):
            exp = provisional_expiry(moment)
        self.assertEqual(exp, _aware(2026, 8, 10, 18, 0))

    def test_confirmed_three_open_days(self):
        # Thu Aug 6 before close → Sat Aug 8 close
        moment = _aware(2026, 8, 6, 11, 0)
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [6],
        }):
            exp = confirmed_expiry(moment, open_days=3)
        self.assertEqual(exp, _aware(2026, 8, 8, 18, 0))

    def test_verify_sets_confirmed_expiry(self):
        listing = _listing()
        res = create_hold(
            listing=listing, quantity=1, customer_name='V', email='v@example.com',
            verified=False,
        )
        self.assertEqual(res.status, 'pending_verification')
        with patch('apps.webstore.services.hours.get_hours_config', return_value={
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00',
            'closed_weekdays': [6],
        }):
            with patch('django.utils.timezone.now', return_value=_aware(2026, 8, 6, 11, 0)):
                verify_hold(res)
        res.refresh_from_db()
        self.assertEqual(res.status, 'requested')
        self.assertEqual(res.expires_at, _aware(2026, 8, 8, 18, 0))

    def test_expire_due_uses_expires_at_not_triage(self):
        listing = _listing('triage-free')
        res = create_hold(
            listing=listing, quantity=1, customer_name='T', email='t@example.com',
            verified=True,
        )
        # Verified hold with future expires_at must not die from age alone.
        res.created_at = timezone.now() - timedelta(hours=72)
        res.expires_at = timezone.now() + timedelta(days=1)
        res.save(update_fields=['created_at', 'expires_at'])
        released = expire_due_reservations()
        res.refresh_from_db()
        self.assertEqual(released, 0)
        self.assertEqual(res.status, 'requested')

        res.expires_at = timezone.now() - timedelta(minutes=1)
        res.save(update_fields=['expires_at'])
        released = expire_due_reservations()
        res.refresh_from_db()
        self.assertEqual(released, 1)
        self.assertEqual(res.status, 'expired')
