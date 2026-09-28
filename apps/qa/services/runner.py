"""
Run every QA check (data_platform Phase 3), keep the result, triage it, and stage the fixes.

``run()`` is the nightly job (``python manage.py run_qa``):
1. Every check in ``apps/qa/checks.py`` runs on its own. A check that fails records its error
   instead of stopping the others.
2. Each finding keeps its count, the count in the last run, sample rows and ids.
3. **The AI triage** (``QA_TRIAGE`` in Settings → AI) reads what changed and writes a headline and
   a note per check. It only reads the numbers here, and changes nothing.
4. **Fixes:** for a check with a fix kind and rows to fix, a Requests item is staged, unless one is
   already waiting. The owner approves it in production. Nothing is changed without that.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import timedelta

from django.db import close_old_connections
from django.utils import timezone

from apps.qa.checks import CHECKS, evaluate
from apps.qa.models import QAFinding, QARun

logger = logging.getLogger(__name__)

PURPOSE = 'QA_TRIAGE'
TOOL = 'qa_triage'
STALE = timedelta(minutes=15)

SYSTEM = """You are the data-quality reviewer for Eco-Thrift's store system. You get tonight's standing \
checks: each is a rail from the store's data-quality register, with tonight's count, the last run's \
count, what reports do with those rows today, and a few sample rows.

Write the owner a short triage:
- A headline: the one thing that most needs attention, or that the data is steady.
- One note per check that changed or is high severity with rows: say whether it is new, worse, \
better or steady, what it likely means, and the next step. Use only the numbers given. Never invent a \
cause you can't see in the rows.
- Plain words, no em or en dashes, no emojis."""

SCHEMA = {
    'name': TOOL,
    'description': 'The QA triage.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'headline': {'type': 'string'},
            'notes': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'check_id': {'type': 'string'},
                        'verdict': {'type': 'string', 'enum': ['new', 'worse', 'better', 'steady']},
                        'note': {'type': 'string'},
                    },
                    'required': ['check_id', 'verdict', 'note'],
                },
            },
        },
        'required': ['headline', 'notes'],
    },
}


def _previous_counts() -> dict[str, int]:
    last = QARun.objects.filter(finished_at__isnull=False, error='').order_by('-started_at').first()
    return dict(last.findings.values_list('check_id', 'count')) if last else {}


def run(*, triage: bool = True, stage_fixes: bool = True) -> QARun:
    previous = _previous_counts()
    qa_run = QARun.objects.create()
    counts = {}
    for check in CHECKS:
        try:
            count, sample, ids = evaluate(check)
            error = ''
        except Exception as exc:  # one broken check never stops the run
            logger.exception('QA check %s failed', check.id)
            count, sample, ids, error = 0, [], [], str(exc)[:300]
        QAFinding.objects.create(
            run=qa_run, check_id=check.id, title=check.title, severity=check.severity, count=count,
            previous=previous.get(check.id), sample=sample, ids=ids, error=error,
        )
        counts[check.id] = count
    qa_run.counts = counts
    qa_run.finished_at = timezone.now()
    qa_run.save(update_fields=['counts', 'finished_at'])
    if stage_fixes:
        stage(qa_run)
    if triage:
        write_triage(qa_run)
    return qa_run


def _ask(payload: list[dict]) -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    return llm_chat_tool_input(
        purpose=PURPOSE, system=SYSTEM, user='Tonight\'s checks (JSON):\n' + json.dumps(payload, default=str, indent=1),
        tool_name=TOOL, tools=[SCHEMA], temperature=0.1, max_tokens=1500, timeout=90, log_source='qa_triage',
    )


def write_triage(qa_run: QARun) -> None:
    """The AI's note on what changed. A failure is recorded and never stops the run."""
    from apps.qa.checks import by_id

    payload = []
    for f in qa_run.findings.all():
        check = by_id(f.check_id)
        payload.append({
            'check_id': f.check_id, 'title': f.title, 'severity': f.severity, 'count': f.count, 'last_run': f.previous,
            'handling_today': check.handling if check else '', 'sample': f.sample[:5], 'error': f.error,
        })
    try:
        body, model_used = _ask(payload)
        qa_run.triage = {'headline': str(body.get('headline') or ''), 'notes': list(body.get('notes') or [])[:30]}
        qa_run.triage_model = model_used[:80]
    except Exception as exc:
        logger.warning('QA triage failed: %s', exc)
        qa_run.triage = {'headline': '', 'notes': [], 'error': str(exc)[:300]}
    qa_run.save(update_fields=['triage', 'triage_model'])


def stage(qa_run: QARun) -> list[int]:
    """A Requests item per fixable check with rows, unless one is already waiting or running."""
    from apps.core.models import ApprovalRequest
    from apps.core.services.approval_requests import stage as stage_request
    from apps.qa.checks import by_id

    staged = []
    for f in qa_run.findings.exclude(count=0):
        check = by_id(f.check_id)
        if not check or not check.fix_kind or not f.ids:
            continue
        waiting = ApprovalRequest.objects.filter(
            kind=check.fix_kind,
            status__in=[ApprovalRequest.STATUS_PENDING, ApprovalRequest.STATUS_APPROVED, ApprovalRequest.STATUS_RUNNING],
        ).exists()
        if waiting:
            continue
        req = stage_request(
            check.fix_kind, title=f'QA {check.id}: {check.title} ({f.count})',
            summary=f'Found by the nightly QA run {qa_run.pk}. Handling today: {check.handling}.',
            params={'ids': f.ids, 'check_id': check.id, 'qa_run': qa_run.pk}, requested_by='qa',
        )
        staged.append(req.pk)
    return staged


def start(*, triage: bool = True) -> QARun | None:
    """Run in a background thread (the Run now button). Returns None if a run is already going."""
    recent = QARun.objects.filter(finished_at__isnull=True, started_at__gt=timezone.now() - STALE).exists()
    if recent:
        return None

    def _go() -> None:
        close_old_connections()
        try:
            run(triage=triage)
        finally:
            close_old_connections()

    threading.Thread(target=_go, name='qa-run', daemon=True).start()
    return QARun.objects.first()
