"""Safe anonymous B-Stock calls (Dash #75): kill switch, cap per hour, back-off, random gaps, call log.

Every anonymous call to a ``*.bstock.com`` API (search, auction state) passes ``check()`` and is
written to ``BStockCall``. Background calls (hourly sweep, quick check) also take ``slot()``: one at a
time across processes (a Postgres advisory lock), a random gap after the last call, and no retry of
a 429 in place: a 429 or 403 pauses every call for 5 minutes, doubling to 2 hours while refusals go
on; one clean answer resets it. Signed-in calls (manifest pull, Costco search) keep their own rules.

Settings (Admin -> Assumptions -> B-Stock calls):
- ``buying_bstock_calls_off``: the kill switch. True stops every anonymous call.
- ``buying_bstock_calls_per_hour``: the cap (default 300), counted from the log.
"""

from __future__ import annotations

import logging
import random
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterator

from django.db import connection
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

KEY_OFF = 'buying_bstock_calls_off'
KEY_PER_HOUR = 'buying_bstock_calls_per_hour'
KEY_BACKOFF = 'buying_bstock_backoff'  # {'until': iso, 'step': n}: written by the code, not a person

# Worst hour: a quick tick every 60 s x 3 calls (2 search pages + 1 state) = 180, plus the hourly
# sweep (~6) and staff refreshes. 300 leaves room; the cap is a stop for runaway loops, not a pace.
DEFAULT_PER_HOUR = 300
KIND_SWEEP = 'sweep'
KIND_QUICK = 'quick'
KIND_STATE = 'state'
LOCK_WAIT_SECONDS = 180
GAP_SECONDS = (4.0, 12.0)
BACKOFF_FIRST = timedelta(minutes=5)
BACKOFF_MAX = timedelta(hours=2)
KEEP_DAYS = 14
REFUSED = {'429', '403'}
_LOCK_KEY = 7_517_501  # pg advisory lock: one background B-Stock call at a time


class CallsPaused(Exception):
    """The gate said no: kill switch, back-off or the hourly cap. ``str()`` is the reason."""


def _setting(key: str, default):
    from apps.core.models import AppSetting

    try:
        return AppSetting.objects.get(key=key).value
    except AppSetting.DoesNotExist:
        return default


def calls_off() -> bool:
    v = _setting(KEY_OFF, False)
    return v is True or str(v).strip().lower() in ('true', '1', 'yes', 'on')


def per_hour_cap() -> int:
    try:
        return max(1, int(_setting(KEY_PER_HOUR, DEFAULT_PER_HOUR)))
    except (TypeError, ValueError):
        return DEFAULT_PER_HOUR


def backoff_until(now: datetime | None = None) -> datetime | None:
    """When the back-off ends, or None when there is none (or it has passed)."""
    v = _setting(KEY_BACKOFF, None)
    if not isinstance(v, dict) or not v.get('until'):
        return None
    until = parse_datetime(str(v['until']))
    if until is None or until <= (now or timezone.now()):
        return None
    return until


def calls_last_hour(now: datetime | None = None) -> int:
    from apps.buying.models import BStockCall

    since = (now or timezone.now()) - timedelta(hours=1)
    return BStockCall.objects.filter(at__gte=since).count()


def check(now: datetime | None = None) -> None:
    """Raise ``CallsPaused`` when no anonymous B-Stock call may go out now."""
    now = now or timezone.now()
    if calls_off():
        raise CallsPaused('B-Stock calls are off (kill switch, Admin -> Assumptions).')
    until = backoff_until(now)
    if until is not None:
        raise CallsPaused(f'B-Stock refused a call; paused until {timezone.localtime(until):%H:%M}.')
    cap = per_hour_cap()
    if calls_last_hour(now) >= cap:
        raise CallsPaused(f'Hourly cap reached ({cap} calls in the last hour).')


def record(kind: str, status: str | int, *, ms: float = 0, rows: int | None = None, note: str = '') -> None:
    """Log one call and move the back-off: a refusal starts or doubles it, a clean answer clears it."""
    from apps.buying.models import BStockCall

    status_s = str(status)[:10]
    try:
        BStockCall.objects.create(
            at=timezone.now(), kind=kind[:20], status=status_s, ms=max(0, int(ms)), rows=rows, note=note[:200],
        )
    except Exception:  # noqa: BLE001 - the log must never break a sweep
        logger.exception('B-Stock call log write failed')
    if status_s in REFUSED:
        _start_backoff()
    elif status_s.startswith('2'):
        _clear_backoff()


def _start_backoff() -> None:
    from apps.core.models import AppSetting

    v = _setting(KEY_BACKOFF, None)
    step = int(v.get('step', 0)) + 1 if isinstance(v, dict) else 1
    wait = min(BACKOFF_FIRST * (2 ** (step - 1)), BACKOFF_MAX)
    until = timezone.now() + wait
    AppSetting.objects.update_or_create(
        key=KEY_BACKOFF,
        defaults={'value': {'until': until.isoformat(), 'step': step},
                  'description': 'Buying: B-Stock back-off after a refusal (written by the code).'},
    )
    logger.warning('B-Stock refused a call: all anonymous calls paused %s min (step %s).', int(wait.total_seconds() // 60), step)


def _clear_backoff() -> None:
    from apps.core.models import AppSetting

    AppSetting.objects.filter(key=KEY_BACKOFF).delete()


def _last_call_at():
    from apps.buying.models import BStockCall

    return BStockCall.objects.order_by('-at').values_list('at', flat=True).first()


@contextmanager
def slot(kind: str, *, sleep=time.sleep) -> Iterator[None]:
    """
    One background call: gate, then the advisory lock (one at a time across dynos), then a random
    4-12 s gap since the last logged call. Raises ``CallsPaused`` before any wait when the gate says no.
    """
    check()
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while True:
        with connection.cursor() as cur:
            cur.execute('SELECT pg_try_advisory_lock(%s)', [_LOCK_KEY])
            if cur.fetchone()[0]:
                break
        if time.monotonic() > deadline:
            raise CallsPaused('Another B-Stock call has held the line for 3 minutes; skipped.')
        sleep(1.0)
    try:
        check()  # the call ahead of us may have hit a refusal
        last = _last_call_at()
        if last is not None:
            gap = random.uniform(*GAP_SECONDS)
            wait = gap - (timezone.now() - last).total_seconds()
            if wait > 0:
                sleep(wait)
        yield
    finally:
        with connection.cursor() as cur:
            cur.execute('SELECT pg_advisory_unlock(%s)', [_LOCK_KEY])


def prune(now: datetime | None = None) -> int:
    from apps.buying.models import BStockCall

    cutoff = (now or timezone.now()) - timedelta(days=KEEP_DAYS)
    n, _ = BStockCall.objects.filter(at__lt=cutoff).delete()
    return n


@dataclass
class DayTotal:
    day: str
    calls: int
    refused: int
    errors: int
    by_kind: dict[str, int]


def daily_totals(days: int = 14) -> list[dict]:
    """The daily call log: calls, refusals (429/403), errors, calls by kind. Newest day first."""
    from apps.buying.models import BStockCall

    since = timezone.now() - timedelta(days=days)
    qs = (
        BStockCall.objects.filter(at__gte=since)
        
        .annotate(day=TruncDate('at', tzinfo=timezone.get_current_timezone()))
    )
    out: dict[str, DayTotal] = {}
    for row in qs.values('day', 'kind').annotate(
        n=Count('id'),
        refused=Count('id', filter=Q(status__in=REFUSED)),
        errors=Count('id', filter=~Q(status__startswith='2') & ~Q(status__in=REFUSED)),
    ):
        key = row['day'].isoformat()
        t = out.setdefault(key, DayTotal(day=key, calls=0, refused=0, errors=0, by_kind={}))
        t.calls += row['n']
        t.refused += row['refused']
        t.errors += row['errors']
        t.by_kind[row['kind']] = t.by_kind.get(row['kind'], 0) + row['n']
    return [vars(out[k]) for k in sorted(out, reverse=True)]


def status_now() -> dict:
    now = timezone.now()
    until = backoff_until(now)
    return {
        'off': calls_off(),
        'per_hour_cap': per_hour_cap(),
        'calls_last_hour': calls_last_hour(now),
        'paused_until': until.isoformat() if until else None,
        'last_call_at': last.isoformat() if (last := _last_call_at()) else None,
    }
