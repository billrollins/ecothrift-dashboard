"""
The member card (owner 2026-10-20): one person's Thrift+ standing on one screen, for the register's "Thrift+ member"
button and the Members page in Dash (``GET thriftplus/register/member/?person=<id>``).

Their photo and status (pending / member / off), the ThriftBucks they collected, used and still have (with the use-by date),
Thrift+ credit, their returns lately (with the owner's W14 warning), their recent trips (date, ticket number, total) and the
people on the membership. Staff screens only.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry, Person
from apps.thriftplus.services import ledger, register
from apps.thriftplus.services.returns import recent_returns

ZERO = Decimal('0.00')
TRIPS = 8


def _money(value) -> str:
    return str((value or ZERO).quantize(Decimal('0.01')))


def rewards(account: Account) -> dict:
    """ThriftBucks collected and used on this membership (a voided sale counts for neither), what is left with its soonest
    use-by date, and Thrift+ credit."""
    bank = LedgerEntry.objects.filter(account=account, kind=LedgerEntry.KIND_BANK, reverses__isnull=True, reversed_by__isnull=True)
    collected = bank.filter(reason__in=('sale', 'rering'), amount__gt=0).aggregate(s=Sum('amount'))['s']
    used = bank.filter(reason='spend').aggregate(s=Sum('amount'))['s']
    now = ledger.balances(account)
    return {
        'collected': _money(collected), 'used': _money(-(used or ZERO)), 'balance': now['banked'], 'usable_today': now['available'],
        'use_by': now['bucks_use_by'], 'credit': now['credit'],
    }


def trips(account: Account, *, limit: int = TRIPS) -> list[dict]:
    """The newest finished sales on this membership: day, ticket number (the receipt's), items and total."""
    from apps.pos.models import Cart

    carts = (Cart.objects.filter(thrift_member__account=account, status='completed').select_related('receipt')
             .order_by('-completed_at', '-pk')[:limit])
    rows = []
    for cart in carts:
        receipt = getattr(cart, 'receipt', None)
        rows.append({
            'cart_id': cart.pk, 'ticket': receipt.receipt_number if receipt is not None else f'#{cart.pk}',
            'date': timezone.localdate(cart.completed_at).isoformat() if cart.completed_at else None,
            'items': sum(l.quantity or 0 for l in cart.lines.filter(line_kind='item')), 'total': _money(cart.total),
        })
    return rows


def on_membership(account: Account) -> list[dict]:
    people = Person.objects.filter(account=account, removed_at__isnull=True).order_by('role', 'pk')
    return [{'person_id': p.pk, 'first_name': p.first_name, 'name': f'{p.first_name} {p.last_name}'.strip(), 'role': p.role,
             'photo_url': p.photo.url if p.photo else None, 'verified_18': p.verified_18} for p in people]


# The Member window's history (Dash Updates #16): only what changes a member's standing, newest first. Never the
# event detail (a phone number, ID or signature steps), never sales (Trips) or sign-in codes.
HISTORY_ACTIONS = (
    'joined_online', 'joined_website', 'signup', 'finished_joining', 'staff_membership', 'second_added',
    'phone_added', 'return', 'return_late_ok', 'deactivated',
)
HISTORY_LIMIT = 10


def history(account: Account) -> list[dict]:
    from apps.thriftplus.models import Event

    rows = (Event.objects.filter(account=account, action__in=HISTORY_ACTIONS).select_related('actor', 'person')
            .order_by('-created_at')[:HISTORY_LIMIT])
    return [{
        'action': e.action, 'at': e.created_at.isoformat(),
        'person': e.person.first_name if e.person_id else None,
        # Who did it, when it was the team (a member's own steps say nobody).
        'by': e.actor.full_name if e.actor_id and (e.actor.is_superuser or e.actor.role in ('Employee', 'Manager', 'Admin')) else None,
    } for e in rows]


def returns_list(account: Account) -> list[dict]:
    """Every return on the membership, newest first: day, the item, the credit given, waiting or handled."""
    from apps.thriftplus.models import ReturnRecord

    rows = ReturnRecord.objects.filter(account=account).select_related('cart_line', 'person').order_by('-created_at')[:20]
    return [{'at': r.created_at.isoformat(), 'cart_id': r.cart_line.cart_id, 'item': r.cart_line.description,
             'person': r.person.first_name,
             'credit': _money(r.credit), 'status': r.status} for r in rows]


def card(person: Person, *, window: bool = False) -> dict:
    """Everything the member card shows for one person; ``window`` adds the Member window's history, returns and
    trip count (Dash Updates #16)."""
    account = person.account
    body = {
        'person': {**register.finalize_row(person), 'name': f'{person.first_name} {person.last_name}'.strip(),
                   'standing': register.standing(person), 'role': person.role, 'practice': bool(account.is_practice)},
        'rewards': rewards(account),
        # W14: return trips in the owner's window, with a warning at the owner's number (never a block).
        'returns': recent_returns(account),
        'trips': trips(account),
        'people': on_membership(account),
    }
    if window:
        from apps.pos.models import Cart

        body['window'] = {
            'joined_at': account.created_at.isoformat(),
            'trip_count': Cart.objects.filter(thrift_member__account=account, status='completed').count(),
            'returns': returns_list(account),
            'history': history(account),
        }
    return body
