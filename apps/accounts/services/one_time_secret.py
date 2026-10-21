"""Seal and open a one-time secret with the server key (standard library only): an HMAC-SHA256 keystream with a random
nonce, and an HMAC tag so a changed row is refused. The sealed text sits in the database only until it is shown once.
Never log, print or return the opened value anywhere but the one Show answer."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from django.conf import settings

SALT = b'accounts.one_time_secret.v1'


def _key(purpose: bytes) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode(), SALT + purpose, hashlib.sha256).digest()


def _stream(nonce: bytes, length: int) -> bytes:
    key, out, counter = _key(b'stream'), b'', 0
    while len(out) < length:
        out += hmac.new(key, nonce + counter.to_bytes(4, 'big'), hashlib.sha256).digest()
        counter += 1
    return out[:length]


def seal(value: str) -> str:
    data = value.encode()
    nonce = secrets.token_bytes(16)
    body = bytes(a ^ b for a, b in zip(data, _stream(nonce, len(data))))
    tag = hmac.new(_key(b'tag'), nonce + body, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + tag + body).decode()


def open_sealed(sealed: str) -> str:
    raw = base64.urlsafe_b64decode(sealed.encode())
    nonce, tag, body = raw[:16], raw[16:48], raw[48:]
    if not hmac.compare_digest(tag, hmac.new(_key(b'tag'), nonce + body, hashlib.sha256).digest()):
        raise ValueError('The secret does not open.')
    return bytes(a ^ b for a, b in zip(body, _stream(nonce, len(body)))).decode()
