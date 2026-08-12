"""What was done to an item, where the time went, and why.

Every second on a bench belongs to exactly one action. An action is a single
piece of work — inspecting, testing, repairing, assembling or salvaging —
pointed either at one grade or at the item as a whole.

Three rules hold the log together:

* **The clock is never homeless.** An item opens with an initial inspection, so
  from check-in onwards there is always somewhere for time to go.

* **A pause is not a new action.** Someone who stops for a phone call and comes
  back to the same grade is still doing the same thing; splitting that into two
  rows would say something untrue about the work.

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
        where = action.grade or 'the item'
        super().__init__(
            f'Say what you did on {where} before starting something else.',
        )


def _clean_description(raw: Any) -> str:
    return str(raw or '').strip()[:MAX_DESCRIPTION]


def _clean_category(raw: Any) -> str:
    value = str(raw or '').strip().lower()
    if not value:
        return RestorationAction.DEFAULT_CATEGORY
    if value not in VALID_CATEGORIES:
        raise ValueError(f'Unknown action category: {value}')
    return value


def _clean_grade(job: RestorationJob, raw: Any) -> str:
    """Empty means the item as a whole; anything else must be a real grade."""

    grade = str(raw or '').strip()[:64]
    if not grade:
        return ''
    known = job.grade_values if isinstance(job.grade_values, dict) else {}
    if known and grade not in known:
        raise ValueError(f'{grade} is not a grade on this item\'s scale.')
    return grade


def current_action(job: RestorationJob) -> RestorationAction | None:
    return job.current_action if job.current_action_id else None


def ensure_initial_action(job: RestorationJob, user=None) -> RestorationAction:
    """Open an item's first action, so the clock always has somewhere to go.

    Idempotent: an item that already has one keeps it, which matters because
    check-in can run more than once over an item's life.
    """

    existing = current_action(job)
    if existing is not None:
        return existing

    first = job.actions.order_by('started_at', 'id').first()
    if first is not None:
        job.current_action = first
        job.save(update_fields=['current_action', 'updated_at'])
        return first

    action = RestorationAction.objects.create(
        job=job,
        grade='',
        category=RestorationAction.CATEGORY_INSPECT,
        description=RestorationAction.INITIAL_DESCRIPTION,
        created_by=user if getattr(user, 'pk', None) else None,
    )
    job.current_action = action
    job.save(update_fields=['current_action', 'updated_at'])
    return action


@transaction.atomic
def start_action(
    job: RestorationJob,
    user=None,
    *,
    grade: str = '',
    category: str | None = None,
    description: str = '',
    force_new: bool = False,
) -> tuple[RestorationJob, RestorationAction]:
    """Point the clock at a piece of work, opening a new action if needed.

    Returning to the grade you were already on resumes that action rather than
    opening another — you have not started anything new. Turning to a different
    grade, or to the item as a whole, closes the old action and opens one.

    `force_new` is how someone says they have genuinely moved on to a second
    piece of work on the same grade: finished testing it, now repairing it. The
    description gate still applies, so the first piece has to be written up
    before the second can start.

    A new action defaults to Inspect with no description so the clock starts on
    the first click. The cost of that convenience is paid at the other end: the
    action must be described before the next one can begin.
    """

    from apps.inventory.services.restoration_bench import (
        _pause_timer,
        _timeline_event,
        _timer_save_fields,
    )

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Work can only be recorded on bench or pending items.')

    grade = _clean_grade(job, grade)
    existing = current_action(job)

    # Same scope, still open: this is a resume, not a new piece of work.
    if not force_new and existing is not None and existing.ended_at is None and existing.grade == grade:
        if category is not None:
            existing.category = _clean_category(category)
        if description:
            existing.description = _clean_description(description)
        existing.save(update_fields=['category', 'description', 'updated_at'])
        _aim_timer_at(job, existing, user=user)
        return job, existing

    # Moving on. The work being left behind has to say what it was.
    if existing is not None and not existing.is_described:
        raise ActionNeedsDescriptionError(existing)

    # Bank the outgoing action's time before the clock changes meaning.
    _pause_timer(job)
    if existing is not None and existing.ended_at is None:
        existing.ended_at = timezone.now()
        existing.save(update_fields=['ended_at', 'updated_at'])

    action = RestorationAction.objects.create(
        job=job,
        grade=grade,
        category=_clean_category(category),
        description=_clean_description(description),
        created_by=user if getattr(user, 'pk', None) else None,
    )
    _aim_timer_at(job, action, user=user)

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


def _aim_timer_at(job: RestorationJob, action: RestorationAction, *, user=None) -> None:
    """Attach the clock to an action and set the attribution it implies.

    Work on a grade is charged to that grade; work on the item as a whole is
    charged to the item, because one teardown informs every grade at once and
    splitting it between them would be a fiction.
    """

    from apps.inventory.services.restoration_bench import _start_timer, _timer_save_fields

    mode = (
        RestorationJob.TIMER_MODE_WORK
        if action.grade
        else RestorationJob.TIMER_MODE_LOOK
    )
    job.current_action = action
    _start_timer(job, user=user, mode=mode, grade=action.grade)
    job.save(update_fields=_timer_save_fields())


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
    return action


def close_open_actions(job: RestorationJob) -> None:
    """Stamp every still-open action as ended. Used when an item is finished."""

    job.actions.filter(ended_at__isnull=True).update(
        ended_at=timezone.now(),
        updated_at=timezone.now(),
    )


def action_totals(job: RestorationJob) -> dict[str, Any]:
    """Where this item's time went, by scope and by category."""

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
