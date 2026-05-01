"""Route chat-style completions to Anthropic or xAI (Grok) based on settings and model id."""

from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class LLMConfigError(Exception):
    """Missing API key or invalid provider configuration."""


def resolve_llm_provider(model_id: str) -> str:
    """
    anthropic | xai

    AI_PROVIDER: auto (default) → grok-* models use xai, otherwise anthropic.
    """
    raw = (getattr(settings, 'AI_PROVIDER', None) or 'auto').strip().lower()
    mid = (model_id or '').strip().lower()
    if raw == 'xai':
        return 'xai'
    if raw == 'anthropic':
        return 'anthropic'
    if raw != 'auto':
        logger.warning('Unknown AI_PROVIDER=%r; using auto.', raw)
    if mid.startswith('grok'):
        return 'xai'
    return 'anthropic'


def llm_chat_completion_text(
    *,
    system: str,
    user: str,
    model_id: str,
    max_tokens: int = 2048,
    log_source: str = '',
    log_detail: str = '',
) -> tuple[str, str]:
    """
    Single-turn chat completion. Returns (assistant_text, model_used).

    Raises LLMConfigError if credentials are missing for the resolved provider.
    Propagates provider SDK errors for the caller to map to HTTP responses.
    """
    provider = resolve_llm_provider(model_id)
    mid = (model_id or '').strip()

    if provider == 'anthropic':
        return _anthropic_completion(
            system=system,
            user=user,
            model_id=mid,
            max_tokens=max_tokens,
            log_source=log_source,
            log_detail=log_detail,
        )

    return _xai_completion(
        system=system,
        user=user,
        model_id=mid,
        max_tokens=max_tokens,
        log_source=log_source,
        log_detail=log_detail,
    )


def _anthropic_completion(
    *,
    system: str,
    user: str,
    model_id: str,
    max_tokens: int,
    log_source: str,
    log_detail: str,
) -> tuple[str, str]:
    import anthropic as anthropic_lib

    from apps.core.services.ai_usage_log import log_ai_usage_from_response

    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
    if not api_key:
        raise LLMConfigError('ANTHROPIC_API_KEY is not configured.')

    client = anthropic_lib.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        system=[{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}],
        messages=[{'role': 'user', 'content': user}],
    )

    if log_source:
        log_ai_usage_from_response(
            log_source,
            response,
            model=model_id,
            detail=log_detail,
        )

    content_text = ''
    for block in response.content:
        if block.type == 'text':
            content_text += block.text

    model_used = getattr(response, 'model', None) or model_id
    return content_text, model_used


def _xai_completion(
    *,
    system: str,
    user: str,
    model_id: str,
    max_tokens: int,
    log_source: str,
    log_detail: str,
) -> tuple[str, str]:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise LLMConfigError(
            'openai package is required for Grok/xAI. Install with: pip install openai',
        ) from e

    from apps.core.services.ai_usage_log import log_ai_usage

    api_key = getattr(settings, 'XAI_API_KEY', '') or ''
    if not api_key:
        raise LLMConfigError(
            'XAI_API_KEY (or GROK_API_KEY) is not configured for Grok models.',
        )

    base_url = (getattr(settings, 'XAI_API_BASE', None) or 'https://api.x.ai/v1').strip()
    client = OpenAI(api_key=api_key, base_url=base_url)

    response = client.chat.completions.create(
        model=model_id,
        max_tokens=max_tokens,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ],
    )

    choice = response.choices[0].message
    content_text = (choice.content or '').strip()
    model_used = getattr(response, 'model', None) or model_id

    if log_source:
        u = getattr(response, 'usage', None)
        inp = int(getattr(u, 'prompt_tokens', 0) or 0) if u else 0
        out = int(getattr(u, 'completion_tokens', 0) or 0) if u else 0
        log_ai_usage(
            log_source,
            model_used,
            input_tokens=inp,
            output_tokens=out,
            detail=log_detail,
            success=True,
            error=None,
        )

    return content_text, model_used
