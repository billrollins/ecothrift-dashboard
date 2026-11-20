"""Claim a non-member receipt's ThriftBucks by joining the same day (owner 2026-11-20, Dash Update #204, rulebook B15).

The non-member receipt says "Claim 12.60 ThriftBucks ... Join free today and they are yours." Its QR carries this sale:
``HTTPS://ECOTHRIFT.US/J/<TOKEN>``. Upper case on purpose: the QR packs it as alphanumeric, so the code stays the size
of the member QR (version 3, about 29 mm on the tape) even with the token in it. ``/J/<token>`` opens the join screen
with the token (``ecothrift/urls.py``); once the new member has finished joining, the app sends the token back
(``me/claim-receipt/``) and the sale is re-rung onto them (``register.rering``): the trip's ThriftBucks as kept, usable
from tomorrow, exactly what the register's re-ring gives. ThriftBucks only: the items stay AS IS (no 3-day returns
after the fact).

The token is the sale's id (base 36) and an HMAC of it (12 base-32 characters, 60 bits) under SECRET_KEY: it can't be
guessed from a receipt number, and it names one sale. Refused: another day than the sale's (store time), a sale that
already has a member (so one claim per sale), a sale that is not completed (void, training), a membership not joined
that day, a membership not finished yet, nothing to claim.
"""
from __future__ import annotations

import base64
import re
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac

from apps.thriftplus.models import Account, LedgerEntry

SALT = 'thriftplus.receipt_claim'
SIG_LEN = 12
TOKEN_RE = re.compile(r'^[0-9A-Z]{1,12}[A-Z2-7]{%d}$' % SIG_LEN)
ZERO = Decimal('0')


class ClaimError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ── The token ──────────────────────────────────────────────────────────────────

def _b36(n: int) -> str:
    digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    out = ''
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if n == 0:
            return out


def _sig(pk36: str) -> str:
    raw = salted_hmac(SALT, pk36, secret=settings.SECRET_KEY, algorithm='sha256').digest()
    return base64.b32encode(raw).decode('ascii')[:SIG_LEN]


def token_for(cart_id: int) -> str:
    pk36 = _b36(int(cart_id))
    return pk36 + _sig(pk36)


def cart_id_from(token: str) -> int | None:
    """The sale a token names, or None when it was not made here (case and spaces forgiven)."""
    t = re.sub(r'\s+', '', str(token or '')).upper()
    if not TOKEN_RE.match(t):
        return None
    pk36, sig = t[:-SIG_LEN], t[-SIG_LEN:]
    if not constant_time_compare(sig, _sig(pk36)):
        return None
    return int(pk36, 36)


def claim_url(cart_id: int) -> str:
    """What the receipt's QR opens: ``HTTPS://ECOTHRIFT.US/J/<TOKEN>`` (all alphanumeric-mode characters)."""
    host = (settings.PUBLIC_SITE_CANONICAL_HOST or 'ecothrift.us').upper()
    return f'HTTPS://{host}/J/{token_for(cart_id)}'


# ── Which sales can be claimed ─────────────────────────────────────────────────

def _sale_day(cart):
    return timezone.localdate(cart.completed_at) if cart.completed_at else None


def claimable_bucks(cart) -> Decimal:
    """What joining would add: the trip's full ThriftBucks, worked as the re-ring works them (closed rewards included)."""
    from apps.thriftplus.services import register, trip

    item_lines = [l for l in register._all_lines(cart) if register._is_item(l)]
    if not item_lines:
        return ZERO
    t = trip.totals(register.trip_lines(item_lines, include_closed=True), member=True, choice=trip.CHOICE_BANK)
    return t.full_value


def _check_sale(cart) -> None:
    from apps.thriftplus.services import register

    if cart.status != 'completed' or not cart.completed_at:
        raise ClaimError('NOT_CLAIMABLE', 'This receipt can no longer be claimed.')
    if _sale_day(cart) != timezone.localdate():
        raise ClaimError('TOO_LATE', 'Receipts can be claimed only on the day of the sale.')
    if register.is_training(cart):
        raise ClaimError('NOT_CLAIMABLE', 'This receipt can no longer be claimed.')
    if register.member_of(cart) is not None:
        raise ClaimError('ALREADY_CLAIMED', "This receipt's ThriftBucks are already on a Thrift+ account.")


def url_for_receipt(cart) -> str:
    """The claim link for a finished non-member sale's receipt, or "" (another day, a member on it, nothing to claim).
    Never raises: the receipt then gets the plain join QR."""
    try:
        _check_sale(cart)
        if claimable_bucks(cart) <= 0:
            return ''
        return claim_url(cart.pk)
    except ClaimError:
        return ''
    except Exception:  # pragma: no cover - a receipt must always print
        return ''


# ── The claim ──────────────────────────────────────────────────────────────────

def claim(person, token: str) -> Decimal:
    """Put ``person`` (signed in on the app) on the sale ``token`` names, as a re-ring. Answers the ThriftBucks added.
    Raises ClaimError (BAD_TOKEN, NOT_CLAIMABLE, TOO_LATE, ALREADY_CLAIMED, NOT_NEW, NOT_FINISHED, NOTHING)."""
    from apps.pos.models import Cart
    from apps.thriftplus.services import members, register

    cart_id = cart_id_from(token)
    if cart_id is None:
        raise ClaimError('BAD_TOKEN', "That receipt link didn't work.")
    account = person.account
    if person.removed_at is not None or account.status == Account.STATUS_PENDING:
        raise ClaimError('NOT_FINISHED', 'Finish joining first, then your ThriftBucks are added.')
    if account.status != Account.STATUS_ACTIVE or account.is_practice:
        raise ClaimError('NOT_CLAIMABLE', 'This receipt can no longer be claimed.')
    with transaction.atomic():
        cart = Cart.objects.select_for_update().filter(pk=cart_id).first()
        if cart is None:
            raise ClaimError('BAD_TOKEN', "That receipt link didn't work.")
        _check_sale(cart)
        # Joining that day is the offer ("Join free today and they are yours"); an older membership keeps the
        # register's 30-minute re-ring. Stops a found receipt being claimed onto an existing account.
        if timezone.localdate(account.created_at) != _sale_day(cart):
            raise ClaimError('NOT_NEW', 'This is for new members who join the day of the sale.')
        if claimable_bucks(cart) <= 0:
            raise ClaimError('NOTHING', 'This trip has no ThriftBucks to claim.')
        try:
            member = register.rering(cart, person=person.pk, window=timedelta(days=1))
        except register.RegisterError as exc:
            if exc.code == 'MEMBER_PENDING':
                raise ClaimError('NOT_FINISHED', 'Finish joining first, then your ThriftBucks are added.') from None
            if exc.code == 'ALREADY_MEMBER':
                raise ClaimError('ALREADY_CLAIMED', "This receipt's ThriftBucks are already on a Thrift+ account.") from None
            raise ClaimError('NOT_CLAIMABLE', 'This receipt can no longer be claimed.') from None
        added = sum((e.amount for e in LedgerEntry.objects.filter(cart_id=cart.pk, account=account, reason='rering',
                                                                    kind=LedgerEntry.KIND_BANK)), ZERO)
        members.log('receipt_claim', account=account, person=person, card=member.card, cart=cart.pk,
                    bucks=str(added))
    return added
