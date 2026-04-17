"""Read Phase 5 buying-related AppSetting keys with safe defaults."""

from __future__ import annotations

from apps.core.models import AppSetting


def get_pricing_need_window_days(using: str = 'default') -> int:
    """Sold-items lookback window for the category need panel (default 90)."""
    try:
        s = AppSetting.objects.using(using).get(key='pricing_need_window_days')
        return int(s.value)
    except AppSetting.DoesNotExist:
        return 90
    except (TypeError, ValueError):
        return 90
