"""Trash or revise a restoration comment from either ledger. Both rows go together.

Only the author can trash or edit a comment, and only when every later action
and later comment was written by them — or there is nothing later. Finished
jobs stay open for comments; someone else's later work still locks them.
"""

from __future__ import annotations

from django.db import transaction

from apps.inventory.models import Item, ItemNote, RestorationJob, RestorationTimelineEvent


COMMENT_EVENT_TYPES = frozenset({'note.queue_changed', 'note.added'})
QUEUE_NOTE_EVENT = 'note.queue_changed'
ADDED_NOTE_EVENT = 'note.added'
TRASH_REASON = 'Cleared from the notes trail.'


def job_for_item(item: Item) -> RestorationJob | None:
    if not item.check_in_id:
        return None
    return RestorationJob.objects.filter(item_check_in_id=item.check_in_id).order_by('-id').first()


def job_for_note(note: ItemNote) -> RestorationJob | None:
    if note.restoration_job_id:
        job = RestorationJob.objects.filter(pk=note.restoration_job_id).first()
        if job is not None:
            return job
    check_in_id = note.check_in_id or getattr(note.item, 'check_in_id', None)
    if not check_in_id:
        return None
    return RestorationJob.objects.filter(item_check_in_id=check_in_id).order_by('-id').first()


def _actor_pk(user) -> int | None:
    if user is not None and getattr(user, 'is_authenticated', False):
        return getattr(user, 'pk', None)
    return None


def _later(occurred_at, row_id, other_at, other_id) -> bool:
    return (other_at, other_id) > (occurred_at, row_id)


def comment_owned_by(*, author_id, actor) -> bool:
    actor_id = _actor_pk(actor)
    return actor_id is not None and author_id == actor_id


def comment_is_locked(
    *,
    occurred_at,
    row_id: int,
    job: RestorationJob,
    actor,
    exclude_note_id: int | None = None,
    exclude_event_id: int | None = None,
) -> bool:
    """True when someone else wrote a comment or logged an action after this one."""

    actor_id = _actor_pk(actor)
    if actor_id is None:
        return True
    for action in job.actions.all():
        if action.started_at > occurred_at and action.created_by_id != actor_id:
            return True
    item_ids = []
    if job.item_check_in_id:
        item_ids = list(job.item_check_in.items.values_list('id', flat=True))
    if item_ids:
        later_notes = ItemNote.objects.filter(
            item_id__in=item_ids,
            status=ItemNote.STATUS_ACTIVE,
        )
        for note in later_notes:
            if exclude_note_id is not None and note.pk == exclude_note_id:
                continue
            if note.author_id != actor_id and _later(
                occurred_at, row_id, note.occurred_at, note.pk
            ):
                return True
    later_events = RestorationTimelineEvent.objects.filter(
        job=job,
        status=RestorationTimelineEvent.STATUS_ACTIVE,
        event_type__in=COMMENT_EVENT_TYPES,
    )
    for event in later_events:
        if exclude_event_id is not None and event.pk == exclude_event_id:
            continue
        if event.actor_id != actor_id and _later(
            occurred_at, row_id, event.occurred_at, event.pk
        ):
            return True
    return False


def item_note_can_delete(note: ItemNote, actor) -> bool:
    if note.status != ItemNote.STATUS_ACTIVE:
        return False
    if not comment_owned_by(author_id=note.author_id, actor=actor):
        return False
    job = job_for_note(note)
    if job is None:
        return False
    return not comment_is_locked(
        occurred_at=note.occurred_at,
        row_id=note.pk,
        job=job,
        actor=actor,
        exclude_note_id=note.pk,
    )


def item_note_can_edit(note: ItemNote, actor) -> bool:
    from apps.inventory.services.item_notes import MANUAL_SURFACES

    if note.status != ItemNote.STATUS_ACTIVE:
        return False
    if note.surface not in MANUAL_SURFACES:
        return False
    if not comment_owned_by(author_id=note.author_id, actor=actor):
        return False
    job = job_for_note(note)
    if job is None:
        return True
    return not comment_is_locked(
        occurred_at=note.occurred_at,
        row_id=note.pk,
        job=job,
        actor=actor,
        exclude_note_id=note.pk,
    )


def _payload(event: RestorationTimelineEvent) -> dict:
    return event.payload if isinstance(event.payload, dict) else {}


def _resolve_notes_for_event(event: RestorationTimelineEvent) -> list[ItemNote]:
    payload = _payload(event)
    note_id = payload.get('item_note_id')
    if note_id:
        found = list(ItemNote.objects.filter(pk=note_id))
        if found:
            return found
    body = str(payload.get('next') or payload.get('body') or '').strip()
    if not body or not event.job_id:
        return []
    item_ids = []
    if event.job.item_check_in_id:
        item_ids = list(event.job.item_check_in.items.values_list('id', flat=True))
    if not item_ids:
        return []
    return list(
        ItemNote.objects.filter(
            item_id__in=item_ids,
            body=body,
            restoration_job_id=event.job_id,
        ).exclude(status=ItemNote.STATUS_VOIDED)
    )


def _resolve_events_for_note(note: ItemNote, job: RestorationJob) -> list[RestorationTimelineEvent]:
    events = list(
        RestorationTimelineEvent.objects.filter(
            job=job,
            status=RestorationTimelineEvent.STATUS_ACTIVE,
            event_type__in=COMMENT_EVENT_TYPES,
        )
    )
    matched = [
        event
        for event in events
        if _payload(event).get('item_note_id') == note.pk
    ]
    if matched:
        return matched
    body = (note.body or '').strip()
    if not body:
        return []
    return [
        event
        for event in events
        if str(_payload(event).get('next') or _payload(event).get('body') or '').strip() == body
    ]


def _revert_live_queue_note(event: RestorationTimelineEvent, actor) -> None:
    if event.event_type != QUEUE_NOTE_EVENT:
        return
    payload = _payload(event)
    next_text = str(payload.get('next') or '')
    previous = str(payload.get('previous') or '')
    job = event.job
    if (job.queue_note or '') != next_text:
        return
    job.queue_note = previous
    job.save(update_fields=['queue_note', 'updated_at'])
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'queue',
        previous,
        author=actor,
        source_key='queue',
    )


def _void_note(note: ItemNote, actor) -> ItemNote:
    from apps.inventory.services.item_notes import void_item_note

    if note.status != ItemNote.STATUS_ACTIVE:
        if note.status == ItemNote.STATUS_REVISED:
            note.status = ItemNote.STATUS_VOIDED
            note.void_reason = TRASH_REASON
            note.save(update_fields=['status', 'void_reason'])
        return note
    return void_item_note(note, reason=TRASH_REASON, actor=actor, allow_system=True)


@transaction.atomic
def trash_restoration_comment(*, note: ItemNote | None = None, event=None, actor=None):
    """Void the comment on both ledgers. Returns the voided timeline event or note."""

    from apps.inventory.services.restoration_timeline import _void_words_event

    if event is None and note is None:
        raise ValueError('Name the comment.')

    if event is not None:
        event = (
            RestorationTimelineEvent.objects.select_for_update()
            .select_related('job')
            .get(pk=event.pk)
        )
        if event.status != RestorationTimelineEvent.STATUS_ACTIVE:
            raise ValueError('Only an active comment can be cleared.')
        if event.event_type not in COMMENT_EVENT_TYPES:
            raise ValueError('This history line is not a comment.')
        if not comment_owned_by(author_id=event.actor_id, actor=actor):
            raise ValueError('Only the author can clear this comment.')
        if comment_is_locked(
            occurred_at=event.occurred_at,
            row_id=event.pk,
            job=event.job,
            actor=actor,
            exclude_event_id=event.pk,
        ):
            raise ValueError('Someone else has written or worked since this comment.')
        _revert_live_queue_note(event, actor)
        for matched in _resolve_notes_for_event(event):
            matched = ItemNote.objects.select_for_update().get(pk=matched.pk)
            _void_note(matched, actor)
        return _void_words_event(event, actor)

    note = ItemNote.objects.select_for_update().select_related('item').get(pk=note.pk)
    job = job_for_note(note)
    if job is None:
        raise ValueError('This comment is not on a restoration item.')
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if note.status != ItemNote.STATUS_ACTIVE:
        raise ValueError('Only an active comment can be cleared.')
    if not comment_owned_by(author_id=note.author_id, actor=actor):
        raise ValueError('Only the author can clear this comment.')
    if comment_is_locked(
        occurred_at=note.occurred_at,
        row_id=note.pk,
        job=job,
        actor=actor,
        exclude_note_id=note.pk,
    ):
        raise ValueError('Someone else has written or worked since this comment.')
    events = _resolve_events_for_note(note, job)
    for matched in events:
        locked = (
            RestorationTimelineEvent.objects.select_for_update()
            .select_related('job')
            .get(pk=matched.pk)
        )
        _revert_live_queue_note(locked, actor)
        _void_words_event(locked, actor)
    note = ItemNote.objects.select_for_update().get(pk=note.pk)
    return _void_note(note, actor)


@transaction.atomic
def revise_restoration_comment(note: ItemNote, *, body: str, actor=None) -> ItemNote:
    """Revise a manual note and keep its action-history twin on the same line."""

    from apps.inventory.services.item_notes import revise_item_note

    note = ItemNote.objects.select_for_update().select_related('item').get(pk=note.pk)
    job = job_for_note(note)
    if job is not None:
        job = RestorationJob.objects.select_for_update().get(pk=job.pk)
        if comment_is_locked(
            occurred_at=note.occurred_at,
            row_id=note.pk,
            job=job,
            actor=actor,
            exclude_note_id=note.pk,
        ):
            raise ValueError('Someone else has written or worked since this comment.')
        twins = _resolve_events_for_note(note, job)
    else:
        twins = []
    replacement = revise_item_note(note, body=body, actor=actor)
    for event in twins:
        locked = RestorationTimelineEvent.objects.select_for_update().get(pk=event.pk)
        payload = dict(_payload(locked))
        if locked.event_type == ADDED_NOTE_EVENT:
            payload['body'] = replacement.body
        else:
            payload['next'] = replacement.body
        payload['item_note_id'] = replacement.pk
        locked.payload = payload
        update = ['payload']
        if locked.event_type == ADDED_NOTE_EVENT:
            locked.entity_id = f'item-note:{replacement.pk}'
            update.append('entity_id')
        locked.save(update_fields=update)
    return replacement


def append_manual_job_note(item: Item, body: str, *, author, job: RestorationJob | None = None):
    """Write a person-typed note and its action-history twin."""

    from apps.inventory.services.item_notes import append_item_note
    from apps.inventory.services.restoration_timeline import append_timeline_event

    job = job or job_for_item(item)
    note = append_item_note(
        item,
        'manual',
        body,
        author=author,
        job_id=job.pk if job is not None else None,
        check_in=item.check_in,
        source_key='manual',
    )
    if note is None or job is None:
        return note
    append_timeline_event(
        job,
        ADDED_NOTE_EVENT,
        {'body': note.body, 'item_note_id': note.pk},
        actor=author,
        entity_id=f'item-note:{note.pk}',
    )
    return note


def record_queue_note_change(
    job: RestorationJob,
    *,
    previous: str,
    next_text: str,
    actor,
    surface: str = 'queue',
    correlation_id=None,
):
    """Dual-write a queue-note change with the ItemNote id on the timeline row."""

    from apps.inventory.services.item_notes import record_surface_note_for_job
    from apps.inventory.services.restoration_timeline import append_timeline_event

    written = record_surface_note_for_job(
        job,
        surface,
        next_text,
        author=actor,
        source_key=surface,
    )
    note_id = written[0].pk if written else None
    append_timeline_event(
        job,
        QUEUE_NOTE_EVENT,
        {'previous': previous or '', 'next': next_text or '', 'item_note_id': note_id},
        actor=actor,
        entity_id=f'queue-note:{job.pk}',
        correlation_id=correlation_id,
    )
    return written
