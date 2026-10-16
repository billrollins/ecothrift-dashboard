"""
Dash → Users → Members (owner 2026-10-16): every member in one list, and the drawer's actions.

**Stages, nothing else:**
- ``unconfirmed``: signed up, email not confirmed yet. Not listed; deleted after 24 hours (``purge_unconfirmed``).
- ``needs_finalize``: email confirmed; finish at a register (phone, ID, photo).
- ``member``: finalized at a register.
- ``off``: deactivated (Reactivate puts it back) or revoked.

**Rows:** every membership (not practice, not unconfirmed), and, until the legacy cleanup request has run, each old
ecothrift.us customer login with no membership (``legacy``: shown as Needs Finalize, an old account). A staff member's
own membership is a member with a Staff tag; a staff login itself is never a row. Keys: ``a<account>``, ``c<user>``.
"""
from __future__ import annotations

from collections import Counter
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import Lower
from django.utils import timezone

from apps.thriftplus.models import Account, CartMember, LedgerEntry, Person, ReturnRecord

STAGES = {'unconfirmed': 'Unconfirmed', 'needs_finalize': 'Needs Finalize', 'member': 'Member', 'off': 'Off'}
UNCONFIRMED_HOURS = 24


def primary(account: Account) -> Person | None:
    people = [p for p in account.people.all() if p.removed_at is None]
    return next((p for p in people if p.role == Person.ROLE_PRIMARY), people[0] if people else None)


def stage(account: Account, person: Person | None = None) -> str:
    if account.status in (Account.STATUS_INACTIVE, Account.STATUS_REVOKED):
        return 'off'
    if account.status == Account.STATUS_ACTIVE:
        return 'member'
    person = person if person is not None else primary(account)
    return 'needs_finalize' if person is not None and person.email_verified_at else 'unconfirmed'


def _unconfirmed_q() -> Q:
    """Pending memberships whose people never confirmed an email."""
    return Q(status=Account.STATUS_PENDING) & ~Q(people__email_verified_at__isnull=False)


# ── The list ───────────────────────────────────────────────────────────────────

def _legacy_users():
    """Old ecothrift.us customer logins with no membership (linked or by email). Never a staff or system login."""
    from apps.thriftplus.services.one_account import _customer_users

    taken = {e.strip().lower() for e in Person.objects.filter(removed_at__isnull=True).values_list('email', flat=True) if e}
    linked = set(Person.objects.filter(user__isnull=False).values_list('user_id', flat=True))
    return [u for u in _customer_users().select_related('customer')
            if u.pk not in linked and (u.email or '').strip().lower() not in taken]


def rows() -> list[dict]:
    from apps.thriftplus.services import ledger
    from apps.webstore.models import Conversation, Reservation

    accounts = list(Account.objects.filter(is_practice=False).exclude(_unconfirmed_q())
                    .select_related('staff_user').prefetch_related('people'))
    sales = {r['account']: r for r in CartMember.objects.filter(cart__status='completed').values('account')
             .annotate(n=Count('cart'), spent=Sum('cart__total'), last=Max('cart__completed_at'))}
    collected = dict(LedgerEntry.objects.filter(kind=LedgerEntry.KIND_BANK, amount__gt=0, reason__in=('sale', 'rering'))
                     .values_list('account').annotate(s=Sum('amount')))
    returns = Counter(dict(ReturnRecord.objects.values_list('account').annotate(n=Count('pk'))))
    holds = {r['e']: r for r in Reservation.objects.annotate(e=Lower('email')).values('e').annotate(
        total=Count('pk'), active=Count('pk', filter=Q(status__in=Reservation.ACTIVE_STATUSES)))}
    waiting = set(Conversation.objects.filter(state='needs_reply', archived_at__isnull=True)
                  .annotate(e=Lower('guest_email')).values_list('e', flat=True))
    waiting |= set(Conversation.objects.filter(state='needs_reply', archived_at__isnull=True, customer__isnull=False)
                   .annotate(e=Lower('customer__email')).values_list('e', flat=True))

    from apps.thriftplus.models import Card
    from apps.thriftplus.services.cards import display

    # The main member's member code (their QR), newest active one (owner 2026-10-16: See QR in the drawer).
    codes: dict[int, str] = {}
    for pid, code in (Card.objects.filter(status=Card.STATUS_ACTIVE, person__account__in=accounts)
                      .order_by('issued_at', 'pk').values_list('person_id', 'code')):
        codes[pid] = code

    out = []
    for account in accounts:
        person = primary(account)
        code = codes.get(person.pk, '') if person else ''
        email = (person.email if person else '').strip().lower()
        sale = sales.get(account.pk, {})
        hold = holds.get(email, {}) if email else {}
        others = [str(p) for p in account.people.all() if p.removed_at is None and p is not person]
        # The people on the membership, main member first, with their photos (owner 2026-10-16: the avatar circles).
        people = sorted((p for p in account.people.all() if p.removed_at is None), key=lambda p: p is not person)
        out.append({
            'key': f'a{account.pk}', 'kind': 'member', 'account_id': account.pk, 'user_id': None,
            # Member # is the primary person's 12-digit member code, "7166 7172 0440" (owner 2026-10-16); the
            # membership's database id stays internal.
            'number': display(code) if code else '', 'name': (str(person) if person else '') or email or 'No name',
            'second': others[0] if others else '', 'email': person.email if person else '',
            'phone': person.phone if person else '', 'stage': stage(account, person),
            'since': account.created_at, 'bucks': str(ledger.bucks_total(account)),
            'bucks_lifetime': str(collected.get(account.pk) or Decimal('0.00')),
            'credit': str(ledger.credit_balance(account)), 'returns': returns.get(account.pk, 0),
            'sales': sale.get('n', 0), 'spent': str(sale.get('spent') or Decimal('0.00')), 'last_visit': sale.get('last'),
            'holds_active': hold.get('active', 0), 'holds_total': hold.get('total', 0),
            'needs_reply': bool(email and email in waiting), 'notes': account.notes,
            'staff': account.staff_user.full_name if account.staff_user_id else '', 'legacy': False,
            'qr': f'TP{code}' if code else '', 'code_display': display(code) if code else '',
            # A second adult can be added to an active membership that has none (2 adults at most).
            'can_add_person': account.status == Account.STATUS_ACTIVE and not others,
            'photo_url': person.photo.url if person and person.photo else None,
            'people': [{'id': p.pk, 'name': str(p), 'role': p.role, 'photo_url': p.photo.url if p.photo else None}
                       for p in people],
        })
    for user in _legacy_users():
        email = (user.email or '').strip().lower()
        hold = holds.get(email, {})
        profile = getattr(user, 'customer', None)
        out.append({
            'key': f'c{user.pk}', 'kind': 'legacy', 'account_id': None, 'user_id': user.pk,
            'number': profile.customer_number if profile else '', 'name': user.full_name or email, 'second': '',
            'email': user.email, 'phone': user.phone or '',
            'stage': 'needs_finalize' if user.is_active else 'off', 'since': user.date_joined,
            'bucks': '0.00', 'bucks_lifetime': '0.00', 'credit': '0.00', 'returns': 0, 'sales': 0, 'spent': '0.00',
            'last_visit': None, 'holds_active': hold.get('active', 0), 'holds_total': hold.get('total', 0),
            'needs_reply': email in waiting, 'notes': profile.notes if profile else '', 'staff': '', 'legacy': True,
        })
    out.sort(key=lambda r: (r['since'], r['key']), reverse=True)
    return out


# ── 24 hours to confirm the email ──────────────────────────────────────────────

def purge_unconfirmed(*, now=None, dry_run: bool = False) -> int:
    """Delete sign-ups that never confirmed their email within 24 hours and never reached a register (no phone, no
    sales, no ThriftBucks). Run every 10 minutes with ``expire_online_holds``."""
    from django.db import transaction

    from apps.thriftplus.services.delete_member import erase

    cutoff = (now or timezone.now()) - timedelta(hours=UNCONFIRMED_HOURS)
    stale = (Account.objects.filter(_unconfirmed_q(), created_at__lt=cutoff, is_practice=False, staff_user__isnull=True)
             .exclude(people__phone__gt='').exclude(carts__isnull=False).exclude(ledger__isnull=False).distinct())
    ids = list(stale.values_list('pk', flat=True))
    if dry_run:
        return len(ids)
    for pk in ids:
        with transaction.atomic():
            account = Account.objects.select_for_update().filter(pk=pk).first()
            if account is not None:
                erase(account, website=False)
    return len(ids)
