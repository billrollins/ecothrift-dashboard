"""The public site's "Price check" button (owner, 2026-10-08) follows the Thrift+ switch."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.thriftplus.services.members import ENABLED_KEY


class PriceCheckFlagTests(TestCase):
    def test_the_site_config_says_when_the_scanner_is_open(self):
        api = APIClient()
        self.assertFalse(api.get('/api/webstore/config/').json()['thrift_plus_open'])
        AppSetting.objects.update_or_create(key=ENABLED_KEY, defaults={'value': True})
        self.assertTrue(api.get('/api/webstore/config/').json()['thrift_plus_open'])
