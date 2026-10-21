"""Error alerts for the owner (critic review 2026-10-21, point 8).

Server 500s arrive through Django's ``got_request_exception`` signal (connected in ``CoreConfig.ready``); screen
crashes arrive from Dash's error screen (``POST /api/core/errors/report/``). Both land in ``AppError``.
``GET /api/core/errors/`` gives the owner a count and the latest ones; ``POST /api/core/errors/seen/`` clears the
count. Recording never raises: a broken error log must not turn one error into two.
"""
from __future__ import annotations

import logging
import sys
import traceback
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

MESSAGE_MAX = 500
DETAIL_MAX = 8000
PATH_MAX = 500
AGENT_MAX = 300


def _version() -> str:
    try:
        raw = (Path(settings.BASE_DIR) / '.version').read_text(encoding='utf-8').strip()
    except OSError:
        return ''
    return raw[1:].strip() if raw.lower().startswith('v') else raw


def _clip(value, limit: int, tail: bool = False) -> str:
    text = str(value or '')
    if len(text) <= limit:
        return text
    return text[-limit:] if tail else text[:limit]


def _user(request):
    user = getattr(request, 'user', None)
    return user if user is not None and getattr(user, 'is_authenticated', False) else None


def on_request_exception(sender, request=None, **kwargs):
    """``got_request_exception`` receiver: record the 500 being handled right now."""
    try:
        exc_type, exc, tb = sys.exc_info()
        if exc is None:
            return
        record_server_error(request, exc, ''.join(traceback.format_exception(exc_type, exc, tb)))
    except Exception:  # noqa: BLE001 - never let the error log fail a request twice
        logger.exception('app_errors: could not record a server error')


def record_server_error(request, exc: BaseException, detail: str = ''):
    from apps.core.models import AppError

    try:
        return AppError.objects.create(
            source=AppError.SOURCE_SERVER,
            message=_clip(f'{type(exc).__name__}: {exc}', MESSAGE_MAX),
            detail=_clip(detail, DETAIL_MAX, tail=True),
            path=_clip(getattr(request, 'path', ''), PATH_MAX),
            method=_clip(getattr(request, 'method', ''), 10),
            user=_user(request),
            user_agent=_clip(getattr(request, 'META', {}).get('HTTP_USER_AGENT', ''), AGENT_MAX),
            version=_version(),
        )
    except Exception:  # noqa: BLE001
        logger.exception('app_errors: could not save a server error')
        return None


def record_screen_error(request, data: dict):
    """A crash the error screen sent: ``message``, ``stack``, ``component_stack``, ``path`` (the page's URL path) and
    ``version`` (the screen's own build, which can be older than the server's after a deploy)."""
    from apps.core.models import AppError

    stack = '\n\n'.join(s for s in (str(data.get('stack') or ''), str(data.get('component_stack') or '')) if s)
    try:
        return AppError.objects.create(
            source=AppError.SOURCE_SCREEN,
            message=_clip(data.get('message') or 'Screen error', MESSAGE_MAX),
            detail=_clip(stack, DETAIL_MAX),
            path=_clip(data.get('path') or '', PATH_MAX),
            user=_user(request),
            user_agent=_clip(request.META.get('HTTP_USER_AGENT', ''), AGENT_MAX),
            version=_clip(data.get('version') or _version(), 40),
        )
    except Exception:  # noqa: BLE001
        logger.exception('app_errors: could not save a screen error')
        return None


def _row(e) -> dict:
    return {
        'id': e.id,
        'source': e.source,
        'message': e.message,
        'path': e.path,
        'method': e.method,
        'user': (f'{e.user.first_name} {e.user.last_name}'.strip() or e.user.email) if e.user else None,
        'version': e.version,
        'seen': e.seen,
        'created_at': e.created_at.isoformat(),
    }


def summary(limit: int = 10) -> dict:
    """Open (unseen) count, counts for the last day and week, and the latest errors (newest first)."""
    from apps.core.models import AppError

    now = timezone.now()
    qs = AppError.objects.all()
    latest = qs.select_related('user').order_by('-created_at')[:limit]
    return {
        'open_count': qs.filter(seen=False).count(),
        'last_24h': qs.filter(created_at__gte=now - timedelta(hours=24)).count(),
        'last_7d': qs.filter(created_at__gte=now - timedelta(days=7)).count(),
        'latest': [_row(e) for e in latest],
    }


def mark_seen() -> int:
    from apps.core.models import AppError

    return AppError.objects.filter(seen=False).update(seen=True)
