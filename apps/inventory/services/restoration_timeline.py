"""Append-only restoration timeline and current-state projection helpers."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import RestorationJob, RestorationTimelineEvent


TIMELINE_EVENT_TYPES = {
    'legacy.snapshot',
    'job.sent',
    'job.checked_in',
    'job.moved_to_queue',
    'valuation.requested',
    'valuation.values_changed',
    'valuation.fulfilled',
    'condition.current_grade.set',
    'test.added',
    'test.result_set',
    'test.removed',
    'plan.estimated',
    'plan.committed',
    'plan.cleared',
    'parts.draft_changed',
    'parts.request_submitted',
    'parts.ordered',
    'parts.received',
    'work.performed',
    'timer.started',
    'timer.paused',
    'timer.adjusted',
    'hold.placed',
    'hold.resumed',
    'disposition.completed',
    'return.to_processing',
}

CLIENT_EVENT_TYPES = {
    'condition.current_grade.set',
    'test.added',
    'test.result_set',
    'plan.estimated',
    'plan.committed',
    'plan.cleared',
    'work.performed',
}


def _actor(user):
    if user is not None and getattr(user, 'is_authenticated', False):
        return user
    return None


def _clean_payload(payload: Any) -> dict[str, Any]:
    return deepcopy(payload) if isinstance(payload, dict) else {}


def append_timeline_event(
    job: RestorationJob,
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    actor=None,
    entity_id: str = '',
    correlation_id: UUID | None = None,
    supersedes: RestorationTimelineEvent | None = None,
    occurred_at=None,
) -> RestorationTimelineEvent:
    if event_type not in TIMELINE_EVENT_TYPES:
        raise ValueError(f'Unsupported restoration timeline event type: {event_type}.')
    return RestorationTimelineEvent.objects.create(
        job=job,
        event_type=event_type,
        entity_id=str(entity_id or '')[:128],
        occurred_at=occurred_at or timezone.now(),
        actor=_actor(actor),
        supersedes=supersedes,
        correlation_id=correlation_id or uuid4(),
        payload=_clean_payload(payload),
    )


def append_entity_revision(
    job: RestorationJob,
    event_type: str,
    payload: dict[str, Any],
    *,
    actor=None,
    entity_id: str,
) -> RestorationTimelineEvent:
    previous = (
        RestorationTimelineEvent.objects.select_for_update()
        .filter(
            job=job,
            event_type=event_type,
            entity_id=str(entity_id),
            status=RestorationTimelineEvent.STATUS_ACTIVE,
        )
        .order_by('-occurred_at', '-id')
        .first()
    )
    if previous is not None:
        previous.status = RestorationTimelineEvent.STATUS_REVISED
        previous.save(update_fields=['status'])
    return append_timeline_event(
        job,
        event_type,
        payload,
        actor=actor,
        entity_id=entity_id,
        supersedes=previous,
    )


@transaction.atomic
def revise_timeline_event(
    event: RestorationTimelineEvent,
    *,
    payload: dict[str, Any],
    actor=None,
) -> RestorationTimelineEvent:
    event = (
        RestorationTimelineEvent.objects.select_for_update()
        .select_related('job')
        .get(pk=event.pk)
    )
    if event.status != RestorationTimelineEvent.STATUS_ACTIVE:
        raise ValueError('Only an active timeline entry can be revised.')
    merged = {**_clean_payload(event.payload), **_clean_payload(payload)}
    _apply_projection(event.job, event.event_type, merged, event.entity_id)
    event.status = RestorationTimelineEvent.STATUS_REVISED
    event.save(update_fields=['status'])
    return append_timeline_event(
        event.job,
        event.event_type,
        merged,
        actor=actor,
        entity_id=event.entity_id,
        supersedes=event,
    )


@transaction.atomic
def void_timeline_event(
    event: RestorationTimelineEvent,
    *,
    reason: str,
    actor=None,
) -> RestorationTimelineEvent:
    event = (
        RestorationTimelineEvent.objects.select_for_update()
        .select_related('job')
        .get(pk=event.pk)
    )
    if event.status != RestorationTimelineEvent.STATUS_ACTIVE:
        raise ValueError('Only an active timeline entry can be voided.')
    if not str(reason or '').strip():
        raise ValueError('A reason is required to void a timeline entry.')
    _apply_projection(event.job, event.event_type, event.payload, event.entity_id, remove=True)
    event.status = RestorationTimelineEvent.STATUS_VOIDED
    event.voided_at = timezone.now()
    event.voided_by = _actor(actor)
    event.void_reason = str(reason).strip()
    event.save(update_fields=['status', 'voided_at', 'voided_by', 'void_reason'])
    return event


@transaction.atomic
def create_projected_timeline_event(
    job: RestorationJob,
    *,
    event_type: str,
    payload: dict[str, Any],
    entity_id: str,
    actor=None,
) -> RestorationTimelineEvent:
    if event_type not in CLIENT_EVENT_TYPES:
        raise ValueError('This timeline event type cannot be created directly.')
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    _apply_projection(job, event_type, payload, entity_id)
    return append_entity_revision(
        job,
        event_type,
        payload,
        actor=actor,
        entity_id=entity_id,
    )


def _decision_work(session: dict[str, Any]) -> dict[str, Any]:
    value = session.get('decisionWork')
    return value if isinstance(value, dict) else {}


def _rows_by_id(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        return {}
    return {
        str(row.get('id')): row
        for row in value
        if isinstance(row, dict) and row.get('id') not in (None, '')
    }


def _replace_or_remove(
    rows: list[Any],
    entity_id: str,
    payload: dict[str, Any],
    *,
    remove: bool,
) -> list[Any]:
    updated: list[Any] = []
    matched = False
    for raw in rows:
        if not isinstance(raw, dict) or str(raw.get('id')) != str(entity_id):
            updated.append(raw)
            continue
        matched = True
        if not remove:
            updated.append({**raw, **payload, 'id': raw.get('id', entity_id)})
    if not matched and not remove:
        updated.append({**payload, 'id': payload.get('id', entity_id)})
    return updated


def _apply_projection(
    job: RestorationJob,
    event_type: str,
    payload: dict[str, Any],
    entity_id: str,
    *,
    remove: bool = False,
) -> None:
    """Apply event-backed CRUD to the legacy session projection."""

    session = deepcopy(job.work_session or {})
    decision = deepcopy(_decision_work(session))
    changed = False

    if event_type == 'condition.current_grade.set':
        condition = deepcopy(decision.get('condition') or {})
        condition['currentGrade'] = None if remove else payload.get('grade')
        decision['condition'] = condition
        changed = True
    elif event_type in {'test.added', 'test.result_set'}:
        tests = list(decision.get('tests') or [])
        decision['tests'] = _replace_or_remove(tests, entity_id, payload, remove=remove)
        changed = True
    elif event_type == 'plan.estimated':
        outcomes = list(decision.get('outcomes') or [])
        decision['outcomes'] = _replace_or_remove(outcomes, entity_id, payload, remove=remove)
        changed = True
    elif event_type in {'plan.committed', 'plan.cleared'}:
        decision['selection'] = {} if remove or event_type == 'plan.cleared' else deepcopy(payload)
        session['selectedGrade'] = None if remove else payload.get('grade')
        changed = True
    elif event_type == 'work.performed':
        rows = list(session.get('benchRows') or [])
        session['benchRows'] = _replace_or_remove(rows, entity_id, payload, remove=remove)
        changed = True

    if changed:
        decision['timestamps'] = {
            **(decision.get('timestamps') or {}),
            'updatedAt': timezone.now().isoformat(),
        }
        session['decisionWork'] = decision
        job.work_session = session
        job.save(update_fields=['work_session', 'updated_at'])


def _record_entity_changes(
    *,
    job: RestorationJob,
    old_rows: dict[str, dict[str, Any]],
    new_rows: dict[str, dict[str, Any]],
    event_type: str,
    actor=None,
) -> None:
    for entity_id, row in new_rows.items():
        if old_rows.get(entity_id) != row:
            append_entity_revision(
                job,
                event_type,
                row,
                actor=actor,
                entity_id=entity_id,
            )
    for entity_id in old_rows.keys() - new_rows.keys():
        latest = (
            RestorationTimelineEvent.objects.select_for_update()
            .filter(
                job=job,
                event_type=event_type,
                entity_id=entity_id,
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            )
            .order_by('-occurred_at', '-id')
            .first()
        )
        if latest is not None:
            latest.status = RestorationTimelineEvent.STATUS_VOIDED
            latest.voided_at = timezone.now()
            latest.voided_by = _actor(actor)
            latest.void_reason = 'Removed from the TARS workspace.'
            latest.save(update_fields=['status', 'voided_at', 'voided_by', 'void_reason'])


def record_work_session_changes(
    job: RestorationJob,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    *,
    actor=None,
) -> None:
    """Translate the legacy session patch into attributed semantic events."""

    old = before if isinstance(before, dict) else {}
    new = after if isinstance(after, dict) else {}
    if old == new:
        return

    old_decision = _decision_work(old)
    new_decision = _decision_work(new)
    old_grade = (old_decision.get('condition') or {}).get('currentGrade')
    new_grade = (new_decision.get('condition') or {}).get('currentGrade')
    if old_grade != new_grade:
        append_entity_revision(
            job,
            'condition.current_grade.set',
            {'grade': new_grade, 'previous_grade': old_grade},
            actor=actor,
            entity_id='current-grade',
        )

    old_tests = _rows_by_id(old_decision.get('tests'))
    new_tests = _rows_by_id(new_decision.get('tests'))
    for test_id, test in new_tests.items():
        previous = old_tests.get(test_id)
        if previous is None:
            append_timeline_event(
                job,
                'test.added',
                test,
                actor=actor,
                entity_id=test_id,
            )
        elif previous != test:
            append_entity_revision(
                job,
                'test.result_set',
                test,
                actor=actor,
                entity_id=test_id,
            )
    for test_id in old_tests.keys() - new_tests.keys():
        append_timeline_event(
            job,
            'test.removed',
            {'test': old_tests[test_id]},
            actor=actor,
            entity_id=test_id,
        )

    _record_entity_changes(
        job=job,
        old_rows=_rows_by_id(old_decision.get('outcomes')),
        new_rows=_rows_by_id(new_decision.get('outcomes')),
        event_type='plan.estimated',
        actor=actor,
    )
    _record_entity_changes(
        job=job,
        old_rows=_rows_by_id(old.get('benchRows')),
        new_rows=_rows_by_id(new.get('benchRows')),
        event_type='work.performed',
        actor=actor,
    )

    old_selection = old_decision.get('selection') or {}
    new_selection = new_decision.get('selection') or {}
    if old_selection != new_selection:
        if new_selection.get('outcomeId'):
            append_entity_revision(
                job,
                'plan.committed',
                new_selection,
                actor=actor,
                entity_id='committed-plan',
            )
        elif old_selection.get('outcomeId'):
            append_timeline_event(
                job,
                'plan.cleared',
                {'previous': old_selection},
                actor=actor,
                entity_id='committed-plan',
            )

    if old.get('parts') != new.get('parts') or old.get('orders') != new.get('orders'):
        append_entity_revision(
            job,
            'parts.draft_changed',
            {
                'parts': new.get('parts') or [],
                'orders': new.get('orders') or [],
            },
            actor=actor,
            entity_id='parts-draft',
        )

