"""
Thrift+ membership rules (owner design, 2026-09-25). Every change writes an ``Event``.

- **Signup:**
  - a cashier checks ID (the name matches; this sets the 18+ flag);
  - takes a photo;
  - scans a blank card, which attaches it.
  - No ID means an unverified person: they earn rewards, but get no returns and no 18+ items.
- **Up to 2 adults per account.** Adding the second needs both present and the primary's OK.
  The primary can remove the second; the second can remove only themselves.
- **Cards:** a person may carry more than one (a wallet card and a keychain tag). A lost card is
  killed, and a new blank is issued.
- **Revocation** (theft, tag switching, return abuse) kills the whole account and all its cards.
"""
from __future__ import annotations

import re

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.core.models import AppSetting
from apps.thriftplus.models import Account, Card, Event, Person
from apps.thriftplus.services.cards import parse

ENABLED_KEY = 'thrift_plus_enabled'


class MemberError(ValueError):
    """A membership rule said no (shown to the cashier as is)."""


def is_enabled() -> bool:
    value = AppSetting.objects.filter(key=ENABLED_KEY).values_list('value', flat=True).first()
    return value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def normalize_phone(raw: str | None) -> str:
    digits = re.sub(r'\D', '', raw or '')
    return digits[1:] if len(digits) == 11 and digits.startswith('1') else digits


def log(action: str, *, account=None, person=None, card=None, actor=None, **detail) -> Event:
    return Event.objects.create(action=action, account=account, person=person, card=card, actor=actor, detail=detail)


def find(query: str) -> QuerySet[Account]:
    """Accounts by card code, phone or name."""
    q = (query or '').strip()
    accounts = Account.objects.all()
    if not q:
        return accounts
    code = parse(q)
    if code:
        return accounts.filter(people__cards__code=code).distinct()
    phone = normalize_phone(q)
    if len(phone) >= 7 and phone.isdigit():
        return accounts.filter(people__phone__endswith=phone[-7:]).distinct()
    words = q.split()
    cond = Q()
    for w in words:
        cond &= Q(people__first_name__icontains=w) | Q(people__last_name__icontains=w)
    return accounts.filter(cond).distinct()


def card_by_code(raw: str) -> Card:
    code = parse(raw)
    if not code:
        raise MemberError('That is not a Thrift+ card number (the check digit does not match).')
    card = Card.objects.select_related('person__account').filter(code=code).first()
    if card is None:
        raise MemberError('That card is not in the system. Use a card from a printed batch.')
    return card


def _require_active(account: Account) -> None:
    if account.status != Account.STATUS_ACTIVE:
        raise MemberError('This account is revoked.')


@transaction.atomic
def issue_card(person: Person, raw_code: str, *, user=None) -> Card:
    _require_active(person.account)
    if not person.is_active:
        raise MemberError('This person is no longer on the account.')
    card = Card.objects.select_for_update().get(pk=card_by_code(raw_code).pk)
    if card.status != Card.STATUS_UNISSUED:
        raise MemberError(f'Card {card.code} is already {card.get_status_display().lower()}.')
    card.person = person
    card.status = Card.STATUS_ACTIVE
    card.issued_at = timezone.now()
    card.issued_by = user
    card.save(update_fields=['person', 'status', 'issued_at', 'issued_by'])
    log('card_issued', account=person.account, person=person, card=card, actor=user)
    return card


@transaction.atomic
def kill_card(card: Card, *, reason: str = 'lost', user=None) -> Card:
    if card.status == Card.STATUS_DEAD:
        return card
    card.status = Card.STATUS_DEAD
    card.dead_at = timezone.now()
    card.dead_reason = reason[:120]
    card.save(update_fields=['status', 'dead_at', 'dead_reason'])
    account = card.person.account if card.person_id else None
    log('card_killed', account=account, person=card.person, card=card, actor=user, reason=reason)
    return card


def _person(account: Account, role: str, *, first_name: str, last_name: str = '', phone: str = '',
            id_checked: bool = False, verified_18: bool = False, photo=None, user=None) -> Person:
    if not (first_name or '').strip():
        raise MemberError('A first name is required.')
    person = Person(
        account=account, role=role, first_name=first_name.strip()[:80], last_name=(last_name or '').strip()[:80],
        phone=normalize_phone(phone), id_checked=bool(id_checked), verified_18=bool(id_checked and verified_18),
    )
    if person.id_checked:
        person.verified_at = timezone.now()
        person.verified_by = user
    if photo:
        person.photo = photo
    person.save()
    return person


@transaction.atomic
def create_account(*, first_name: str, last_name: str = '', phone: str = '', id_checked: bool = False,
                   verified_18: bool = False, photo=None, card_code: str = '', user=None) -> Account:
    """Sign up: the primary person, and their first card if one was scanned."""
    phone_digits = normalize_phone(phone)
    if phone_digits and Person.objects.filter(phone=phone_digits, removed_at__isnull=True,
                                              account__status=Account.STATUS_ACTIVE).exists():
        raise MemberError('That phone number is already on a membership. Look it up instead.')
    account = Account.objects.create(created_by=user)
    person = _person(account, Person.ROLE_PRIMARY, first_name=first_name, last_name=last_name, phone=phone,
                     id_checked=id_checked, verified_18=verified_18, photo=photo, user=user)
    log('signup', account=account, person=person, actor=user, id_checked=person.id_checked, verified_18=person.verified_18)
    if card_code:
        issue_card(person, card_code, user=user)
    return account


@transaction.atomic
def verify(person: Person, *, verified_18: bool, user=None) -> Person:
    """A cashier checked this person's ID: the name matches, and the 18+ flag is set from it."""
    _require_active(person.account)
    person.id_checked = True
    person.verified_18 = bool(verified_18)
    person.verified_at = timezone.now()
    person.verified_by = user
    person.save(update_fields=['id_checked', 'verified_18', 'verified_at', 'verified_by', 'updated_at'])
    log('verified', account=person.account, person=person, actor=user, verified_18=person.verified_18)
    return person


@transaction.atomic
def add_second_adult(account: Account, *, both_present: bool, primary_approves: bool, first_name: str,
                     last_name: str = '', phone: str = '', id_checked: bool = False, verified_18: bool = False,
                     photo=None, card_code: str = '', user=None) -> Person:
    _require_active(account)
    if not (both_present and primary_approves):
        raise MemberError('Both adults must be here, and the primary must approve adding the second.')
    if account.people.filter(role=Person.ROLE_SECONDARY, removed_at__isnull=True).exists():
        raise MemberError('This account already has a second adult (2 adults per card at most).')
    person = _person(account, Person.ROLE_SECONDARY, first_name=first_name, last_name=last_name, phone=phone,
                     id_checked=id_checked, verified_18=verified_18, photo=photo, user=user)
    log('second_added', account=account, person=person, actor=user)
    if card_code:
        issue_card(person, card_code, user=user)
    return person


@transaction.atomic
def remove_second_adult(person: Person, *, removed_by: str, user=None) -> Person:
    """``removed_by`` is 'primary' or 'self': the only two people who may take a second adult off."""
    if person.role != Person.ROLE_SECONDARY:
        raise MemberError('The primary cannot be removed. Revoke the account instead.')
    if removed_by not in ('primary', 'self'):
        raise MemberError('Only the primary, or the second adult themselves, can remove the second adult.')
    person.removed_at = timezone.now()
    person.save(update_fields=['removed_at', 'updated_at'])
    for card in person.cards.exclude(status=Card.STATUS_DEAD):
        kill_card(card, reason='person removed', user=user)
    log('second_removed', account=person.account, person=person, actor=user, removed_by=removed_by)
    return person


@transaction.atomic
def set_photo(person: Person, photo, *, user=None) -> Person:
    person.photo = photo
    person.save(update_fields=['photo', 'updated_at'])
    log('photo', account=person.account, person=person, actor=user)
    return person


@transaction.atomic
def revoke(account: Account, *, reason: str, user=None) -> Account:
    """Theft, tag switching or return abuse: the whole card goes, for every person on it."""
    if not (reason or '').strip():
        raise MemberError('Give a reason to revoke a membership.')
    account.status = Account.STATUS_REVOKED
    account.revoked_at = timezone.now()
    account.revoked_reason = reason.strip()[:200]
    account.revoked_by = user
    account.save(update_fields=['status', 'revoked_at', 'revoked_reason', 'revoked_by', 'updated_at'])
    for card in Card.objects.filter(person__account=account).exclude(status=Card.STATUS_DEAD):
        kill_card(card, reason='account revoked', user=user)
    log('revoked', account=account, actor=user, reason=account.revoked_reason)
    return account
