from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from apps.core.services.ai_usage_log import set_request_user

from .services import idle, view_as


def issued_before_sign_out(user, token) -> bool:
    """True when the token was issued before this login used "Sign out on all devices" (Me page)."""
    ended = getattr(user, 'sessions_ended_at', None)
    issued = token.get('iat') if token is not None else None
    return bool(ended and issued is not None and int(issued) < int(ended.timestamp()))


class IdleStampJWTAuthentication(JWTAuthentication):
    """The normal JWT check, plus a throttled "this login was active just now" stamp (D16 idle sign-out), a
    refusal for tokens from before "Sign out on all devices", and the login AI calls in this request are charged to
    (Owner page, AI spend).

    View as (``services/view_as.py``): a token with the ``view_as`` claim runs the request as the employee. The owner
    stays on the request as ``real_user`` (audit) and is the one stamped active and charged for AI."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, token = result
            if issued_before_sign_out(user, token):
                raise AuthenticationFailed('Signed out on all devices. Sign in again.', code='SIGNED_OUT')
            idle.stamp(user)
            set_request_user(user)
            if view_as.CLAIM in token.payload:
                # ViewAsMiddleware checked the session already; check again when it did not run (tests, odd paths).
                session = getattr(request._request, 'view_as_session', None)
                if session is None or session.pk != token[view_as.CLAIM] or session.real_user_id != user.pk:
                    session = view_as.session_for_claim(token[view_as.CLAIM], user.pk)
                    if session is None or not view_as.is_live(session):
                        if request._request.path in view_as.WRITE_PATHS:
                            return result  # Back or sign-out after it ended: just the owner.
                        raise AuthenticationFailed('Viewing as has ended.', code='VIEW_AS_ENDED')
                allowed = view_as.WRITE_PATHS + view_as.READ_POSTS
                if request.method not in ('GET', 'HEAD', 'OPTIONS') and request._request.path not in allowed:
                    raise PermissionDenied(view_as.read_only_detail(session))
                request._request.real_user = user
                request._request.view_as_session = session
                return session.target, token
        return result
