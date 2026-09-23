"""Save and read the B-Stock login token handed over from bstock.com.

The token is the RS256 JWT B-Stock's own pages carry in ``__NEXT_DATA__`` (about an hour).
Only the newest row is kept. Nothing here returns the token to a browser.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db import connection, transaction
from django.utils import timezone

from apps.buying.models import BStockToken

# The elt cookie holds a JWE; B-Stock's APIs reject it.
JWE_PREFIX = 'eyJhbGciOiJSU0EtT0FF'

# Three base64url segments, nothing else (no spaces or line breaks that would end up in a header).
JWT_SHAPE = re.compile(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
MAX_TOKEN_LENGTH = 8192

# A token this close to expiring is treated as gone: a pull takes a few minutes.
EXPIRY_MARGIN = timedelta(minutes=2)

# B-Stock logins last about an hour; a much longer one is not the token the bookmarklet reads.
MAX_LIFETIME = timedelta(hours=2)

# pg_advisory_xact_lock key shared by the token swap (any constant unique to this lock).
_TOKEN_LOCK_KEY = 804_217_001


class TokenRejected(ValueError):
    """The posted value is not a usable B-Stock JWT."""


@dataclass
class TokenStatus:
    connected: bool
    expires_at: datetime | None
    # Usable time: to the expiry minus the margin the pull already refuses to cut into.
    seconds_left: int
    saved_at: datetime | None

    def as_dict(self) -> dict:
        return {
            'connected': self.connected,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'seconds_left': self.seconds_left,
            'saved_at': self.saved_at.isoformat() if self.saved_at else None,
        }


def _lock() -> None:
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_TOKEN_LOCK_KEY])


def save_token(raw: str, *, user=None) -> BStockToken:
    """Validate and store the token, replacing any older one in one locked swap."""
    from apps.buying.services.scraper import jwt_expiry

    token = (raw or '').strip()
    if token.lower().startswith('bearer '):
        token = token[7:].strip()
    if token.startswith(JWE_PREFIX):
        raise TokenRejected('That is the encrypted cookie, not the login token. Use the bookmark.')
    if len(token) > MAX_TOKEN_LENGTH or not token.startswith('eyJ') or not JWT_SHAPE.match(token):
        raise TokenRejected('That does not look like a B-Stock login token.')
    expires_at = jwt_expiry(token)
    if expires_at is None:
        raise TokenRejected('Could not read when that token expires.')
    now = timezone.now()
    if expires_at - EXPIRY_MARGIN <= now:
        raise TokenRejected('That login has expired or is about to. Reload B-Stock and send it again.')
    if expires_at - now > MAX_LIFETIME:
        raise TokenRejected('That token lasts far longer than a B-Stock login. It is not the right one.')
    with transaction.atomic():
        _lock()
        BStockToken.objects.all().delete()
        return BStockToken.objects.create(token=token, expires_at=expires_at, saved_by=user)


def clear_token(token: str | None = None) -> int:
    """
    Forget the stored login (owner disconnected, or B-Stock refused it). Returns rows removed.

    With ``token``, only that exact login is forgotten: a newer one the owner sent while a
    refused request was in flight stays.
    """
    with transaction.atomic():
        _lock()
        rows = BStockToken.objects.all() if token is None else BStockToken.objects.filter(token=token)
        return rows.delete()[0]


def _usable_row() -> BStockToken | None:
    row = BStockToken.objects.first()
    if row is None or row.expires_at is None:
        return None
    if row.expires_at - EXPIRY_MARGIN <= timezone.now():
        return None
    return row


def current_token() -> str:
    """The token if it has more than a couple of minutes left, else ''."""
    row = _usable_row()
    return row.token if row else ''


def token_status() -> TokenStatus:
    row = BStockToken.objects.first()
    if row is None:
        return TokenStatus(connected=False, expires_at=None, seconds_left=0, saved_at=None)
    usable = (
        int((row.expires_at - EXPIRY_MARGIN - timezone.now()).total_seconds()) if row.expires_at else 0
    )
    return TokenStatus(
        connected=usable > 0,
        expires_at=row.expires_at,
        seconds_left=max(0, usable),
        saved_at=row.saved_at,
    )
