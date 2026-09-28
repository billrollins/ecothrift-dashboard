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

``start(day)`` does the same in a background thread (the model can take longer than a web
request is allowed). The command ``build_daily_brief`` runs it on a schedule.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import date, timedelta

from django.db import close_old_connections
from django.utils import timezone

from apps.core.models import ContextSnapshot, DailyBrief
from apps.core.services.context_snapshot import build_snapshot

logger = logging.getLogger(__name__)

PURPOSE = 'SUPERVISOR_BRIEF'
TOOL = 'write_brief'
STALE_WRITING = timedelta(minutes=10)

SYSTEM = """You are the AI supervisor for Eco-Thrift, a liquidation and thrift store in Omaha run by its \
owner, Bill. Each morning you write Bill a short brief from yesterday's snapshot of the business.

Rules:
- Use only numbers and facts in the snapshot JSON. Never invent a number, a cause or a name.
  If a section is missing or has an error, say that it could not be read.
- Lead with what needs Bill: decisions, approvals waiting, people problems (open punches, someone
  near 40 hours; no overtime is approved), lots to bid on today, auctions ended without a result.
- Compare with the snapshot's own baselines (the same weekday last week, the 4-week average, the
  week so far). Say "up" or "down" with the amount; don't editorialize.
- Plain words, short sentences, no em dashes or en dashes, no emojis, no hype.
- Keep "needs_you" to at most 6 items, "numbers" to at most 8, and "watch" to at most 4. Each item
  is one line.
"""

SCHEMA = {
    'name': TOOL,
    'description': "Bill's daily brief.",
    'input_schema': {
        'type': 'object',
        'properties': {
            'headline': {'type': 'string', 'description': 'One line: the most important thing today.'},
            'needs_you': {'type': 'array', 'items': {'type': 'string'}, 'description': 'What Bill should act on today.'},
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


def _ask(data: dict) -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    user = 'Snapshot (JSON):\n' + json.dumps(data, default=str, indent=1)
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


def start(day: date | None = None) -> DailyBrief:
    """Write the brief in a background thread; returns the ``writing`` row at once."""
    day = day or default_day()
    current = DailyBrief.objects.filter(day=day).first()
    if is_writing(current):
        return current
    brief, _ = DailyBrief.objects.update_or_create(
        day=day, defaults={'status': DailyBrief.STATUS_WRITING, 'error': '', 'started_at': timezone.now()},
    )

    def _run() -> None:
        close_old_connections()
        try:
            write(day)
        finally:
            close_old_connections()

    threading.Thread(target=_run, name=f'daily-brief-{day}', daemon=True).start()
    return brief
