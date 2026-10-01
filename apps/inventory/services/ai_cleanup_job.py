"""AI cleanup as a background job.

The web page used to run cleanup itself: one HTTP request per batch, each waiting for the model.
Heroku cuts a request off at 30 seconds, so a slow model (Spark Contributor takes 30 to 70 seconds
a batch) could not run. Now the page only **starts** a job and **polls** it; the batches run in a
thread inside the web process, with no request waiting on them.

- **State:** one ``AppSetting`` row per order (``ai_cleanup_job:<order id>``). Any web process can
  answer a poll; only the process that owns the thread writes progress.
- **Progress is the data itself:** a row is cleaned when ``ai_reasoning`` is set, so a job that
  dies loses nothing. Starting again cleans only what is left.
- **A dead job heals itself:** the thread writes a heartbeat. Gunicorn recycles its processes
  (``--max-requests``) and a deploy restarts them, which kills the thread. A poll that finds a
  running job with a stale heartbeat starts the thread again in the process that got the poll.
- **Stop** is a flag in the state; the thread checks it between batches. Batches already with the
  model finish and save.
- **Undo / Cancel cleanup** bumps ``PurchaseOrder.ai_cleanup_generation``; the job sees it and stops.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from django.db import close_old_connections, connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.core.models import AppSetting
from apps.inventory.models import PreprocessingRow, PurchaseOrder
from apps.inventory.services.ai_cleanup import (
    MAX_BATCH_ROW_IDS, complete_ai_cleanup, resolve_cleanup_api_key, run_ai_cleanup_batch,
    uncleaned_staging_row_ids,
)

logger = logging.getLogger(__name__)

# One model call may take this long. Nothing waits on it, so it can be generous.
JOB_CALL_TIMEOUT_SECONDS = 150.0
# No heartbeat for this long means the thread is gone (it beats when a batch starts and ends).
STALE_SECONDS = JOB_CALL_TIMEOUT_SECONDS + 45
# A row that fails or comes back unusable this many times in one job is left for the next run.
MAX_ATTEMPTS_PER_ROW = 2
# Batches with the model at one time. Each waits without a database connection (see _one_batch).
MAX_CONCURRENCY = 48
# With many workers a provider may answer "too many requests". The batch waits and asks again
# (seconds before each further try) instead of failing.
RATE_LIMIT_WAITS = (8, 20, 45)
ACTIVE = ('running', 'stopping')

_write_lock = threading.Lock()


def _key(order_id: int) -> str:
    return f'ai_cleanup_job:{order_id}'


def _now() -> str:
    return timezone.now().isoformat()


def read(order_id: int) -> dict[str, Any]:
    row = AppSetting.objects.filter(key=_key(order_id)).first()
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def _update(order_id: int, token: str | None, **changes) -> dict[str, Any]:
    """Change the job's state. With ``token``, only if this thread still owns the job."""
    with _write_lock, transaction.atomic():
        row, _ = AppSetting.objects.select_for_update().get_or_create(
            key=_key(order_id),
            defaults={'value': {}, 'description': 'AI cleanup background job for one purchase order.'},
        )
        state = dict(row.value) if isinstance(row.value, dict) else {}
        if token is not None and state.get('token') != token:
            return state
        for name, value in changes.items():
            if name.startswith('add_'):
                state[name[4:]] = int(state.get(name[4:]) or 0) + int(value)
            else:
                state[name] = value
        row.value = state
        row.save(update_fields=['value', 'updated_at'])
        return state


def _is_stale(state: dict[str, Any]) -> bool:
    beat = parse_datetime(str(state.get('heartbeat_at') or ''))
    return beat is None or (timezone.now() - beat).total_seconds() > STALE_SECONDS


def _fresh_db() -> None:
    """A thread starts with no usable connection of its own. (Tests replace this.)"""
    close_old_connections()


def _release_db() -> None:
    """A thread must give its connection back when it ends. (Tests replace this.)"""
    connections.close_all()


def _executor(concurrency: int, order_id: int):
    return ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix=f'ai-cleanup-{order_id}')


def _spawn(order_id: int, token: str) -> None:
    threading.Thread(target=_run, args=(order_id, token), name=f'ai-cleanup-{order_id}', daemon=True).start()


def start(order: PurchaseOrder, *, user, model: str, effort: str, batch_size: int, concurrency: int) -> dict[str, Any]:
    """Start (or resume) the order's cleanup. A job that is already running is left alone."""
    batch_size = max(1, min(int(batch_size), MAX_BATCH_ROW_IDS))
    concurrency = max(1, min(int(concurrency), MAX_CONCURRENCY))
    token = uuid.uuid4().hex
    with _write_lock, transaction.atomic():
        row, _ = AppSetting.objects.select_for_update().get_or_create(
            key=_key(order.pk),
            defaults={'value': {}, 'description': 'AI cleanup background job for one purchase order.'},
        )
        state = dict(row.value) if isinstance(row.value, dict) else {}
        if state.get('status') in ACTIVE and not _is_stale(state):
            return state
        generation = PurchaseOrder.objects.values_list('ai_cleanup_generation', flat=True).get(pk=order.pk)
        state = {
            'token': token, 'status': 'running', 'stop_requested': False,
            'model': model, 'effort': effort, 'batch_size': batch_size, 'concurrency': concurrency,
            'generation': generation,
            'started_at': _now(), 'heartbeat_at': _now(), 'finished_at': None,
            'started_by': (getattr(user, 'first_name', '') or getattr(user, 'email', '') or '') if user else '',
            'rows_at_start': PreprocessingRow.objects.filter(purchase_order=order, ai_reasoning='').count(),
            'batches_done': 0, 'rows_saved': 0, 'rows_discarded': 0, 'failed_batches': 0,
            'restarts': 0, 'rate_limited': 0, 'last_error': '', 'message': '', 'match_candidates': None,
        }
        row.value = state
        row.updated_by = user if getattr(user, 'pk', None) else None
        row.save()
    _spawn(order.pk, token)
    return state


def request_stop(order: PurchaseOrder) -> dict[str, Any]:
    state = read(order.pk)
    if state.get('status') not in ACTIVE:
        return state
    if _is_stale(state):  # nothing is running any more: just close it
        return _update(order.pk, None, status='stopped', stop_requested=True, finished_at=_now(),
                       message='Stopped.')
    return _update(order.pk, None, status='stopping', stop_requested=True)


def status(order: PurchaseOrder, *, heal: bool = True) -> dict[str, Any]:
    """The job's state plus the order's progress. Restarts a job whose thread died."""
    state = read(order.pk)
    if heal and state.get('status') in ACTIVE and _is_stale(state):
        if state.get('stop_requested'):
            state = _update(order.pk, None, status='stopped', finished_at=_now(), message='Stopped.')
        else:
            token = uuid.uuid4().hex
            with _write_lock, transaction.atomic():
                row = AppSetting.objects.select_for_update().get(key=_key(order.pk))
                current = dict(row.value)
                # Another process may have restarted it while this one waited for the lock.
                if current.get('status') in ACTIVE and _is_stale(current):
                    current.update(token=token, heartbeat_at=_now(), restarts=int(current.get('restarts') or 0) + 1)
                    row.value = current
                    row.save(update_fields=['value', 'updated_at'])
                    restarted = True
                else:
                    restarted = False
                state = current
            if restarted:
                logger.warning('ai_cleanup_job order=%s restarted after a stale heartbeat', order.pk)
                _spawn(order.pk, token)
    rows = PreprocessingRow.objects.filter(purchase_order=order)
    total = rows.count()
    remaining = rows.filter(ai_reasoning='').count()
    public = {k: v for k, v in state.items() if k != 'token'}
    started = parse_datetime(str(state.get('started_at') or ''))
    ended = parse_datetime(str(state.get('finished_at') or '')) or timezone.now()
    public.update({
        'status': state.get('status') or 'idle',
        'total_rows': total,
        'cleaned_rows': total - remaining,
        'remaining_rows': remaining,
        'elapsed_seconds': round((ended - started).total_seconds(), 1) if started else 0,
    })
    return public


def _one_batch(order_id: int, token: str, row_ids: list[int], stop: threading.Event, *, model: str,
               effort: str, api_key: str) -> dict[str, Any]:
    """Runs in a pool thread. Never raises: a failure is part of the answer."""
    _fresh_db()
    try:
        if stop.is_set():
            return {'skipped': True, 'row_ids': row_ids}
        # The beat also tells this batch whether the job was stopped or replaced while it waited its turn.
        now = _update(order_id, token, heartbeat_at=_now())
        if now.get('token') != token or now.get('stop_requested'):
            stop.set()
            return {'skipped': True, 'row_ids': row_ids}
        order = PurchaseOrder.objects.get(pk=order_id)
        if order.ai_cleanup_generation != now.get('generation'):
            # Undo / Cancel cleanup ran since the job started: nothing more may be saved.
            stop.set()
            return {'cancelled': True, 'row_ids': row_ids}
        waits = (0, *RATE_LIMIT_WAITS)
        for attempt, wait_seconds in enumerate(waits):
            if wait_seconds and stop.wait(wait_seconds):
                return {'skipped': True, 'row_ids': row_ids}
            try:
                result = run_ai_cleanup_batch(
                    order, row_ids, model_id=model, api_key=api_key, effort=effort, timeout=JOB_CALL_TIMEOUT_SECONDS,
                    # The model call can take a minute. Holding a connection through it would cost the
                    # shared database one connection per worker; Django opens a new one for the save.
                    before_model_call=_release_db,
                )
                result['row_ids'] = row_ids
                return result
            except Exception as e:  # noqa: BLE001
                if getattr(e, 'kind', '') != 'rate_limit' or attempt == len(waits) - 1:
                    raise
                _update(order_id, token, heartbeat_at=_now(), add_rate_limited=1)
        raise RuntimeError('unreachable')
    except Exception as e:  # noqa: BLE001 - every failure is reported on the job
        logger.warning('ai_cleanup_job order=%s batch failed: %s', order_id, e)
        return {'failed': True, 'row_ids': row_ids, 'error': f'{type(e).__name__}: {e}'[:400]}
    finally:
        _release_db()


def _run(order_id: int, token: str) -> None:
    """The job thread: clean what is uncleaned, a few batches at a time, until done or told to stop."""
    _fresh_db()
    try:
        state = read(order_id)
        if state.get('token') != token:
            return
        order = PurchaseOrder.objects.get(pk=order_id)
        model, effort = state['model'], state.get('effort') or 'off'
        batch_size, concurrency = int(state['batch_size']), int(state['concurrency'])
        api_key, key_error = resolve_cleanup_api_key(model)
        if key_error:
            _update(order_id, token, status='failed', finished_at=_now(), last_error=key_error, message=key_error)
            return

        attempts: Counter[int] = Counter()
        stop = threading.Event()
        outcome = ''
        while not outcome:
            ids = [i for i in uncleaned_staging_row_ids(order) if attempts[i] < MAX_ATTEMPTS_PER_ROW]
            if not ids:
                break
            batches = [ids[i:i + batch_size] for i in range(0, len(ids), batch_size)]
            with _executor(concurrency, order_id) as pool:
                futures = [
                    pool.submit(_one_batch, order_id, token, b, stop, model=model, effort=effort, api_key=api_key)
                    for b in batches
                ]
                for future in as_completed(futures):
                    res = future.result()
                    if res.get('skipped'):
                        now = read(order_id)
                        if now.get('token') != token:
                            outcome = 'replaced'
                        elif now.get('stop_requested'):
                            outcome = outcome or 'stopped'
                        continue
                    if res.get('failed'):
                        attempts.update(res['row_ids'])
                        now = _update(order_id, token, heartbeat_at=_now(), add_batches_done=1,
                                      add_failed_batches=1, last_error=res['error'])
                    elif res.get('cancelled'):
                        outcome = 'cancelled'
                        now = _update(order_id, token, heartbeat_at=_now())
                    else:
                        attempts.update(d['row_id'] for d in res.get('discarded_rows') or [])
                        now = _update(order_id, token, heartbeat_at=_now(), add_batches_done=1,
                                      add_rows_saved=res.get('rows_saved', 0),
                                      add_rows_discarded=len(res.get('discarded_rows') or []))
                    if now.get('token') != token:
                        outcome = 'replaced'
                    elif now.get('stop_requested'):
                        outcome = outcome or 'stopped'
                    if outcome:
                        stop.set()
            generation = PurchaseOrder.objects.values_list('ai_cleanup_generation', flat=True).get(pk=order_id)
            if not outcome and generation != state.get('generation'):
                outcome = 'cancelled'

        if outcome == 'replaced':
            return
        if outcome == 'cancelled':
            _update(order_id, token, status='cancelled', finished_at=_now(),
                    message='Cleanup was undone while it ran, so it stopped. Batches in flight were not saved.')
            return
        if outcome == 'stopped':
            _update(order_id, token, status='stopped', finished_at=_now(), message='Stopped. Run again to continue.')
            return
        remaining = PreprocessingRow.objects.filter(purchase_order=order, ai_reasoning='').count()
        if remaining:
            _update(order_id, token, status='done_with_gaps', finished_at=_now(),
                    message=f'{remaining} row(s) could not be cleaned this run. Run again to retry just those.')
            return
        completion = complete_ai_cleanup(order)
        _update(order_id, token, status='done', finished_at=_now(), message='',
                match_candidates=completion.get('match_candidates'))
    except Exception as e:  # noqa: BLE001 - the job must always end in a readable state
        logger.exception('ai_cleanup_job order=%s crashed', order_id)
        try:
            _update(order_id, token, status='failed', finished_at=_now(),
                    last_error=f'{type(e).__name__}: {e}'[:400], message='The cleanup job crashed. Run again to continue.')
        except Exception:  # noqa: BLE001
            pass
    finally:
        _release_db()


def wait(order_id: int, seconds: float = 30.0) -> dict[str, Any]:
    """For tests: block until the job leaves the running states."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        state = read(order_id)
        if state.get('status') not in ACTIVE:
            return state
        time.sleep(0.05)
    return read(order_id)
