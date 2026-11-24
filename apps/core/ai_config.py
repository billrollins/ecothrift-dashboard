"""Central AI model resolution.

Order for ``ai_model(purpose, override)`` (Dash #195: actions use tiers):
1. a non-blank ``override``
2. the action's own model in Settings > AI (``core.AiAction.model``), when active
3. the model of the action's tier (``core.AiTier``: Fast, Standard, Best, Image), when active
4. the fallback: ``FALLBACK_MODELS[purpose]`` (image purposes) or ``settings.AI_MODEL``

Effort: the action's own effort when set, else its tier's.

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
PROVIDER_VALUES = ('anthropic', 'openai', 'xai', 'google', 'meta')

# Purposes whose fallback cannot be the text model in AI_MODEL.
FALLBACK_MODELS = {
    'LABEL_IMAGE': 'grok-imagine-image-quality',
    # The photo editor's AI tab (Dash #209): the model the owner picked and tested.
    'PHOTO_REMOVE_BACKGROUND': 'grok-imagine-image-2.0',
    'PHOTO_OPTIMIZE': 'grok-imagine-image-2.0',
    'PHOTO_FILTER': 'grok-imagine-image-2.0',
    'PHOTO_FREE_EDIT': 'grok-imagine-image-2.0',
}


def _load_action(purpose: str):
    """Return (AiAction with its model, its AiTier with its model) or (None, None). Never raises."""
    try:
        from django.db import transaction

        from apps.core.models import AiAction, AiTier

        with transaction.atomic():
            action = (
                AiAction.objects.select_related('model')
                .filter(purpose=str(purpose or '').upper())
                .first()
            )
            tier = AiTier.objects.select_related('model').filter(key=action.tier).first() if action else None
            return action, tier
    except Exception:  # noqa: BLE001 - see module docstring
        return None, None


def _active_slug(row) -> str:
    model = getattr(row, 'model', None)
    return model.slug if model is not None and model.status == 'active' else ''


def settings_model(purpose: str) -> str:
    """The fallback model for a purpose when Settings > AI has none assigned."""
    fallback = FALLBACK_MODELS.get(str(purpose or '').upper())
    if fallback:
        return fallback
    return str(getattr(settings, 'AI_MODEL', '') or 'claude-sonnet-4-6').strip()


def resolve(purpose: str) -> dict:
    """What a purpose runs on and why: {model, effort, model_from: action|tier|env, effort_from: action|tier|none}."""
    action, tier = _load_action(purpose)
    slug, model_from = _active_slug(action), 'action'
    if not slug:
        slug, model_from = _active_slug(tier), 'tier'
    if not slug:
        slug, model_from = settings_model(purpose), 'env'
    if action is not None and action.effort in EFFORT_VALUES:
        effort, effort_from = action.effort, 'action'
    elif tier is not None and tier.effort in EFFORT_VALUES:
        effort, effort_from = tier.effort, 'tier'
    else:
        effort, effort_from = 'off', 'none'
    return {'model': slug, 'effort': effort, 'model_from': model_from, 'effort_from': effort_from}


def ai_model(purpose: str, override: str | None = None) -> str:
    """Return the model id for a named purpose."""
    if override is not None and str(override).strip():
        return str(override).strip()
    return resolve(purpose)['model']


def ai_effort(purpose: str) -> str:
    """Return the effort for a purpose: off | low | medium | high | max (the action's own, else its tier's)."""
    return resolve(purpose)['effort']


def best_text_models() -> dict[str, str]:
    """The best active text model per provider: {provider: slug}. Used by the AI panel (#196) for its five models.

    Best = highest Artificial Analysis Intelligence Index; a provider with no AA scores gives its model with the
    highest output price (the flagship). The Best tier's own model always wins for its provider. Never raises.
    """
    try:
        from django.db import transaction

        from apps.core.models import AiModel, AiTier

        with transaction.atomic():
            rows = list(AiModel.objects.filter(status='active', modality='text'))
            best_tier = _active_slug(AiTier.objects.select_related('model').filter(key='best').first())
    except Exception:  # noqa: BLE001 - see module docstring
        return {}
    out: dict[str, str] = {}
    for provider in PROVIDER_VALUES:
        mine = [m for m in rows if m.provider == provider]
        tier_pick = [m for m in mine if m.slug == best_tier]
        scored = sorted((m for m in mine if m.aa_intelligence is not None), key=lambda m: -m.aa_intelligence)
        priced = sorted((m for m in mine if m.output_price is not None), key=lambda m: -m.output_price)
        pick = (tier_pick or scored or priced or [None])[0]
        if pick is not None:
            out[provider] = pick.slug
    return out


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
