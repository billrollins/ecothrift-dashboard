from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from apps.core.services.ai_usage_log import set_request_user

from .services import idle


def issued_before_sign_out(user, token) -> bool:
    """True when the token was issued before this login used "Sign out on all devices" (Me page)."""
    ended = getattr(user, 'sessions_ended_at', None)
    issued = token.get('iat') if token is not None else None
    return bool(ended and issued is not None and int(issued) < int(ended.timestamp()))


class IdleStampJWTAuthentication(JWTAuthentication):
    """The normal JWT check, plus a throttled "this login was active just now" stamp (D16 idle sign-out), a
    refusal for tokens from before "Sign out on all devices", and the login AI calls in this request are charged to
    (Owner page, AI spend)."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            if issued_before_sign_out(*result):
                raise AuthenticationFailed('Signed out on all devices. Sign in again.', code='SIGNED_OUT')
            idle.stamp(result[0])
            set_request_user(result[0])
        return result
