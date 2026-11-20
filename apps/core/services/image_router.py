"""One image call for every provider (Dash #195): model id -> provider -> its image API -> base64 picture.

- **xAI** (grok-imagine-*): ``POST /images/generations`` with ``aspect_ratio``.
- **OpenAI** (gpt-image-*, chatgpt-image-*, dall-e-3): ``POST /images/generations`` with a ``size`` from the aspect.
- **Google** Nano Banana (gemini-*-image*, nano-banana*): ``generateContent`` asking for an IMAGE answer; Imagen
  (imagen-*): ``predict``.

Images are priced per picture: every call is logged in ``AIUsage`` at the model's ``image_price`` from Settings > AI
(``DEFAULT_IMAGE_USD`` while that is blank). Raises :class:`ImageError` with a message a person can read.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal

from django.conf import settings

from apps.core.services.llm_router import GOOGLE_API_BASE, LLMConfigError, resolve_api_key, resolve_provider

logger = logging.getLogger(__name__)

DEFAULT_IMAGE_USD = Decimal('0.07')  # what Label Studio logged per image before prices were kept per model
OPENAI_SIZES = {'1:1': '1024x1024', 'wide': '1536x1024', 'tall': '1024x1536'}


class ImageError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def image_price(model_id: str) -> Decimal | None:
    from apps.core.models import AiModel

    return AiModel.objects.filter(slug=model_id).values_list('image_price', flat=True).first()


def _shape(aspect: str) -> str:
    try:
        w, h = (float(x) for x in str(aspect or '1:1').split(':'))
    except ValueError:
        return '1:1'
    return '1:1' if abs(w - h) / max(w, h) < 0.15 else ('wide' if w > h else 'tall')


def _post(url: str, headers: dict, payload: dict, timeout: float) -> dict:
    import requests

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.RequestException as exc:
        raise ImageError(f'Image API connection error: {exc}', status=503) from exc
    if resp.status_code in (401, 403):
        raise ImageError('Image API authentication failed.', status=503)
    if resp.status_code == 429:
        raise ImageError('Image API rate limited; try again shortly.', status=503)
    if resp.status_code >= 400:
        raise ImageError(f'Image API error ({resp.status_code}): {resp.text[:300]}', status=400)
    try:
        return resp.json()
    except ValueError as exc:
        raise ImageError('Image API returned an unexpected response.') from exc


def _openai_style(base: str, key: str, payload: dict, timeout: float) -> tuple[str, str]:
    data = _post(f'{base.rstrip("/")}/images/generations', {'Authorization': f'Bearer {key}'}, payload, timeout)
    item = (data.get('data') or [{}])[0]
    if not item.get('b64_json'):
        raise ImageError('Image API returned no picture.')
    return item['b64_json'], 'image/png'


def _google(model_id: str, key: str, prompt: str, aspect: str, timeout: float) -> tuple[str, str]:
    headers = {'x-goog-api-key': key}
    if model_id.startswith('imagen'):
        data = _post(f'{GOOGLE_API_BASE}/models/{model_id}:predict', headers,
                     {'instances': [{'prompt': prompt}], 'parameters': {'sampleCount': 1, 'aspectRatio': aspect}}, timeout)
        pred = (data.get('predictions') or [{}])[0]
        if not pred.get('bytesBase64Encoded'):
            raise ImageError('Imagen returned no picture.')
        return pred['bytesBase64Encoded'], pred.get('mimeType') or 'image/png'
    data = _post(f'{GOOGLE_API_BASE}/models/{model_id}:generateContent', headers, {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['TEXT', 'IMAGE'], 'imageConfig': {'aspectRatio': aspect}},
    }, timeout)
    for part in ((data.get('candidates') or [{}])[0].get('content') or {}).get('parts') or []:
        inline = part.get('inlineData') or part.get('inline_data') or {}
        if inline.get('data'):
            return inline['data'], inline.get('mimeType') or inline.get('mime_type') or 'image/png'
    raise ImageError('The model answered without a picture. Try another prompt.')


def generate_image(model_id: str, prompt: str, *, aspect: str = '1:1', timeout: float = 120.0, log_source: str = '',
                   log_purpose: str = '', log_detail: str = '') -> dict:
    """One picture. Returns {b64, content_type, model_used, seconds, cost}. Logs the call with its per-image cost."""
    from apps.core.services.ai_usage_log import log_ai_usage

    mid = str(model_id or '').strip()
    provider = resolve_provider(mid)
    try:
        key = resolve_api_key(provider)
    except LLMConfigError as exc:
        raise ImageError(str(exc), status=503) from exc
    started = time.monotonic()
    if provider == 'xai':
        base = getattr(settings, 'XAI_API_BASE', None) or 'https://api.x.ai/v1'
        b64, mime = _openai_style(base, key, {'model': mid, 'prompt': prompt, 'n': 1, 'response_format': 'b64_json',
                                              'aspect_ratio': aspect}, timeout)
    elif provider == 'openai':
        base = getattr(settings, 'OPENAI_API_BASE', None) or 'https://api.openai.com/v1'
        payload = {'model': mid, 'prompt': prompt, 'n': 1, 'size': OPENAI_SIZES[_shape(aspect)]}
        if mid.startswith('dall-e'):
            payload['response_format'] = 'b64_json'  # gpt-image always answers in base64 and refuses this field
        else:
            payload['quality'] = 'medium'  # the quality the per-image prices in Settings > AI are for
        b64, mime = _openai_style(base, key, payload, timeout)
    elif provider == 'google':
        b64, mime = _google(mid, key, prompt, aspect, timeout)
    else:
        raise ImageError(f'{mid} is not an image model Dash can call (xAI, OpenAI or Google).', status=400)
    seconds = round(time.monotonic() - started, 2)
    cost = image_price(mid)
    try:
        log_ai_usage(log_source or 'image', mid, purpose=log_purpose, cost_usd=cost if cost is not None else DEFAULT_IMAGE_USD,
                     duration_ms=int(seconds * 1000), detail=log_detail[:200])
    except Exception:  # noqa: BLE001 - usage logging must never fail a call
        logger.exception('AI usage logging failed for an image call')
    return {'b64': b64, 'content_type': mime, 'model_used': mid, 'seconds': seconds,
            'cost': None if cost is None else str(cost)}
