"""View as (owner 2026-10-21): the server side of read only.

A request whose access token carries the ``view_as`` claim is the owner seeing Dash as an employee
(``services/view_as.py``). This middleware runs before any view:

- the session is checked (not ended, not past two hours); an ended one answers 401 ``VIEW_AS_ENDED``;
- every write (POST, PUT, PATCH, DELETE) is refused with a 403 "Viewing as Maria K: read only", except Back, sign-out
  and refresh (and the few searches sent as POST, ``view_as.READ_POSTS``, which run like reads);
- a read runs inside a transaction that is always rolled back, so nothing a page does on open (marking a message read,
  a last-seen stamp) is kept.

The authentication class (``authentication.py``) then runs the request as the employee.
"""
from __future__ import annotations

from django.db import transaction
from django.http import JsonResponse

from .services import view_as

SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')


def _claim(request):
    """(session id, user id) from a Bearer token carrying the view-as claim, or None."""
    header = request.META.get('HTTP_AUTHORIZATION') or ''
    if not header.startswith('Bearer '):
        return None
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.settings import api_settings
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        token = AccessToken(header[len('Bearer '):].strip())
    except TokenError:
        return None  # A bad or expired token: the authentication class answers it.
    if view_as.CLAIM not in token.payload:
        return None
    return token[view_as.CLAIM], token.get(api_settings.USER_ID_CLAIM)


class ViewAsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        claim = _claim(request)
        if claim is None:
            return self.get_response(request)
        session = view_as.session_for_claim(*claim)
        if session is None or not view_as.is_live(session):
            if request.path in view_as.WRITE_PATHS:
                return self.get_response(request)  # Back or sign-out after it ended: just the owner.
            return JsonResponse({'detail': 'Viewing as has ended.', 'code': 'VIEW_AS_ENDED'}, status=401)
        request.view_as_session = session
        if request.method not in SAFE_METHODS and request.path not in view_as.READ_POSTS:
            if request.path in view_as.WRITE_PATHS:
                return self.get_response(request)
            return JsonResponse({'detail': view_as.read_only_detail(session), 'code': 'VIEW_AS_READ_ONLY'},
                                status=403)
        with transaction.atomic():
            response = self.get_response(request)
            transaction.set_rollback(True)
        return response
