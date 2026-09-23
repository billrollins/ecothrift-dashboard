"""Settings > AI: list provider models, add new ones, and resolve dialog choices."""
from __future__ import annotations

import logging

from django.conf import settings

from apps.core.ai_config import EFFORT_VALUES, ai_model
from apps.core.models import AiAction, AiModel
from apps.core.services.llm_api_keys import (
    resolve_anthropic_api_key,
    resolve_google_api_key,
    resolve_xai_api_key,
)
from apps.core.services.llm_router import GOOGLE_API_BASE, resolve_provider

logger = logging.getLogger(__name__)

# Up to five requests run one after another; keep the total under Heroku's 30 s.
LIST_TIMEOUT_SECONDS = 5.0

GOOGLE_SKIP_WORDS = (
    '-image', '-tts', 'embedding', 'live', 'native-audio', 'computer-use',
    'robotics', 'transcribe', 'imagen', 'veo', 'lyria', 'aqa',
)


def _get_json(url: str, headers: dict, params: dict | None = None) -> dict:
    import requests

    resp = requests.get(url, headers=headers, params=params or {}, timeout=LIST_TIMEOUT_SECONDS)
    if resp.status_code >= 400:
        raise RuntimeError(f'HTTP {resp.status_code}: {(resp.text or "")[:200]}')
    return resp.json()


def list_anthropic_models(api_key: str) -> list[tuple[str, str, str]]:
    import anthropic as anthropic_lib

    client = anthropic_lib.Anthropic(
        api_key=api_key, max_retries=0, timeout=LIST_TIMEOUT_SECONDS,
    )
    rows = []
    for item in client.models.list(limit=1000):
        slug = str(getattr(item, 'id', '') or '').strip()
        if slug:
            rows.append((slug, str(getattr(item, 'display_name', '') or ''), AiModel.MODALITY_TEXT))
    return rows


def list_xai_models(api_key: str) -> list[tuple[str, str, str]]:
    base = (getattr(settings, 'XAI_API_BASE', None) or 'https://api.x.ai/v1').strip().rstrip('/')
    headers = {'Authorization': f'Bearer {api_key}'}
    rows = []
    for item in _get_json(f'{base}/language-models', headers).get('models') or []:
        slug = str(item.get('id') or '').strip()
        if slug.startswith('grok') and 'text' in (item.get('output_modalities') or []):
            rows.append((slug, '', AiModel.MODALITY_TEXT))
    for item in _get_json(f'{base}/image-generation-models', headers).get('models') or []:
        slug = str(item.get('id') or '').strip()
        if slug.startswith('grok'):
            rows.append((slug, '', AiModel.MODALITY_IMAGE))
    return rows


def list_google_models(api_key: str) -> list[tuple[str, str, str]]:
    headers = {'x-goog-api-key': api_key}
    rows = []
    page_token = ''
    for _page in range(20):
        params = {'pageSize': 1000}
        if page_token:
            params['pageToken'] = page_token
        data = _get_json(f'{GOOGLE_API_BASE}/models', headers, params)
        for item in data.get('models') or []:
            name = str(item.get('name') or '')
            if not name.startswith('models/gemini-'):
                continue
            slug = name[len('models/'):]
            if 'generateContent' not in (item.get('supportedGenerationMethods') or []):
                continue
            if any(word in slug for word in GOOGLE_SKIP_WORDS):
                continue
            rows.append((slug, str(item.get('displayName') or ''), AiModel.MODALITY_TEXT))
        page_token = str(data.get('nextPageToken') or '')
        if not page_token:
            break
    return rows


PROVIDER_LISTERS = (
    (AiModel.PROVIDER_ANTHROPIC, resolve_anthropic_api_key, list_anthropic_models),
    (AiModel.PROVIDER_XAI, resolve_xai_api_key, list_xai_models),
    (AiModel.PROVIDER_GOOGLE, resolve_google_api_key, list_google_models),
)


def discover_models() -> list[dict]:
    """Ask each provider for its models and add unknown slugs as active rows."""
    results = []
    for provider, key_fn, lister in PROVIDER_LISTERS:
        key = key_fn()
        if not key:
            results.append({
                'provider': provider, 'ok': False, 'found': 0, 'added': [],
                'error': 'No API key in .env',
            })
            continue
        try:
            rows = lister(key)
        except Exception as exc:  # noqa: BLE001 - one provider failing must not stop the others
            logger.warning('AI model check failed for %s: %s', provider, exc)
            results.append({
                'provider': provider, 'ok': False, 'found': 0, 'added': [],
                'error': str(exc)[:300],
            })
            continue
        added = []
        for slug, label, modality in rows:
            _row, created = AiModel.objects.get_or_create(
                slug=slug,
                defaults={
                    'label': label,
                    'provider': provider,
                    'modality': modality,
                    'status': AiModel.STATUS_ACTIVE,
                    'source': AiModel.SOURCE_DISCOVERED,
                },
            )
            if created:
                added.append(slug)
        results.append({
            'provider': provider, 'ok': True, 'found': len(rows), 'added': added, 'error': '',
        })
    return results


def action_choices(action_row: AiAction) -> dict:
    """What a dialog may offer for one action: resolved default + active models."""
    default_model = ai_model(action_row.purpose)
    rows = AiModel.objects.filter(
        status=AiModel.STATUS_ACTIVE, modality=action_row.modality,
    ).order_by('provider', 'slug')
    models = [{'slug': m.slug, 'label': m.label or m.slug, 'provider': m.provider} for m in rows]
    if default_model and all(m['slug'] != default_model for m in models):
        models.insert(0, {
            'slug': default_model, 'label': default_model, 'provider': resolve_provider(default_model),
        })
    effort = action_row.effort if action_row.effort in EFFORT_VALUES else 'off'
    return {
        'purpose': action_row.purpose,
        'modality': action_row.modality,
        'default_model': default_model,
        'default_effort': effort,
        'models': models,
    }


def resolve_run_choice(purpose: str, model: object, effort: object) -> tuple[str, str]:
    """Model id + effort for one dialog run. Raises ValueError with a user message.

    A blank model or effort means the action's saved default. A model other than
    the default must be an active catalog text model.
    """
    purpose = str(purpose or '').upper()
    action_row = AiAction.objects.filter(purpose=purpose).first()
    default_model = ai_model(purpose)
    default_effort = action_row.effort if action_row and action_row.effort in EFFORT_VALUES else 'off'
    slug = str(model or '').strip() or default_model
    if slug != default_model and not AiModel.objects.filter(
        slug=slug, status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_TEXT,
    ).exists():
        raise ValueError('Pick a model from the list.')
    run_effort = str(effort or '').strip().lower() or default_effort
    if run_effort not in EFFORT_VALUES:
        raise ValueError('Effort must be off, low, medium, high, or max.')
    return slug, run_effort
