"""Listing templates and the phone test report (Dash Updates #51)."""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.webstore.models import ChannelPublication
from apps.webstore.tests.test_listing_crud import _listing_with_photo, _manager

TEST = {
    'tested': True, 'powers_on': 'pass', 'charges': 'pass', 'holds_charge': 'fail',
    'carrier_locked': 'yes', 'carrier': 'verizon', 'demo_locked': 'no', 'battery_health': 87,
    'wifi': 'pass', 'note': 'Small scratch on the back.',
}


class ListingTemplateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mgr = _manager('templates-mgr@example.com')
        self.client.force_authenticate(self.mgr)
        self.listing = _listing_with_photo(slug='test-phone', title='Pixel 7', status='published')
        self.url = f'/api/webstore/listings/{self.listing.id}/'

    def patch(self, data):
        return self.client.patch(self.url, data, format='json')

    def public(self):
        return APIClient().get('/api/webstore/catalog/test-phone/').json()

    def test_phone_report_shows_on_the_shop_and_is_stamped(self):
        r = self.patch({'template': 'phone', 'device_test': TEST})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['device_tested_on'], timezone.localdate().isoformat())
        self.assertEqual(r.json()['device_tested_by_name'], 'Listing Manager')
        report = self.public()['device_report']
        rows = {row['key']: row for row in report['rows']}
        # Bill's five always; optional checks only when checked.
        self.assertEqual(list(rows)[:5], ['powers_on', 'charges', 'holds_charge', 'carrier_locked', 'demo_locked'])
        self.assertEqual(rows['holds_charge'], {'key': 'holds_charge', 'label': 'Holds a charge', 'result': 'Fail', 'tone': 'bad'})
        self.assertEqual(rows['carrier_locked']['result'], 'Locked to Verizon')
        self.assertEqual(rows['demo_locked']['result'], 'Not demo locked')
        self.assertEqual(rows['battery_health']['result'], '87%')
        self.assertIn('wifi', rows)
        self.assertNotIn('cameras', rows)
        self.assertNotIn('activation_locked', rows)
        self.assertEqual(report['note'], 'Small scratch on the back.')

    def test_not_tested_or_standard_shows_nothing_and_keeps_the_data(self):
        self.patch({'template': 'phone', 'device_test': {**TEST, 'tested': False}})
        self.assertIsNone(self.public()['device_report'])
        self.patch({'template': 'phone', 'device_test': TEST})
        self.patch({'template': 'standard'})
        self.assertIsNone(self.public()['device_report'])
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.device_test['carrier'], 'verizon')
        self.patch({'template': 'phone'})
        self.assertIsNotNone(self.public()['device_report'])

    def test_bad_values_are_refused(self):
        for bad in ({'powers_on': 'maybe'}, {'carrier': 'sprintz'}, {'battery_health': 120}, {'surprise': 1},
                    {'note': 'x' * 301}):
            r = self.patch({'template': 'phone', 'device_test': {'tested': True, **bad}})
            self.assertEqual(r.status_code, 400, bad)
        self.assertEqual(self.patch({'template': 'tablet'}).status_code, 400)

    def test_facebook_copy_carries_the_report_as_plain_text(self):
        self.patch({'template': 'phone', 'device_test': TEST})
        r = self.client.post(f'{self.url}generate-fb-copy/')
        body = r.json()['fb_body']
        self.assertIn('Tested by Eco-Thrift on', body)
        self.assertIn('✓ Turns on: Pass', body)
        self.assertIn('✗ Holds a charge: Fail', body)
        self.assertIn('✗ Carrier lock: Locked to Verizon', body)
        self.assertIn('Note: Small scratch on the back.', body)
        self.assertIn('Tested by', ChannelPublication.objects.get(listing=self.listing, channel='facebook_page').body)
        self.patch({'template': 'standard'})
        body = self.client.post(f'{self.url}generate-fb-copy/').json()['fb_body']
        self.assertNotIn('Tested by', body)
