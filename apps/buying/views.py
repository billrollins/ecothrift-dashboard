"""Local dev helpers for B-Stock buying (token ingest)."""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.buying.management.commands.bstock_token import bstock_token_path

logger = logging.getLogger(__name__)

JWE_COOKIE_PREFIX = 'eyJhbGciOiJSU0EtT0FF'


def _client_is_loopback(request) -> bool:
    addr = request.META.get('REMOTE_ADDR') or ''
    return addr in ('127.0.0.1', '::1')


@csrf_exempt
@require_POST
def receive_bstock_token(request):
    """
    Save JWT to workspace/.bstock_token for management commands.

    Allowed when DEBUG is True or the client is loopback. No session auth.
    """
    if not settings.DEBUG and not _client_is_loopback(request):
        return HttpResponseForbidden('Only allowed in DEBUG or from localhost.')

    try:
        body = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'invalid JSON'}, status=400)

    token = (body.get('token') or '').strip()
    if not token.startswith('eyJ'):
        return JsonResponse({'error': 'token must start with eyJ'}, status=400)
    if token.startswith(JWE_COOKIE_PREFIX):
        return JsonResponse(
            {
                'error': (
                    'This looks like a JWE from the elt cookie. '
                    'Use the JWT from __NEXT_DATA__.props.pageProps.accessToken.'
                )
            },
            status=400,
        )

    path = bstock_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token + '\n', encoding='utf-8')
    logger.info('B-Stock token saved via POST (length=%s)', len(token))
    return JsonResponse({'status': 'ok', 'length': len(token)})
