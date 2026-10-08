"""Thrift+ text consent (standards T59; house standard `texting.md`).

Two separate choices, never pre-ticked, wherever a member's phone number is taken: **Thrift+ account texts**
and **store news**. Each change is recorded in ``apps.texting`` (the one consent store): which kind, in or out,
when, how, by whom, and the wording shown. No consent row, no text. Neither choice is needed to join or to buy.

The account-texts wording is quoted word for word in the Twilio registration (``texting.md`` § Campaign), so a
change here needs a new version and a word to master.
"""
from __future__ import annotations

from apps.thriftplus.models import Person
from apps.thriftplus.services.members import MemberError, log

KIND_THRIFTPLUS = 'thriftplus'
KIND_NEWS = 'news'
KINDS = (KIND_THRIFTPLUS, KIND_NEWS)

# Word for word as `texting.md` § Campaign quotes them (master, 2026-10-07). Change only together with master.
WORDING = {
    KIND_THRIFTPLUS: {
        'version': 'thriftplus-sms-2026-10-07',
        'label': 'Thrift+ account texts',
        'text': ('Text me my Thrift+ updates (savings, gift card balance, receipts, returns). Message frequency varies. '
                 'Message and data rates may apply. Reply STOP to opt out, HELP for help. '
                 'Terms: ecothrift.us/terms · Privacy: ecothrift.us/privacy.'),
    },
    KIND_NEWS: {
        'version': 'news-sms-2026-10-07',
        'label': 'Store news texts',
        'text': ('Text me Eco-Thrift store news (new arrivals and sales, up to about 4 a month). '
                 'Message and data rates may apply. Reply STOP to opt out, HELP for help.'),
    },
}
NOT_REQUIRED = 'Neither box is needed to join or to buy anything.'


def wordings() -> dict:
    """What the sign-up screens show, in order."""
    return {'kinds': [{'kind': k, **WORDING[k]} for k in KINDS], 'not_required': NOT_REQUIRED}


def _texting():
    from apps.texting import service

    return service


def can_text(person: Person) -> bool:
    """A 10-digit US number is needed for any text."""
    return bool(_texting().digits(person.phone))


def choices(person: Person) -> dict:
    """{'thriftplus': bool, 'news': bool}: what this person may be texted now (STOP ends both)."""
    service = _texting()
    if not service.digits(person.phone):
        return {k: False for k in KINDS}
    return {k: service.may_text(person.phone, k) for k in KINDS}


def set_choice(person: Person, kind: str, opted_in: bool, *, how: str, user=None) -> None:
    """Record one choice. Opting in records the wording shown; opting out is recorded the same way."""
    if kind not in KINDS:
        raise MemberError('Pick Thrift+ account texts or store news.')
    service = _texting()
    if not service.digits(person.phone):
        raise MemberError('Texts need a 10-digit mobile number. Add it first.')
    words = WORDING[kind]
    service.record_consent(
        person.phone, kind=kind, opted_in=bool(opted_in), how=how,
        wording_version=words['version'] if opted_in else '', wording=words['text'] if opted_in else '',
        ref=f'thriftplus.person:{person.pk}', by=user,
    )
    log('texts', account=person.account, person=person, actor=user, kind=kind, opted_in=bool(opted_in), how=how[:160])


def record_signup(person: Person, ticked: dict, *, user=None) -> None:
    """At sign-up only the ticked boxes are recorded; an unticked box leaves no row (no consent, no text)."""
    picked = [k for k in KINDS if ticked.get(k)]
    if not picked:
        return
    name = (getattr(user, 'full_name', '') or '').strip() or 'staff'
    for kind in picked:
        set_choice(person, kind, True, how=f'Thrift+ sign-up (staff: {name})', user=user)
