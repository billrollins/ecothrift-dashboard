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


def _int_setting(key: str, default: int, *, minimum: int = 0, maximum: int | None = None) -> int:
    try:
        value = max(minimum, int(AppSetting.objects.get(key=key).value))
    except (AppSetting.DoesNotExist, TypeError, ValueError):
        return default
    return value if maximum is None else min(value, maximum)


def get_manifest_pull_window_hours() -> int:
    """Pull manifests for auctions ending within this many hours (default 36, at least 1)."""
    return _int_setting('buying_manifest_pull_window_hours', 36, minimum=1, maximum=168)


def get_manifest_pull_max_per_run() -> int:
    """Most manifests one Pull fetches (default 40, at least 1)."""
    return _int_setting('buying_manifest_pull_max_per_run', 40, minimum=1)


def get_manifest_pull_retry_hours() -> int:
    """Hours before a failed pull is tried again (default 12, at least 1: the claim stamp needs it)."""
    return _int_setting('buying_manifest_pull_retry_hours', 12, minimum=1)


def get_manifest_pull_page_delay_seconds() -> float:
    """Pause between B-Stock manifest requests (setting is milliseconds, default 500)."""
    return _int_setting('buying_manifest_pull_page_delay_ms', 500) / 1000.0
