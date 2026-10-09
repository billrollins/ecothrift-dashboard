"""
Thrift+ member sign-in for the scanner app and portal (thrift_plus_rewards Phase 4). Members are not
Django users, and their session can't reach anything staff-side (the auth map of 2026-09-25):
- **The session:** a random token in an httpOnly cookie (``tp_session``, path
  ``/api/thriftplus/public/``). Only a keyed hash of it is stored (``MemberSession``).
- **Checked on every request:** the session isn't revoked or expired, the person is still on the
  account, and the account is active. Revoking a membership cuts access at once.
- **Ways in:**
  - email or username with a password (Django's hasher and password rules);
  - or the Thrift+ card plus the last 4 digits of the member's phone. A card session can look,
    scan and keep a cart, and can set up a login only when none exists. Five wrong tries lock
    the card for 15 minutes.
- **Password reset:** a one-use emailed link (1 hour). The answer is the same whether or not the
  email is on file. A reset signs out every phone.
"""
from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission

from apps.thriftplus.models import Account, Card, MemberLogin, MemberResetToken, MemberSession, Person
from apps.thriftplus.services import cards
from apps.thriftplus.services.members import normalize_phone

COOKIE = 'tp_session'
COOKIE_PATH = '/api/thriftplus/public/'
PASSWORD_DAYS = 90
CARD_DAYS = 30
RESET_HOURS = 1
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


# ── Sessions ───────────────────────────────────────────────────────────────────

def start_session(person: Person, kind: str, *, user_agent: str = '') -> tuple[str, MemberSession]:
    token = secrets.token_urlsafe(32)
    days = PASSWORD_DAYS if kind == MemberSession.KIND_PASSWORD else CARD_DAYS
    session = MemberSession.objects.create(
        token_hash=_hash(token, 'session'), person=person, kind=kind,
        expires_at=timezone.now() + timedelta(days=days), user_agent=(user_agent or '')[:200],
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
    if session is None or not _usable(session.person):
        return None
    now = timezone.now()
    if session.last_seen_at is None or now - session.last_seen_at > SEEN_EVERY:
        MemberSession.objects.filter(pk=session.pk).update(last_seen_at=now)
    return session


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


class IsPasswordMember(BasePermission):
    """Signed in with a password (not the card), for changes that need more than the card."""

    def has_permission(self, request, view):
        return isinstance(request.user, Member) and request.user.session.kind == MemberSession.KIND_PASSWORD


# ── Ways in ────────────────────────────────────────────────────────────────────

def _staff_person(key: str, password: str) -> Person | None:
    """A staff member signs in to the scanner with their Dash email (or username) and password. They land on
    their own staff membership, made on the first sign-in (J6: staff memberships are their own accounts)."""
    from django.contrib.auth import authenticate, get_user_model

    from apps.accounts.services import lockout
    from apps.accounts.services.usernames import is_staff_user

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
    account = Account.objects.filter(staff_user=user).first()
    if account is None:
        with transaction.atomic():
            account = Account.objects.create(staff_user=user, created_by=user, notes='Made when this staff member signed in to the scanner.')
            Person.objects.create(
                account=account, role=Person.ROLE_PRIMARY,
                first_name=(user.first_name or email.split('@')[0])[:80], last_name=(user.last_name or '')[:80],
                email=(user.email or '').strip().lower(),
            )
    return account.people.filter(role=Person.ROLE_PRIMARY, removed_at__isnull=True).first() or account.people.filter(removed_at__isnull=True).first()


def sign_in_password(login: str, password: str) -> Person:
    key = (login or '').strip().lower()
    row = MemberLogin.objects.select_related('person__account').filter(email=key).first() or \
        MemberLogin.objects.select_related('person__account').filter(username=key).first()
    if row is None:
        person = _staff_person(key, password)
        if person is not None and _usable(person):
            return person
        raise AuthError('BAD_LOGIN', "That email or password isn't right.")
    ok = check_password(password or '', row.password)
    if not ok or not _usable(row.person):
        raise AuthError('BAD_LOGIN', "That email or password isn't right.")
    return row.person


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


def _clean_login(email: str, username: str | None) -> tuple[str, str | None]:
    email = (email or '').strip().lower()
    if '@' not in email or len(email) > 254:
        raise AuthError('BAD_EMAIL', 'Enter a real email address.')
    name = (username or '').strip().lower() or None
    if name is not None and (not name.replace('_', '').replace('.', '').isalnum() or not 3 <= len(name) <= 30):
        raise AuthError('BAD_USERNAME', 'A username is 3 to 30 letters or numbers.')
    return email, name


def set_up_login(person: Person, *, email: str, username: str | None, password: str) -> MemberLogin:
    """A member's first email and password (from a card session). Changing an existing login goes
    through the reset email."""
    if MemberLogin.objects.filter(person=person).exists():
        raise AuthError('HAS_LOGIN', 'You already have a login. Use "Forgot password?" to change it.')
    email, username = _clean_login(email, username)
    if MemberLogin.objects.filter(email=email).exists():
        raise AuthError('EMAIL_TAKEN', 'That email is already on a Thrift+ login.')
    if username and MemberLogin.objects.filter(username=username).exists():
        raise AuthError('USERNAME_TAKEN', 'That username is taken.')
    try:
        validate_password(password)
    except ValidationError as exc:
        raise AuthError('WEAK_PASSWORD', ' '.join(exc.messages)) from exc
    return MemberLogin.objects.create(person=person, email=email, username=username, password=make_password(password))


# ── Password reset ─────────────────────────────────────────────────────────────

def mask(email: str) -> str:
    name, _, domain = email.partition('@')
    return f'{name[:1]}***@{domain}' if domain else '***'


def request_reset(email: str, *, base_url: str) -> str:
    """Email a reset link if the email has a login. Returns the masked address either way."""
    email = (email or '').strip().lower()
    row = MemberLogin.objects.select_related('person__account').filter(email=email).first()
    if row is not None and _usable(row.person):
        token = secrets.token_urlsafe(32)
        MemberResetToken.objects.create(login=row, token_hash=_hash(token, 'reset'),
                                        expires_at=timezone.now() + timedelta(hours=RESET_HOURS))
        from apps.webstore.emails import _send

        link = f'{base_url.rstrip("/")}/scan?reset={token}'
        _send(
            'Reset your Thrift+ password',
            f'Hi {row.person.first_name},\n\nSet a new Thrift+ password here:\n\n{link}\n\n'
            'The link works once, for one hour. If you did not ask for it, ignore this email.\n\n- Eco-Thrift',
            row.email,
        )
    return mask(email)


@transaction.atomic
def confirm_reset(token: str, password: str) -> Person:
    row = (
        MemberResetToken.objects.select_for_update().select_related('login__person__account')
        .filter(token_hash=_hash(token or '', 'reset'), used_at__isnull=True, expires_at__gt=timezone.now()).first()
    )
    if row is None or not _usable(row.login.person):
        raise AuthError('BAD_RESET', 'That reset link has expired. Ask for a new one.')
    try:
        validate_password(password)
    except ValidationError as exc:
        raise AuthError('WEAK_PASSWORD', ' '.join(exc.messages)) from exc
    login = row.login
    login.password = make_password(password)
    login.save(update_fields=['password', 'updated_at'])
    row.used_at = timezone.now()
    row.save(update_fields=['used_at'])
    revoke_all(login.person)
    return login.person
