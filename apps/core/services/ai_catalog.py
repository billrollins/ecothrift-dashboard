"""Settings > AI: list each provider's models (Refresh runs these in parallel) and resolve dialog choices."""
from __future__ import annotations

import logging
import re
from decimal import Decimal

from django.conf import settings

from apps.core.ai_config import EFFORT_VALUES, ai_effort, ai_model
from apps.core.models import AiAction, AiModel
from apps.core.services.llm_api_keys import (
    resolve_anthropic_api_key,
    resolve_google_api_key,
    resolve_meta_api_key,
    resolve_openai_api_key,
    resolve_xai_api_key,
)
from apps.core.services.llm_router import GOOGLE_API_BASE, resolve_provider

logger = logging.getLogger(__name__)

# Each list call; Refresh runs the providers side by side.
LIST_TIMEOUT_SECONDS = 6.0

# OpenAI lists every model it has ever served; these are not chat models we can call, or are generations retired
# from our use (gpt-3, gpt-4 and o1 families).
OPENAI_SKIP_WORDS = (
    'embedding', 'tts', 'whisper', 'transcribe', 'moderation', 'realtime', 'audio', 'search', 'dall-e-2',
    'computer-use', 'davinci', 'babbage', 'instruct', 'sora', 'live',
)
OPENAI_IMAGE_PREFIXES = ('gpt-image', 'chatgpt-image', 'dall-e-3')
OPENAI_SKIP_PREFIXES = ('gpt-3', 'gpt-4', 'o1', 'chatgpt-4')
SNAPSHOT = re.compile(r'^(?P<base>.+?)-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$')

GOOGLE_SKIP_WORDS = (
    '-tts', 'embedding', 'live', 'native-audio', 'computer-use',
    'robotics', 'transcribe', 'veo', 'lyria', 'aqa',
)
# Google's image models (Nano Banana: gemini-*-image*, nano-banana*) answer generateContent with a picture;
# Imagen answers predict.
GOOGLE_IMAGE_WORDS = ('-image', 'nano-banana', 'imagen')
# xAI prices in units of 1e-10 USD (a token price of 12500 = $1.25 per 1M tokens; an image price of 200000000 = $0.02).
XAI_PRICE_UNIT = 10 ** 10


def _get_json(url: str, headers: dict, params: dict | None = None) -> dict:
    import requests

    resp = requests.get(url, headers=headers, params=params or {}, timeout=LIST_TIMEOUT_SECONDS)
    if resp.status_code >= 400:
        raise RuntimeError(f'HTTP {resp.status_code}: {(resp.text or "")[:200]}')
    return resp.json()


def _day(value) -> dict:
    """{'released': date} from a unix timestamp or an ISO date-time, or {} when there is none."""
    from datetime import date, datetime, timezone

    try:
        if isinstance(value, (int, float)) and value > 0:
            return {'released': datetime.fromtimestamp(value, tz=timezone.utc).date()}
        if isinstance(value, datetime):
            return {'released': value.date()}
        if isinstance(value, date):
            return {'released': value}
        if isinstance(value, str) and value:
            return {'released': datetime.fromisoformat(value.replace('Z', '+00:00')).date()}
    except (ValueError, OverflowError, OSError):
        pass
    return {}


def list_anthropic_models(api_key: str) -> list[tuple[str, str, str]]:
    import anthropic as anthropic_lib

    client = anthropic_lib.Anthropic(
        api_key=api_key, max_retries=0, timeout=LIST_TIMEOUT_SECONDS,
    )
    rows = []
    for item in client.models.list(limit=1000):
        slug = str(getattr(item, 'id', '') or '').strip()
        if slug:
            rows.append((slug, str(getattr(item, 'display_name', '') or ''), AiModel.MODALITY_TEXT,
                         _day(getattr(item, 'created_at', None))))
    return rows


def list_xai_models(api_key: str) -> list[tuple[str, str, str]]:
    base = (getattr(settings, 'XAI_API_BASE', None) or 'https://api.x.ai/v1').strip().rstrip('/')
    headers = {'Authorization': f'Bearer {api_key}'}
    rows = []
    for item in _get_json(f'{base}/language-models', headers).get('models') or []:
        slug = str(item.get('id') or '').strip()
        if slug.startswith('grok') and 'text' in (item.get('output_modalities') or []):
            rows.append((slug, '', AiModel.MODALITY_TEXT, _day(item.get('created'))))
    for item in _get_json(f'{base}/image-generation-models', headers).get('models') or []:
        slug = str(item.get('id') or '').strip()
        if slug.startswith('grok'):
            price = item.get('image_price')
            extra = {'image_price': Decimal(str(price)) / XAI_PRICE_UNIT} if isinstance(price, (int, float)) and price > 0 else {}
            rows.append((slug, '', AiModel.MODALITY_IMAGE, {**extra, **_day(item.get('created'))}))
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
            if not name.startswith(('models/gemini-', 'models/nano-banana', 'models/imagen-')):
                continue
            slug = name[len('models/'):]
            label = str(item.get('displayName') or '')
            methods = item.get('supportedGenerationMethods') or []
            image = any(w in slug for w in GOOGLE_IMAGE_WORDS) or 'nano banana' in label.lower()
            if not ('generateContent' in methods or (image and 'predict' in methods)):
                continue
            if any(word in slug for word in GOOGLE_SKIP_WORDS):
                continue
            rows.append((slug, label, AiModel.MODALITY_IMAGE if image else AiModel.MODALITY_TEXT))
        page_token = str(data.get('nextPageToken') or '')
        if not page_token:
            break
    return rows


def list_meta_models(api_key: str) -> list[tuple[str, str, str]]:
    """Meta's OpenAI-compatible /models list; keeps the muse-spark chat models."""
    base = (getattr(settings, 'META_API_BASE', None) or 'https://api.meta.ai/v1').strip().rstrip('/')
    rows = []
    for item in _get_json(f'{base}/models', {'Authorization': f'Bearer {api_key}'}).get('data') or []:
        slug = str(item.get('id') or '').strip()
        if slug.startswith('muse-spark'):
            rows.append((slug, '', AiModel.MODALITY_TEXT))
    return rows


def list_openai_models(api_key: str) -> list[tuple[str, str, str]]:
    """OpenAI's /models: the gpt-*, o<digit>* and chatgpt-* chat models (text) and the gpt-image / dall-e-3 image
    models (image)."""
    base = (getattr(settings, 'OPENAI_API_BASE', None) or 'https://api.openai.com/v1').strip().rstrip('/')
    rows = []
    for item in _get_json(f'{base}/models', {'Authorization': f'Bearer {api_key}'}).get('data') or []:
        slug = str(item.get('id') or '').strip()
        low = slug.lower()
        if low.startswith(OPENAI_IMAGE_PREFIXES):
            rows.append((slug, '', AiModel.MODALITY_IMAGE, _day(item.get('created'))))
            continue
        chat = low.startswith(('gpt-', 'chatgpt-')) or (len(low) > 1 and low[0] == 'o' and low[1].isdigit())
        if not chat or low.startswith(OPENAI_SKIP_PREFIXES) or any(w in low for w in OPENAI_SKIP_WORDS):
            continue
        rows.append((slug, '', AiModel.MODALITY_TEXT, _day(item.get('created'))))
    return rows


def drop_snapshots(rows: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Leave out a dated snapshot (gpt-9-2026-08-07, claude-x-20261101) when its plain alias is also listed."""
    slugs = {r[0] for r in rows}
    out = []
    for row in rows:
        m = SNAPSHOT.match(row[0])
        if m and m.group('base') in slugs:
            continue
        out.append(row)
    return out


PROVIDER_LISTERS = (
    (AiModel.PROVIDER_ANTHROPIC, resolve_anthropic_api_key, lambda key: drop_snapshots(list_anthropic_models(key))),
    (AiModel.PROVIDER_OPENAI, resolve_openai_api_key, lambda key: drop_snapshots(list_openai_models(key))),
    (AiModel.PROVIDER_XAI, resolve_xai_api_key, list_xai_models),
    (AiModel.PROVIDER_GOOGLE, resolve_google_api_key, list_google_models),
    (AiModel.PROVIDER_META, resolve_meta_api_key, list_meta_models),
)


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
    effort = ai_effort(action_row.purpose)
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
    default_model = ai_model(purpose)
    default_effort = ai_effort(purpose)
    slug = str(model or '').strip() or default_model
    if slug != default_model and not AiModel.objects.filter(
        slug=slug, status=AiModel.STATUS_ACTIVE, modality=AiModel.MODALITY_TEXT,
    ).exists():
        raise ValueError('Pick a model from the list.')
    run_effort = str(effort or '').strip().lower() or default_effort
    if run_effort not in EFFORT_VALUES:
        raise ValueError('Effort must be off, low, medium, high, or max.')
    return slug, run_effort
