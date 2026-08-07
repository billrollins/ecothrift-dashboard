"""Shared Online Sales test helpers."""
from __future__ import annotations

from apps.webstore.services.reservations import create_hold


def make_verified_hold(**kwargs):
    """create_hold that lands as status=requested (skips email verification)."""
    kwargs.setdefault('verified', True)
    return create_hold(**kwargs)
