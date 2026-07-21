"""Online Sales feature gates (env-driven)."""

from django.conf import settings


def online_sales_enabled() -> bool:
    """Server-authoritative kill-switch. Default off until the initiative resumes."""
    return bool(getattr(settings, 'ONLINE_SALES_ENABLED', False))
