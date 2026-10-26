"""
Delete a Thrift+ customer for good (owner 2026-10-16): "as if they never existed". For testing, when staff sign each
other up and then clean up; **Deactivate** (``members.deactivate``) is the normal way to take a member off. Superuser
only, from Dash → Thrift+ → Members.

- ``preview`` finds everything the customer left: the people on the membership, register sales (their total),
  ThriftBucks and Thrift+ credit, ledger rows, returns, scans, history, sign-ins, consent records and the website side
  (the customer login with the same email, holds, orders, conversations). The confirm dialog shows it, and the person
  deleting types the member's name.
- ``delete`` removes all of it in one transaction. A paid sale is undone first, like a void: its cash comes back out
  of the drawer (when the drawer is still open) and its items go back on the shelf. Then the sale itself is deleted.
  An active hold gives its stock back to the listing; no email goes out.
- **Staff logins are kept.** A staff member's own membership can be deleted (the staff wipe, owner 2026-10-16), but
  their Dash login, and the website customer account on it, stay; ``staff_members.ensure_staff_membership`` makes them
  a fresh membership.
"""
from __future__ import annotations

import re
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Sum

from apps.thriftplus.models import (
    Account,
    AppCart,
    Card,
    CartMember,
    Event,
    LedgerEntry,
    MemberEmailToken,
    MemberLogin,
    MemberSession,
    Person,
    ReturnRecord,
    ScanSignal,
)
from apps.thriftplus.services import ledger
from apps.thriftplus.services.members import MemberError


def _norm(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip()).lower()


def display_name(account: Account) -> str:
    """The name to type: the primary person's first and last name."""
    person = account.people.filter(role=Person.ROLE_PRIMARY).order_by('pk').first() or account.people.order_by('pk').first()
    return str(person) if person else f'Member {account.pk}'


def _people(account: Account):
    return Person.objects.filter(account=account)


def _emails(account: Account) -> list[str]:
    emails = set(e.strip().lower() for e in _people(account).values_list('email', flat=True) if e and e.strip())
    emails |= set(e.lower() for e in MemberLogin.objects.filter(person__account=account).values_list('email', flat=True))
    return sorted(emails)


def _phones(account: Account) -> list[str]:
    return sorted({p for p in _people(account).values_list('phone', flat=True) if p})


def _refs(account: Account) -> list[str]:
    return [f'thriftplus.person:{pk}' for pk in _people(account).values_list('pk', flat=True)]


def _customer_logins(account: Account, emails: list[str]):
    """The member's website customer logins (linked, or with their email); only real customer logins (a customer record
    or the Customer group), never a staff login (staff, consignee or superuser) or a system login."""
    from apps.accounts.services.staff_customer import is_customer, is_staff_login

    q = Q(thrift_plus_person__account=account)  # the linked login (one account, 2026-10-16)
    for e in emails:
        q |= Q(email__iexact=e)
    users = get_user_model().objects.filter(q).distinct()
    if account.staff_user_id:
        users = users.exclude(pk=account.staff_user_id)
    return [u for u in users if not is_staff_login(u) and is_customer(u)]


def _cart_ids(account: Account) -> list[int]:
    return list(CartMember.objects.filter(account=account).values_list('cart_id', flat=True))


def _website(emails: list[str]) -> dict:
    """Querysets on the website side, kept by email (holds, orders, guest conversations, emailed links)."""
    from apps.accounts.models import MagicLinkToken
    from apps.webstore.models import Conversation, HoldConfirmation, Order, Reservation

    def by(model, field):
        if not emails:
            return model.objects.none()
        q = Q()
        for e in emails:
            q |= Q(**{f'{field}__iexact': e})
        return model.objects.filter(q)

    return {
        'holds': by(Reservation, 'email'),
        'hold_confirmations': by(HoldConfirmation, 'email'),
        'orders': by(Order, 'email'),
        'conversations': by(Conversation, 'guest_email'),
        'links': by(MagicLinkToken, 'email'),
    }


def _consents(account: Account, emails: list[str], *, staff_email: str = ''):
    """Email and text consent records: those made from this member's people, plus any for the customer's own email
    and phone. A staff member's email consents stay (their login stays)."""
    from apps.texting.models import EmailConsent, TextConsent

    refs = _refs(account)
    mail = Q(ref__in=refs)
    for e in emails:
        if e != staff_email:
            mail |= Q(email=e)
    text = Q(ref__in=refs)
    if not account.staff_user_id:
        phones = _phones(account)
        if phones:
            text |= Q(phone__in=phones)
    return EmailConsent.objects.filter(mail), TextConsent.objects.filter(text)


def preview(account: Account) -> dict:
    """Everything a delete would remove, in counts, for the confirm dialog. Changes nothing."""
    from apps.pos.models import Cart

    emails = _emails(account)
    staff_email = (account.staff_user.email or '').lower() if account.staff_user_id else ''
    carts = Cart.objects.filter(pk__in=_cart_ids(account))
    paid = carts.filter(status='completed')
    logins = _customer_logins(account, emails)
    site = _website(emails)
    email_consents, text_consents = _consents(account, emails, staff_email=staff_email)
    balances = ledger.balances(account)
    return {
        'account': account.pk,
        'name': display_name(account),
        'status': account.status,
        'is_practice': account.is_practice,
        'staff_member': account.staff_user.full_name if account.staff_user_id else '',
        'people': [{'id': p.pk, 'name': str(p), 'email': p.email, 'phone': p.phone, 'role': p.role} for p in _people(account)],
        'emails': emails,
        'sales': carts.count(),
        'paid_sales': paid.count(),
        'sales_total': str(paid.aggregate(t=Sum('total'))['t'] or Decimal('0.00')),
        'training_sales': carts.filter(status='training').count(),
        'bucks': balances['banked'],
        'credit': balances['credit'],
        'ledger_rows': LedgerEntry.objects.filter(account=account).count(),
        'returns': ReturnRecord.objects.filter(account=account).count(),
        'scans': ScanSignal.objects.filter(account=account).count(),
        'history': Event.objects.filter(account=account).count(),
        'member_codes': Card.objects.filter(person__account=account).count(),
        'sign_ins': MemberSession.objects.filter(person__account=account).count(),
        'passwords': MemberLogin.objects.filter(person__account=account).count(),
        'consents': email_consents.count() + text_consents.count(),
        'website_logins': [{'id': u.pk, 'email': u.email, 'name': u.full_name} for u in logins],
        'holds': site['holds'].count(),
        'active_holds': site['holds'].filter(status__in=_active_hold_statuses()).count(),
        'orders': site['orders'].count(),
        'conversations': site['conversations'].count(),
    }


def _active_hold_statuses():
    from apps.webstore.models import Reservation

    return Reservation.ACTIVE_STATUSES


def _undo_sale(cart) -> int:
    """Like a void (``pos.views.CartViewSet.void``) without the ledger: the cash comes back out of an open drawer and
    the items go back on the shelf, unless another paid sale holds them. Returns how many items went back."""
    from apps.pos.models import CartLine, Drawer
    from apps.pos.views import _cancel_delivery_jobs_for_cart, _sale_cash

    back = 0
    if cart.status == 'completed':
        if cart.payment_method in ('cash', 'split'):
            drawer = Drawer.objects.select_for_update().get(pk=cart.drawer_id)
            if drawer.status == 'open':
                drawer.cash_sales_total -= _sale_cash(cart)
                drawer.save(update_fields=['cash_sales_total'])
        for line in cart.lines.filter(item__isnull=False).select_related('item'):
            item = line.item
            elsewhere = CartLine.objects.filter(item=item, cart__status='completed').exclude(cart=cart).exists()
            if item.status == 'sold' and not elsewhere:
                item.status = 'on_shelf'
                item.sold_at = None
                item.sold_for = None
                item.sold_net = item.thriftbucks_at_sale = None
                item.save()
                back += 1
    _cancel_delivery_jobs_for_cart(cart)
    return back


def _drop_holds(holds) -> int:
    """Give an active hold's stock back to its listing (no email), then delete every hold."""
    from apps.webstore.models import WebListing

    for hold in holds.filter(status__in=_active_hold_statuses()):
        listing = WebListing.objects.select_for_update().get(pk=hold.listing_id)
        listing.reserved = max(0, listing.reserved - hold.quantity)
        listing.sync_stock_mirror()
        listing.save(update_fields=['reserved', 'stock', 'updated_at'])
    return holds.delete()[0]


@transaction.atomic
def delete(account: Account, *, typed_name: str, actor=None) -> dict:
    """Delete the membership and everything it left. ``typed_name`` must match the member's name (case and spaces
    don't matter). Returns what was removed."""
    account = Account.objects.select_for_update().get(pk=account.pk)
    name = display_name(account)
    if _norm(typed_name) != _norm(name):
        raise MemberError(f'Type the member\'s name exactly: {name}')
    return erase(account, actor=actor)


def erase(account: Account, *, actor=None, website: bool = True) -> dict:
    """The delete itself, with no name check (``delete``, and the staff wipe). Run inside a transaction.
    ``website=False`` (the 24-hour purge of unconfirmed sign-ups) deletes the membership only: an ecothrift.us login,
    holds or consents with the same email are someone's real account and stay."""
    from apps.pos.models import Cart

    name = display_name(account)
    summary = preview(account)
    emails = _emails(account)
    staff_email = (account.staff_user.email or '').lower() if account.staff_user_id else ''
    logins = _customer_logins(account, emails)
    site = _website(emails)
    email_consents, text_consents = _consents(account, emails, staff_email=staff_email)
    people = list(_people(account).values_list('pk', flat=True))

    # The register: returns hold their sale lines, so they go first; then each sale is undone and deleted.
    ReturnRecord.objects.filter(account=account).delete()
    items_back = 0
    for cart in Cart.objects.select_for_update().filter(pk__in=_cart_ids(account)):
        items_back += _undo_sale(cart)
        cart.delete()
    LedgerEntry.objects.filter(account=account).delete()
    ScanSignal.objects.filter(account=account).delete()
    AppCart.objects.filter(account=account).delete()

    # Sign-ins and member codes, then the people and the membership (its history goes with it).
    MemberSession.objects.filter(person_id__in=people).delete()
    MemberEmailToken.objects.filter(person_id__in=people).delete()
    MemberLogin.objects.filter(person_id__in=people).delete()
    Card.objects.filter(person_id__in=people).delete()
    Event.objects.filter(Q(account=account) | Q(person_id__in=people)).delete()
    if website:
        email_consents.delete()
        text_consents.delete()
    for person in Person.objects.filter(pk__in=people):
        for f in (person.photo, person.signature):
            if f:
                f.delete(save=False)
    Person.objects.filter(pk__in=people).delete()
    account.delete()

    # The website side: holds, orders, conversations and emailed links by email, then the customer login itself.
    if website:
        _drop_holds(site['holds'])
        site['hold_confirmations'].delete()
        site['orders'].delete()
        site['conversations'].delete()
        site['links'].delete()
        for user in logins:
            user.delete()

    # Who deleted whom stays in the server log only (the membership's own history is gone with it).
    import logging

    logging.getLogger(__name__).warning('Thrift+ member %s (%s) deleted by %s: %s', summary['account'], name,
                                        getattr(actor, 'pk', None), {k: summary[k] for k in ('sales', 'returns', 'holds')})
    return {**summary, 'items_back': items_back, 'deleted': True}


def staff_accounts():
    """Every staff membership; the customer memberships merged into one (they end revoked, MERGED_REASON); and any
    customer membership with an active staff member's Dash email (staff signing each other up while testing)."""
    from apps.thriftplus.services.staff_members import MERGED_REASON, staff_users

    emails = [e.strip().lower() for e in staff_users().values_list('email', flat=True) if e]
    return Account.objects.filter(Q(staff_user__isnull=False) | Q(revoked_reason__startswith=MERGED_REASON)
                                  | Q(people__email__in=emails)).distinct()


def staff_wipe_preview() -> dict:
    accounts = list(staff_accounts())
    rows = [preview(a) for a in accounts]
    total = lambda key: sum(int(r[key]) for r in rows)  # noqa: E731
    return {
        'memberships': len(rows),
        'sales': total('sales'), 'returns': total('returns'), 'scans': total('scans'), 'ledger_rows': total('ledger_rows'),
        'rows': [{'account': r['account'], 'name': r['name'], 'staff_member': r['staff_member'], 'sales': r['sales'],
                  'bucks': r['bucks'], 'credit': r['credit']} for r in rows],
    }


WIPE_WORDS = 'START FRESH'


@transaction.atomic
def staff_wipe(*, typed: str, actor=None) -> dict:
    """Owner 2026-10-16 ("wipe, keep auto-make"): delete every staff membership and everything on it, then make each
    active staff member a fresh, empty one. Staff Dash logins are never touched."""
    from apps.thriftplus.services import staff_members

    if _norm(typed) != _norm(WIPE_WORDS):
        raise MemberError(f'Type {WIPE_WORDS} to go ahead.')
    ids = list(staff_accounts().values_list('pk', flat=True))
    deleted = [erase(Account.objects.select_for_update().get(pk=pk), actor=actor)['account'] for pk in ids]
    made = staff_members.create_missing(actor=actor)
    return {'deleted': len(deleted), **made}


# ── From a website customer (Dash → Users → Customers, owner 2026-10-16) ─────────

def _site_only_preview(user) -> dict:
    emails = [user.email.strip().lower()] if (user.email or '').strip() else []
    site = _website(emails)
    return {
        'account': None, 'name': user.full_name or user.email, 'status': 'website', 'is_practice': False, 'staff_member': '',
        'people': [], 'emails': emails, 'sales': 0, 'paid_sales': 0, 'sales_total': '0.00', 'training_sales': 0,
        'bucks': '0.00', 'credit': '0.00', 'ledger_rows': 0, 'returns': 0, 'scans': 0, 'history': 0, 'member_codes': 0,
        'sign_ins': 0, 'passwords': 0, 'consents': 0,
        'website_logins': [{'id': user.pk, 'email': user.email, 'name': user.full_name}],
        'holds': site['holds'].count(), 'active_holds': site['holds'].filter(status__in=_active_hold_statuses()).count(),
        'orders': site['orders'].count(), 'conversations': site['conversations'].count(),
    }


def _customer_only(user):
    from apps.accounts.services.staff_customer import is_customer, is_staff_login

    if is_staff_login(user):
        raise MemberError('This is a staff login. Staff are switched off in People, never deleted here.')
    if not is_customer(user):
        raise MemberError('This is not a customer login.')


def preview_customer(user) -> dict:
    """What deleting a website customer removes: their Thrift+ membership and everything on it (one account), or only
    the website side when they have no membership."""
    from apps.thriftplus.services.one_account import find_person

    _customer_only(user)
    person = find_person(user)
    return preview(person.account) if person is not None else _site_only_preview(user)


@transaction.atomic
def delete_customer(user, *, typed_name: str, actor=None) -> dict:
    """Delete a website customer for good, the same as deleting their membership: ``typed_name`` must match."""
    from apps.thriftplus.services.one_account import find_person

    _customer_only(user)
    person = find_person(user)
    if person is not None:
        if person.user_id is None:  # found by email: link it, so the delete takes this login too
            person.user = user
            person.save(update_fields=['user', 'updated_at'])
        return delete(person.account, typed_name=typed_name, actor=actor)
    name = user.full_name or user.email
    if _norm(typed_name) != _norm(name):
        raise MemberError(f'Type the customer\'s name exactly: {name}')
    summary = _site_only_preview(user)
    site = _website(summary['emails'])
    _drop_holds(site['holds'])
    site['hold_confirmations'].delete()
    site['orders'].delete()
    site['conversations'].delete()
    site['links'].delete()
    user.delete()
    import logging

    logging.getLogger(__name__).warning('website customer %s deleted by %s', summary['emails'], getattr(actor, 'pk', None))
    return {**summary, 'items_back': 0, 'deleted': True}
