"""Thrift+ email (standards T73 and T74; email-first, D20).

No boxes (Bill, 2026-10-08: "do not force a check box if not needed"). A member may give an email at sign-up, and
then gets:
- **account email:** receipts and Thrift+ updates (savings, gift card balance, returns). It needs no consent;
- **store news:** marketing email. US law (CAN-SPAM) needs no opt-in, only an unsubscribe link in every news email
  and the store's postal address. Members turn it off with that link, in My account, or at the register.

The shared ``apps.texting`` ``EmailConsent`` records only the turning off (and any turning back on). No row means on.
Rulebook X1 (``.ai/extended/thrift-plus-decisions.md``).
"""
from __future__ import annotations

from apps.thriftplus.models import Person
from apps.thriftplus.services.members import MemberError, log

KIND_NEWS = 'news'
NOTE = "We'll email your receipts and Thrift+ updates. Store news emails have an unsubscribe link."


def _store():
    from apps.texting import service

    return service


def clean_email(raw: str | None) -> str:
    """The address lower-cased and trimmed, or '' when it is not a usable address."""
    return _store().normalize_email(raw or '')


def news_on(person: Person) -> bool:
    """Store news goes to a member with an email unless they turned it off (the newest record decides)."""
    if not clean_email(person.email):
        return False
    state = _store().email_consent_state(person.email, KIND_NEWS)
    return state is None or state.opted_in


def choices(person: Person) -> dict:
    """{'updates': bool, 'news': bool}: account email follows the address; store news can be turned off."""
    has = bool(clean_email(person.email))
    return {'updates': has, 'news': has and news_on(person)}


def set_news(person: Person, on: bool, *, how: str, user=None) -> None:
    """Turn store news off (or back on). Recorded the same way either way."""
    if not clean_email(person.email):
        raise MemberError('Add an email address first.')
    _store().record_email_consent(person.email, kind=KIND_NEWS, opted_in=bool(on), how=how,
                                  ref=f'thriftplus.person:{person.pk}', by=user)
    log('news_email', account=person.account, person=person, actor=user, on=bool(on), how=how[:160])


def set_address(person: Person, raw: str, *, user=None) -> Person:
    """Add or change a member's email (blank removes it). Store news follows the address."""
    email = clean_email(raw)
    if (raw or '').strip() and not email:
        raise MemberError("That email doesn't look right.")
    person.email = email
    person.save(update_fields=['email', 'updated_at'])
    log('email_set', account=person.account, person=person, actor=user, has_email=bool(email))
    return person
