"""Thrift+ email consent (standards T73, email-first: D20, Bill 2026-10-08).

Eco-Thrift sends no texts. At sign-up a member may give an email and tick two separate boxes, never pre-ticked:
**Thrift+ updates** and **store news**. Neither is needed to join. Each change is recorded in the shared consent
store (``apps.texting`` ``EmailConsent``, built with the hiring coder): which kind, in or out, when, how, by whom,
and the words shown. No consent row, no email of that kind. Receipts and messages about something the member did
need no tick.

Rulebook: X1 (``.ai/extended/thrift-plus-decisions.md``). The words below change only with a new version.
"""
from __future__ import annotations

from apps.thriftplus.models import Person
from apps.thriftplus.services.members import MemberError, log

KIND_THRIFTPLUS = 'thriftplus'
KIND_NEWS = 'news'
KINDS = (KIND_THRIFTPLUS, KIND_NEWS)

# Master's words (2026-10-08). A change needs a new version.
WORDING = {
    KIND_THRIFTPLUS: {
        'version': 'thriftplus-email-2026-10-08',
        'label': 'Thrift+ updates by email',
        'text': 'Email me my Thrift+ updates (savings, gift card balance, receipts, returns).',
    },
    KIND_NEWS: {
        'version': 'news-email-2026-10-08',
        'label': 'Store news by email',
        'text': 'Email me Eco-Thrift store news.',
    },
}
NOT_REQUIRED = 'Neither box is needed to join or to buy anything.'


def wordings() -> dict:
    """What the sign-up screens show, in order."""
    return {'kinds': [{'kind': k, **WORDING[k]} for k in KINDS], 'not_required': NOT_REQUIRED}


def _store():
    from apps.texting import service

    return service


def clean_email(raw: str | None) -> str:
    """The address lower-cased and trimmed, or '' when it is not a usable address."""
    return _store().normalize_email(raw or '')


def choices(person: Person) -> dict:
    """{'thriftplus': bool, 'news': bool}: what this person may be emailed now."""
    store = _store()
    if not store.normalize_email(person.email):
        return {k: False for k in KINDS}
    return {k: store.may_email(person.email, k) for k in KINDS}


def set_choice(person: Person, kind: str, opted_in: bool, *, how: str, user=None) -> None:
    """Record one choice. Opting in records the words shown; opting out is recorded the same way."""
    if kind not in KINDS:
        raise MemberError('Pick Thrift+ updates or store news.')
    store = _store()
    if not store.normalize_email(person.email):
        raise MemberError('Add an email address first.')
    words = WORDING[kind]
    store.record_email_consent(
        person.email, kind=kind, opted_in=bool(opted_in), how=how,
        wording_version=words['version'] if opted_in else '', wording=words['text'] if opted_in else '',
        ref=f'thriftplus.person:{person.pk}', by=user,
    )
    log('emails', account=person.account, person=person, actor=user, kind=kind, opted_in=bool(opted_in), how=how[:160])


def set_address(person: Person, raw: str, *, user=None) -> Person:
    """Add or change a member's email. A new address starts with no consents (choices follow the address)."""
    email = clean_email(raw)
    if raw and not email:
        raise MemberError("That email doesn't look right.")
    person.email = email
    person.save(update_fields=['email', 'updated_at'])
    log('email_set', account=person.account, person=person, actor=user, has_email=bool(email))
    return person


def record_signup(person: Person, ticked: dict, *, user=None) -> None:
    """At sign-up only the ticked boxes are recorded; an unticked box leaves no row (no consent, no email)."""
    picked = [k for k in KINDS if ticked.get(k)]
    if not picked:
        return
    name = (getattr(user, 'full_name', '') or '').strip() or 'staff'
    for kind in picked:
        set_choice(person, kind, True, how=f'Thrift+ sign-up (staff: {name})', user=user)
