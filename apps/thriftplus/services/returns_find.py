"""
The Returns page's Find and receipt (owner 2026-10-20): one box finds the receipt by ANY of

- the person: their member QR, member #, phone, email or name (then their recent tickets, newest first);
- the ticket: the receipt # as printed (``R-20261020-014``, or just ``14`` for today's), a date, or the total;
- an item: its tag SKU, or words from its description (the ticket or tickets it is on).

Every step is one indexed lookup with a short limit (cards, receipt number, SKU, ``status`` + ``completed_at``, the
sale's lines by item). ``receipt`` then opens one ticket split into Returnable (still in the 3 days, or late) and AS IS.
Training (the TRAIN register) also sees practice sales and writes nothing (``returns.batch``).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from django.utils import timezone

from apps.thriftplus.models import CartMember, Person, ReturnRecord, SalePhoto
from apps.thriftplus.services import cards, ledger, register, returns

TICKET_LIMIT = 15
PEOPLE_LIMIT = 8
WORDS_DAYS = 30  # words from an item's description: sales of the last 30 days
AMOUNT_DAYS = 90  # a total or a date: sales of the last 90 days
RECEIPT_RE = re.compile(r'^(?:R|TRAIN)-\d{8}(?:-\d+)?$', re.I)
AMOUNT_RE = re.compile(r'^\$?\s*\d{1,6}\.\d{1,2}$|^\$\s*\d{1,6}$')


def statuses(training: bool) -> list[str]:
    return ['completed', 'training'] if training else ['completed']


def _carts(training: bool):
    """Finished sales with what a ticket row shows, newest first."""
    from apps.pos.models import Cart

    return (Cart.objects.filter(status__in=statuses(training), completed_at__isnull=False)
            .select_related('receipt', 'cashier', 'thrift_member__person')
            .annotate(item_count=Count('lines', filter=Q(lines__line_kind='item'))).order_by('-completed_at', '-pk'))


def ticket_row(cart) -> dict:
    receipt = getattr(cart, 'receipt', None)
    member = getattr(cart, 'thrift_member', None)
    return {
        'cart': cart.pk, 'receipt_number': receipt.receipt_number if receipt else f'Sale {cart.pk}',
        'completed_at': cart.completed_at, 'items': getattr(cart, 'item_count', None), 'total': str(cart.total),
        'member': f'{member.person.first_name} {member.person.last_name}'.strip() if member else '',
        'practice': cart.status == 'training',
    }


def _person_row(person: Person) -> dict:
    return {
        'person_id': person.pk, 'account_id': person.account_id, 'first_name': person.first_name,
        'last_name': person.last_name, 'name': f'{person.first_name} {person.last_name}'.strip(),
        'photo_url': person.photo.url if person.photo else None, 'status': person.account.status, 'role': person.role,
        'phone_last4': person.phone[-4:] if person.phone else None, 'contact': register.contact(person),
    }


def _person_tickets(person: Person, training: bool) -> list[dict]:
    return [ticket_row(c) for c in _carts(training).filter(thrift_member__account_id=person.account_id)[:TICKET_LIMIT]]


def _parse_date(q: str) -> date | None:
    """2026-10-20, 10/20, 10/20/26 or 10/20/2026 (the year left out is this year, or last when that is ahead)."""
    today = timezone.localdate()
    text = q.strip()
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    m = re.fullmatch(r'(\d{1,2})[/-](\d{1,2})', text)
    if m:
        try:
            day = date(today.year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            return None
        return day if day <= today else date(today.year - 1, day.month, day.day)
    return None


def _answer(kind: str, *, tickets=None, people=None, person=None, message: str = '', training: bool = False) -> dict:
    """One answer. A single ticket opens at once (``receipt``): the next step needs no second request."""
    tickets = tickets or []
    body = {'kind': kind, 'people': people or [], 'person': person, 'tickets': tickets, 'message': message, 'receipt': None}
    if len(tickets) == 1 and kind != 'person' and not people:
        body['receipt'] = receipt(tickets[0]['cart'], training=training)
    return body


def find(q: str = '', *, person=None, training: bool = False) -> dict:
    """The Returns page's Find. ``person`` (an id, picked from an earlier answer) lists that member's tickets."""
    q = (q or '').strip()
    today = timezone.localdate()
    if person not in (None, ''):
        p = Person.objects.select_related('account').filter(pk=person, removed_at__isnull=True).first()
        if p is None:
            return _answer('none', message='That member is not in the system.')
        return _answer('person', tickets=_person_tickets(p, training), person=_person_row(p), training=training)
    if not q:
        return _answer('none', message='Scan the receipt or an item tag, or type a name, phone, ticket # or date.')

    # 1. A member QR or member # (12 digits, Luhn): their tickets.
    code = cards.parse(q)
    if code:
        p = Person.objects.select_related('account').filter(cards__code=code, removed_at__isnull=True).first()
        if p is None:
            return _answer('none', message="That member code isn't in the system.")
        return _answer('person', tickets=_person_tickets(p, training), person=_person_row(p), training=training)

    # 2. A ticket #: as printed, or just today's number.
    receipt_no = None
    if RECEIPT_RE.match(q):
        receipt_no = q.upper()
    elif re.fullmatch(r'\d{1,4}', q):
        receipt_no = f'R-{today:%Y%m%d}-{int(q):03d}'
    if receipt_no:
        found = list(_carts(training).filter(receipt__receipt_number=receipt_no)[:1])
        if not found and re.fullmatch(r'(?:R|TRAIN)-\d{8}', receipt_no):  # a whole day's tickets
            found = []
            tickets = [ticket_row(c) for c in _carts(training).filter(receipt__receipt_number__startswith=f'{receipt_no}-')[:30]]
            return _answer('ticket', tickets=tickets, message='' if tickets else 'No tickets that day.', training=training)
        if found:
            return _answer('ticket', tickets=[ticket_row(found[0])], training=training)
        return _answer('none', message=f'No ticket {receipt_no}. Check the number on the receipt.')

    # 3. An item's tag SKU: the tickets it is on.
    from apps.inventory.models import Item

    item = Item.objects.filter(sku__iexact=q).first() if re.fullmatch(r'[A-Za-z0-9-]{3,20}', q) and re.search(r'[A-Za-z]', q) else None
    if item is not None:
        ids = list(_item_cart_ids(item, training))
        tickets = [ticket_row(c) for c in _carts(training).filter(pk__in=ids)[:TICKET_LIMIT]]
        return _answer('item', tickets=tickets, training=training,
                       message='' if tickets else f'{item.sku} is not on a sale ticket yet.')

    # 4. A date.
    when = _parse_date(q)
    if when is not None:
        start = timezone.make_aware(datetime.combine(when, datetime.min.time()))
        tickets = [ticket_row(c) for c in _carts(training).filter(completed_at__gte=start, completed_at__lt=start + timedelta(days=1))[:30]]
        return _answer('date', tickets=tickets, training=training, message='' if tickets else 'No sales that day.')

    # 5. A total ($12.34, 12.34 or $12).
    if AMOUNT_RE.match(q):
        try:
            amount = Decimal(q.replace('$', '').strip())
        except InvalidOperation:
            amount = None
        if amount is not None:
            since = timezone.now() - timedelta(days=AMOUNT_DAYS)
            tickets = [ticket_row(c) for c in _carts(training).filter(total=amount, completed_at__gte=since)[:TICKET_LIMIT]]
            return _answer('total', tickets=tickets, training=training, message='' if tickets else f'No sale of ${amount} lately.')

    # 6. A person by phone, email or name, and items by words from their description.
    people_qs = register.find_people_qs(q)
    people = [_person_row(p) for p in (people_qs[:PEOPLE_LIMIT] if people_qs is not None else [])]
    tickets = []
    digits_only = not any(ch.isalpha() for ch in q)
    if not digits_only and '@' not in q:
        tickets = _word_tickets(q, training)
    if len(people) == 1 and not tickets:
        only = Person.objects.select_related('account').get(pk=people[0]['person_id'])
        return _answer('person', tickets=_person_tickets(only, training), person=people[0], training=training)
    message = '' if (people or tickets) else 'Nothing found. Try the ticket #, a phone number or words from the item.'
    return _answer('words' if tickets else 'people', tickets=tickets, people=people, message=message, training=training)


def _item_cart_ids(item, training: bool):
    from apps.pos.models import CartLine

    return (CartLine.objects.filter(item_id=item.pk, cart__status__in=statuses(training), cart__completed_at__isnull=False)
            .order_by('-cart__completed_at').values_list('cart_id', flat=True)[:TICKET_LIMIT])


def _word_tickets(q: str, training: bool) -> list[dict]:
    """Tickets with a line whose description has all the words (the last 30 days)."""
    from apps.pos.models import CartLine

    words = [w for w in re.split(r'\s+', q) if len(w) >= 2][:4]
    if not words:
        return []
    since = timezone.now() - timedelta(days=WORDS_DAYS)
    lines = CartLine.objects.filter(cart__status__in=statuses(training), cart__completed_at__gte=since, line_kind='item')
    for word in words:
        lines = lines.filter(description__icontains=word)
    ids = list(lines.order_by('-cart__completed_at').values_list('cart_id', flat=True)[:TICKET_LIMIT * 3])
    unique = list(dict.fromkeys(ids))[:TICKET_LIMIT]
    return [ticket_row(c) for c in _carts(training).filter(pk__in=unique)]


def acting_person(member, picked=None):
    """The person the return is for: the one picked, else who the sale was rung for, else anyone still on the membership."""
    if picked not in (None, ''):
        return picked
    if member.person.removed_at is None:
        return member.person_id
    other = (Person.objects.filter(account_id=member.account_id, removed_at__isnull=True)
             .order_by('role', 'pk').values_list('pk', flat=True).first())
    return other or member.person_id


# ── One ticket, open (Step 2) ──────────────────────────────────────────────────


def receipt(cart_id: int, *, training: bool = False) -> dict | None:
    """The ticket split into Returnable (in the 3 days, or late) and AS IS (greyed, with the reason). None when there is no
    such finished sale."""
    from apps.pos.models import Cart, CartLine

    cart = (Cart.objects.filter(pk=cart_id, status__in=statuses(training), completed_at__isnull=False)
            .select_related('receipt', 'cashier').first())
    if cart is None:
        return None
    today = timezone.localdate()
    sold_on = timezone.localdate(cart.completed_at)
    last = returns.deadline(sold_on)
    member = CartMember.objects.filter(cart_id=cart.pk).select_related('account', 'person').first()
    account = member.account if member else None
    lines = list(CartLine.objects.filter(cart_id=cart.pk, line_kind='item').select_related('cart', 'item__product__profile').order_by('pk'))
    returned = {r.cart_line_id: r for r in ReturnRecord.objects.filter(cart_line_id__in=[l.pk for l in lines])}
    photos = {}
    for sp in SalePhoto.objects.filter(cart_line_id__in=[l.pk for l in lines]):
        photos.setdefault(sp.cart_line_id, []).append(sp.photo.url)
    rules = returns.guide()
    rows = []
    for line in lines:
        parts = returns.refund_parts(line, rules=rules)
        row = {
            'cart_line': line.pk, 'sku': line.item.sku if line.item_id else '', 'title': line.description,
            'quantity': line.quantity, 'price': str(line.line_total), 'mark': parts['mark'],
            'refund': str(parts['refund']), 'bucks_back': str(parts['bucks_back']), 'bucks_take': str(parts['bucks_take']),
            'photos': photos.get(line.pk, []), 'state': 'as_is', 'late': False, 'why': '',
        }
        if line.pk in returned:
            done = returned[line.pk]
            row.update(state='returned', why=f'Already returned {done.created_at:%b} {done.created_at.day}.')
        elif account is None:
            row['why'] = 'Not sold to a Thrift+ member. All sales final.'
        else:
            issues = returns.problems(line, account, today, training=training, parts=parts)
            if not issues:
                row['state'] = 'returnable'
            elif not returns.problems(line, account, today, late_ok=True, training=training, parts=parts):
                row.update(state='returnable', late=True)  # only the 3 days stand in the way
            else:
                row['why'] = ' '.join(issues)
        rows.append(row)
    return {
        'cart': cart.pk, 'practice': cart.status == 'training',
        'receipt_number': cart.receipt.receipt_number if getattr(cart, 'receipt', None) else f'Sale {cart.pk}',
        'completed_at': cart.completed_at, 'total': str(cart.total), 'tax': str(cart.tax_amount),
        'cashier': (cart.cashier.full_name or cart.cashier.email) if cart.cashier else '',
        'deadline': last.isoformat(), 'late': today > last, 'closed_note': returns.closed_note(sold_on),
        'member': None if member is None else {
            'person_id': member.person_id, 'account_id': member.account_id,
            'name': f'{member.person.first_name} {member.person.last_name}'.strip(),
            'photo_url': member.person.photo.url if member.person.photo else None,
            **(ledger.balances(account) if account else {}),
        },
        'lines': rows,
    }
