"""Delivery operational settings driven by AppSetting."""

from __future__ import annotations

from apps.core.models import AppSetting

# Fallback when AppSetting is missing or invalid. Matches historical hardcode.
DEFAULT_DELIVERY_SERVICE_MINUTES = 20
SETTING_KEY_DELIVERY_SERVICE_MINUTES = 'delivery_service_minutes_per_stop'
MIN_SERVICE_MINUTES = 5
MAX_SERVICE_MINUTES = 120


def get_delivery_service_minutes() -> int:
    """Return on-site unload/service minutes per stop (clamped 5-120)."""
    try:
        row = AppSetting.objects.get(key=SETTING_KEY_DELIVERY_SERVICE_MINUTES)
        raw = row.value
        if raw is None:
            return DEFAULT_DELIVERY_SERVICE_MINUTES
        minutes = int(raw)
    except (AppSetting.DoesNotExist, TypeError, ValueError):
        return DEFAULT_DELIVERY_SERVICE_MINUTES
    return max(MIN_SERVICE_MINUTES, min(MAX_SERVICE_MINUTES, minutes))


def get_delivery_service_seconds() -> int:
    return get_delivery_service_minutes() * 60
