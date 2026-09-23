"""Central AI model resolution.

Order for ``ai_model(purpose, override)``:
1. a non-blank ``override``
2. the active model assigned to the purpose in Settings > AI (``core.AiAction``)
3. the fallback: ``FALLBACK_MODELS[purpose]`` (image purposes) or ``settings.AI_MODEL``

Settings > AI is the only place per-purpose models are chosen. ``AI_MODEL`` in
``.env`` is just the emergency fallback.

Every DB read here is wrapped in ``except Exception`` on purpose. This module
runs in DB-less tests (SimpleTestCase raises an AssertionError subclass on any
query), during ``migrate`` before the tables exist, and at import time. Any
failure falls back to the env settings.
"""

from __future__ import annotations

from django.conf import settings

EFFORT_VALUES = ('off', 'low', 'medium', 'high', 'max')
PROVIDER_VALUES = ('anthropic', 'xai', 'google')

# Purposes whose fallback cannot be the text model in AI_MODEL.
FALLBACK_MODELS = {
    'LABEL_IMAGE': 'grok-imagine-image-quality',
}


def _load_action(purpose: str):
    """Return the AiAction row (with its model) or None. Never raises."""
    try:
        from django.db import transaction

        from apps.core.models import AiAction

        with transaction.atomic():
            return (
                AiAction.objects.select_related('model')
                .filter(purpose=str(purpose or '').upper())
                .first()
            )
    except Exception:  # noqa: BLE001 - see module docstring
        return None


def settings_model(purpose: str) -> str:
    """The fallback model for a purpose when Settings > AI has none assigned."""
    fallback = FALLBACK_MODELS.get(str(purpose or '').upper())
    if fallback:
        return fallback
    return str(getattr(settings, 'AI_MODEL', '') or 'claude-sonnet-4-6').strip()


def ai_model(purpose: str, override: str | None = None) -> str:
    """Return the model id for a named purpose."""
    if override is not None and str(override).strip():
        return str(override).strip()
    action = _load_action(purpose)
    if action is not None and action.model is not None and action.model.status == 'active':
        return action.model.slug
    return settings_model(purpose)


def ai_effort(purpose: str) -> str:
    """Return the effort saved for a purpose: off | low | medium | high | max."""
    action = _load_action(purpose)
    if action is None or action.effort not in EFFORT_VALUES:
        return 'off'
    return action.effort


def catalog_provider(model_id: str) -> str | None:
    """Provider saved for this exact model id in the catalog, or None. Never raises."""
    mid = str(model_id or '').strip()
    if not mid:
        return None
    try:
        from django.db import transaction

        from apps.core.models import AiModel

        with transaction.atomic():
            provider = (
                AiModel.objects.filter(slug=mid).values_list('provider', flat=True).first()
            )
    except Exception:  # noqa: BLE001 - see module docstring
        return None
    return provider if provider in PROVIDER_VALUES else None
