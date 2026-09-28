"""
Superuser → Requests: routine data work staged in production and approved there.

The owner's rule (2026-09-25): anything done routinely (backfills, merges, brand aliases, QA
fixes) is approved **in production**, never tested locally and then applied for him. So:

1. **Stage.** ``stage(kind, title=..., params=...)`` (the ``stage_request`` command, run in production
   by Claude or a job) builds the kind's **preview** from production data: counts, what will
   change, sample rows. Nothing changes.
2. **Approve.** The owner reads the preview on the Requests page and approves (or rejects), with
   an optional note.
3. **Apply.** The kind's ``apply`` runs in a background thread, in chunks. It reports through
   ``Progress``: a heartbeat, done/total, a **cursor** to resume from, and log lines. A run cut
   short (a deploy, a worker recycle) goes stale after ``STALE_AFTER``; ``resume_stalled`` (hourly,
   or the page's Resume button) starts it again from the cursor, so every apply must be idempotent.
4. **Undo.** A kind with an ``undo`` can reverse an applied request, logged the same way.

Kinds register themselves from each app's ``approval_kinds.py`` (imported in ``AppConfig.ready``).
"""
from __future__ import annotations

import logging
import threading
import traceback
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Callable

from django.db import close_old_connections, transaction
from django.utils import timezone

from apps.core.models import ApprovalRequest

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=5)
LOG_LINES = 300


class RequestError(Exception):
    """A request can't do what was asked (wrong status, unknown kind, no undo)."""


@dataclass(frozen=True)
class Kind:
    kind: str
    label: str
    # params -> {'counts': {label: n}, 'changes': [text], 'sample': [row], 'params': {extra params}}
    preview: Callable[[dict], dict]
    # (request, progress) -> result dict. Must be idempotent and resume from progress.cursor.
    apply: Callable[[ApprovalRequest, 'Progress'], dict]
    # request -> result dict. None when the kind can't be undone.
    undo: Callable[[ApprovalRequest], dict] | None = None


_REGISTRY: dict[str, Kind] = {}


def register(kind: Kind) -> Kind:
    _REGISTRY[kind.kind] = kind
    return kind


def get_kind(name: str) -> Kind:
    try:
        return _REGISTRY[name]
    except KeyError as exc:
        raise RequestError(f'Unknown request kind {name!r}.') from exc


def kinds() -> list[Kind]:
    return sorted(_REGISTRY.values(), key=lambda k: k.kind)


class Progress:
    """How an apply reports: heartbeat, done/total, a resumable cursor, and log lines."""

    def __init__(self, request: ApprovalRequest):
        self.request = request
        self._progress = dict(request.progress or {})
        self._log = (request.log or '').splitlines()

    @property
    def cursor(self) -> Any:
        return self._progress.get('cursor')

    @property
    def state(self) -> dict:
        return self._progress

    def update(self, *, done: int | None = None, total: int | None = None, cursor: Any = None, log: str = '', **extra: Any) -> None:
        if done is not None:
            self._progress['done'] = done
        if total is not None:
            self._progress['total'] = total
        if cursor is not None:
            self._progress['cursor'] = cursor
        self._progress.update(extra)
        if log:
            self._log.append(f"{timezone.localtime().strftime('%H:%M:%S')} {log}")
            self._log = self._log[-LOG_LINES:]
        now = timezone.now()
        ApprovalRequest.objects.filter(pk=self.request.pk).update(
            progress=self._progress, log='\n'.join(self._log), heartbeat_at=now, updated_at=now,
        )

    def log(self, line: str) -> None:
        self.update(log=line)


def stage(kind: str, *, title: str, summary: str = '', params: dict | None = None, requested_by: str = '') -> ApprovalRequest:
    """Build the preview from this database and save a pending request. Changes nothing else."""
    k = get_kind(kind)
    params = dict(params or {})
    preview = k.preview(params) or {}
    params.update(preview.pop('params', {}) or {})
    return ApprovalRequest.objects.create(
        kind=kind, title=title[:200], summary=summary, params=params, preview=preview, requested_by=requested_by[:80],
    )


def _decide(request: ApprovalRequest, user, status: str, note: str) -> None:
    request.status = status
    request.decided_by = user
    request.decided_at = timezone.now()
    request.decision_note = note or ''
    request.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_note', 'updated_at'])


def approve(request: ApprovalRequest, user, note: str = '', *, start: bool = True) -> ApprovalRequest:
    if request.status != ApprovalRequest.STATUS_PENDING:
        raise RequestError(f'Only a pending request can be approved (this one is {request.status}).')
    get_kind(request.kind)
    _decide(request, user, ApprovalRequest.STATUS_APPROVED, note)
    if start:
        transaction.on_commit(lambda: start_thread(request.pk))
    return request


def reject(request: ApprovalRequest, user, note: str = '') -> ApprovalRequest:
    if request.status != ApprovalRequest.STATUS_PENDING:
        raise RequestError(f'Only a pending request can be rejected (this one is {request.status}).')
    _decide(request, user, ApprovalRequest.STATUS_REJECTED, note)
    return request


def is_stale(request: ApprovalRequest, now=None) -> bool:
    now = now or timezone.now()
    beat = request.heartbeat_at or request.started_at or request.decided_at
    return request.status == ApprovalRequest.STATUS_RUNNING and (beat is None or now - beat > STALE_AFTER)


def _thread_main(pk: int) -> None:
    # A background thread gets its own database connection; close it cleanly both ways.
    close_old_connections()
    try:
        run(pk)
    finally:
        close_old_connections()


def start_thread(pk: int) -> None:
    threading.Thread(target=_thread_main, args=(pk,), name=f'approval-request-{pk}', daemon=True).start()


def run(pk: int) -> ApprovalRequest | None:
    """Apply an approved (or stalled) request. Safe to call twice: only one run holds it."""
    try:
        with transaction.atomic():
            request = ApprovalRequest.objects.select_for_update().filter(pk=pk).first()
            if request is None:
                return None
            if request.status == ApprovalRequest.STATUS_RUNNING and not is_stale(request):
                return request  # another run is alive
            if request.status not in (ApprovalRequest.STATUS_APPROVED, ApprovalRequest.STATUS_RUNNING):
                return request
            now = timezone.now()
            request.status = ApprovalRequest.STATUS_RUNNING
            request.started_at = request.started_at or now
            request.heartbeat_at = now
            request.error = ''
            request.save(update_fields=['status', 'started_at', 'heartbeat_at', 'error', 'updated_at'])
        kind = get_kind(request.kind)
        progress = Progress(request)
        progress.log('started' if not progress.cursor else f'resumed at {progress.cursor}')
        result = kind.apply(request, progress) or {}
        request.refresh_from_db()
        request.status = ApprovalRequest.STATUS_APPLIED
        request.result = {**(request.result or {}), **result}
        request.finished_at = timezone.now()
        request.save(update_fields=['status', 'result', 'finished_at', 'updated_at'])
        Progress(request).log('applied')
        return request
    except Exception as exc:  # the request records it; the page shows it
        logger.exception('approval request %s failed', pk)
        ApprovalRequest.objects.filter(pk=pk).update(
            status=ApprovalRequest.STATUS_FAILED,
            error=f'{exc}\n\n{traceback.format_exc()[-3000:]}',
            finished_at=timezone.now(),
        )
        return ApprovalRequest.objects.filter(pk=pk).first()


def resume(request: ApprovalRequest) -> ApprovalRequest:
    """Start a failed or stalled request again from its cursor."""
    if request.status == ApprovalRequest.STATUS_FAILED or is_stale(request):
        ApprovalRequest.objects.filter(pk=request.pk).update(status=ApprovalRequest.STATUS_APPROVED)
        transaction.on_commit(lambda: start_thread(request.pk))
        request.refresh_from_db()
        return request
    raise RequestError('Only a failed or stalled request can be resumed.')


def resume_stalled(now=None) -> int:
    """Restart every stalled run (hourly, from the sweep). Returns how many."""
    now = now or timezone.now()
    n = 0
    for request in ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_RUNNING):
        if is_stale(request, now):
            ApprovalRequest.objects.filter(pk=request.pk).update(status=ApprovalRequest.STATUS_APPROVED)
            start_thread(request.pk)
            n += 1
    return n


def undo(request: ApprovalRequest, user) -> ApprovalRequest:
    if request.status != ApprovalRequest.STATUS_APPLIED:
        raise RequestError(f'Only an applied request can be undone (this one is {request.status}).')
    kind = get_kind(request.kind)
    if kind.undo is None:
        raise RequestError(f'{kind.label} cannot be undone.')
    result = kind.undo(request) or {}
    request.refresh_from_db()
    request.status = ApprovalRequest.STATUS_UNDONE
    request.undone_by = user
    request.undone_at = timezone.now()
    request.result = {**(request.result or {}), 'undo': result}
    request.save(update_fields=['status', 'undone_by', 'undone_at', 'result', 'updated_at'])
    Progress(request).log('undone')
    return request
