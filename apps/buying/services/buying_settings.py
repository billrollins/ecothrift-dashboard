"""Read Phase 5 buying-related AppSetting keys with safe defaults."""

from __future__ import annotations

from apps.core.models import AppSetting


def get_pricing_need_window_days() -> int:
    """Sold-items lookback window for the category need panel (default 90)."""
    try:
        s = AppSetting.objects.get(key='pricing_need_window_days')
        return int(s.value)
    except AppSetting.DoesNotExist:
        return 90
    except (TypeError, ValueError):
        return 90


def get_want_vote_decay_per_day() -> float:
    """Effective want decays this many steps per day toward 5 (default 1.0)."""
    try:
        s = AppSetting.objects.get(key='buying_want_vote_decay_per_day')
        return float(s.value)
    except AppSetting.DoesNotExist:
        return 1.0
    except (TypeError, ValueError):
        return 1.0
