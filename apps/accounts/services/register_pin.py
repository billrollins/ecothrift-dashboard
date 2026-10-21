"""Register PIN (critic review 2026-10-21, digest point 3): one PIN per staff member, for the register.

- **Who:** any active staff login (Employee, Manager, Admin, or the owner). Each person sets their own on the Me page;
  a manager can clear one (forgotten) so the person sets a new one. 4 to 6 digits.
- **One PIN, one person.** PINs are unique, so typing a PIN alone says who it is (a manager approving at the register,
  someone stepping in to Cover). Kept as a keyed hash (HMAC with the server secret), never the PIN itself. Too-easy
  PINs (``1111``, ``1234``, ``9876``) are refused; a PIN someone else has is refused as "pick a different PIN", and
  five of those in an hour stop that person setting one for the hour, so the refusal can't be used to find PINs.
- **Checking:** ``check_pin(pin, device=..., min_role='Manager')`` answers the person or raises ``PinError``. A
  right PIN of someone below ``min_role`` counts as wrong. Five wrong tries in a row **on one register or device**
  lock PIN entry there for 15 minutes (REG-11: never one store-wide lockout); a right one clears that count. A login
  that is switched off, or a person whose employment has ended, has no working PIN.
- Every set and clear is an ``AccountEvent``. Each caller logs what the PIN approved (who, what for).
"""
from __future__ import annotations

import re

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from apps.accounts.models import AccountEvent, User

PIN_RE = re.compile(r'\d{4,6}')
MAX_FAILURES = 5       # wrong tries in a row on one device
LOCK_MINUTES = 15
MAX_TAKEN = 5          # "pick a different PIN" answers per person per hour
TAKEN_WINDOW = 60 * 60

ROLE_RANK = {'Employee': 1, 'Manager': 2, 'Admin': 3}


class PinError(Exception):
    """A PIN that is missing, wrong, locked, or can't be set. ``http`` is the status the view answers with."""

    def __init__(self, code: str, message: str, http: int = 403, **extra):
        super().__init__(message)
        self.code = code
        self.http = http
        self.extra = extra

    def payload(self) -> dict:
        return {**self.extra, 'detail': str(self), 'code': self.code}


def _hash(pin: str) -> str:
    return salted_hmac('accounts.register_pin', pin, algorithm='sha256').hexdigest()


def _too_easy(pin: str) -> bool:
    if len(set(pin)) == 1:
        return True
    steps = {int(b) - int(a) for a, b in zip(pin, pin[1:])}
    return steps in ({1}, {-1})


def role_rank(user) -> int:
    """Employee 1, Manager 2, Admin (or the owner) 3; 0 for anyone else."""
    if getattr(user, 'is_superuser', False):
        return ROLE_RANK['Admin']
    return ROLE_RANK.get(user.role or '', 0)


def can_hold_pin(user) -> bool:
    """An active staff login whose employment has not ended."""
    if user is None or not getattr(user, 'pk', None) or not user.is_active or role_rank(user) == 0:
        return False
    profile = getattr(user, 'employee', None)  # no profile (the owner) raises an AttributeError: None
    ended = getattr(profile, 'termination_date', None)
    return not (ended and ended <= timezone.localdate())


def has_pin(user) -> bool:
    return bool(getattr(user, 'register_pin_hash', None))


def status(user) -> dict:
    """For the Me page: is a PIN set, and since when. Never the PIN."""
    return {'set': has_pin(user), 'set_at': user.register_pin_set_at if has_pin(user) else None,
            'can_set': can_hold_pin(user)}


def _taken_key(user) -> str:
    return f'regpin:taken:{user.pk}'


def set_pin(user, pin: str, *, actor=None) -> dict:
    """The person sets (or changes) their own PIN. Raises ``PinError``: ``PIN_NOT_STAFF``, ``PIN_FORMAT``,
    ``PIN_EASY``, ``PIN_TAKEN``, ``PIN_SET_LOCKED``."""
    pin = (pin or '').strip()
    if not can_hold_pin(user):
        raise PinError('PIN_NOT_STAFF', 'Only active staff have a register PIN.')
    if (cache.get(_taken_key(user)) or 0) >= MAX_TAKEN:
        raise PinError('PIN_SET_LOCKED', 'Too many tries. Set your PIN again in an hour.', http=429)
    if not PIN_RE.fullmatch(pin):
        raise PinError('PIN_FORMAT', 'The PIN is 4 to 6 digits.', http=400)
    if _too_easy(pin):
        raise PinError('PIN_EASY', 'That PIN is too easy to guess (like 1111 or 1234). Pick another.', http=400)
    digest = _hash(pin)
    if User.objects.filter(register_pin_hash=digest).exclude(pk=user.pk).exists():
        _count_taken(user)
        raise PinError('PIN_TAKEN', 'Pick a different PIN.', http=400)
    again = has_pin(user)
    try:
        with transaction.atomic():
            user.register_pin_hash, user.register_pin_set_at = digest, timezone.now()
            user.save(update_fields=['register_pin_hash', 'register_pin_set_at'])
    except IntegrityError:  # someone set the same PIN a moment ago
        user.refresh_from_db(fields=['register_pin_hash', 'register_pin_set_at'])
        _count_taken(user)
        raise PinError('PIN_TAKEN', 'Pick a different PIN.', http=400) from None
    AccountEvent.log(user, AccountEvent.KIND_PIN_SET, actor=actor or user, detail='changed' if again else 'set')
    return status(user)


def _count_taken(user) -> None:
    cache.set(_taken_key(user), (cache.get(_taken_key(user)) or 0) + 1, TAKEN_WINDOW)


def clear_pin(user, *, actor) -> dict:
    """A manager clears a forgotten PIN (or the person clears their own); they set a new one on the Me page."""
    if has_pin(user):
        user.register_pin_hash, user.register_pin_set_at = None, None
        user.save(update_fields=['register_pin_hash', 'register_pin_set_at'])
        AccountEvent.log(user, AccountEvent.KIND_PIN_CLEARED, actor=actor)
    return status(user)


def device_key(request=None, register=None) -> str:
    """The lockout key for where the PIN was typed: the register's code when there is one, else the address."""
    code = getattr(register, 'code', None) or (register if isinstance(register, str) else '')
    if code:
        return f'register:{code}'
    address = (request.META.get('REMOTE_ADDR') if request is not None else '') or 'unknown'
    return f'ip:{address}'


def _fail_key(device: str) -> str:
    return f'regpin:fail:{(device or "unknown")[:120]}'


def _lock_key(device: str) -> str:
    return f'regpin:lock:{(device or "unknown")[:120]}'


def is_locked(device: str) -> bool:
    return bool(cache.get(_lock_key(device)))


def check_pin(pin: str, *, device: str, min_role: str | None = None) -> User:
    """Whose PIN is this. Answers the user, or raises ``PinError``: ``PIN_LOCKED`` (429), ``PIN_NEEDED``,
    ``PIN_WRONG`` (with ``tries_left``). ``min_role`` ('Employee', 'Manager', 'Admin') refuses anyone below it; that
    counts as a wrong try, so a cashier can't learn whose PIN is whose."""
    pin = (pin or '').strip()
    if is_locked(device):
        raise PinError('PIN_LOCKED', f'Too many wrong PINs here. Try again in {LOCK_MINUTES} minutes.', http=429)
    if not pin:
        raise PinError('PIN_NEEDED', 'Type a PIN.', http=400)
    need = ROLE_RANK.get(min_role or '', 0)
    if min_role and not need:
        raise ValueError(f'Unknown role {min_role!r}')
    user = User.objects.filter(register_pin_hash=_hash(pin)).first() if PIN_RE.fullmatch(pin) else None
    if user is not None and can_hold_pin(user) and role_rank(user) >= need:
        cache.delete(_fail_key(device))
        return user
    failures = (cache.get(_fail_key(device)) or 0) + 1
    if failures >= MAX_FAILURES:
        cache.delete(_fail_key(device))
        cache.set(_lock_key(device), True, LOCK_MINUTES * 60)
        raise PinError('PIN_LOCKED', f'Too many wrong PINs. PIN entry here is locked for {LOCK_MINUTES} minutes.',
                       http=429)
    cache.set(_fail_key(device), failures, LOCK_MINUTES * 60)
    wrong = "That PIN is wrong, or it isn't a manager's." if need >= ROLE_RANK['Manager'] else 'That PIN is wrong.'
    raise PinError('PIN_WRONG', wrong, tries_left=MAX_FAILURES - failures)
