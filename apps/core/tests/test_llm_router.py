"""LLM router: provider/key resolution and per-provider completion routing.

All HTTP/SDK traffic is mocked — no network calls. One routing test per provider
(anthropic SDK, xAI REST, Google REST) plus error normalization and purpose lookup.
"""

import json
from unittest import mock

from django.test import SimpleTestCase, override_settings

from apps.core.services.llm_router import (
    LLMAPIError,
    LLMConfigError,
    ai_model,
    is_provider_configured,
    llm_chat_text,
    llm_chat_tool_input,
    llm_complete,
    resolve_api_key,
    resolve_provider,
)


@override_settings(AI_PROVIDER='auto')
class ResolveProviderTests(SimpleTestCase):
    def test_model_id_prefixes(self):
        self.assertEqual(resolve_provider('grok-4.3'), 'xai')
        self.assertEqual(resolve_provider('grok-4-1-fast'), 'xai')
        self.assertEqual(resolve_provider('gemini-2.5-flash'), 'google')
        self.assertEqual(resolve_provider('claude-sonnet-4-6'), 'anthropic')
        self.assertEqual(resolve_provider(''), 'anthropic')

    @override_settings(AI_PROVIDER='xai')
    def test_forced_provider_overrides_model_id(self):
        self.assertEqual(resolve_provider('claude-sonnet-4-6'), 'xai')

    @override_settings(AI_PROVIDER='google')
    def test_forced_google(self):
        self.assertEqual(resolve_provider('grok-4.3'), 'google')


@override_settings(
    AI_PROVIDER='auto',
    ANTHROPIC_API_KEY='',
    XAI_API_KEY='',
    GOOGLE_API_KEY='',
    GEMINI_API_KEY='',
)
class ResolveApiKeyTests(SimpleTestCase):
    def test_missing_keys_raise_config_error(self):
        for provider in ('anthropic', 'xai', 'google'):
            with self.assertRaises(LLMConfigError):
                resolve_api_key(provider)

    @override_settings(XAI_API_KEY='xai-k', GOOGLE_API_KEY='goo-k', ANTHROPIC_API_KEY='ant-k')
    def test_present_keys_returned(self):
        self.assertEqual(resolve_api_key('xai'), 'xai-k')
        self.assertEqual(resolve_api_key('google'), 'goo-k')
        self.assertEqual(resolve_api_key('anthropic'), 'ant-k')

    @override_settings(GOOGLE_API_KEY='', GEMINI_API_KEY='gem-k')
    def test_gemini_alias(self):
        self.assertEqual(resolve_api_key('google'), 'gem-k')

    @override_settings(XAI_API_KEY='xai-k')
    def test_is_provider_configured(self):
        self.assertTrue(is_provider_configured('grok-4.3'))
        self.assertFalse(is_provider_configured('claude-sonnet-4-6'))
        self.assertFalse(is_provider_configured('gemini-2.5-flash'))


class _FakeHTTPResponse:
    def __init__(self, payload, status_code=200, text=''):
        self._payload = payload
        self.status_code = status_code
        self.text = text or json.dumps(payload)

    def json(self):
        return self._payload


class _FakeAnthropicBlock:
    def __init__(self, type_, **attrs):
        self.type = type_
        for k, v in attrs.items():
            setattr(self, k, v)


class _FakeAnthropicUsage:
    input_tokens = 11
    output_tokens = 7
    cache_creation_input_tokens = 0
    cache_read_input_tokens = 0


class _FakeAnthropicResponse:
    def __init__(self, blocks):
        self.content = blocks
        self.usage = _FakeAnthropicUsage()
        self.model = 'claude-sonnet-4-6'
        self.stop_reason = 'end_turn'
        self.id = 'msg_test'


@override_settings(
    AI_PROVIDER='auto',
    ANTHROPIC_API_KEY='ant-k',
    XAI_API_KEY='xai-k',
    GOOGLE_API_KEY='goo-k',
    XAI_API_BASE='https://api.x.ai/v1',
)
class RouterCompletionTests(SimpleTestCase):
    def test_anthropic_route(self):
        fake = _FakeAnthropicResponse([_FakeAnthropicBlock('text', text='hello')])
        client = mock.MagicMock()
        client.messages.create.return_value = fake
        with mock.patch('anthropic.Anthropic', return_value=client) as ctor:
            result = llm_complete(
                model_id='claude-sonnet-4-6',
                system='sys',
                user='hi',
                max_tokens=64,
            )
        ctor.assert_called_once_with(api_key='ant-k')
        kwargs = client.messages.create.call_args.kwargs
        self.assertEqual(kwargs['model'], 'claude-sonnet-4-6')
        self.assertEqual(kwargs['max_tokens'], 64)
        self.assertEqual(result.text, 'hello')
        self.assertEqual(result.model_used, 'claude-sonnet-4-6')
        self.assertEqual(result.input_tokens, 11)
        self.assertEqual(result.output_tokens, 7)

    def test_anthropic_tool_input(self):
        fake = _FakeAnthropicResponse([
            _FakeAnthropicBlock('tool_use', name='suggest_mappings', input={'suggestions': []}),
        ])
        client = mock.MagicMock()
        client.messages.create.return_value = fake
        tools = [{'name': 'suggest_mappings', 'description': '', 'input_schema': {'type': 'object'}}]
        with mock.patch('anthropic.Anthropic', return_value=client):
            result = llm_complete(
                model_id='claude-sonnet-4-6',
                system='sys',
                user='hi',
                tool_name='suggest_mappings',
                tools=tools,
            )
        self.assertEqual(result.tool_input, {'suggestions': []})
        kwargs = client.messages.create.call_args.kwargs
        self.assertEqual(kwargs['tool_choice'], {'type': 'tool', 'name': 'suggest_mappings'})

    def test_xai_route(self):
        payload = {
            'id': 'cmpl-1',
            'model': 'grok-4.3',
            'choices': [{'message': {'content': 'grok says hi'}, 'finish_reason': 'stop'}],
            'usage': {'prompt_tokens': 5, 'completion_tokens': 3},
        }
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)) as post:
            result = llm_complete(model_id='grok-4.3', system='sys', user='hi', temperature=0)
        url = post.call_args.args[0]
        self.assertIn('api.x.ai', url)
        sent = post.call_args.kwargs['json']
        self.assertEqual(sent['model'], 'grok-4.3')
        self.assertEqual(sent['temperature'], 0)
        self.assertEqual(sent['messages'][0], {'role': 'system', 'content': 'sys'})
        self.assertEqual(
            post.call_args.kwargs['headers']['Authorization'], 'Bearer xai-k',
        )
        self.assertEqual(result.text, 'grok says hi')
        self.assertEqual(result.input_tokens, 5)

    def test_google_route(self):
        payload = {
            'modelVersion': 'gemini-2.5-flash',
            'candidates': [
                {'content': {'parts': [{'text': 'gemini says hi'}]}, 'finishReason': 'STOP'},
            ],
            'usageMetadata': {'promptTokenCount': 9, 'candidatesTokenCount': 4},
        }
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)) as post:
            result = llm_complete(model_id='gemini-2.5-flash', system='sys', user='hi')
        url = post.call_args.args[0]
        self.assertIn('generativelanguage.googleapis.com', url)
        self.assertIn('gemini-2.5-flash:generateContent', url)
        self.assertEqual(post.call_args.kwargs['headers']['x-goog-api-key'], 'goo-k')
        sent = post.call_args.kwargs['json']
        self.assertEqual(sent['systemInstruction'], {'parts': [{'text': 'sys'}]})
        self.assertEqual(result.text, 'gemini says hi')
        self.assertEqual(result.output_tokens, 4)

    def test_google_tool_input(self):
        payload = {
            'candidates': [
                {
                    'content': {
                        'parts': [
                            {'functionCall': {'name': 'suggest_mappings', 'args': {'suggestions': [{'target': 't', 'formula': 'f'}]}}},
                        ],
                    },
                },
            ],
        }
        tools = [{'name': 'suggest_mappings', 'description': '', 'input_schema': {'type': 'object'}}]
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)) as post:
            data, model_used = llm_chat_tool_input(
                purpose='PREPROCESSING_SUGGEST',
                model_override='gemini-2.5-flash',
                system='sys',
                user='hi',
                tool_name='suggest_mappings',
                tools=tools,
            )
        sent = post.call_args.kwargs['json']
        self.assertEqual(
            sent['toolConfig'],
            {'functionCallingConfig': {'mode': 'ANY', 'allowedFunctionNames': ['suggest_mappings']}},
        )
        self.assertEqual(data['suggestions'][0]['formula'], 'f')
        self.assertEqual(model_used, 'gemini-2.5-flash')

    def test_xai_tool_input(self):
        payload = {
            'model': 'grok-4.3',
            'choices': [
                {
                    'message': {
                        'content': '',
                        'tool_calls': [
                            {'function': {'name': 'suggest_mappings', 'arguments': json.dumps({'suggestions': []})}},
                        ],
                    },
                },
            ],
        }
        tools = [{'name': 'suggest_mappings', 'description': '', 'input_schema': {'type': 'object'}}]
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)) as post:
            data, _ = llm_chat_tool_input(
                purpose='PREPROCESSING_SUGGEST',
                model_override='grok-4.3',
                system='sys',
                user='hi',
                tool_name='suggest_mappings',
                tools=tools,
            )
        sent = post.call_args.kwargs['json']
        self.assertEqual(sent['tool_choice'], {'type': 'function', 'function': {'name': 'suggest_mappings'}})
        self.assertEqual(data, {'suggestions': []})

    def test_missing_tool_call_raises_value_error(self):
        payload = {'choices': [{'message': {'content': 'no tool'}}]}
        tools = [{'name': 'suggest_mappings', 'description': '', 'input_schema': {'type': 'object'}}]
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)):
            with self.assertRaises(ValueError):
                llm_chat_tool_input(
                    purpose='PREPROCESSING_SUGGEST',
                    model_override='grok-4.3',
                    system='sys',
                    user='hi',
                    tool_name='suggest_mappings',
                    tools=tools,
                )

    def test_http_429_normalized_to_retryable_rate_limit(self):
        with mock.patch(
            'requests.post',
            return_value=_FakeHTTPResponse({}, status_code=429, text='slow down'),
        ):
            with self.assertRaises(LLMAPIError) as ctx:
                llm_complete(model_id='grok-4.3', system='', user='hi')
        self.assertEqual(ctx.exception.kind, 'rate_limit')
        self.assertTrue(ctx.exception.retryable)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_http_401_normalized_to_auth(self):
        with mock.patch(
            'requests.post',
            return_value=_FakeHTTPResponse({}, status_code=401, text='bad key'),
        ):
            with self.assertRaises(LLMAPIError) as ctx:
                llm_complete(model_id='gemini-2.5-flash', system='', user='hi')
        self.assertEqual(ctx.exception.kind, 'auth')
        self.assertFalse(ctx.exception.retryable)

    @override_settings(XAI_API_KEY='')
    def test_missing_key_raises_config_error_before_any_call(self):
        with mock.patch('requests.post') as post:
            with self.assertRaises(LLMConfigError):
                llm_complete(model_id='grok-4.3', system='', user='hi')
        post.assert_not_called()


@override_settings(
    AI_PROVIDER='auto',
    XAI_API_KEY='xai-k',
    AI_MODEL_AI_CHAT='grok-4-1-fast',
    AI_MODEL='claude-sonnet-4-6',
)
class PurposeResolutionTests(SimpleTestCase):
    def test_ai_model_purpose_lookup_and_override(self):
        self.assertEqual(ai_model('AI_CHAT'), 'grok-4-1-fast')
        self.assertEqual(ai_model('AI_CHAT', 'gemini-2.5-flash'), 'gemini-2.5-flash')
        # Unset purpose falls back to AI_MODEL.
        self.assertEqual(ai_model('NO_SUCH_PURPOSE'), 'claude-sonnet-4-6')

    def test_llm_chat_text_uses_purpose_model(self):
        payload = {
            'model': 'grok-4-1-fast',
            'choices': [{'message': {'content': 'ok'}}],
        }
        with mock.patch('requests.post', return_value=_FakeHTTPResponse(payload)) as post:
            text, model_used = llm_chat_text(purpose='AI_CHAT', system='s', user='u')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'grok-4-1-fast')
        self.assertEqual(text, 'ok')
        self.assertEqual(model_used, 'grok-4-1-fast')
