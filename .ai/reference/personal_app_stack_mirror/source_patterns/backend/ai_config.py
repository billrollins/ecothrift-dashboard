"""Central AI model resolution — knobs live in ``.env`` → ``ecothrift.settings``.

Every ``AI_MODEL_<PURPOSE>`` env var maps to a Django setting of the same name.
Use ``ai_model('<PURPOSE>', override=...)`` in application code; pass per-request
``model`` from the client as ``override`` when the API supports it.
"""

from __future__ import annotations

from django.conf import settings


def ai_model(purpose: str, override: str | None = None) -> str:
    """Return the configured model id for a named purpose."""
    if override is not None and str(override).strip():
        return str(override).strip()
    attr = f'AI_MODEL_{purpose.upper()}'
    val = getattr(settings, attr, None)
    if val and str(val).strip():
        return str(val).strip()
    return str(getattr(settings, 'AI_MODEL', 'claude-sonnet-4-6')).strip()
