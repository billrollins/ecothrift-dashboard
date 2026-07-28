"""Unit tests for delivery distance tiering + Routes API planning (no network)."""
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from datetime import datetime, timedelta, timezone as dt_timezone

from apps.pos.services.delivery_distance import (
    STORE_LAT,
    STORE_LON,
    STORE_MAPS_ADDRESS,
    _departure_rfc3339_or_none,
    _parse_duration_seconds,
    build_google_maps_route_url,
    build_optimized_delivery_route,
    haversine_miles,
    optimize_delivery_stop_order,
    plan_delivery_route_with_etas,
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


class DurationParseTests(SimpleTestCase):
    def test_parse_duration_seconds(self):
        self.assertEqual(_parse_duration_seconds('1234s'), 1234)
        self.assertEqual(_parse_duration_seconds('12.5s'), 12)
        self.assertEqual(_parse_duration_seconds(90), 90)
        self.assertEqual(_parse_duration_seconds({'seconds': '40'}), 40)
        self.assertIsNone(_parse_duration_seconds(None))
        self.assertIsNone(_parse_duration_seconds('bad'))


class DepartureTimeTests(SimpleTestCase):
    def test_omits_missing_and_near_term_departure(self):
        self.assertIsNone(_departure_rfc3339_or_none(None))
        now = datetime.now(dt_timezone.utc)
        self.assertIsNone(_departure_rfc3339_or_none(now))
        self.assertIsNone(_departure_rfc3339_or_none(now - timedelta(minutes=5)))
        self.assertIsNone(_departure_rfc3339_or_none(now + timedelta(seconds=30)))

    def test_keeps_future_departure(self):
        future = datetime.now(dt_timezone.utc) + timedelta(minutes=10)
        text = _departure_rfc3339_or_none(future)
        self.assertIsNotNone(text)
        assert text is not None
        self.assertTrue(text.endswith('Z'))


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
    @patch('apps.pos.services.delivery_distance._http_post_json')
    def test_optimize_reorders_from_waypoint_order(self, mock_post):
        mock_post.return_value = (
            {
                'routes': [
                    {
                        'optimizedIntermediateWaypointIndex': [1, 0],
                        'duration': '100s',
                        'distanceMeters': 1000,
                        'legs': [
                            {'duration': '40s', 'distanceMeters': 400},
                            {'duration': '30s', 'distanceMeters': 300},
                            {'duration': '30s', 'distanceMeters': 300},
                        ],
                    }
                ]
            },
            200,
            None,
        )
        ordered, optimized = optimize_delivery_stop_order(['First', 'Second'])
        self.assertEqual(ordered, ['Second', 'First'])
        self.assertTrue(optimized)
        self.assertTrue(mock_post.called)
        body = mock_post.call_args[0][1]
        self.assertTrue(body.get('optimizeWaypointOrder'))
        self.assertEqual(body.get('travelMode'), 'DRIVE')
        # Near-term / missing departure must be omitted — Routes rejects past times.
        self.assertNotIn('departureTime', body)
        headers = mock_post.call_args.kwargs.get('headers') or mock_post.call_args[1].get('headers')
        self.assertIn('optimizedIntermediateWaypointIndex', headers['X-Goog-FieldMask'])

    @override_settings(GOOGLE_MAPS_API_KEY='test-key')
    @patch('apps.pos.services.delivery_distance._http_post_json')
    def test_build_optimized_route_payload(self, mock_post):
        mock_post.return_value = (
            {
                'routes': [
                    {
                        'optimizedIntermediateWaypointIndex': [1, 0],
                        'duration': '100s',
                        'distanceMeters': 1000,
                        'legs': [
                            {'duration': '40s', 'distanceMeters': 400},
                            {'duration': '30s', 'distanceMeters': 300},
                            {'duration': '30s', 'distanceMeters': 300},
                        ],
                    }
                ]
            },
            200,
            None,
        )
        payload = build_optimized_delivery_route(['Alpha', 'Beta'])
        self.assertTrue(payload['optimized'])
        self.assertEqual(payload['ordered_addresses'], ['Beta', 'Alpha'])
        self.assertEqual(payload['store_address'], STORE_MAPS_ADDRESS)
        self.assertIsNotNone(payload['maps_url'])
        from urllib.parse import quote

        store_q = quote(STORE_MAPS_ADDRESS)
        self.assertIn(f'origin={store_q}', payload['maps_url'])
        self.assertIn(f'destination={store_q}', payload['maps_url'])

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_plan_reports_no_key_fallback(self):
        plan = plan_delivery_route_with_etas(['A St', 'B St'], optimize=True)
        self.assertFalse(plan['optimized'])
        self.assertFalse(plan['etas_available'])
        self.assertEqual(plan['fallback_reason'], 'no_key')
        self.assertIsNone(plan['provider'])

    @override_settings(GOOGLE_MAPS_API_KEY='test-key')
    @patch('apps.pos.services.delivery_distance._http_post_json')
    def test_plan_etas_and_totals(self, mock_post):
        mock_post.return_value = (
            {
                'routes': [
                    {
                        'optimizedIntermediateWaypointIndex': [0, 1],
                        'duration': '2400s',
                        'distanceMeters': 10000,
                        'legs': [
                            {'duration': '600s', 'distanceMeters': 3000},
                            {'duration': '900s', 'distanceMeters': 4000},
                            {'duration': '900s', 'distanceMeters': 3000},
                        ],
                    }
                ]
            },
            200,
            None,
        )
        plan = plan_delivery_route_with_etas(
            ['A St', 'B St'],
            optimize=True,
            service_seconds=20 * 60,
        )
        self.assertTrue(plan['etas_available'])
        self.assertEqual(plan['provider'], 'google_routes')
        self.assertIsNone(plan['fallback_reason'])
        self.assertEqual(plan['total_drive_seconds'], 2400)
        self.assertEqual(plan['total_service_seconds'], 2400)
        self.assertEqual(plan['total_eta_seconds'], 4800)
        self.assertEqual(len(plan['etas']), 2)
        self.assertIsNotNone(plan['etas'][0]['arrive_at'])
        self.assertEqual(plan['etas'][0]['drive_seconds'], 600)

    @override_settings(GOOGLE_MAPS_API_KEY='test-key')
    @patch('apps.pos.services.delivery_distance._http_post_json')
    def test_plan_captures_route_polyline(self, mock_post):
        mock_post.return_value = (
            {
                'routes': [
                    {
                        'duration': '600s',
                        'distanceMeters': 3000,
                        'polyline': {'encodedPolyline': '_p~iF~ps|U'},
                        'legs': [
                            {'duration': '300s', 'distanceMeters': 1500},
                            {'duration': '300s', 'distanceMeters': 1500},
                        ],
                    }
                ]
            },
            200,
            None,
        )
        plan = plan_delivery_route_with_etas(['A St'], optimize=False)
        self.assertEqual(plan['polyline'], '_p~iF~ps|U')
        headers = mock_post.call_args.kwargs.get('headers') or mock_post.call_args[1].get('headers')
        self.assertIn('routes.polyline.encodedPolyline', headers['X-Goog-FieldMask'])


class RouteMapUrlTests(SimpleTestCase):
    def _url(self, **kwargs):
        from apps.pos.services.delivery_route_map import build_static_map_url

        params = {
            'key': 'test-key',
            'stop_addresses': ['1 A St', '2 B St'],
            'store_address': STORE_MAPS_ADDRESS,
            'polyline': 'abc123',
            'width': 640,
            'height': 360,
        }
        params.update(kwargs)
        return build_static_map_url(**params)

    def test_builds_labelled_markers_and_path(self):
        url = self._url()
        self.assertIn('label%3A1', url)
        self.assertIn('label%3A2', url)
        self.assertIn('label%3AS', url)
        self.assertIn('enc%3Aabc123', url)
        self.assertIn('key=test-key', url)

    def test_no_stops_means_no_map(self):
        self.assertIsNone(self._url(stop_addresses=[]))
        self.assertIsNone(self._url(stop_addresses=['   ']))

    def test_oversized_polyline_falls_back_to_markers(self):
        url = self._url(polyline='x' * 20000)
        self.assertIsNotNone(url)
        self.assertNotIn('enc%3A', url)
        self.assertIn('label%3A1', url)
