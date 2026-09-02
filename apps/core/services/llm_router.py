"""One LLM routing layer: purpose → model id → provider → API key → completion.

Provider is inferred from the model id: ``grok-*`` → xAI, ``gemini-*`` → Google,
anything else → Anthropic. ``AI_PROVIDER`` (auto | anthropic | xai | google)
force-overrides the inference for every call.

Application code should use :func:`llm_chat_text` / :func:`llm_chat_tool_input`
with a purpose name from ``.env`` (``AI_MODEL_<PURPOSE>``), or :func:`llm_complete`
when it needs token usage / stop reason. No feature code should construct an
``anthropic.Anthropic()`` client or read provider API keys directly.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from django.conf import settings

from apps.core.ai_config import ai_model  # noqa: F401 - re-exported router API
from apps.core.services.llm_api_keys import (
    resolve_anthropic_api_key,
    resolve_google_api_key,
    resolve_xai_api_key,
)

logger = logging.getLogger(__name__)

GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
DEFAULT_TIMEOUT_SECONDS = 60.0
DEFAULT_MAX_TOKENS = 4096

PROVIDER_KEY_HINT = {
    'anthropic': 'ANTHROPIC_API_KEY',
    'xai': 'XAI_API_KEY (or GROK_API_KEY)',
    'google': 'GOOGLE_API_KEY (or GEMINI_API_KEY)',
}

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


class LLMAPIError(Exception):
    """Normalized provider API failure (any provider).

    ``kind``: auth | rate_limit | bad_request | connection | api.
    ``status_code``: HTTP status when known.
    """

    def __init__(self, message: str, *, kind: str = 'api', status_code: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code

    @property
    def retryable(self) -> bool:
        return self.kind in ('rate_limit', 'connection')


@dataclass
class LLMResult:
    text: str
    model_used: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    stop_reason: str = ''
    response_id: str = ''
    tool_input: dict | None = None


def resolve_provider(model_id: str) -> str:
    """anthropic | xai | google - by model id, unless AI_PROVIDER forces one."""
    raw = (getattr(settings, 'AI_PROVIDER', None) or 'auto').strip().lower()
    if raw in ('anthropic', 'xai', 'google'):
        return raw
    if raw != 'auto':
        logger.warning('Unknown AI_PROVIDER=%r; using auto.', raw)
    mid = (model_id or '').strip().lower()
    if mid.startswith('grok'):
        return 'xai'
    if mid.startswith('gemini'):
        return 'google'
    return 'anthropic'


def resolve_api_key(provider: str) -> str:
    """Return the API key for a provider; raise LLMConfigError when missing."""
    if provider == 'xai':
        key = resolve_xai_api_key()
    elif provider == 'google':
        key = resolve_google_api_key()
    elif provider == 'anthropic':
        key = resolve_anthropic_api_key()
    else:
        raise LLMConfigError(f'Unknown LLM provider {provider!r}.')
    if not key:
        raise LLMConfigError(
            f'{PROVIDER_KEY_HINT[provider]} is not configured in .env '
            f'(required for {provider} models).',
        )
    return key


def is_provider_configured(model_id: str) -> bool:
    """True when the API key for this model's provider is present."""
    try:
        resolve_api_key(resolve_provider(model_id))
    except LLMConfigError:
        return False
    return True


def suggest_mappings_tools() -> list[dict]:
    """Tool list for the suggest-formulas endpoint (Anthropic input_schema format)."""
    return [
        {
            'name': 'suggest_mappings',
            'description': (
                'Return CSV column formula suggestions for manifest standardization.'
            ),
            'input_schema': SUGGEST_MAPPINGS_JSON_SCHEMA,
        },
    ]


# ── message helpers ──────────────────────────────────────────────────────────

def _message_text(content) -> str:
    """Flatten anthropic-style content blocks to plain text for xAI/Google."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get('type') == 'text':
                parts.append(str(block.get('text') or ''))
            elif isinstance(block, str):
                parts.append(block)
        return '\n'.join(parts)
    return str(content or '')


def _build_messages(user, messages) -> list[dict]:
    if messages:
        return list(messages)
    return [{'role': 'user', 'content': user or ''}]


# ── provider calls ───────────────────────────────────────────────────────────

def _anthropic_complete(
    *,
    model_id: str,
    api_key: str,
    system: str,
    messages: list[dict],
    max_tokens: int | None,
    temperature: float | None,
    timeout: float | None,
    tool_name: str | None,
    tools: list[dict] | None,
) -> LLMResult:
    import anthropic as anthropic_lib

    client = anthropic_lib.Anthropic(api_key=api_key)
    kwargs: dict = {
        'model': model_id,
        'max_tokens': max_tokens or DEFAULT_MAX_TOKENS,
        'messages': messages,
    }
    if system:
        kwargs['system'] = [
            {'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}},
        ]
    if temperature is not None:
        kwargs['temperature'] = temperature
    if timeout is not None:
        kwargs['timeout'] = timeout
    if tools:
        kwargs['tools'] = tools
        if tool_name:
            kwargs['tool_choice'] = {'type': 'tool', 'name': tool_name}

    try:
        response = client.messages.create(**kwargs)
    except anthropic_lib.AuthenticationError as e:
        raise LLMAPIError(str(e), kind='auth', status_code=401) from e
    except anthropic_lib.RateLimitError as e:
        raise LLMAPIError(str(e), kind='rate_limit', status_code=429) from e
    except anthropic_lib.BadRequestError as e:
        raise LLMAPIError(str(e), kind='bad_request', status_code=400) from e
    except anthropic_lib.APIConnectionError as e:
        raise LLMAPIError(str(e), kind='connection') from e
    except anthropic_lib.APIError as e:
        raise LLMAPIError(str(e), status_code=getattr(e, 'status_code', None)) from e

    text = ''
    tool_input = None
    for block in response.content:
        btype = getattr(block, 'type', '')
        if btype == 'text':
            text += block.text
        elif btype == 'tool_use' and tool_name and getattr(block, 'name', '') == tool_name:
            inp = getattr(block, 'input', None)
            if isinstance(inp, dict) and tool_input is None:
                tool_input = inp

    usage = getattr(response, 'usage', None)
    return LLMResult(
        text=text,
        model_used=getattr(response, 'model', None) or model_id,
        input_tokens=int(getattr(usage, 'input_tokens', 0) or 0),
        output_tokens=int(getattr(usage, 'output_tokens', 0) or 0),
        cache_creation_tokens=int(getattr(usage, 'cache_creation_input_tokens', 0) or 0),
        cache_read_tokens=int(getattr(usage, 'cache_read_input_tokens', 0) or 0),
        stop_reason=str(getattr(response, 'stop_reason', '') or ''),
        response_id=str(getattr(response, 'id', '') or ''),
        tool_input=tool_input,
    )


def _requests_post(url: str, *, headers: dict, payload: dict, timeout: float | None) -> dict:
    import requests

    try:
        resp = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout or DEFAULT_TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        raise LLMAPIError(str(e), kind='connection') from e
    if resp.status_code >= 400:
        body = (resp.text or '')[:500]
        kind = {401: 'auth', 403: 'auth', 429: 'rate_limit', 400: 'bad_request'}.get(
            resp.status_code, 'api',
        )
        raise LLMAPIError(
            f'HTTP {resp.status_code} from {url.split("/")[2]}: {body}',
            kind=kind,
            status_code=resp.status_code,
        )
    return resp.json()


def _xai_complete(
    *,
    model_id: str,
    api_key: str,
    system: str,
    messages: list[dict],
    max_tokens: int | None,
    temperature: float | None,
    timeout: float | None,
    tool_name: str | None,
    tools: list[dict] | None,
) -> LLMResult:
    base_url = (getattr(settings, 'XAI_API_BASE', None) or 'https://api.x.ai/v1').strip()
    oai_messages = []
    if system:
        oai_messages.append({'role': 'system', 'content': system})
    for m in messages:
        oai_messages.append({'role': m.get('role', 'user'), 'content': _message_text(m.get('content'))})

    payload: dict = {'model': model_id, 'messages': oai_messages}
    if max_tokens is not None:
        payload['max_tokens'] = max_tokens
    if temperature is not None:
        payload['temperature'] = temperature
    if tools:
        payload['tools'] = [
            {
                'type': 'function',
                'function': {
                    'name': t['name'],
                    'description': t.get('description', ''),
                    'parameters': t['input_schema'],
                },
            }
            for t in tools
        ]
        if tool_name:
            payload['tool_choice'] = {'type': 'function', 'function': {'name': tool_name}}

    data = _requests_post(
        f'{base_url}/chat/completions',
        headers={'Authorization': f'Bearer {api_key}'},
        payload=payload,
        timeout=timeout,
    )

    choice = (data.get('choices') or [{}])[0]
    message = choice.get('message') or {}
    tool_input = None
    if tool_name:
        for tc in message.get('tool_calls') or []:
            fn = tc.get('function') or {}
            if fn.get('name') == tool_name:
                try:
                    parsed = json.loads(fn.get('arguments') or '{}')
                except json.JSONDecodeError as e:
                    raise ValueError(f'Invalid Grok tool arguments JSON: {e}') from e
                if isinstance(parsed, dict):
                    tool_input = parsed
                    break

    usage = data.get('usage') or {}
    return LLMResult(
        text=str(message.get('content') or ''),
        model_used=str(data.get('model') or model_id),
        input_tokens=int(usage.get('prompt_tokens') or 0),
        output_tokens=int(usage.get('completion_tokens') or 0),
        stop_reason=str(choice.get('finish_reason') or ''),
        response_id=str(data.get('id') or ''),
        tool_input=tool_input,
    )


def _google_complete(
    *,
    model_id: str,
    api_key: str,
    system: str,
    messages: list[dict],
    max_tokens: int | None,
    temperature: float | None,
    timeout: float | None,
    tool_name: str | None,
    tools: list[dict] | None,
) -> LLMResult:
    contents = []
    for m in messages:
        role = 'model' if m.get('role') == 'assistant' else 'user'
        contents.append({'role': role, 'parts': [{'text': _message_text(m.get('content'))}]})

    generation_config: dict = {}
    if temperature is not None:
        generation_config['temperature'] = temperature
    if max_tokens is not None:
        generation_config['maxOutputTokens'] = max_tokens

    payload: dict = {'contents': contents}
    if system:
        payload['systemInstruction'] = {'parts': [{'text': system}]}
    if generation_config:
        payload['generationConfig'] = generation_config
    if tools:
        payload['tools'] = [
            {
                'functionDeclarations': [
                    {
                        'name': t['name'],
                        'description': t.get('description', ''),
                        'parameters': t['input_schema'],
                    }
                    for t in tools
                ],
            },
        ]
        if tool_name:
            payload['toolConfig'] = {
                'functionCallingConfig': {'mode': 'ANY', 'allowedFunctionNames': [tool_name]},
            }

    data = _requests_post(
        f'{GOOGLE_API_BASE}/models/{model_id}:generateContent',
        headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key},
        payload=payload,
        timeout=timeout,
    )

    candidate = (data.get('candidates') or [{}])[0]
    parts = ((candidate.get('content') or {}).get('parts') or [])
    text = ''.join(str(p.get('text', '')) for p in parts)
    tool_input = None
    if tool_name:
        for p in parts:
            fc = p.get('functionCall')
            if isinstance(fc, dict) and fc.get('name') == tool_name and isinstance(fc.get('args'), dict):
                tool_input = fc['args']
                break

    usage = data.get('usageMetadata') or {}
    return LLMResult(
        text=text,
        model_used=str(data.get('modelVersion') or model_id),
        input_tokens=int(usage.get('promptTokenCount') or 0),
        output_tokens=int(usage.get('candidatesTokenCount') or 0),
        stop_reason=str(candidate.get('finishReason') or ''),
        response_id=str(data.get('responseId') or ''),
        tool_input=tool_input,
    )


_PROVIDER_CALLS = {
    'anthropic': _anthropic_complete,
    'xai': _xai_complete,
    'google': _google_complete,
}


# ── public completion API ────────────────────────────────────────────────────

def llm_complete(
    *,
    model_id: str,
    system: str = '',
    user: str | None = None,
    messages: list[dict] | None = None,
    max_tokens: int | None = DEFAULT_MAX_TOKENS,
    temperature: float | None = None,
    timeout: float | None = None,
    api_key: str | None = None,
    tool_name: str | None = None,
    tools: list[dict] | None = None,
    log_source: str = '',
    log_detail: str = '',
    log_auction_id: int | None = None,
    log_marketplace: str | None = None,
) -> LLMResult:
    """One completion call routed by model id. Raises LLMConfigError / LLMAPIError.

    Pass either ``user`` (single-turn) or ``messages`` (multi-turn, anthropic-style
    role/content dicts; content blocks are flattened to text for xAI/Google).
    """
    mid = (model_id or '').strip()
    provider = resolve_provider(mid)
    key = api_key or resolve_api_key(provider)

    result = _PROVIDER_CALLS[provider](
        model_id=mid,
        api_key=key,
        system=system,
        messages=_build_messages(user, messages),
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        tool_name=tool_name,
        tools=tools,
    )

    if log_source:
        try:
            from apps.core.services.ai_usage_log import log_ai_usage

            log_ai_usage(
                log_source,
                result.model_used,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cache_creation_tokens=result.cache_creation_tokens,
                cache_read_tokens=result.cache_read_tokens,
                auction_id=log_auction_id,
                marketplace=log_marketplace,
                detail=log_detail,
                success=True,
                error=None,
            )
        except Exception:  # noqa: BLE001 - usage logging must never fail a call
            logger.exception('AI usage logging failed for %s', log_source)
    return result


def llm_chat_text(
    *,
    purpose: str,
    system: str,
    user: str | None = None,
    messages: list[dict] | None = None,
    model_override: str | None = None,
    max_tokens: int = 2048,
    temperature: float | None = None,
    timeout: float | None = None,
    log_source: str = '',
    log_detail: str = '',
    log_auction_id: int | None = None,
    log_marketplace: str | None = None,
) -> tuple[str, str]:
    """Single chat completion for a configured purpose. Returns (text, model_used)."""
    result = llm_complete(
        model_id=ai_model(purpose, model_override),
        system=system,
        user=user,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        log_source=log_source,
        log_detail=log_detail,
        log_auction_id=log_auction_id,
        log_marketplace=log_marketplace,
    )
    return result.text, result.model_used


def llm_chat_tool_input(
    *,
    purpose: str,
    system: str,
    user: str,
    tool_name: str,
    tools: list[dict],
    model_override: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    timeout: float | None = None,
    log_source: str = '',
    log_detail: str = '',
) -> tuple[dict, str]:
    """Forced tool call for a configured purpose; returns (tool input dict, model_used).

    Raises ValueError when the response contains no usable tool call.
    """
    result = llm_complete(
        model_id=ai_model(purpose, model_override),
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
        tool_name=tool_name,
        tools=tools,
        log_source=log_source,
        log_detail=log_detail,
    )
    if not isinstance(result.tool_input, dict) or not result.tool_input:
        raise ValueError(f'Model response missing tool call input for {tool_name}')
    return result.tool_input, result.model_used
