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


# Need v2: a manager's goal per category moves its target weeks of cover.
CATEGORY_GOALS = ('more', 'normal', 'less', 'stop')
GOAL_TARGET_MULTIPLIER = {'more': 1.5, 'normal': 1.0, 'less': 0.5}


def get_target_cover_weeks(using: str = 'default') -> int:
    """
    Weeks of stock (shelf + pipeline) to hold per category. 0 (the default) means auto:
    the store's own average cover, so Need v2 compares each category with the store.
    """
    try:
        value = int(AppSetting.objects.using(using).get(key='buying_target_cover_weeks').value)
    except (AppSetting.DoesNotExist, TypeError, ValueError):
        return 0
    return max(0, min(260, value))


def get_pipeline_max_age_days(using: str = 'default') -> int:
    """Open POs older than this are not counted as on order (they are usually done but never closed)."""
    try:
        value = int(AppSetting.objects.using(using).get(key='buying_pipeline_max_age_days').value)
    except (AppSetting.DoesNotExist, TypeError, ValueError):
        return 120
    return max(7, min(730, value))


def get_category_goals(using: str = 'default') -> dict[str, str]:
    """``{category: more | less | stop}`` from Admin (categories left out are ``normal``)."""
    try:
        raw = AppSetting.objects.using(using).get(key='buying_category_goals').value
    except AppSetting.DoesNotExist:
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): v for k, v in raw.items() if v in CATEGORY_GOALS and v != 'normal'}
