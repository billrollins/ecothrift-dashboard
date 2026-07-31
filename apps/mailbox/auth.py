"""MSAL client-credentials authentication with Django-cache token reuse."""
from __future__ import annotations

from django.conf import settings
from django.core.cache import cache


class GraphConfigurationError(RuntimeError):
    """Raised when Graph is disabled or its required settings are incomplete."""


TOKEN_CACHE_KEY = 'mailbox:ms_graph:access_token'
TOKEN_TTL_BUFFER_SECONDS = 120


def graph_enabled() -> bool:
    return bool(getattr(settings, 'MS_GRAPH_ENABLED', False))


def graph_settings() -> dict[str, str]:
    values = {
        'tenant_id': str(getattr(settings, 'MS_GRAPH_TENANT_ID', '') or '').strip(),
        'client_id': str(getattr(settings, 'MS_GRAPH_CLIENT_ID', '') or '').strip(),
        'client_secret': str(getattr(settings, 'MS_GRAPH_CLIENT_SECRET', '') or '').strip(),
        'mailbox': str(getattr(settings, 'MS_GRAPH_MAILBOX', '') or '').strip(),
    }
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise GraphConfigurationError(
            'Microsoft Graph configuration is incomplete: ' + ', '.join(missing),
        )
    return values


def get_access_token() -> str:
    if not graph_enabled():
        raise GraphConfigurationError('Microsoft Graph mail is disabled (MS_GRAPH_ENABLED=false).')

    cached = cache.get(TOKEN_CACHE_KEY)
    if cached:
        return str(cached)

    values = graph_settings()
    try:
        import msal
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise GraphConfigurationError('The msal package is required for Microsoft Graph mail.') from exc

    app = msal.ConfidentialClientApplication(
        values['client_id'],
        authority=f"https://login.microsoftonline.com/{values['tenant_id']}",
        client_credential=values['client_secret'],
    )
    result = app.acquire_token_for_client(scopes=['https://graph.microsoft.com/.default'])
    token = result.get('access_token')
    if not token:
        detail = result.get('error_description') or result.get('error') or 'unknown authentication error'
        raise GraphConfigurationError(f'Microsoft Graph authentication failed: {detail}')

    expires_in = max(
        60,
        int(result.get('expires_in') or 3600) - TOKEN_TTL_BUFFER_SECONDS,
    )
    cache.set(TOKEN_CACHE_KEY, token, timeout=expires_in)
    return str(token)
