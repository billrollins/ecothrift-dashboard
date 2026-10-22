"""Read a few settings once per read-only request (Dashboard speed, 2026-10-22).

The Dashboard's department numbers and the Retail QA summary grade every day of a week, and each day asked the
database again for the store hours, the hours overrides and the Retail QA settings: about 450 to 580 queries a load.
Inside ``read_memo()`` a reader marked ``@memo_read`` runs once and every later call gets a copy of that answer.
Outside it (every write path) each call reads fresh, as before.
"""

from __future__ import annotations

import functools
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from typing import Any, Callable, Iterator, TypeVar

T = TypeVar('T')

_memo: ContextVar[dict[Callable[..., Any], Any] | None] = ContextVar('read_memo', default=None)


@contextmanager
def read_memo() -> Iterator[None]:
    """Remember ``@memo_read`` answers until the block ends. Nested blocks share the outer memo."""
    if _memo.get() is not None:
        yield
        return
    token = _memo.set({})
    try:
        yield
    finally:
        _memo.reset(token)


def memo_read(fn: Callable[[], T]) -> Callable[[], T]:
    """A no-argument reader that runs once inside ``read_memo()``. Callers get a copy, so they may change it."""

    @functools.wraps(fn)
    def wrapper() -> T:
        memo = _memo.get()
        if memo is None:
            return fn()
        if fn not in memo:
            memo[fn] = fn()
        value = memo[fn]
        # Model rows are shared (read-only here); dicts and lists of plain values are copied.
        return list(value) if isinstance(value, list) else deepcopy(value)

    return wrapper
