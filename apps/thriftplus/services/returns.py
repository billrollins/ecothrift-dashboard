"""
Thrift+ member returns (thrift_plus_rewards Phase 3). The owner's rules (2026-09-25):
- **Members only**, for items bought while a member: the sale carried a card on this membership.
  Guests: all sales final.
- **Primary-function failure only.** Not cosmetic issues, secondary functions, missing parts or
  remorse. The cashier confirms it.
- **Excluded:** as-is, for parts, untested, clothing and soft goods, 18+, crossbows. The categories
  and words are settings.
- **The window:** 3 calendar days after the sale, closing at the end of day 3. If the store is closed
  on day 3, it runs to the end of the next open day.
- **The refund** is store credit for 95% of what was paid for the line, before tax (the owner,
  2026-09-25: the 5% is the cost of not testing in the store; the setting is
  ``thrift_plus_return_credit_share``). The line's cover and bank rows are reversed (the item's
  rewards come back out).

Staff decide what happens to the returned item (``ReturnRecord.status``). Its inventory status is
not changed here.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import CartMember, LedgerEntry, RestrictedProduct, ReturnRecord, SalePhoto
from apps.thriftplus.services import ledger, members
from apps.thriftplus.services.register import RegisterError, _card

WINDOW_DAYS = 3
CATEGORIES_KEY = 'thrift_plus_nonreturnable_categories'
WORDS_KEY = 'thrift_plus_nonreturnable_words'
DEFAULT_CATEGORIES = ['Apparel & accessories', 'Bedding', 'Linens', 'Towels', 'Curtains']
DEFAULT_WORDS = ['as-is', 'as is', 'for parts', 'parts only', 'untested', 'crossbow']
PHOTO_OVER = Decimal('100.00')
SHARE_KEY = 'thrift_plus_return_credit_share'
DEFAULT_SHARE = Decimal('0.95')


def _setting_list(key: str, default: list[str]) -> list[str]:
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=key).values_list('value', flat=True).first()
    if raw is None:
        return default
    if isinstance(raw, str):
        raw = raw.split(',')
    return [str(x).strip() for x in raw if str(x).strip()]


def deadline(sold_on: date) -> date:
    """The last day a return is taken: day 3, or the next day the store is open."""
    from apps.webstore.services.hours import is_open_day

    day = sold_on + timedelta(days=WINDOW_DAYS)
    for _ in range(14):
        try:
            if is_open_day(day):
                return day
        except Exception:  # store hours unreadable: day 3 stands
            return day
        day += timedelta(days=1)
    return day


def excluded(item) -> str:
    """Why this item can't come back, or '' when it can."""
    if RestrictedProduct.objects.filter(product_id=item.product_id).exists():
        return '18+ items are final sale.'
    if item.condition == 'salvage':
        return 'Sold for parts.'
    profile = getattr(item.product, 'profile', None) if item.product_id else None
    cats = {c.lower() for c in _setting_list(CATEGORIES_KEY, DEFAULT_CATEGORIES)}
    if profile is not None and ({(profile.category or '').lower(), (profile.subcategory or '').lower()} & cats):
        return f'{profile.subcategory or profile.category} is final sale.'
    text = ' '.join([
        item.product.title if item.product_id else '', item.notes or '',
        ' '.join(str(f) for f in (profile.flags if profile is not None else []) or []),
    ]).lower()
    for word in _setting_list(WORDS_KEY, DEFAULT_WORDS):
        if re.search(rf'\b{re.escape(word.lower())}\b', text):  # whole words: "canvas island" is not "as is"
            return f'Sold "{word}": final sale.'
    return ''


def returnable(item) -> bool:
    return not excluded(item)


def credit_share() -> Decimal:
    """The share of the pre-tax price a return gives back as credit (0.95); never above 1."""
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=SHARE_KEY).values_list('value', flat=True).first()
    try:
        value = Decimal(str(raw)) if raw not in (None, '') else DEFAULT_SHARE
    except Exception:
        return DEFAULT_SHARE
    return value if Decimal('0') <= value <= Decimal('1') else DEFAULT_SHARE


def paid_for(line) -> Decimal:
    """The store credit a return gives: the share (95%) of what was paid for the line, before tax."""
    return (max(Decimal('0'), line.line_total) * credit_share()).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def problems(line, account, today: date | None = None) -> list[str]:
    """Everything that stops this line coming back for this membership (empty: it can)."""
    today = today or timezone.localdate()
    cart = line.cart
    out = []
    if line.line_kind != 'item' or line.item_id is None:
        out.append('Only items can come back.')
    if cart.status != 'completed' or not cart.completed_at:
        out.append('That sale was not completed.')
    member = CartMember.objects.filter(cart_id=cart.pk).first()
    if member is None or member.account_id != account.pk:
        out.append('It was not bought on this Thrift+ membership. Guest sales are final.')
    if ReturnRecord.objects.filter(cart_line_id=line.pk).exists():
        out.append('It was already returned.')
    if cart.completed_at:
        last = deadline(timezone.localdate(cart.completed_at))
        if today > last:
            out.append(f'The return window closed {last:%b} {last.day}.')
    if line.item_id is not None:
        why = excluded(line.item)
        if why:
            out.append(why)
    return out


def purchases(code: str, *, days: int = 10) -> dict:
    """A member's recent purchases, each with whether it can come back and why not."""
    from apps.pos.models import CartLine

    card = _card(code)
    account = card.person.account
    since = timezone.now() - timedelta(days=days)
    lines = (
        CartLine.objects.filter(cart__thrift_member__account=account, cart__status='completed', cart__completed_at__gte=since,
                                line_kind='item')
        .select_related('cart', 'item__product__profile').order_by('-cart__completed_at', 'pk')
    )
    rows = []
    for line in lines:
        issues = problems(line, account)
        rows.append({
            'cart_line': line.pk, 'cart': line.cart_id, 'sku': line.item.sku if line.item_id else '',
            'title': line.description, 'paid': str(paid_for(line)), 'sold_at': line.cart.completed_at,
            'deadline': deadline(timezone.localdate(line.cart.completed_at)).isoformat(),
            'photos': [p.photo.url for p in SalePhoto.objects.filter(cart_line=line)],
            'ok': not issues, 'problems': issues,
        })
    person = card.person
    return {
        'member': {'name': f'{person.first_name} {person.last_name}'.strip(), 'account_id': account.pk,
                   'photo_url': person.photo.url if person.photo else None, **ledger.balances(account)},
        'lines': rows,
    }


def do_return(line, code: str, *, confirmed: bool, note: str = '', user=None) -> ReturnRecord:
    """Take the line back: store credit for what was paid, and its rewards reversed."""
    card = _card(code)
    account = card.person.account
    if not confirmed:
        raise RegisterError('NOT_PRIMARY', "Returns are for items whose main function doesn't work. Confirm that first.")
    issues = problems(line, account)
    if issues:
        raise RegisterError('NOT_RETURNABLE', ' '.join(issues))
    with transaction.atomic():
        paid = paid_for(line)
        ledger.reverse_cart(line.cart, 'return', user, line_id=line.pk)
        ledger.record(account, LedgerEntry.KIND_CREDIT, paid, 'return', cart=line.cart, line=line, actor=user,
                      note=(note or '')[:200])
        record = ReturnRecord.objects.create(
            account=account, person=card.person, cart_line=line, item=line.item, paid=paid, note=note or '',
            returned_by=user,
        )
        members.log('return', account=account, person=card.person, card=card, actor=user, cart=line.cart_id,
                    cart_line=line.pk, credit=str(paid))
    return record


def needs_photo(line) -> bool:
    """A $100+ item bought by a member: photograph its serial number and condition at the sale."""
    return line.line_kind == 'item' and (line.unit_price or 0) >= PHOTO_OVER and not SalePhoto.objects.filter(cart_line=line).exists()
