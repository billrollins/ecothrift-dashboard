"""Sign-in lockout (house standard D16): 5 wrong tries on one username or email, or 30 from one address, lock it for
15 minutes from the last wrong try. Unknown usernames count the same, so a lockout says nothing about who exists."""
from __future__ import annotations

from django.core.cache import cache

WINDOW = 15 * 60
MAX_PER_NAME = 5
MAX_PER_ADDRESS = 30


def _key(kind: str, value: str) -> str:
    return f'auth:fail:{kind}:{(value or "").strip().lower()[:120]}'


def is_locked(name: str, address: str | None) -> bool:
    return (cache.get(_key('name', name)) or 0) >= MAX_PER_NAME or (
        bool(address) and (cache.get(_key('ip', address)) or 0) >= MAX_PER_ADDRESS
    )


def record_failure(name: str, address: str | None) -> bool:
    """Count a wrong try. True when this one locks the name."""
    n = (cache.get(_key('name', name)) or 0) + 1
    cache.set(_key('name', name), n, WINDOW)
    if address:
        cache.set(_key('ip', address), (cache.get(_key('ip', address)) or 0) + 1, WINDOW)
    return n == MAX_PER_NAME


def clear(name: str) -> None:
    cache.delete(_key('name', name))
