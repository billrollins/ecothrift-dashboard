"""Append-only item notes. Survive check-in, job and split churn.

Corrections append a successor and retire the old row. Removal voids in place
and keeps the body. Manual notes are the only ones a person can revise or void
from the trail; every other surface is written by the form that owns it.
"""

from __future__ import annotations

from typing import Iterable

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, ItemCheckIn, ItemNote, RestorationJob


SURFACES = {choice[0] for choice in ItemNote.SURFACE_CHOICES}
MANUAL_SURFACES = {ItemNote.SURFACE_MANUAL}


def _actor(user):
    if user is not None and getattr(user, 'is_authenticated', False):
        return user
    return None


def _clean_body(body: str) -> str:
    return str(body or '').strip()


def append_item_note(
    item: Item,
    surface: str,
    body: str,
    *,
    author=None,
    job_id: int | None = None,
    check_in: ItemCheckIn | None = None,
    source_key: str = '',
    supersedes: ItemNote | None = None,
    occurred_at=None,
) -> ItemNote | None:
    """Write one note. Empty body is a no-op so dual-write never invents blanks."""

    if surface not in SURFACES:
        raise ValueError(f'Unsupported item note surface: {surface}.')
    cleaned = _clean_body(body)
    if not cleaned:
        return None
    return ItemNote.objects.create(
        item=item,
        body=cleaned,
        surface=surface,
        source_key=str(source_key or '')[:128],
        restoration_job_id=job_id,
        check_in=check_in,
        author=_actor(author),
        occurred_at=occurred_at or timezone.now(),
        supersedes=supersedes,
    )


def _job_items(job: RestorationJob) -> list[Item]:
    if not job.item_check_in_id:
        return []
    return list(job.item_check_in.items.order_by('id'))


def append_note_for_job(
    job: RestorationJob,
    surface: str,
    body: str,
    *,
    author=None,
    source_key: str = '',
    occurred_at=None,
) -> list[ItemNote]:
    """One row per item on the job's check-in, so the item view is always complete."""

    cleaned = _clean_body(body)
    if not cleaned:
        return []
    check_in = job.item_check_in if job.item_check_in_id else None
    written: list[ItemNote] = []
    for item in _job_items(job):
        note = append_item_note(
            item,
            surface,
            cleaned,
            author=author,
            job_id=job.pk,
            check_in=check_in,
            source_key=source_key,
            occurred_at=occurred_at,
        )
        if note is not None:
            written.append(note)
    return written


@transaction.atomic
def record_surface_note_for_job(
    job: RestorationJob,
    surface: str,
    body: str,
    *,
    author=None,
    source_key: str = '',
    occurred_at=None,
) -> list[ItemNote]:
    """Supersede the active note for this surface+source_key on each item.

    Empty body voids the live note instead of writing a blank. Same text is a
    no-op so a form that re-saves does not grow the trail.
    """

    cleaned = _clean_body(body)
    key = str(source_key or surface)[:128]
    check_in = job.item_check_in if job.item_check_in_id else None
    written: list[ItemNote] = []
    for item in _job_items(job):
        active = (
            ItemNote.objects.select_for_update()
            .filter(
                item=item,
                surface=surface,
                source_key=key,
                status=ItemNote.STATUS_ACTIVE,
            )
            .order_by('-occurred_at', '-id')
            .first()
        )
        if not cleaned:
            if active is not None:
                void_item_note(active, reason='Cleared.', actor=author, allow_system=True)
            continue
        if active is not None and active.body == cleaned:
            continue
        if active is not None:
            active.status = ItemNote.STATUS_REVISED
            active.save(update_fields=['status'])
        note = append_item_note(
            item,
            surface,
            cleaned,
            author=author,
            job_id=job.pk,
            check_in=check_in,
            source_key=key,
            supersedes=active,
            occurred_at=occurred_at,
        )
        if note is not None:
            written.append(note)
    return written


@transaction.atomic
def revise_item_note(
    note: ItemNote,
    *,
    body: str,
    actor=None,
) -> ItemNote:
    note = ItemNote.objects.select_for_update().select_related('item').get(pk=note.pk)
    if note.surface not in MANUAL_SURFACES:
        raise ValueError('Only a manual note can be revised.')
    if note.status != ItemNote.STATUS_ACTIVE:
        raise ValueError('Only an active note can be revised.')
    if _actor(actor) is None or note.author_id != getattr(actor, 'pk', None):
        raise ValueError('Only the author can revise this note.')
    cleaned = _clean_body(body)
    if not cleaned:
        raise ValueError('Write the note.')
    if note.body == cleaned:
        return note
    note.status = ItemNote.STATUS_REVISED
    note.save(update_fields=['status'])
    replacement = append_item_note(
        note.item,
        note.surface,
        cleaned,
        author=actor,
        job_id=note.restoration_job_id,
        check_in=note.check_in,
        source_key=note.source_key,
        supersedes=note,
    )
    if replacement is None:
        raise ValueError('Write the note.')
    return replacement


@transaction.atomic
def void_item_note(
    note: ItemNote,
    *,
    reason: str,
    actor=None,
    allow_system: bool = False,
) -> ItemNote:
    note = ItemNote.objects.select_for_update().get(pk=note.pk)
    if note.surface not in MANUAL_SURFACES and not allow_system:
        raise ValueError('Only a manual note can be voided.')
    if note.status != ItemNote.STATUS_ACTIVE:
        raise ValueError('Only an active note can be voided.')
    if not allow_system:
        if _actor(actor) is None or note.author_id != getattr(actor, 'pk', None):
            raise ValueError('Only the author can void this note.')
    cleaned_reason = _clean_body(reason)
    if not cleaned_reason:
        raise ValueError('A reason is required to void a note.')
    note.status = ItemNote.STATUS_VOIDED
    note.voided_at = timezone.now()
    note.voided_by = _actor(actor)
    note.void_reason = cleaned_reason
    note.save(update_fields=['status', 'voided_at', 'voided_by', 'void_reason'])
    return note


def note_trail(item_ids: Iterable[int]):
    """Active notes, oldest first. Revised and voided rows stay out of the list."""

    ids = [int(pk) for pk in item_ids]
    if not ids:
        return ItemNote.objects.none()
    return (
        ItemNote.objects.filter(item_id__in=ids, status=ItemNote.STATUS_ACTIVE)
        .select_related('author', 'item')
        .order_by('occurred_at', 'id')
    )


def handoff_note_body(handoff: dict | None) -> str:
    if not isinstance(handoff, dict):
        return ''
    parts: list[str] = []
    evidence = str(handoff.get('condition_evidence') or '').strip()
    if evidence:
        parts.append(evidence)
    unknowns = handoff.get('unknowns')
    if isinstance(unknowns, list):
        unknown_text = '; '.join(str(row).strip() for row in unknowns if str(row).strip())
    else:
        unknown_text = str(unknowns or '').strip()
    if unknown_text:
        parts.append(f'Unknowns: {unknown_text}')
    return '\n'.join(parts)
