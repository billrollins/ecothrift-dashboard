from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.logging import get_logger
from apps.core.services.ai_usage_log import log_ai_usage, log_ai_usage_from_response

logger = get_logger(__name__, 'LOG_AI')

AVAILABLE_MODELS = [
    {'id': 'claude-sonnet-4-6', 'name': 'Claude Sonnet 4.6', 'default': True},
    {'id': 'claude-haiku-4-5', 'name': 'Claude Haiku 4.5', 'default': False},
]

DEFAULT_MODEL = getattr(settings, 'AI_MODEL', None) or next(
    m['id'] for m in AVAILABLE_MODELS if m['default']
)


def _import_anthropic():
    """Lazy import so the server can start even if anthropic isn't installed."""
    import anthropic as _anthropic
    return _anthropic


def get_anthropic_client():
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', None)
    if not api_key:
        return None
    anthropic = _import_anthropic()
    return anthropic.Anthropic(api_key=api_key)


class ModelListView(APIView):
    """GET /api/ai/models/ — return curated list of available Claude models."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'models': AVAILABLE_MODELS, 'default': DEFAULT_MODEL})


class ChatProxyView(APIView):
    """POST /api/ai/chat/ — proxy a single Claude Messages API call.

    Expects JSON body:
        model (str, optional): model id, defaults to DEFAULT_MODEL
        system (str, optional): system prompt
        messages (list): messages array [{role, content}]
        max_tokens (int, optional): defaults to 4096
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        client = get_anthropic_client()
        if client is None:
            return Response(
                {'error': 'ANTHROPIC_API_KEY is not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        data = request.data
        model = data.get('model', DEFAULT_MODEL)
        system_prompt = data.get('system', '')
        messages = data.get('messages', [])
        max_tokens = data.get('max_tokens', 4096)

        if not messages:
            return Response(
                {'error': 'messages is required and must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        anthropic = _import_anthropic()

        try:
            kwargs = {
                'model': model,
                'max_tokens': max_tokens,
                'messages': messages,
            }
            if system_prompt:
                kwargs['system'] = [
                    {'type': 'text', 'text': system_prompt, 'cache_control': {'type': 'ephemeral'}}
                ]
            else:
                kwargs['extra_body'] = {'cache_control': {'type': 'ephemeral'}}

            response = client.messages.create(**kwargs)

            log_ai_usage_from_response(
                'ai_chat_proxy',
                response,
                model=model,
                detail='POST /api/ai/chat/',
            )

            content_text = ''
            for block in response.content:
                if block.type == 'text':
                    content_text += block.text

            u = response.usage
            return Response({
                'id': response.id,
                'model': response.model,
                'content': content_text,
                'stop_reason': response.stop_reason,
                'usage': {
                    'input_tokens': getattr(u, 'input_tokens', 0) or 0,
                    'output_tokens': getattr(u, 'output_tokens', 0) or 0,
                    'cache_creation_tokens': getattr(u, 'cache_creation_input_tokens', 0) or 0,
                    'cache_read_tokens': getattr(u, 'cache_read_input_tokens', 0) or 0,
                },
            })

        except anthropic.BadRequestError as e:
            logger.warning('Anthropic BadRequest: %s', e)
            log_ai_usage(
                'ai_chat_proxy',
                model,
                0,
                0,
                detail='POST /api/ai/chat/',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': f'Bad request to Claude API: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except anthropic.AuthenticationError as e:
            logger.error('Anthropic authentication failed')
            log_ai_usage(
                'ai_chat_proxy',
                model,
                0,
                0,
                detail='POST /api/ai/chat/',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': 'AI service authentication failed. Check API key.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except anthropic.RateLimitError as e:
            log_ai_usage(
                'ai_chat_proxy',
                model,
                0,
                0,
                detail='POST /api/ai/chat/',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': 'AI service rate limit exceeded. Please try again shortly.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except anthropic.APIError as e:
            logger.error('Anthropic API error: %s', e)
            log_ai_usage(
                'ai_chat_proxy',
                model,
                0,
                0,
                detail='POST /api/ai/chat/',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
