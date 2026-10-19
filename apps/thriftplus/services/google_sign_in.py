"""
"Continue with Google" in the Thrift+ app (Join v2, owner 2026-10-19): the Google Identity Services ID token, checked
here against Google's published keys (PyJWT), for our client id (env ``GOOGLE_CLIENT_ID``; unset = the button is
hidden and the endpoint answers ``GOOGLE_OFF``). Only a Google-verified email counts.
"""
from __future__ import annotations

import logging

import jwt
from decouple import config

logger = logging.getLogger(__name__)

CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
ISSUERS = ('accounts.google.com', 'https://accounts.google.com')
_jwks = jwt.PyJWKClient(CERTS_URL, cache_keys=True)  # one per process: Google's keys are cached


class GoogleError(Exception):
    pass


def client_id() -> str | None:
    return str(config('GOOGLE_CLIENT_ID', default='') or '').strip() or None


def verify(credential: str) -> dict:
    """The token's claims (``email``, ``given_name``, ``family_name``, ``name``), checked: signed by Google, for our
    client id, from Google's issuer, not expired, and the email verified by Google. ``GoogleError`` otherwise."""
    audience = client_id()
    if not audience:
        raise GoogleError('Google sign-in is not set up.')
    if not credential or not isinstance(credential, str):
        raise GoogleError('No Google credential.')
    try:
        key = _jwks.get_signing_key_from_jwt(credential)
        claims = jwt.decode(credential, key.key, algorithms=['RS256'], audience=audience,
                            options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']})
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise GoogleError(f'The Google credential did not check out: {exc.__class__.__name__}') from exc
    if claims.get('iss') not in ISSUERS:
        raise GoogleError('The Google credential has the wrong issuer.')
    if claims.get('email_verified') not in (True, 'true') or not claims.get('email'):
        raise GoogleError('Google has not verified that email.')
    return claims
