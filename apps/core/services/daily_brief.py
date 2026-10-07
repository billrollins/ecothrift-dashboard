"""
The AI supervisor's daily brief for the owner (data_platform Phase 2). Dash only: no email, no text.

``write(day)`` builds the day's ``ContextSnapshot`` (``context_snapshot.build_snapshot``), then asks
the model configured for ``SUPERVISOR_BRIEF`` (Settings → AI) for a structured brief:
- a headline;
- what needs the owner;
- the numbers;
- what to watch.

The model is told to use only the snapshot, so every number in the brief can be traced there,
and the page shows the snapshot beside it.

``start(day)`` does the same in its own process (the model can take longer than a web request is
allowed, and a web worker can be recycled mid-write). The command ``build_daily_brief`` runs it on a schedule.
"""
from __future__ import annotations

import atexit
import json
import logging
import subprocess
import sys
import threading
from datetime import date, timedelta

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from apps.core.models import ContextSnapshot, DailyBrief
from apps.core.services.context_snapshot import build_snapshot

logger = logging.getLogger(__name__)

PURPOSE = 'SUPERVISOR_BRIEF'
TOOL = 'write_brief'
STALE_WRITING = timedelta(minutes=4)  # the model call times out at 2 minutes; past this the writer is gone
STOPPED = 'The writer stopped before finishing (the server restarted it). Press Rewrite.'
_IN_FLIGHT: set = set()  # days this worker process is writing now

SYSTEM = """You are the AI supervisor for Eco-Thrift, a liquidation and thrift store in Omaha run by its \
owner, Bill. Each morning you write Bill a short brief from a snapshot of the business.

Focus on what matters now. Yesterday is one more day of context, not the subject:
- Lead with what needs Bill today: decisions, approvals waiting, people problems (open punches,
  someone near 40 hours; no overtime is approved), lots to bid on today, auctions ended without a
  result, data QA checks that got worse overnight or are high severity with rows, and hiring: check-ins
  due or overdue, overdue onboarding items, new applicants waiting, interviews today.
- If store_open is false, the store was closed that day. Don't report its zero sales, zero hours
  or missed routines at all; they are expected.
- If there is a last_week section (the Monday brief), review the week: sales against the week
  before, hours, routines done against due and which ones were missed most.
- Use only numbers and facts in the snapshot JSON. Never invent a number, a cause or a name. If a
  section is missing or has an error, say that it could not be read.
- Times are in Central (the snapshot gives them that way). Never write UTC.
- Compare with the snapshot's own baselines. Say "up" or "down" with the amount; don't editorialize.
- Plain words, short sentences, no em dashes or en dashes, no emojis, no hype.
- Keep "needs_you" to at most 6 items, "numbers" to at most 8, and "watch" to at most 4. Each item
  is one line. When a snapshot row has a "link" that fits the item, put it in the item's link.
"""

SCHEMA = {
    'name': TOOL,
    'description': "Bill's daily brief.",
    'input_schema': {
        'type': 'object',
        'properties': {
            'headline': {'type': 'string', 'description': 'One line: the most important thing today.'},
            'needs_you': {
                'type': 'array', 'description': 'What Bill should act on today.',
                'items': {'type': 'object', 'properties': {'text': {'type': 'string'}, 'link': {'type': 'string'}}, 'required': ['text']},
            },
            'numbers': {'type': 'array', 'items': {'type': 'string'}, 'description': "Yesterday's key numbers, against the baselines."},
            'watch': {'type': 'array', 'items': {'type': 'string'}, 'description': 'Trends or risks to keep an eye on.'},
        },
        'required': ['headline', 'needs_you', 'numbers', 'watch'],
    },
}


def default_day() -> date:
    return timezone.localdate() - timedelta(days=1)


def snapshot_for(day: date) -> ContextSnapshot:
    data = build_snapshot(day)
    snap, _ = ContextSnapshot.objects.update_or_create(day=day, defaults={'data': data})
    return snap


def user_message(data: dict) -> str:
    """Exactly what the model is sent after the instructions (the page shows it)."""
    return 'Snapshot (JSON):\n' + json.dumps(data, default=str, indent=1)


def _ask(data: dict) -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    user = user_message(data)
    return llm_chat_tool_input(
        purpose=PURPOSE, system=SYSTEM, user=user, tool_name=TOOL, tools=[SCHEMA],
        temperature=0.2, max_tokens=2000, timeout=120, log_source='daily_brief', log_detail=str(data.get('for_day')),
    )


def write(day: date | None = None) -> DailyBrief:
    """Build the snapshot and the brief for ``day`` (default yesterday), synchronously."""
    day = day or default_day()
    brief, _ = DailyBrief.objects.update_or_create(
        day=day, defaults={'status': DailyBrief.STATUS_WRITING, 'error': '', 'started_at': timezone.now()},
    )
    try:
        snap = snapshot_for(day)
        body, model_used = _ask(snap.data)
        brief.snapshot = snap
        brief.body = {k: body.get(k) for k in ('headline', 'needs_you', 'numbers', 'watch')}
        brief.model_used = model_used
        brief.status = DailyBrief.STATUS_READY
    except Exception as exc:  # the page shows it; the snapshot is still kept
        logger.exception('daily brief for %s failed', day)
        brief.snapshot = ContextSnapshot.objects.filter(day=day).first()
        brief.status = DailyBrief.STATUS_FAILED
        brief.error = str(exc)[:2000]
    brief.finished_at = timezone.now()
    brief.save()
    return brief


def is_writing(brief: DailyBrief | None) -> bool:
    return bool(
        brief and brief.status == DailyBrief.STATUS_WRITING and brief.started_at
        and timezone.now() - brief.started_at < STALE_WRITING
    )


def settle(brief: DailyBrief | None) -> DailyBrief | None:
    """A brief left 'writing' past the stale window lost its writer (a server restart): say so."""
    if brief is not None and brief.status == DailyBrief.STATUS_WRITING and not is_writing(brief):
        brief.status, brief.error, brief.finished_at = DailyBrief.STATUS_FAILED, STOPPED, timezone.now()
        brief.save(update_fields=['status', 'error', 'finished_at'])
    return brief


@atexit.register
def _stopped_mid_write() -> None:
    """The web server recycles its workers every few hundred requests, and that kills this thread.
    Mark what it was writing as stopped, so the page doesn't sit on 'writing'."""
    if not _IN_FLIGHT:
        return
    try:
        DailyBrief.objects.filter(day__in=list(_IN_FLIGHT), status=DailyBrief.STATUS_WRITING).update(
            status=DailyBrief.STATUS_FAILED, error=STOPPED, finished_at=timezone.now())
    except Exception:  # the process is exiting; the stale window is the backstop
        pass


def start(day: date | None = None) -> DailyBrief:
    """Write the brief in a background thread; returns the ``writing`` row at once."""
    day = day or default_day()
    current = DailyBrief.objects.filter(day=day).first()
    if is_writing(current):
        return current
    brief, _ = DailyBrief.objects.update_or_create(
        day=day, defaults={'status': DailyBrief.STATUS_WRITING, 'error': '', 'started_at': timezone.now()},
    )

    # Its own process, in its own session: the web server recycles its workers every few hundred
    # requests, and a thread inside a worker dies with it (2026-09-28). This outlives the worker.
    try:
        subprocess.Popen(
            [sys.executable, str(settings.BASE_DIR / 'manage.py'), 'build_daily_brief', '--day', day.isoformat()],
            cwd=str(settings.BASE_DIR), start_new_session=True,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return brief
    except OSError:
        logger.exception('could not start the brief process; writing in a thread instead')

    def _run() -> None:
        close_old_connections()
        _IN_FLIGHT.add(day)
        try:
            write(day)
        finally:
            _IN_FLIGHT.discard(day)
            close_old_connections()

    threading.Thread(target=_run, name=f'daily-brief-{day}', daemon=True).start()
    return brief
