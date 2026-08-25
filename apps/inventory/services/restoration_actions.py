"""What was done to an item, where the time went, and why.

Every second on a bench belongs to exactly one action. An action is a single
piece of work — inspecting, testing, repairing, assembling or salvaging —
on the item as a whole. Grades are a money question, not a clock question.

Three rules hold the log together:

* **The clock is never homeless.** An item opens with an initial inspection, so
  from check-in onwards there is always somewhere for time to go.

* **A pause is not a new action.** Someone who stops for a phone call and comes
  back is still doing the same sitting; splitting that into two rows would say
  something untrue about the work.

* **Nothing is left unsaid.** An action must be described before its author
  starts another. The moment you move on is the moment you know what you did,
  so it is also the last honest moment to write it down.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import RestorationAction, RestorationJob

VALID_CATEGORIES = {choice[0] for choice in RestorationAction.CATEGORY_CHOICES}

MAX_DESCRIPTION = 2000


class ActionNeedsDescriptionError(ValueError):
    """Raised when someone tries to move on from work they never described."""

    def __init__(self, action: RestorationAction):
        self.action_id = action.pk
        super().__init__('Say what you did before starting something else.')


def _clean_description(raw: Any) -> str:
    return str(raw or '').strip()[:MAX_DESCRIPTION]


def _clean_category(raw: Any) -> str:
    value = str(raw or '').strip().lower()
    if not value:
        return RestorationAction.DEFAULT_CATEGORY
    if value not in VALID_CATEGORIES:
        raise ValueError(f'Unknown action category: {value}')
    return value


def current_action(job: RestorationJob) -> RestorationAction | None:
    return job.current_action if job.current_action_id else None


def open_bench_action(job: RestorationJob, user=None) -> RestorationAction:
    """Open the action an item lands on when it reaches a bench.

    An item arriving for the first time starts on an initial inspection. One
    coming back from a hold or from the queue starts on a fresh inspection of
    its own, because picking a job back up is genuinely a new sitting — the
    work before the break was finished when the item left.

    Both are on the item as a whole and both arrive already described, so the
    clock has somewhere to go from the first second and the first action is
    never the one blocking a description.
    """

    resumed = job.actions.exists()
    action = RestorationAction.objects.create(
        job=job,
        grade='',
        category=RestorationAction.CATEGORY_INSPECT,
        description=(
            RestorationAction.RESUME_DESCRIPTION
            if resumed
            else RestorationAction.INITIAL_DESCRIPTION
        ),
        created_by=user if getattr(user, 'pk', None) else None,
    )
    job.current_action = action
    job.save(update_fields=['current_action', 'updated_at'])
    from apps.inventory.services.restoration_bench import _timeline_event
    _timeline_event(
        job,
        'action.started',
        {
            'action_id': action.pk,
            'grade': action.grade,
            'category': action.category,
            'description': action.description,
        },
        actor=user,
        entity_id=f'action:{action.pk}',
    )
    return action


def ensure_initial_action(job: RestorationJob, user=None) -> RestorationAction:
    """Give an item somewhere for its time to go, if it has nowhere.

    Idempotent, unlike `open_bench_action`: this is the repair for a job that
    somehow has no current action, not the normal arrival path.
    """

    existing = current_action(job)
    if existing is not None:
        return existing

    first = job.actions.order_by('-started_at', '-id').first()
    if first is not None:
        job.current_action = first
        job.save(update_fields=['current_action', 'updated_at'])
        return first

    return open_bench_action(job, user=user)


@transaction.atomic
def start_action(
    job: RestorationJob,
    user=None,
    *,
    category: str | None = None,
    description: str = '',
    force_new: bool = False,
) -> tuple[RestorationJob, RestorationAction]:
    """Point the clock at a piece of work, opening a new sitting if needed.

    Coming back to an open sitting resumes it. `force_new` is how someone says
    they have genuinely moved on: finished inspecting, now repairing. The
    description gate still applies, so the first piece has to be written up
    before the second can start.

    A new action defaults to Inspect with no description so the clock starts on
    the first click. The cost of that convenience is paid at the other end: the
    action must be described before the next one can begin.

    Actions are always on the item. The leftover `grade` column stays empty.
    """

    from apps.inventory.services.restoration_bench import _timeline_event

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Work can only be recorded on bench or pending items.')

    existing = current_action(job)

    # Still open: this is a resume, not a new piece of work.
    if not force_new and existing is not None and existing.ended_at is None:
        if category is not None:
            existing.category = _clean_category(category)
        if description:
            existing.description = _clean_description(description)
        existing.save(update_fields=['category', 'description', 'updated_at'])
        _open_action_on(job, existing)
        return job, existing

    # Moving on. The work being left behind has to say what it was.
    if existing is not None and not existing.is_described:
        raise ActionNeedsDescriptionError(existing)

    if existing is not None and existing.ended_at is None:
        existing.ended_at = timezone.now()
        existing.save(update_fields=['ended_at', 'updated_at'])

    action = RestorationAction.objects.create(
        job=job,
        grade='',
        category=_clean_category(category),
        description=_clean_description(description),
        created_by=user if getattr(user, 'pk', None) else None,
    )
    _open_action_on(job, action)

    _timeline_event(
        job,
        'action.started',
        {
            'action_id': action.pk,
            'grade': action.grade,
            'category': action.category,
            'description': action.description,
        },
        actor=user,
        entity_id=f'action:{action.pk}',
    )
    return job, action


def _open_action_on(job: RestorationJob, action: RestorationAction) -> None:
    """Point the diary at this action. Seconds stay 0 until the clock returns."""

    job.current_action = action
    job.save(update_fields=['current_action', 'updated_at'])


@transaction.atomic
def describe_action(
    job: RestorationJob,
    action_id: int,
    *,
    description: str | None = None,
    category: str | None = None,
    user=None,
) -> RestorationAction:
    """Write down what an action was, or correct it.

    Editable for as long as the item is unfinished. People remember what they
    did after they have done it, and a log that refuses corrections just
    collects wrong answers.
    """

    from apps.inventory.services.restoration_bench import _timeline_event

    action = RestorationAction.objects.select_for_update().get(pk=action_id, job=job)
    fields = ['updated_at']
    if description is not None:
        action.description = _clean_description(description)
        fields.append('description')
    if category is not None:
        action.category = _clean_category(category)
        fields.append('category')
    action.save(update_fields=fields)

    _timeline_event(
        job,
        'action.described',
        {
            'action_id': action.pk,
            'grade': action.grade,
            'category': action.category,
            'description': action.description,
        },
        actor=user,
        entity_id=f'action:{action.pk}',
    )
    if description is not None:
        from apps.inventory.services.item_notes import record_surface_note_for_job

        record_surface_note_for_job(
            job,
            'action',
            action.description,
            author=user,
            source_key=f'action:{action.pk}',
        )
    return action


@transaction.atomic
def delete_action(
    job: RestorationJob,
    action_id: int,
    user=None,
) -> tuple[RestorationJob, RestorationAction]:
    """Remove a row from the log.

    The only row that cannot go is the last one standing: an item with no
    actions has no diary of its work, and deleting that is not a correction.

    Returns the neighbouring action, which becomes current if the deleted row
    was the open one.
    """

    from apps.inventory.services.restoration_bench import _timeline_event

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    doomed = RestorationAction.objects.select_for_update().get(pk=action_id, job=job)

    ordered = list(job.actions.order_by('started_at', 'id'))
    if len(ordered) <= 1:
        raise ValueError('An item cannot be left with no record of its work.')
    index = next(i for i, row in enumerate(ordered) if row.pk == doomed.pk)
    absorber = ordered[index - 1] if index > 0 else ordered[1]

    was_current = job.current_action_id == doomed.pk
    removed = {
        'action_id': doomed.pk,
        'grade': doomed.grade,
        'category': doomed.category,
        'description': doomed.description,
        'returned_to_action_id': absorber.pk,
    }
    doomed.delete()

    if was_current:
        absorber.ended_at = None
        absorber.save(update_fields=['ended_at', 'updated_at'])
        job.current_action = absorber
        job.save(update_fields=['current_action', 'updated_at'])

    _timeline_event(job, 'action.deleted', removed, actor=user, entity_id=f'action:{absorber.pk}')
    return job, absorber


def undo_last_action(job: RestorationJob, user=None) -> tuple[RestorationJob, RestorationAction]:
    """Take back the action just opened, giving its time to the one before it.

    Undo is deletion aimed at the row the clock is on — the common case, and
    the one worth a single button, because opening the wrong sitting is a
    mistake you notice a second later.
    """

    current = current_action(job)
    if current is None:
        raise ValueError('There is nothing to undo.')
    if not job.actions.exclude(pk=current.pk).exists():
        raise ValueError('The first action on an item cannot be undone.')
    return delete_action(job, current.pk, user=user)


def close_open_actions(job: RestorationJob) -> None:
    """Stamp every still-open action as ended. Used when an item is finished."""

    job.actions.filter(ended_at__isnull=True).update(
        ended_at=timezone.now(),
        updated_at=timezone.now(),
    )


def action_totals(job: RestorationJob) -> dict[str, Any]:
    """Where this item's time went, by leftover grade (always empty now) and category."""

    by_grade: dict[str, int] = {}
    by_category: dict[str, int] = {}
    total = 0
    for action in job.actions.all():
        seconds = int(action.seconds or 0)
        total += seconds
        key = action.grade or ''
        by_grade[key] = by_grade.get(key, 0) + seconds
        by_category[action.category] = by_category.get(action.category, 0) + seconds
    return {'total_seconds': total, 'by_grade': by_grade, 'by_category': by_category}
