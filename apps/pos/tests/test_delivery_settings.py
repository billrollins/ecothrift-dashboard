"""Tests for delivery AppSetting-backed service minutes."""

from django.test import TestCase

from apps.core.models import AppSetting
from apps.pos.services.delivery_settings import (
    DEFAULT_DELIVERY_SERVICE_MINUTES,
    SETTING_KEY_DELIVERY_SERVICE_MINUTES,
    get_delivery_service_minutes,
    get_delivery_service_seconds,
)


class DeliverySettingsTests(TestCase):
    def test_default_when_missing(self):
        AppSetting.objects.filter(key=SETTING_KEY_DELIVERY_SERVICE_MINUTES).delete()
        self.assertEqual(get_delivery_service_minutes(), DEFAULT_DELIVERY_SERVICE_MINUTES)
        self.assertEqual(get_delivery_service_seconds(), DEFAULT_DELIVERY_SERVICE_MINUTES * 60)

    def test_reads_appsetting(self):
        AppSetting.objects.update_or_create(
            key=SETTING_KEY_DELIVERY_SERVICE_MINUTES,
            defaults={'value': 25, 'description': 'test'},
        )
        self.assertEqual(get_delivery_service_minutes(), 25)

    def test_clamps_range(self):
        AppSetting.objects.update_or_create(
            key=SETTING_KEY_DELIVERY_SERVICE_MINUTES,
            defaults={'value': 1, 'description': 'test'},
        )
        self.assertEqual(get_delivery_service_minutes(), 5)
        AppSetting.objects.update_or_create(
            key=SETTING_KEY_DELIVERY_SERVICE_MINUTES,
            defaults={'value': 999, 'description': 'test'},
        )
        self.assertEqual(get_delivery_service_minutes(), 120)
