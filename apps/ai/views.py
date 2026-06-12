from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.ai_config import ai_model
from apps.core.logging import get_logger
from apps.core.services.ai_usage_log import log_ai_usage
from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

logger = get_logger(__name__, 'LOG_AI')

AVAILABLE_MODELS = [
    {'id': 'claude-sonnet-4-6', 'name': 'Claude Sonnet 4.6', 'default': True},
    {'id': 'claude-haiku-4-5', 'name': 'Claude Haiku 4.5', 'default': False},
]

DEFAULT_MODEL = ai_model('AI_CHAT')


class ModelListView(APIView):
    """GET /api/ai/models/ — return curated list of available models."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'models': AVAILABLE_MODELS, 'default': DEFAULT_MODEL})


class ChatProxyView(APIView):
    """POST /api/ai/chat/ — proxy a single chat completion via the LLM router.

    Expects JSON body:
        model (str, optional): model id, defaults to AI_MODEL_AI_CHAT
        system (str, optional): system prompt
        messages (list): messages array [{role, content}]
        max_tokens (int, optional): defaults to 4096
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
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

        try:
            result = llm_complete(
                model_id=model,
                system=system_prompt,
                messages=messages,
                max_tokens=max_tokens,
                log_source='ai_chat_proxy',
                log_detail='POST /api/ai/chat/',
            )
        except LLMConfigError as e:
            return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except LLMAPIError as e:
            logger.warning('AI chat proxy %s error: %s', e.kind, e)
            log_ai_usage(
                'ai_chat_proxy',
                model,
                0,
                0,
                detail='POST /api/ai/chat/',
                success=False,
                error=str(e),
            )
            if e.kind == 'bad_request':
                return Response(
                    {'error': f'Bad request to AI service: {e}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if e.kind == 'auth':
                return Response(
                    {'error': 'AI service authentication failed. Check API key.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            if e.kind == 'rate_limit':
                return Response(
                    {'error': 'AI service rate limit exceeded. Please try again shortly.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({
            'id': result.response_id,
            'model': result.model_used,
            'content': result.text,
            'stop_reason': result.stop_reason,
            'usage': {
                'input_tokens': result.input_tokens,
                'output_tokens': result.output_tokens,
                'cache_creation_tokens': result.cache_creation_tokens,
                'cache_read_tokens': result.cache_read_tokens,
            },
        })
