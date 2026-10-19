"""
Thrift+ member sign-in for the scanner app and portal (thrift_plus_rewards Phase 4). Members are not
Django users, and their session can't reach anything staff-side (the auth map of 2026-09-25):
- **The session:** a random token in an httpOnly cookie (``tp_session``, path
  ``/api/thriftplus/public/``). Only a keyed hash of it is stored (``MemberSession``).
- **Checked on every request:** the session isn't revoked or expired, the person is still on the
  account, and the account is active. Revoking a membership cuts access at once.
- **Ways in:**
  - **an emailed link or 6-digit code** (owner 2026-10-15, J8 and J11: customers have no password and get no
    texts). Join online with a name and email (a *pending* membership, "not ready" until a register finishes it,
    J2), or "Email me a link". Each email's link and code work once, for 15 minutes; 5 wrong codes kill it. The
    answer never says whether an email is a member's. Sends and code tries are limited per email and per address,
    and every send, use and failure is logged with the email masked. A staff member's Dash email signs in to their
    own staff membership (made then if they have none; owner 2026-10-15), never a pending join;
  - a password: **staff only** (their Dash login; owner 2026-10-16, "the only passwords are for staff"). The old
    member logins and their reset links are retired (``one_account``);
  - or the Thrift+ card plus the last 4 digits of the member's phone (gone 10-14; old sessions only).
  - **Join v2** (owner 2026-10-19): "Continue with Google" (``google_sign_in``), and one "Phone or email" box: a
    6-digit code by email (the ways above) or by text (Twilio Verify, ``phone_codes``), with the same never-says-
    whether-a-member answers, limits on top of Verify's, and every send and check logged with the number masked.
- **One account** (owner 2026-10-16): an emailed sign-in here signs in to ecothrift.us too, and back
  (``services/one_account.py``).
"""
from __future__ import annotations

import hmac
import ipaddress
import logging
import math
import secrets
import time
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Case, F, IntegerField, Value, When
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission

from apps.thriftplus.models import Account, Card, MemberEmailToken, MemberLogin, MemberSession, Person
from apps.thriftplus.services import cards
from apps.thriftplus.services.members import normalize_phone

logger = logging.getLogger(__name__)

COOKIE = 'tp_session'
COOKIE_PATH = '/api/thriftplus/public/'
# Owner 2026-10-14 (APP D5): stay signed in on the phone so My card opens at the register without a password: a year,
# renewed on each visit (``renew``), whichever way they signed in.
PASSWORD_DAYS = 365
CARD_DAYS = 365
EMAIL_DAYS = 365  # owner 2026-10-15 (J11): a phone stays signed in for a year, renewed on use
RENEW_AFTER = timedelta(days=1)
CARD_TRIES = 5
CARD_LOCK_SECONDS = 15 * 60
SEEN_EVERY = timedelta(minutes=5)


class AuthError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _hash(token: str, purpose: str) -> str:
    return salted_hmac(f'thriftplus.{purpose}', token, algorithm='sha256').hexdigest()


def _usable(person: Person) -> bool:
    return person.removed_at is None and person.account.status == Account.STATUS_ACTIVE


def _can_sign_in(person: Person) -> bool:
    """Active, or joined online and not finished yet (owner 2026-10-15, J8): a pending member signs in and sees their
    member QR "not ready"; the register refuses to put them on a sale until it finishes joining (J2)."""
    return person.removed_at is None and person.account.status in (Account.STATUS_ACTIVE, Account.STATUS_PENDING)


def _days(kind: str) -> int:
    return {MemberSession.KIND_PASSWORD: PASSWORD_DAYS, MemberSession.KIND_EMAIL: EMAIL_DAYS,
            MemberSession.KIND_PHONE: EMAIL_DAYS}.get(kind, CARD_DAYS)


# ── Sessions ───────────────────────────────────────────────────────────────────

def start_session(person: Person, kind: str, *, user_agent: str = '') -> tuple[str, MemberSession]:
    token = secrets.token_urlsafe(32)
    session = MemberSession.objects.create(
        token_hash=_hash(token, 'session'), person=person, kind=kind,
        expires_at=timezone.now() + timedelta(days=_days(kind)), user_agent=(user_agent or '')[:200],
    )
    return token, session


def set_cookie(response, token: str, session: MemberSession):
    response.set_cookie(
        COOKIE, token, max_age=int((session.expires_at - timezone.now()).total_seconds()), path=COOKIE_PATH,
        httponly=True, secure=not settings.DEBUG, samesite='Lax',
    )
    return response


def clear_cookie(response):
    response.delete_cookie(COOKIE, path=COOKIE_PATH, samesite='Lax')
    return response


def session_for(token: str | None) -> MemberSession | None:
    if not token:
        return None
    session = (
        MemberSession.objects.select_related('person__account')
        .filter(token_hash=_hash(token, 'session'), revoked_at__isnull=True, expires_at__gt=timezone.now()).first()
    )
    if session is None or not _can_sign_in(session.person):
        return None
    now = timezone.now()
    if session.last_seen_at is None or now - session.last_seen_at > SEEN_EVERY:
        MemberSession.objects.filter(pk=session.pk).update(last_seen_at=now)
    return session


def renew(session: MemberSession) -> bool:
    """Push the session out to a full year again (at most once a day). True when it moved."""
    target = timezone.now() + timedelta(days=_days(session.kind))
    if target - session.expires_at < RENEW_AFTER:
        return False
    MemberSession.objects.filter(pk=session.pk).update(expires_at=target)
    session.expires_at = target
    return True


def revoke_all(person: Person) -> int:
    return MemberSession.objects.filter(person=person, revoked_at__isnull=True).update(revoked_at=timezone.now())


@dataclass
class Member:
    """``request.user`` on the public Thrift+ API: a member, never a Django user."""

    session: MemberSession
    is_authenticated: bool = True
    is_staff: bool = False
    is_superuser: bool = False

    @property
    def person(self) -> Person:
        return self.session.person

    @property
    def account(self) -> Account:
        return self.session.person.account

    @property
    def pk(self) -> str:
        return f'member-{self.session.person_id}'  # for throttle keys; never a User id


class MemberSessionAuthentication(BaseAuthentication):
    """Used only on the public Thrift+ views. No cookie or a dead one is simply anonymous."""

    def authenticate(self, request):
        session = session_for(request.COOKIES.get(COOKIE))
        return (Member(session=session), None) if session else None


class IsMember(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Member)


# Sign-ins that may change a membership: a password, an emailed link or code, Google, or a texted code (owner
# 2026-10-15, J11: members have no password, so the email is the strong sign-in; Join v2 adds the phone). Not the old
# card sign-in.
CHANGE_KINDS = (MemberSession.KIND_PASSWORD, MemberSession.KIND_EMAIL, MemberSession.KIND_PHONE)


class IsPasswordMember(BasePermission):
    """Signed in with a password or an emailed link (not the card), for changes that need more than the card."""

    def has_permission(self, request, view):
        return isinstance(request.user, Member) and request.user.session.kind in CHANGE_KINDS


# ── Ways in ────────────────────────────────────────────────────────────────────

def _staff_person(key: str, password: str) -> Person | None:
    """A staff member signs in to the scanner with their Dash email (or username) and password. They land on
    their own staff membership (J6: staff memberships are their own accounts), made now if they have none yet
    (owner 2026-10-15: ``staff_members.ensure_staff_membership``, which also makes it when the staff login is made)."""
    from django.contrib.auth import authenticate, get_user_model

    from apps.accounts.services import lockout
    from apps.accounts.services.usernames import is_staff_user
    from apps.thriftplus.services import staff_members

    User = get_user_model()
    if lockout.is_locked(key, None):
        raise AuthError('LOCKED', 'Too many tries. Wait 15 minutes, then try again.')
    email = key
    if '@' not in key:
        email = User.objects.filter(username=key).values_list('email', flat=True).first() or key
    user = authenticate(username=email, password=password or '')
    if user is None or not user.is_active or not is_staff_user(user):
        lockout.record_failure(key, None)
        return None
    lockout.clear(key)
    account = staff_members.ensure_staff_membership(user)
    return staff_members.primary_person(account) if account is not None else None


def sign_in_password(login: str, password: str) -> Person:
    """Staff only (owner 2026-10-16: "the only passwords are for staff"): a Dash email or username and password lands
    on the staff member's own membership. Customers sign in by an emailed link or code."""
    person = _staff_person((login or '').strip().lower(), password)
    if person is not None and _usable(person):
        return person
    raise AuthError('BAD_LOGIN', "That email or password isn't right.")


def _lock_key(code: str) -> str:
    return f'thriftplus:card-tries:{code}'


def sign_in_card(raw_code: str, phone_last4: str) -> Person:
    code = cards.parse(raw_code)
    if not code:
        raise AuthError('BAD_CARD', "That card number isn't right.")
    tries = cache.get(_lock_key(code), 0)
    if tries >= CARD_TRIES:
        raise AuthError('LOCKED', 'Too many tries. Wait 15 minutes, or sign in with your email.')
    card = Card.objects.select_related('person__account').filter(code=code, status=Card.STATUS_ACTIVE).first()
    digits = normalize_phone(card.person.phone) if card and card.person else ''
    given = ''.join(ch for ch in (phone_last4 or '') if ch.isdigit())
    ok = bool(card and card.person and len(digits) >= 4 and len(given) == 4
              and hmac.compare_digest(digits[-4:], given) and _usable(card.person))
    if not ok:
        cache.set(_lock_key(code), tries + 1, CARD_LOCK_SECONDS)
        raise AuthError('BAD_CARD', "That card and phone number don't match.")
    cache.delete(_lock_key(code))
    return card.person



def mask(email: str) -> str:
    name, _, domain = email.partition('@')
    return f'{name[:1]}***@{domain}' if domain else '***'


# ── Email sign-in: join online, "Email me a link" (owner 2026-10-15, J8 and J11) ──

TOKEN_MINUTES = 15
CODE_TRIES = 5  # wrong codes before the emailed token dies
SEND_GAP_SECONDS = 30  # between sends to one email
SENDS_PER_15_MIN = 3  # per email
SENDS_PER_HOUR = 6  # per email
SENDS_PER_IP_HOUR = 10
CODE_TRIES_PER_IP = 10  # per 15 minutes
LIMIT_TEXT = 'Too many tries. Wait a few minutes and try again.'
# The app shows these as they are (APP, 10-15).
EMAIL_BAD_TEXT = 'Check your email address.'
NAME_NEEDED_TEXT = 'Enter your first and last name.'
LINK_TEXT = {
    'LINK_USED': 'That link has already been used. Send a new one.',
    'LINK_EXPIRED': 'That link has expired. Send a new one.',
    'LINK_BAD': "That link didn't work. Send a new one.",
    'CODE_BAD': "That code didn't work. Check it and try again.",
    'CODE_EXPIRED': 'That code has expired. Send a new one.',
}


class LimitError(AuthError):
    """Over a send or code-try limit: the API answers 429."""

    def __init__(self, code: str, retry_after: int | None = None):
        super().__init__(code, LIMIT_TEXT)
        self.retry_after = retry_after


def _clean_email(raw: str | None) -> str:
    from apps.thriftplus.services.emails import clean_email

    return clean_email(raw)


def _ip(raw: str | None) -> str | None:
    try:
        return str(ipaddress.ip_address((raw or '').strip()))
    except ValueError:
        return None


def _code_hash(email: str, code: str) -> str:
    return _hash(f'{email}:{code}', 'email-code')


def _count(key: str, seconds: int) -> int:
    """Count one in a fixed window that keeps its end (``cache.incr`` on the database cache re-saves the key with the
    default 5-minute timeout). The email and phone limits both count here."""
    now = time.time()
    value = cache.get(key)
    start, n = value if isinstance(value, (tuple, list)) else (now, int(value or 0))  # a bare count: before 10-19
    left = seconds - (now - start)
    if left <= 0:
        start, n, left = now, 0, seconds
    cache.set(key, (start, n + 1), max(1, math.ceil(left)))
    return n + 1


def _counted(key: str) -> int:
    value = cache.get(key)
    if isinstance(value, (tuple, list)):
        return int(value[1])
    return int(value or 0)  # a bare count, saved by the email limits before 2026-10-19


def _limit_send(email: str, ip: str | None) -> None:
    """Refuse (``LimitError``) a send over the limits; otherwise count it. Every valid request counts, member or not,
    so the answer never says whether an email is a member's: 30 s between sends to one email, 3 per 15 minutes and 6
    an hour per email, 10 an hour per address (staff sends from Dash have no address)."""
    key = _hash(email, 'limit')
    if ip and _counted(f'thriftplus:send-ip:{ip}') >= SENDS_PER_IP_HOUR:
        logger.warning('thrift+ sign-in email refused for %s: too many from one address', mask(email))
        raise LimitError('TOO_MANY')
    last = cache.get(f'thriftplus:send-last:{key}')
    now = time.time()
    if last and now - float(last) < SEND_GAP_SECONDS:
        raise LimitError('TOO_SOON', retry_after=max(1, math.ceil(SEND_GAP_SECONDS - (now - float(last)))))
    if _counted(f'thriftplus:send-15m:{key}') >= SENDS_PER_15_MIN or _counted(f'thriftplus:send-1h:{key}') >= SENDS_PER_HOUR:
        logger.warning('thrift+ sign-in email refused for %s: too many sends', mask(email))
        raise LimitError('TOO_MANY')
    cache.set(f'thriftplus:send-last:{key}', now, SEND_GAP_SECONDS)
    _count(f'thriftplus:send-15m:{key}', 15 * 60)
    _count(f'thriftplus:send-1h:{key}', 60 * 60)
    if ip:
        _count(f'thriftplus:send-ip:{ip}', 60 * 60)


def _limit_code_try(ip: str | None) -> None:
    if not ip:
        return
    key = f'thriftplus:code-ip:{ip}'
    if _counted(key) >= CODE_TRIES_PER_IP:
        logger.warning('thrift+ sign-in code refused: too many tries from one address')
        raise LimitError('TOO_MANY')
    _count(key, 15 * 60)


def member_by_email(email: str) -> Person | None:
    """The member this email belongs to, active or pending (a staff member's own first: the staff login overwrites,
    owner 2026-10-15; then an active membership, then the primary, then the newest), or the person on an older member
    login with that email."""
    if not email:
        return None
    person = (
        Person.objects.select_related('account')
        .filter(email=email, removed_at__isnull=True, account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING))
        .annotate(rank=Case(When(account__status=Account.STATUS_ACTIVE, account__staff_user__isnull=False, then=Value(0)),
                            When(account__status=Account.STATUS_ACTIVE, then=Value(1)), default=Value(2),
                            output_field=IntegerField()))
        .order_by('rank', 'role', '-pk').first()
    )
    if person is None:  # a retired member login's address, until the one-account request copies it over
        login = MemberLogin.objects.select_related('person__account').filter(email=email).first()
        if login is not None and _can_sign_in(login.person) and not login.person.email:
            person = login.person
    return person


def _staff_member_for(address: str) -> tuple[bool, Person | None]:
    """(is a staff email, the person to sign in). An active staff member's Dash email (owner 2026-10-15) signs in to
    their own membership, made or kept in step now, and never makes a pending customer join."""
    from apps.thriftplus.services import staff_members

    user = staff_members.staff_user_for_email(address)
    if user is None:
        return False, None
    account = staff_members.ensure_staff_membership(user)
    person = staff_members.primary_person(account) if account is not None else None
    if person is None or not _can_sign_in(person) or person.email != address:
        return True, None
    return True, person


def _sign_in_purpose(person: Person) -> str:
    """A pending join whose email isn't confirmed yet gets the join email again; everyone else gets a sign-in email."""
    if person.account.status == Account.STATUS_PENDING and not person.email_verified_at:
        return MemberEmailToken.PURPOSE_JOIN
    return MemberEmailToken.PURPOSE_SIGN_IN


def _issue(person: Person, purpose: str, email: str, *, base_url: str, ip: str | None = None, user=None) -> MemberEmailToken:
    """Make the token (keyed hashes only) and email its link and code."""
    from apps.thriftplus.services import members, signin_emails

    token = secrets.token_urlsafe(32)
    code = f'{secrets.randbelow(1_000_000):06d}'
    row = MemberEmailToken.objects.create(
        person=person, purpose=purpose, email=email, token_hash=_hash(token, 'email-link'),
        code_hash=_code_hash(email, code), expires_at=timezone.now() + timedelta(minutes=TOKEN_MINUTES), ip=ip,
    )
    link = f'{base_url.rstrip("/")}/scan?signin={token}'
    sent = signin_emails.send(email, purpose, link=link, code=code)
    members.log('email_link_sent', account=person.account, person=person, actor=user, purpose=purpose, to=mask(email),
                sent=bool(sent), by='staff' if user is not None else 'member')
    return row


def _join_name(first: str, last: str) -> tuple[str, str]:
    """First and last name, both required (owner 2026-10-16), cleaned by the one name rule."""
    from apps.accounts.services.names import OLD_DEFAULTS, clean_name

    if not (first or '').strip() or not (last or '').strip() or (last or '').strip().lower() in OLD_DEFAULTS:
        raise AuthError('NAME_NEEDED', NAME_NEEDED_TEXT)
    return clean_name(first, last)


def join(first_name: str, last_name: str, email: str, *, base_url: str, ip: str | None = None) -> None:
    """Join online with a name and email (J8). A new email: a pending membership (the primary person, no phone) with
    their member code, and the join email. An email already a member's: a sign-in email instead (a pending one not yet
    confirmed: the join email again). A revoked membership's email: nothing is sent (logged). The caller answers the
    same either way. An active staff member's Dash email (owner 2026-10-15): their own membership's sign-in email, never
    a pending join."""
    from apps.thriftplus.services import members

    first, last = _join_name(first_name, last_name)
    address = _clean_email(email)
    if not address:
        raise AuthError('EMAIL_BAD', EMAIL_BAD_TEXT)
    ip = _ip(ip)
    _limit_send(address, ip)
    staff, person = _staff_member_for(address)
    person = person or member_by_email(address)
    if person is not None:
        _issue(person, _sign_in_purpose(person), address, base_url=base_url, ip=ip)
        return
    if staff:
        logger.info('thrift+ join asked with a staff email %s: no membership to sign in, nothing made', mask(address))
        return
    # A revoked or deactivated membership is not joined again from a phone (staff reactivate one in Dash).
    off = (Person.objects.select_related('account')
           .filter(email=address, account__status__in=(Account.STATUS_REVOKED, Account.STATUS_INACTIVE)).first())
    if off is not None:
        reason = 'revoked membership' if off.account.status == Account.STATUS_REVOKED else 'deactivated membership'
        members.log('join_refused', account=off.account, person=off, to=mask(address), reason=reason)
        return
    with transaction.atomic():
        account = Account.objects.create(status=Account.STATUS_PENDING, notes='Joined online (name and email).')
        person = Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=first, last_name=last,
                                       email=address)
        members.log('joined_online', account=account, person=person, to=mask(address))
        members.new_member_code(person)
    _issue(person, MemberEmailToken.PURPOSE_JOIN, address, base_url=base_url, ip=ip)


def request_link(email: str, *, base_url: str, ip: str | None = None) -> None:
    """"Email me a link" (J11): a member (active or pending) gets a sign-in email. The caller answers the same
    whether or not the email is a member's. An active staff member's Dash email gets their own membership's sign-in
    email, the membership made first when they have none (owner 2026-10-15)."""
    address = _clean_email(email)
    if not address:
        raise AuthError('EMAIL_BAD', EMAIL_BAD_TEXT)
    ip = _ip(ip)
    _limit_send(address, ip)
    person = _staff_member_for(address)[1] or member_by_email(address)
    if person is None:
        logger.info('thrift+ sign-in email asked for %s: no member, nothing sent', mask(address))
        return
    _issue(person, _sign_in_purpose(person), address, base_url=base_url, ip=ip)


def send_link_for(person: Person, *, base_url: str, email: str = '', user=None) -> str:
    """Staff send the app link (J12): set the email first when one is given, then a join email (or a sign-in email
    when the address is already confirmed). Answers the purpose sent."""
    from apps.thriftplus.services import emails as member_email
    from apps.thriftplus.services.members import MemberError

    if person.removed_at is not None or person.account.status in (Account.STATUS_REVOKED, Account.STATUS_INACTIVE):
        raise MemberError('This membership is not active.')
    if (email or '').strip() and _clean_email(email) != person.email:
        member_email.set_address(person, email, user=user)
    if not person.email:
        raise MemberError('Add an email address first.')
    _limit_send(person.email, None)
    purpose = MemberEmailToken.PURPOSE_SIGN_IN if person.email_verified_at else MemberEmailToken.PURPOSE_JOIN
    _issue(person, purpose, person.email, base_url=base_url, user=user)
    return purpose


def _failed(row: MemberEmailToken | None, code: str, how: str, email: str = '') -> AuthError:
    from apps.thriftplus.services import members

    if row is not None:
        members.log('email_link_failed', account=row.person.account, person=row.person, purpose=row.purpose,
                    to=mask(row.email), how=how, code=code)
    else:
        logger.info('thrift+ sign-in %s failed (%s)%s', how, code, f' for {mask(email)}' if email else '')
    return AuthError(code, LINK_TEXT[code])


def _matches(row: MemberEmailToken) -> bool:
    """The token still belongs to the person: they can sign in, and the email is still theirs (or they have none)."""
    return _can_sign_in(row.person) and row.person.email in ('', row.email)


def check_link(token: str) -> MemberEmailToken:
    """The emailed link's token, if it can still sign in (nothing is used yet)."""
    row = (MemberEmailToken.objects.select_related('person__account')
           .filter(token_hash=_hash(token, 'email-link')).first()) if token else None
    if row is None:
        raise _failed(None, 'LINK_BAD', 'link')
    if row.used_at is not None:
        raise _failed(row, 'LINK_USED', 'link')
    if row.expires_at <= timezone.now() or row.wrong_codes >= CODE_TRIES:
        raise _failed(row, 'LINK_EXPIRED', 'link')
    if not _matches(row):
        raise _failed(row, 'LINK_BAD', 'link')
    return row


def check_code(email: str, code: str, *, ip: str | None = None) -> MemberEmailToken:
    """The newest unused token for that email, if the code is its code. A wrong code counts against the token; the
    fifth kills it (then CODE_EXPIRED). Code tries are limited per address."""
    _limit_code_try(_ip(ip))
    address = _clean_email(email)
    digits = ''.join(ch for ch in str(code or '') if ch.isdigit())
    row = (MemberEmailToken.objects.select_related('person__account')
           .filter(email=address, used_at__isnull=True).order_by('-created_at', '-pk').first()) if address else None
    if row is None:
        raise _failed(None, 'CODE_BAD', 'code', address)
    if row.expires_at <= timezone.now() or row.wrong_codes >= CODE_TRIES:
        raise _failed(row, 'CODE_EXPIRED', 'code')
    if len(digits) != 6 or not hmac.compare_digest(row.code_hash, _code_hash(address, digits)):
        MemberEmailToken.objects.filter(pk=row.pk).update(wrong_codes=F('wrong_codes') + 1)
        raise _failed(row, 'CODE_BAD', 'code')
    if not _matches(row):
        raise _failed(row, 'CODE_BAD', 'code')
    return row


@transaction.atomic
def redeem(row: MemberEmailToken, *, how: str) -> Person:
    """Use the token once: it confirms the email (J8) and answers the person to sign in."""
    from apps.thriftplus.services import members

    row = MemberEmailToken.objects.select_for_update().select_related('person__account').get(pk=row.pk)
    if row.used_at is not None:
        raise _failed(row, 'LINK_USED' if how == 'link' else 'CODE_EXPIRED', how)
    now = timezone.now()
    row.used_at = now
    row.save(update_fields=['used_at'])
    person = row.person
    fields = []
    if not person.email:
        person.email = row.email
        fields.append('email')
    if person.email_verified_at is None:
        person.email_verified_at = now
        fields.append('email_verified_at')
    if fields:
        person.save(update_fields=[*fields, 'updated_at'])
    members.log('email_link_used', account=person.account, person=person, purpose=row.purpose, to=mask(row.email), how=how)
    return person


# ── Join v2: one "Phone or email" box, texted codes, Google (owner 2026-10-19) ──

CONTACT_BAD_TEXT = 'Enter a US phone number or an email.'
PHONE_OFF_TEXT = 'Texted codes are not on yet. Use your email.'
MEMBERSHIP_OFF_TEXT = 'This membership is not active. Ask at the register.'
GOOGLE_BAD_TEXT = "Google sign-in didn't work. Try again, or use your phone or email."
PHONE_GAP_SECONDS = 30  # between texts to one number
PHONE_SENDS_PER_HOUR = 5  # per number
PHONE_SENDS_PER_IP_HOUR = 10
PHONE_WRONG_CODES = 5  # per number; then the number is locked
PHONE_LOCK_SECONDS = 15 * 60
PHONE_JOIN_SECONDS = 15 * 60  # a phone join's names wait this long for the code


def _phone_key(digits: str, what: str) -> str:
    return f'thriftplus:sms-{what}:{_hash(digits, "phone-limit")}'


def _phone_locked(digits: str) -> int:
    """Seconds left on the number's lock (5 wrong codes), or 0."""
    until = cache.get(_phone_key(digits, 'lock'))
    return max(0, math.ceil(float(until) - time.time())) if until else 0


def _limit_phone_send(digits: str, ip: str | None) -> None:
    """Our limits on top of Verify's, counted for every valid request, member or not (the answer never says): locked
    after 5 wrong codes for 15 minutes, 30 s between texts to one number, 5 an hour per number, 10 an hour per
    address."""
    from apps.thriftplus.services.phone_codes import masked

    locked = _phone_locked(digits)
    if locked:
        raise LimitError('LOCKED', retry_after=locked)
    if ip and _counted(f'thriftplus:sms-ip:{ip}') >= PHONE_SENDS_PER_IP_HOUR:
        logger.warning('thrift+ texted code refused for %s: too many from one address', masked(digits))
        raise LimitError('TOO_MANY')
    last = cache.get(_phone_key(digits, 'last'))
    now = time.time()
    if last and now - float(last) < PHONE_GAP_SECONDS:
        raise LimitError('TOO_SOON', retry_after=max(1, math.ceil(PHONE_GAP_SECONDS - (now - float(last)))))
    if _counted(_phone_key(digits, '1h')) >= PHONE_SENDS_PER_HOUR:
        logger.warning('thrift+ texted code refused for %s: too many sends', masked(digits))
        raise LimitError('TOO_MANY')
    cache.set(_phone_key(digits, 'last'), now, PHONE_GAP_SECONDS)
    _count(_phone_key(digits, '1h'), 60 * 60)
    if ip:
        _count(f'thriftplus:sms-ip:{ip}', 60 * 60)


def _phone_wrong(digits: str) -> int:
    """One more wrong code for the number; the fifth locks it for 15 minutes."""
    key = _phone_key(digits, 'wrong')
    n = int(cache.get(key) or 0) + 1
    if n >= PHONE_WRONG_CODES:
        cache.set(_phone_key(digits, 'lock'), time.time() + PHONE_LOCK_SECONDS, PHONE_LOCK_SECONDS)
        cache.delete(key)
    else:
        cache.set(key, n, PHONE_LOCK_SECONDS)
    return n


def member_by_phone(digits: str) -> Person | None:
    """The member (active or pending, not practice) with this phone: an active membership first, then the primary,
    then the newest. One membership per phone (``register.finish_join``), but 2 adults may share one."""
    if not digits:
        return None
    return (
        Person.objects.select_related('account')
        .filter(phone=digits, removed_at__isnull=True, account__is_practice=False,
                account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING))
        .annotate(rank=Case(When(account__status=Account.STATUS_ACTIVE, then=Value(0)), default=Value(1),
                            output_field=IntegerField()))
        .order_by('rank', 'role', '-pk').first()
    )


def _phone_off(digits: str) -> Person | None:
    return (Person.objects.select_related('account')
            .filter(phone=digits, account__status__in=(Account.STATUS_REVOKED, Account.STATUS_INACTIVE)).first())


def _phone_log(action: str, person: Person | None, digits: str, **detail) -> None:
    """Every send and check, the number masked: on the person when there is one, else the server log."""
    from apps.thriftplus.services import members
    from apps.thriftplus.services.phone_codes import masked

    if person is not None:
        members.log(action, account=person.account, person=person, to=masked(digits), **detail)
    else:
        logger.info('thrift+ %s for %s %s', action, masked(digits), detail or '')


def _phone_purpose(person: Person) -> str:
    from apps.thriftplus.services.members import confirmed

    if person.account.status == Account.STATUS_PENDING and not confirmed(person):
        return MemberEmailToken.PURPOSE_JOIN
    return MemberEmailToken.PURPOSE_SIGN_IN


def _text_code(digits: str, person: Person | None, purpose: str) -> None:
    from apps.thriftplus.services import phone_codes

    try:
        phone_codes.send(digits)
        sent = True
    except phone_codes.PhoneCodeError:
        logger.exception('thrift+ texted code to %s failed', phone_codes.masked(digits))
        sent = False
    _phone_log('phone_code_sent', person, digits, purpose=purpose, sent=sent)


def send_code(contact: str, first_name: str = '', last_name: str = '', *, base_url: str, ip: str | None = None) -> str:
    """One "Phone or email" box (Join v2): with both names a join, with none a sign in. Answers the channel ('sms' or
    'email'), the same whether or not the contact is a member's.
    - An email goes through ``join`` / ``request_link`` (the emailed link and code).
    - A US phone: a member's number (active or pending) gets a sign-in code; a new number with names gets a join code
      (the names wait 15 minutes for it); a new number without names, or a revoked or deactivated membership's, gets
      nothing (logged)."""
    from apps.thriftplus.services import members, phone_codes

    contact = str(contact or '').strip()
    first, last = str(first_name or '').strip(), str(last_name or '').strip()
    if bool(first) != bool(last):
        raise AuthError('NAME_NEEDED', NAME_NEEDED_TEXT)
    joining = bool(first and last)
    if '@' in contact:
        if not _clean_email(contact):
            raise AuthError('CONTACT_BAD', CONTACT_BAD_TEXT)
        if joining:
            join(first, last, contact, base_url=base_url, ip=ip)
        else:
            request_link(contact, base_url=base_url, ip=ip)
        return 'email'
    digits = phone_codes.us_number(contact)
    if not digits:
        raise AuthError('CONTACT_BAD', CONTACT_BAD_TEXT)
    if not phone_codes.available():
        raise AuthError('PHONE_OFF', PHONE_OFF_TEXT)
    names = _join_name(first, last) if joining else None
    ip = _ip(ip)
    _limit_phone_send(digits, ip)
    person = member_by_phone(digits)
    if person is None:
        off = _phone_off(digits)
        if off is not None:
            reason = 'revoked membership' if off.account.status == Account.STATUS_REVOKED else 'deactivated membership'
            members.log('join_refused' if joining else 'phone_code_refused', account=off.account, person=off,
                        to=phone_codes.masked(digits), reason=reason, by='phone')
            return 'sms'
        if names is None:
            logger.info('thrift+ texted code asked for %s: no member, nothing sent', phone_codes.masked(digits))
            return 'sms'
        cache.set(_phone_key(digits, 'join'), {'first_name': names[0], 'last_name': names[1]}, PHONE_JOIN_SECONDS)
        _text_code(digits, None, MemberEmailToken.PURPOSE_JOIN)
        return 'sms'
    _text_code(digits, person, _phone_purpose(person))
    return 'sms'


def check_phone_code(digits: str, code: str, *, ip: str | None = None) -> tuple[Person, str]:
    """The texted code for a US number (10 digits): (the person to sign in, 'join' or 'sign_in'). A new number's join
    becomes a pending membership now (the primary person, the phone verified, no email) with its member code. A wrong
    code counts against the number (the fifth locks it for 15 minutes); tries are limited per address too."""
    from apps.thriftplus.services import phone_codes

    _limit_code_try(_ip(ip))
    locked = _phone_locked(digits)
    if locked:
        raise LimitError('LOCKED', retry_after=locked)
    given = ''.join(ch for ch in str(code or '') if ch.isdigit())
    person = member_by_phone(digits)
    names = cache.get(_phone_key(digits, 'join')) if person is None else None
    ok = False
    if len(given) == 6 and (person is not None or names):
        try:
            ok = phone_codes.check(digits, given)
        except phone_codes.PhoneCodeError:
            logger.exception('thrift+ texted code check for %s failed', phone_codes.masked(digits))
            raise AuthError('CODE_BAD', LINK_TEXT['CODE_BAD']) from None
    if not ok:
        _phone_log('phone_code_failed', person, digits, wrong=_phone_wrong(digits))
        raise AuthError('CODE_BAD', LINK_TEXT['CODE_BAD'])
    cache.delete(_phone_key(digits, 'wrong'))
    cache.delete(_phone_key(digits, 'join'))
    if person is None:
        return _phone_join(digits, names), MemberEmailToken.PURPOSE_JOIN
    purpose = _phone_purpose(person)
    if person.phone_verified_at is None:
        person.phone_verified_at = timezone.now()
        person.save(update_fields=['phone_verified_at', 'updated_at'])
    _phone_log('phone_code_used', person, digits, purpose=purpose)
    return person, purpose


@transaction.atomic
def _phone_join(digits: str, names: dict) -> Person:
    from apps.thriftplus.services import members
    from apps.thriftplus.services.phone_codes import masked

    taken = member_by_phone(digits)  # joined some other way since the code went out
    if taken is not None:
        return taken
    account = Account.objects.create(status=Account.STATUS_PENDING, notes='Joined online (name and phone).')
    person = Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=names['first_name'],
                                   last_name=names['last_name'], phone=digits, phone_verified_at=timezone.now())
    members.log('joined_online', account=account, person=person, to=masked(digits), by='phone')
    members.new_member_code(person)
    _phone_log('phone_code_used', person, digits, purpose=MemberEmailToken.PURPOSE_JOIN)
    return person


def google_address(claims: dict) -> str:
    address = _clean_email(claims.get('email'))
    if not address:
        raise AuthError('GOOGLE_BAD', GOOGLE_BAD_TEXT)
    return address


def google_member(address: str) -> Person | None:
    """The member a Google-verified email signs in to (as ``join``: a staff member's own membership first), or None
    for a new email. A staff email with no usable membership, or a revoked or deactivated membership's email, is
    refused (``MEMBERSHIP_OFF``, logged); the person holds that email, so saying so reveals nothing."""
    from apps.thriftplus.services import members

    staff, person = _staff_member_for(address)
    person = person or member_by_email(address)
    if person is not None:
        return person
    if staff:
        logger.info('thrift+ Google sign-in with a staff email %s: no membership to sign in', mask(address))
        raise AuthError('MEMBERSHIP_OFF', MEMBERSHIP_OFF_TEXT)
    off = (Person.objects.select_related('account')
           .filter(email=address, account__status__in=(Account.STATUS_REVOKED, Account.STATUS_INACTIVE)).first())
    if off is not None:
        reason = 'revoked membership' if off.account.status == Account.STATUS_REVOKED else 'deactivated membership'
        members.log('join_refused', account=off.account, person=off, to=mask(address), reason=reason, by='google')
        raise AuthError('MEMBERSHIP_OFF', MEMBERSHIP_OFF_TEXT)
    return None


def google_sign_in(person: Person, address: str) -> str:
    """Sign in a member by Google: Google verified the email, so it is confirmed (as an emailed link would). Answers
    'join' (a pending join not confirmed until now) or 'sign_in'."""
    from apps.thriftplus.services import members

    purpose = _sign_in_purpose(person)
    fields = []
    if not person.email:
        person.email = address
        fields.append('email')
    if person.email == address and person.email_verified_at is None:
        person.email_verified_at = timezone.now()
        fields.append('email_verified_at')
    if fields:
        person.save(update_fields=[*fields, 'updated_at'])
    members.log('google_sign_in', account=person.account, person=person, to=mask(address), purpose=purpose)
    return purpose


@transaction.atomic
def google_join(address: str, claims: dict) -> Person:
    """A new Google-verified email: a pending membership with Google's given and family name (the one name rule), the
    email confirmed, and a member code."""
    from apps.accounts.services.names import clean_name
    from apps.thriftplus.services import members

    first, last = str(claims.get('given_name') or ''), str(claims.get('family_name') or '')
    if not first.strip():
        first, last = str(claims.get('name') or ''), ''
    if not first.strip():
        first = address.split('@')[0]
    first, last = clean_name(first, last)
    account = Account.objects.create(status=Account.STATUS_PENDING, notes='Joined online (Google).')
    person = Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=first, last_name=last,
                                   email=address, email_verified_at=timezone.now())
    members.log('joined_online', account=account, person=person, to=mask(address), by='google')
    members.new_member_code(person)
    return person
