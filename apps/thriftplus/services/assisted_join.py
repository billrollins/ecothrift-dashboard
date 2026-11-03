"""
Assisted join (owner 2026-11-03, rulebook J22): staff sign a customer up on the store phone, for someone with a flip
phone or no phone at all. The store phone takes no texts, so it is always the customer's code or the photo ID:

- **With a text:** staff type the first and last name and the customer's mobile number; our usual join code goes to
  their phone (``send``) and staff type it in (``check``). The number is then verified, by that staff member.
- **No phone:** staff check the photo ID (first and last name) and make the membership with no contact (``no_phone``).

Either way the answer is a pending membership with its member code, and staff go straight on to the Finalize screen
(``register.finish_join``): the photo, the customer's tap on "I agree", the ID check (Name matches, 18 or older),
Done. Nothing new is kept from the ID (J3). A no-phone member is found at the register by name and their photo (J20),
and can add a phone later (Edit name or phone, J19); the member code never changes.
"""
from __future__ import annotations

from django.db import transaction

from apps.thriftplus.models import Account, Person
from apps.thriftplus.services import member_auth, members, phone_codes
from apps.thriftplus.services.member_auth import AuthError

PHONE_BAD_TEXT = 'Type their 10-digit mobile number.'
PHONE_ON_FILE_TEXT = 'That number is already on a Thrift+ membership. Find them instead.'


def _number(phone: str) -> str:
    digits = phone_codes.us_number(phone)
    if not digits:
        raise AuthError('CONTACT_BAD', PHONE_BAD_TEXT)
    if member_auth.member_by_phone(digits) is not None or member_auth._phone_off(digits) is not None:
        raise AuthError('PHONE_TAKEN', PHONE_ON_FILE_TEXT)
    return digits


def send(first_name: str, last_name: str, phone: str, *, user=None) -> None:
    """Text the customer our join code. The same limits as a join on their own phone, except the per-address one
    (the store phone sends for every assisted join)."""
    member_auth._join_name(first_name, last_name)
    digits = _number(phone)
    if not phone_codes.available():
        raise AuthError('PHONE_OFF', 'Texts are off right now. Use No phone and check their ID.')
    member_auth.send_code(digits, first_name, last_name, base_url='', ip=None)
    members.log('assisted_join_code_sent', actor=user, to=phone_codes.masked(digits))


def check(phone: str, code: str, *, user=None) -> Person:
    """The code the customer read off their phone: a pending membership with the number verified by ``user``."""
    digits = phone_codes.us_number(phone)
    if not digits:
        raise AuthError('CONTACT_BAD', PHONE_BAD_TEXT)
    person, _purpose = member_auth.check_phone_code(digits, code, ip=None)
    with transaction.atomic():
        person.phone_verified_by = user
        person.save(update_fields=['phone_verified_by', 'updated_at'])
        account = person.account
        if account.status == Account.STATUS_PENDING:
            account.notes = 'Assisted join (their phone, a texted code).'
            account.created_by = account.created_by or user
            account.save(update_fields=['notes', 'created_by', 'updated_at'])
        members.log('assisted_join', account=account, person=person, actor=user, by='phone')
    return person


@transaction.atomic
def no_phone(first_name: str, last_name: str, *, user=None) -> Person:
    """No phone at all: a pending membership with the name off the photo ID and no contact. Unfinished, it is
    purged after 24 hours like any unconfirmed sign-up; staff finish it on the spot."""
    first, last = member_auth._join_name(first_name, last_name)
    account = Account.objects.create(status=Account.STATUS_PENDING, created_by=user, notes='Assisted join (no phone, ID).')
    person = Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=first, last_name=last)
    members.log('assisted_join', account=account, person=person, actor=user, by='id')
    members.new_member_code(person, user=user)
    return person
