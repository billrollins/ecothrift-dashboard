"""Route chat-style completions to Anthropic or xAI (Grok) based on settings and model id."""

from __future__ import annotations

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

SUGGEST_MAPPINGS_JSON_SCHEMA: dict = {
    'type': 'object',
    'properties': {
        'suggestions': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'target': {'type': 'string'},
                    'formula': {'type': 'string'},
                    'reasoning': {'type': 'string'},
                    'confidence': {
                        'type': 'string',
                        'enum': ['high', 'medium', 'low'],
                    },
                },
                'required': ['target', 'formula'],
            },
        },
    },
    'required': ['suggestions'],
}


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


def anthropic_tools_suggest_mappings() -> list[dict]:
    return [
        {
            'name': 'suggest_mappings',
            'description': (
                'Return CSV column formula suggestions for manifest standardization.'
            ),
            'input_schema': SUGGEST_MAPPINGS_JSON_SCHEMA,
        },
    ]


def llm_chat_completion_tool_input(
    *,
    system: str,
    user: str,
    model_id: str,
    tool_name: str,
    tools: list[dict],
    temperature: float = 0.0,
    max_tokens: int = 4096,
    log_source: str = '',
    log_detail: str = '',
) -> tuple[dict, str]:
    """
    Single-turn forced tool call; returns parsed tool ``input`` dict and ``model_used``.

    Anthropic uses native ``tool_use`` blocks; Grok/xAI uses OpenAI-compatible chat
    completions ``tool_calls[].function.arguments``.
    """
    provider = resolve_llm_provider(model_id)
    mid = (model_id or '').strip()

    if provider == 'anthropic':
        import anthropic as anthropic_lib

        from apps.core.services.ai_usage_log import log_ai_usage_from_response

        api_key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
        if not api_key:
            raise LLMConfigError('ANTHROPIC_API_KEY is not configured.')

        client = anthropic_lib.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=mid,
            max_tokens=max_tokens,
            temperature=temperature,
            system=[{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}],
            messages=[{'role': 'user', 'content': user}],
            tools=tools,
            tool_choice={'type': 'tool', 'name': tool_name},
        )

        if log_source:
            log_ai_usage_from_response(
                log_source,
                response,
                model=mid,
                detail=log_detail,
            )

        data = {}
        for block in response.content:
            if getattr(block, 'type', None) == 'tool_use' and getattr(block, 'name', '') == tool_name:
                inp = getattr(block, 'input', None)
                if isinstance(inp, dict):
                    data = inp
                    break

        model_used = getattr(response, 'model', None) or mid
        if not isinstance(data, dict) or not data:
            raise ValueError(f'Anthropic response missing tool_use input for {tool_name}')
        return data, model_used

    # Grok/xAI OpenAI-compatible
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

    oai_tools = []
    for t in tools:
        oai_tools.append({
            'type': 'function',
            'function': {
                'name': t['name'],
                'description': t.get('description', ''),
                'parameters': t['input_schema'],
            },
        })

    response = client.chat.completions.create(
        model=mid,
        max_tokens=max_tokens,
        temperature=temperature,
        tools=oai_tools,
        tool_choice={'type': 'function', 'function': {'name': tool_name}},
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ],
    )

    msg = response.choices[0].message
    model_used = getattr(response, 'model', None) or mid

    tool_calls = getattr(msg, 'tool_calls', None) or []
    data: dict = {}
    for tc in tool_calls:
        fn = getattr(tc, 'function', None)
        if fn and getattr(fn, 'name', '') == tool_name:
            raw = getattr(fn, 'arguments', '') or '{}'
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    data = parsed
                    break
            except json.JSONDecodeError as e:
                raise ValueError(f'Invalid Grok tool arguments JSON: {e}') from e

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

    if not isinstance(data, dict) or not data:
        raise ValueError(f'Grok/xAI response missing tool call for {tool_name}')
    return data, model_used


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
