from rest_framework_simplejwt.authentication import JWTAuthentication

from .services import idle


class IdleStampJWTAuthentication(JWTAuthentication):
    """The normal JWT check, plus a throttled "this login was active just now" stamp (D16 idle sign-out)."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            idle.stamp(result[0])
        return result
