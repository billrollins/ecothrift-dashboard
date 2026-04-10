"""Effective want score with step decay toward neutral (5)."""

from __future__ import annotations

from django.utils import timezone

from apps.buying.services.buying_settings import get_want_vote_decay_per_day


def effective_want_value(value: int, voted_at) -> float:
    """
    Move one integer step toward 5 per (decay_per_day * days) whole steps.

    Example: value 8, two days ago with decay 1/day -> 6.
    """
    if voted_at is None:
        return 5.0
    decay = get_want_vote_decay_per_day()
    days = max(0.0, (timezone.now() - voted_at).total_seconds() / 86400.0)
    steps = int(days * decay)
    cur = value
    for _ in range(steps):
        if cur > 5:
            cur -= 1
        elif cur < 5:
            cur += 1
        else:
            break
    return float(max(1, min(10, cur)))
