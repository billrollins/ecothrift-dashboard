"""Review before send (owner's ask, 2026-10-07): a button that emails an applicant shows the email first, filled in,
to edit, send or cancel.

- **Preview** (``preview: true`` on the request): the action runs inside a savepoint with all hiring mail held back,
  then everything is rolled back. The applicant email it would have sent comes back as a draft: the template (with
  ``{placeholders}``), the value Dash filled in for each, and what each value is. Nothing is saved or sent.
- **Send**: the request carries ``email``: ``{"subject": ..., "body": ...}``, the edited template (values still
  linked stay ``{placeholders}``; values typed over are plain words), or ``{"skip": true}`` (do it without
  emailing). The reviewed email uses it and fills the linked values when it goes out. Staff notices go out as usual.

Only emails a person sends with a button are reviewed (``REVIEWED``). The auto-reply, reminders, an applicant's own
booking confirmation, alerts and the welcome after signing go out on their own, from their templates.
"""
from __future__ import annotations

import re
from contextvars import ContextVar
from dataclasses import dataclass

from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

REVIEWED = (
    'interview_invite', 'interview_booked', 'interview_changed', 'interview_cancelled', 'offer_sent', 'first_day',
)

EMAIL_LABELS = {
    'interview_invite': 'Interview link',
    'interview_booked': 'Interview booked',
    'interview_changed': 'Interview moved',
    'interview_cancelled': 'Interview cancelled',
    'offer_sent': 'Offer email',
    'first_day': 'First-day email',
    'not_now': 'Not now email',
}

# What each filled-in value is, for the chip's label.
FIELD_LABELS = {
    'first_name': 'First name', 'last_name': 'Last name', 'full_name': 'Full name', 'roles': 'Roles applied for',
    'phone': 'Phone', 'email': 'Email', 'review_day': 'When we read applications', 'reply_days': 'Days to reply',
    'when': 'Interview time', 'place': 'Place', 'interviewer': 'Interviewer', 'link': 'Their private link',
    'link_days': 'Days the link works', 'length': 'Interview length (minutes)', 'applicant': 'Applicant',
    'action': 'What happened', 'flags': 'Must-haves', 'dash_link': 'Link in Dash', 'role': 'Role',
    'pay_rate': 'Pay per hour', 'employment_type': 'Full or part time', 'start_date': 'Start date',
    'start_time': 'Start time', 'schedule': 'Schedule', 'supervisor': 'Reports to', 'respond_by': 'Reply by',
    'note': 'Note on the offer', 'offer_date': 'Offer date', 'signer_name': 'Signs for Eco-Thrift',
    'signer_title': 'Signer title', 'reason': 'Reason',
}

_PLACEHOLDER = re.compile(r'\{([a-z_]+)\}')


@dataclass
class Review:
    user: object = None
    capture: list | None = None
    subject: str | None = None
    body: str | None = None
    skip: bool = False


_review: ContextVar[Review | None] = ContextVar('hiring_review', default=None)


def current() -> Review | None:
    return _review.get()


def capturing() -> bool:
    """True inside a preview: no mail leaves."""
    review = _review.get()
    return review is not None and review.capture is not None


def placeholders(text: str) -> list[str]:
    return _PLACEHOLDER.findall(text or '')


def _truthy(value) -> bool:
    return value in (True, 'true', '1', 1)


def _norm(text: str) -> str:
    return '\n'.join(line.rstrip() for line in (text or '').replace('\r\n', '\n').split('\n')).strip()


def edited(template: dict, used: dict) -> bool:
    return _norm(template['subject']) != _norm(used['subject']) or _norm(template['body']) != _norm(used['body'])


def typed_over(template: dict, used: dict) -> list[str]:
    """Values the template fills that the sent words no longer link to (typed over, or deleted)."""
    before = placeholders(template['subject'] + '\n' + template['body'])
    after = set(placeholders(used['subject'] + '\n' + used['body']))
    return sorted({name for name in before if name not in after})


def parse(raw, *, user=None) -> Review:
    """The ``email`` part of a request: the edited words, ``skip``, or nothing (the template as is)."""
    review = Review(user=user)
    if not isinstance(raw, dict):
        return review
    if _truthy(raw.get('skip')):
        review.skip = True
        return review
    if isinstance(raw.get('body'), str):
        subject = str(raw.get('subject') or '').replace('\n', ' ').strip()[:300]
        body = raw['body'].replace('\r\n', '\n')[:8000]
        if not subject:
            raise ValidationError({'email': 'The email needs a subject.'})
        if not body.strip():
            raise ValidationError({'email': 'The email needs a message.'})
        review.subject, review.body = subject, body
    return review


def _sender() -> str:
    from email.utils import formataddr, parseaddr

    from apps.hiring.careers import load_setting

    name, address = parseaddr(load_setting()['email'].get('from') or '')
    return formataddr((name or 'Eco-Thrift', address)) if address else 'Eco-Thrift <retail@ecothrift.us>'


def source_label(key: str, template: dict) -> str:
    """Which version the words come from: a role's own, or the one for all roles."""
    from apps.hiring.models import Job

    for job in Job.objects.only('title', 'emails'):
        for name, block in (job.emails or {}).items():
            if (name == key or name.startswith(key + '.')) and isinstance(block, dict) and \
                    block.get('subject') == template.get('subject') and block.get('body') == template.get('body'):
                return f"{job.title}'s own version"
    return 'The version for all roles'


def draft(key: str, *, to, template: dict, values: dict, attachments=None, practice: bool = False) -> dict:
    """What the review screen shows: the template, the values Dash filled in, and what each one is."""
    names = placeholders(template.get('subject', '') + '\n' + template.get('body', ''))
    recipients = [a.strip() for a in to.replace(';', ',').split(',') if a.strip()] if isinstance(to, str) else \
        [a for a in to if a]
    return {
        'key': key,
        'label': EMAIL_LABELS.get(key, key),
        'to': recipients,
        'from': _sender(),
        'subject': template.get('subject', ''),
        'body': template.get('body', ''),
        'values': {name: '' if values.get(name) is None else str(values.get(name)) for name in names if name in values},
        'fields': {name: FIELD_LABELS.get(name, name.replace('_', ' ').capitalize()) for name in names if name in values},
        'attachments': [name for name, _, _ in attachments or []],
        'practice': bool(practice),
        'source': source_label(key, template),
    }


def run(request, action, *, skip_allowed: bool = True):
    """Run a staff action with review before send. ``action()`` returns the Response.

    ``preview: true`` → ``{"email": <draft> | null}`` (null: this action emails nobody, e.g. no address on file);
    nothing is saved and nothing is sent. Otherwise the action runs with the request's ``email`` choice.
    """
    data = request.data if isinstance(request.data, dict) else {}
    if _truthy(data.get('preview')):
        drafts: list = []
        token = _review.set(Review(user=request.user, capture=drafts))
        try:
            with transaction.atomic():
                action()
                transaction.set_rollback(True)
        finally:
            _review.reset(token)
        found = drafts[0] if drafts else None
        if found is not None:
            found['skip_allowed'] = skip_allowed
        return Response({'email': found})
    review = parse(data.get('email'), user=request.user)
    if review.skip and not skip_allowed:
        raise ValidationError({'email': 'This one is only done by email.'})
    token = _review.set(review)
    try:
        return action()
    finally:
        _review.reset(token)
