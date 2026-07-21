"""Unit tests for delivery distance tiering + Maps route optimize (no network)."""
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.pos.services.delivery_distance import (
    STORE_LAT,
    STORE_LON,
    STORE_MAPS_ADDRESS,
    build_google_maps_route_url,
    build_optimized_delivery_route,
    haversine_miles,
    optimize_delivery_stop_order,
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


class DeliveryMapsRouteTests(SimpleTestCase):
    def test_maps_url_returns_to_store(self):
        from urllib.parse import quote

        url = build_google_maps_route_url(['100 Main St, Omaha, NE', '200 Oak St, Omaha, NE'])
        self.assertIsNotNone(url)
        assert url is not None
        store_q = quote(STORE_MAPS_ADDRESS)
        self.assertIn(f'origin={store_q}', url)
        self.assertIn(f'destination={store_q}', url)
        self.assertIn('waypoints=', url)
        self.assertIn(quote('100 Main St, Omaha, NE'), url)
        self.assertIn(quote('200 Oak St, Omaha, NE'), url)

    def test_maps_url_empty_stops(self):
        self.assertIsNone(build_google_maps_route_url([]))

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_optimize_passthrough_without_key(self):
        stops = ['A St', 'B St']
        ordered, optimized = optimize_delivery_stop_order(stops)
        self.assertEqual(ordered, stops)
        self.assertFalse(optimized)

    @override_settings(GOOGLE_MAPS_API_KEY='test-key')
    @patch('apps.pos.services.delivery_distance._http_get_json')
    def test_optimize_reorders_from_waypoint_order(self, mock_get):
        mock_get.return_value = {
            'status': 'OK',
            'routes': [{'waypoint_order': [1, 0]}],
        }
        ordered, optimized = optimize_delivery_stop_order(['First', 'Second'])
        self.assertEqual(ordered, ['Second', 'First'])
        self.assertTrue(optimized)
        self.assertTrue(mock_get.called)
        called_url = mock_get.call_args[0][0]
        self.assertIn('optimize%3Atrue', called_url)
        self.assertIn('waypoints=', called_url)

    @override_settings(GOOGLE_MAPS_API_KEY='test-key')
    @patch('apps.pos.services.delivery_distance._http_get_json')
    def test_build_optimized_route_payload(self, mock_get):
        mock_get.return_value = {
            'status': 'OK',
            'routes': [{'waypoint_order': [1, 0]}],
        }
        payload = build_optimized_delivery_route(['Alpha', 'Beta'])
        self.assertTrue(payload['optimized'])
        self.assertEqual(payload['ordered_addresses'], ['Beta', 'Alpha'])
        self.assertEqual(payload['store_address'], STORE_MAPS_ADDRESS)
        self.assertIsNotNone(payload['maps_url'])
        from urllib.parse import quote

        store_q = quote(STORE_MAPS_ADDRESS)
        self.assertIn(f'origin={store_q}', payload['maps_url'])
        self.assertIn(f'destination={store_q}', payload['maps_url'])
