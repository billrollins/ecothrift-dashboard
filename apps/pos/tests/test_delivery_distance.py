"""Unit tests for delivery distance tiering (no network)."""
from decimal import Decimal
from django.test import SimpleTestCase

from apps.pos.services.delivery_distance import (
    STORE_LAT,
    STORE_LON,
    haversine_miles,
    tier_for_miles,
)


class DeliveryDistanceTierTests(SimpleTestCase):
    def test_store_to_self_is_5mi_tier(self):
        miles = haversine_miles(STORE_LAT, STORE_LON, STORE_LAT, STORE_LON)
        self.assertLess(miles, 0.01)
        quote = tier_for_miles(miles)
        self.assertEqual(quote['tier'], '5mi')
        self.assertEqual(quote['fee'], '50.00')
        self.assertFalse(quote['too_far'])

    def test_about_7_miles_is_10mi_tier(self):
        # ~7 mi west of store
        quote = tier_for_miles(Decimal('7.25'))
        self.assertEqual(quote['tier'], '10mi')
        self.assertEqual(quote['fee'], '75.00')
        self.assertFalse(quote['too_far'])

    def test_over_10_miles_too_far(self):
        quote = tier_for_miles(12.4)
        self.assertIsNone(quote['tier'])
        self.assertIsNone(quote['fee'])
        self.assertTrue(quote['too_far'])
        self.assertEqual(quote['distance_miles'], '12.40')
