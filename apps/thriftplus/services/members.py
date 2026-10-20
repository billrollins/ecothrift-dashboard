"""
Thrift+ membership rules (owner design, 2026-09-25). Every change writes an ``Event``.

- **Signup:**
  - a cashier checks ID (the name matches; this sets the 18+ flag);
  - takes a photo;
  - the member's code is made for them (owner 2026-10-14: there is no Thrift+ card). They show it as the member QR
    in the Thrift+ app, or give their phone number (``people_by_phone``).
  - No ID means an unverified person: they collect ThriftBucks, but get no returns and no 18+ items.
- **Joined online** (owner 2026-10-15, J8): a *pending* membership with a name, an email and a member code; it
  collects and uses nothing until a register finishes joining (the phone read back, the ID, the photo; J2).
- **Up to 2 adults per account.** Adding the second needs both present and the primary's OK.
  The primary can remove the second; the second can remove only themselves.
- **Codes** (the ``Card`` model): a person may have more than one (a code from a printed blank, and one made in the
  app). A lost one is stopped.
- **Revocation** (theft, tag switching, return abuse) stops the whole account and all its codes.
"""
from __future__ import annotations

import re

from django.db import transaction
from django.db.models import F, Q, QuerySet
from django.utils import timezone

from apps.core.models import AppSetting
from apps.thriftplus.models import Account, Card, Event, Person
from apps.thriftplus.services.cards import new_code, parse

ENABLED_KEY = 'thrift_plus_enabled'
# Staff try the scanner before launch: /scan?preview=<code> keeps the code on the phone and sends it as a header.
PREVIEW_KEY = 'thrift_plus_preview_code'
PREVIEW_HEADER = 'HTTP_X_THRIFTPLUS_PREVIEW'
# The scanner's look (owner 2026-10-10): on, the price is the big number and ThriftBucks sit smaller below it.
PRICE_FIRST_KEY = 'thrift_plus_price_first'


class MemberError(ValueError):
    """A membership rule said no (shown to the cashier as is)."""


def is_enabled() -> bool:
    value = AppSetting.objects.filter(key=ENABLED_KEY).values_list('value', flat=True).first()
    return value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def price_first() -> bool:
    """The scanner shows the price as the big number (the default), or ThriftBucks."""
    value = AppSetting.objects.filter(key=PRICE_FIRST_KEY).values_list('value', flat=True).first()
    return value is None or value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def _has_preview_code(request) -> bool:
    import hmac

    sent = (request.META.get(PREVIEW_HEADER) or '').strip()
    if not sent:
        return False
    code = str(AppSetting.objects.filter(key=PREVIEW_KEY).values_list('value', flat=True).first() or '').strip()
    return bool(code) and hmac.compare_digest(sent, code)


def is_tester(account) -> bool:
    """A staff member's own membership, or a practice member: they may use Thrift+ before it is live (2026-10-10)."""
    return bool(account is not None and (account.staff_user_id or account.is_practice))


def open_to(request) -> bool:
    """The scanner and portal answer this request: Thrift+ is on, the phone carries the staff preview code, or the
    phone is signed in as a staff or practice member (staff test mode, owner 2026-10-10)."""
    from apps.thriftplus.services import member_auth

    if is_enabled() or _has_preview_code(request):
        return True
    session = member_auth.session_for(request.COOKIES.get(member_auth.COOKIE))
    return session is not None and is_tester(session.person.account)


def normalize_phone(raw: str | None) -> str:
    digits = re.sub(r'\D', '', raw or '')
    return digits[1:] if len(digits) == 11 and digits.startswith('1') else digits


def confirmed(person: Person | None) -> bool:
    """Join v2 (owner 2026-10-19): a join is confirmed once its email (link, code or Google) or its phone (a texted
    code, or read back at a register) is verified. Confirmed pending joins are Needs Finalize and never purged."""
    return person is not None and (person.email_verified_at is not None or person.phone_verified_at is not None)


def confirmed_q(prefix: str = '') -> Q:
    """``confirmed`` as a filter; ``prefix`` is the path to the person (``'people__'`` from an Account)."""
    return Q(**{f'{prefix}email_verified_at__isnull': False}) | Q(**{f'{prefix}phone_verified_at__isnull': False})


def log(action: str, *, account=None, person=None, card=None, actor=None, **detail) -> Event:
    return Event.objects.create(action=action, account=account, person=person, card=card, actor=actor, detail=detail)


def find(query: str) -> QuerySet[Account]:
    """Accounts by member code, phone, email or name."""
    q = (query or '').strip()
    accounts = Account.objects.all()
    if not q:
        return accounts
    code = parse(q)
    if code:
        return accounts.filter(people__cards__code=code).distinct()
    if '@' in q:  # owner 2026-10-15: a pending join has an email and no phone yet
        return accounts.filter(people__email__icontains=q.lower()).distinct()
    phone = normalize_phone(q)
    if len(phone) >= 7 and phone.isdigit():
        return accounts.filter(people__phone__endswith=phone[-7:]).distinct()
    words = q.split()
    cond = Q()
    for w in words:
        cond &= Q(people__first_name__icontains=w) | Q(people__last_name__icontains=w)
    return accounts.filter(cond).distinct()


def people_by_phone(raw: str | None) -> list[Person]:
    """Find a member by phone at the register (owner 2026-10-14: they show the QR in the Thrift+ app or give their
    phone number). Any format, matched on the digits: the whole number, or the last 7 when the area code is left off.
    Answers every active person on each membership the phone is on, primary first, so the cashier picks the person by
    their photo (2 adults may share one membership, and one phone)."""
    digits = normalize_phone(raw)
    if len(digits) < 7:
        raise MemberError('Type the whole phone number.')
    match = Q(phone=digits) if len(digits) >= 10 else Q(phone__endswith=digits)
    accounts = Person.objects.filter(match, removed_at__isnull=True).values_list('account_id', flat=True)
    return list(
        Person.objects.filter(account_id__in=accounts, removed_at__isnull=True).select_related('account')
        .order_by('account_id', 'role', 'pk')[:10]
    )


def new_member_code(person: Person, *, user=None) -> Card:
    """The member's code when none was scanned (owner 2026-10-14: there is no Thrift+ card): no batch, never printed,
    active and linked to the person, the way the app makes one. The QR in the Thrift+ app is ``TP`` + this code, which
    the register's scan reads."""
    code = new_code()
    while Card.objects.filter(code=code).exists():
        code = new_code()
    card = Card.objects.create(code=code, person=person, status=Card.STATUS_ACTIVE, issued_at=timezone.now(), issued_by=user)
    log('app_card', account=person.account, person=person, card=card, actor=user)
    return card


def member_code(person: Person, *, user=None) -> Card:
    """The person's active code (the newest), or a new one when they have none."""
    card = (Card.objects.filter(person=person, status=Card.STATUS_ACTIVE)
            .order_by(F('issued_at').desc(nulls_last=True), '-pk').first())
    return card or new_member_code(person, user=user)


def card_by_code(raw: str) -> Card:
    code = parse(raw)
    if not code:
        raise MemberError('That is not a Thrift+ member code (the check digit does not match).')
    card = Card.objects.select_related('person__account').filter(code=code).first()
    if card is None:
        raise MemberError('That member code is not in the system. Find them by phone.')
    return card


def _require_active(account: Account) -> None:
    if account.status == Account.STATUS_PENDING:
        raise MemberError('Joined online: finish joining at a register first.')
    if account.status == Account.STATUS_INACTIVE:
        raise MemberError('This membership is deactivated. Reactivate it in Dash first.')
    if account.status != Account.STATUS_ACTIVE:
        raise MemberError('This account is revoked.')


@transaction.atomic
def issue_card(person: Person, raw_code: str, *, user=None) -> Card:
    _require_active(person.account)
    if not person.is_active:
        raise MemberError('This person is no longer on the account.')
    card = Card.objects.select_for_update().get(pk=card_by_code(raw_code).pk)
    if card.status != Card.STATUS_UNISSUED:
        raise MemberError(f'Member code {card.code} is already {card.get_status_display().lower()}.')
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


def _person(account: Account, role: str, *, first_name: str, last_name: str = '', phone: str = '', email: str = '',
            id_checked: bool = False, verified_18: bool = False, photo=None, user=None,
            phone_verified: bool = True) -> Person:
    from apps.accounts.services.names import clean_name

    # Owner 2026-10-16: the screens ask for both names (Join, Add a person, Edit); here the one name rule applies to
    # every way in, so a single name is split or gets "Member", and "Customer" is never a last name.
    if not (first_name or '').strip():
        raise MemberError('A first name is required.')
    first_name, last_name = clean_name(first_name, last_name)
    clean = ''
    if (email or '').strip():
        from apps.thriftplus.services.emails import clean_email

        clean = clean_email(email)
        if not clean:
            raise MemberError("That email doesn't look right.")
    person = Person(
        account=account, role=role, first_name=first_name, last_name=last_name,
        phone=normalize_phone(phone), email=clean, id_checked=bool(id_checked),
        verified_18=bool(id_checked and verified_18),
    )
    if person.id_checked:
        person.verified_at = timezone.now()
        person.verified_by = user
    if person.phone and phone_verified and user is not None:
        # Owner 2026-10-15 (J8, J12): staff took the number in person, so it is verified, with who and when.
        person.phone_verified_at = timezone.now()
        person.phone_verified_by = user
    if photo:
        person.photo = photo
    person.save()
    return person


@transaction.atomic
def create_account(*, first_name: str, last_name: str = '', phone: str = '', email: str = '',
                   id_checked: bool = False, verified_18: bool = False, photo=None, card_code: str = '',
                   user=None, phone_verified: bool = True) -> Account:
    """Sign up: the primary person (with an optional email), and their member code: a printed blank's code if one was
    given, otherwise one made for them (owner 2026-10-14: there is no Thrift+ card)."""
    phone_digits = normalize_phone(phone)
    if phone_digits and Person.objects.filter(phone=phone_digits, removed_at__isnull=True,
                                              account__status=Account.STATUS_ACTIVE).exists():
        raise MemberError('That phone number is already on a membership. Find them by phone instead.')
    account = Account.objects.create(created_by=user)
    person = _person(account, Person.ROLE_PRIMARY, first_name=first_name, last_name=last_name, phone=phone, email=email,
                     id_checked=id_checked, verified_18=verified_18, photo=photo, user=user, phone_verified=phone_verified)
    log('signup', account=account, person=person, actor=user, id_checked=person.id_checked, verified_18=person.verified_18)
    if card_code:
        issue_card(person, card_code, user=user)
    else:
        new_member_code(person, user=user)
    return account


# Practice members' phones use the 555 area code, which no real phone has.
PRACTICE_AREA = '555'


@transaction.atomic
def make_practice_member(*, first_name: str = '', last_name: str = '', card_code: str = '', photo=None,
                         user=None) -> Account:
    """A practice member for training and testing (owner, 2026-10-10): a 555 phone (never a real one, so a trainee can
    still sign up for real later), no email, an 18+ check, and a member code (a printed blank's, or one made for it,
    owner 2026-10-14). Left out of every report and count; it works only on the training register and in the scanner's
    test mode."""
    n = Account.objects.filter(is_practice=True).count() + 1
    while Person.objects.filter(phone=f'{PRACTICE_AREA}{n:07d}').exists():
        n += 1
    account = create_account(first_name=(first_name or '').strip() or 'Practice',
                             last_name=(last_name or '').strip() or f'Member {n}', phone=f'{PRACTICE_AREA}{n:07d}',
                             id_checked=True, verified_18=True, photo=photo, card_code=card_code, user=user,
                             phone_verified=False)
    account.is_practice = True
    account.save(update_fields=['is_practice', 'updated_at'])
    log('practice_member', account=account, actor=user)
    return account


def is_testing(account) -> bool:
    """This member's taps are practice, not shopping: a practice member, or staff testing while Thrift+ is off."""
    return bool(account is not None and (account.is_practice or (account.staff_user_id and not is_enabled())))


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
                     photo=None, card_code: str = '', email: str = '', user=None) -> Person:
    _require_active(account)
    if not (both_present and primary_approves):
        raise MemberError('Both adults must be here, and the primary must approve adding the second.')
    if account.people.filter(role=Person.ROLE_SECONDARY, removed_at__isnull=True).exists():
        raise MemberError('This account already has a second adult (2 adults per membership at most).')
    person = _person(account, Person.ROLE_SECONDARY, first_name=first_name, last_name=last_name, phone=phone,
                     email=email, id_checked=id_checked, verified_18=verified_18, photo=photo, user=user)
    log('second_added', account=account, person=person, actor=user)
    if card_code:
        issue_card(person, card_code, user=user)
    else:
        new_member_code(person, user=user)
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
@transaction.atomic
def set_details(person: Person, *, first_name: str, last_name: str, phone: str, user=None) -> Person:
    """A quick fix on the Thrift+ Staff app (owner 2026-10-20): the name and the mobile number, typed by staff with the
    customer in front of them. A new number counts as checked in person (J8) and must not be on another membership."""
    from apps.accounts.services.names import clean_name

    if not (first_name or '').strip() or not (last_name or '').strip():
        raise MemberError('Type their first and last name.')
    first, last = clean_name(first_name, last_name)
    digits = normalize_phone(phone)
    if digits and len(digits) != 10:
        raise MemberError('Type the 10-digit mobile number.')
    person = Person.objects.select_for_update().select_related('account').get(pk=person.pk)
    if digits and digits != person.phone:
        taken = Person.objects.filter(
            phone=digits, removed_at__isnull=True, account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING),
        ).exclude(pk=person.pk).exists()
        if taken:
            raise MemberError('That phone number is on another membership. Check the ID and ask a manager.')
    before = {'first_name': person.first_name, 'last_name': person.last_name, 'phone': person.phone[-4:] if person.phone else ''}
    person.first_name, person.last_name = first, last
    fields = ['first_name', 'last_name', 'updated_at']
    if digits != person.phone:
        person.phone = digits
        person.phone_verified_at = timezone.now() if digits else None
        person.phone_verified_by = user if digits else None
        fields += ['phone', 'phone_verified_at', 'phone_verified_by']
    person.save(update_fields=fields)
    log('details', account=person.account, person=person, actor=user, before=before,
        after={'first_name': first, 'last_name': last, 'phone': digits[-4:] if digits else ''})
    return person


def set_photo(person: Person, photo, *, user=None) -> Person:
    person.photo = photo
    person.save(update_fields=['photo', 'updated_at'])
    log('photo', account=person.account, person=person, actor=user)
    return person


@transaction.atomic
def revoke(account: Account, *, reason: str, user=None) -> Account:
    """Theft, tag switching or return abuse: the whole membership goes, for every person on it."""
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


@transaction.atomic
def deactivate(account: Account, *, reason: str = '', user=None) -> Account:
    """The normal way to take a member off (owner 2026-10-16). Nothing is erased and the member code is kept; the
    membership can't be used, signed in to or joined again from a phone until staff reactivate it."""
    from apps.thriftplus.models import MemberSession

    if account.status == Account.STATUS_INACTIVE:
        return account
    if account.status == Account.STATUS_REVOKED:
        raise MemberError('This membership is revoked.')
    was = account.status
    account.status = Account.STATUS_INACTIVE
    account.save(update_fields=['status', 'updated_at'])
    MemberSession.objects.filter(person__account=account, revoked_at__isnull=True).update(revoked_at=timezone.now())
    log('deactivated', account=account, actor=user, was=was, reason=(reason or '').strip()[:200])
    return account


@transaction.atomic
def reactivate(account: Account, *, user=None) -> Account:
    """Undo Deactivate: back to what it was (active, or "finish at a register" when it never finished joining)."""
    if account.status != Account.STATUS_INACTIVE:
        raise MemberError('Only a deactivated membership can be reactivated.')
    last = Event.objects.filter(account=account, action='deactivated').order_by('-created_at', '-pk').first()
    was = (last.detail or {}).get('was') if last else ''
    account.status = was if was in (Account.STATUS_ACTIVE, Account.STATUS_PENDING) else Account.STATUS_ACTIVE
    account.save(update_fields=['status', 'updated_at'])
    log('reactivated', account=account, actor=user, status=account.status)
    return account
