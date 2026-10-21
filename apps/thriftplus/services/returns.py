"""
Thrift+ 3-day returns (the 10-12 policy, W1-W14; owner answers 2026-10-14): a return privilege for members (W1).

- **Members only**, for items bought on this membership. Guests: all sales final, sold AS IS (W9).
- **Any reason.** Nothing is asked and nothing is tested (W1, W7).
- **Which items:** the line's mark, frozen on the receipt line at the sale (``CartLine.meta['thrift_plus']['mark']``,
  W10, A3). Until the AI marks items, an item is a "3-day return" item unless W6's guide leaves it out (owner 10-14):
  clothing and soft goods (``thrift_plus_nonreturnable_categories``), AS IS or salvage words
  (``thrift_plus_nonreturnable_words``), and items at ``thrift_plus_return_min_price`` ($10) or less after ThriftBucks.
  18+ items and crossbows are not left out as a group. Lines sold before the marks were frozen use the guide on the day.
- **The window:** 3 calendar days after the sale day (bought Monday, back by Thursday). Nothing extends it; only the
  owner may allow a later return when the store was closed (O1), and that is logged with who and why (W2).
- **What comes back** (W3): ``thrift_plus_return_credit_share`` (0.80) of the money paid for the item, tax included,
  as Thrift+ credit (never back the way they paid); and 80% of the ThriftBucks used on it, as fresh ThriftBucks (30
  days from the return day).
- **ThriftBucks the item collected** (W4): the member keeps 20%; 80% is taken back from unspent ThriftBucks, soonest
  use-by first. What can't be taken back (already spent) comes off the Thrift+ credit, never below zero.
- **Settled on the return day** (W11): new ledger rows that day; the sale and its receipt are never changed.
- **Training register:** the result is worked out and shown, and nothing is written.

- **Past the 3 days** (owner 2026-10-20; Bill 2026-10-21: managers' own PINs): the owner signed in, or a manager's own
  register PIN (``accounts/services/register_pin.py``; the shared owner PIN is retired), lets it through with a reason; it is recorded as a mark against Retail on the original sale's cashier (``LateReturnMark``)
  and listed under Late returns. The Returns page (``returns_find.py``) finds the receipt and returns several lines at
  once (``batch``).

Staff decide what happens to the returned item (``ReturnRecord.status``). Its inventory status is not changed here.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import Account, CartMember, LateReturnMark, LedgerEntry, ReturnRecord, SalePhoto
from apps.thriftplus.services import ledger, members
from apps.thriftplus.services.register import RegisterError, found, paid_by_line

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
WINDOW_DAYS = 3
CATEGORIES_KEY = 'thrift_plus_nonreturnable_categories'
WORDS_KEY = 'thrift_plus_nonreturnable_words'
MIN_PRICE_KEY = 'thrift_plus_return_min_price'
DEFAULT_CATEGORIES = ['Apparel & accessories', 'Bedding', 'Linens', 'Towels', 'Curtains']
DEFAULT_WORDS = ['as-is', 'as is', 'for parts', 'parts only', 'untested']
DEFAULT_MIN_PRICE = Decimal('10.00')
PHOTO_OVER = Decimal('100.00')
SHARE_KEY = 'thrift_plus_return_credit_share'
DEFAULT_SHARE = Decimal('0.80')
MARK_RETURN = '3-day return'
MARK_AS_IS = 'AS IS'


def _setting(key: str):
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=key).values_list('value', flat=True).first()


def _setting_list(key: str, default: list[str]) -> list[str]:
    raw = _setting(key)
    if raw is None:
        return default
    if isinstance(raw, str):
        raw = raw.split(',')
    return [str(x).strip() for x in raw if str(x).strip()]


def _setting_money(key: str, default: Decimal) -> Decimal:
    try:
        raw = _setting(key)
        value = Decimal(str(raw)).quantize(CENT) if raw not in (None, '') else default
    except Exception:  # a bad setting never stops a sale or a return
        return default
    return value if value >= 0 else default


def min_price() -> Decimal:
    """Items at this price or less after ThriftBucks are sold AS IS (W6; $10)."""
    return _setting_money(MIN_PRICE_KEY, DEFAULT_MIN_PRICE)


# W14 (owner 2026-10-21): the member card counts a member's returns and warns at the owner's number. Never a block,
# never printed. A return trip is a day with returns; one trip can take back several items.
WARN_COUNT_KEY = 'thrift_plus_return_warn_count'
WARN_DAYS_KEY = 'thrift_plus_return_warn_days'
DEFAULT_WARN_COUNT = 3
DEFAULT_WARN_DAYS = 30


def _setting_int(key: str, default: int) -> int:
    try:
        value = int(_setting(key))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def recent_returns(account: Account, now=None) -> dict:
    """Return trips and items in the owner's window (default 3 trips in 30 days), and whether that reaches the
    warning."""
    now = now or timezone.now()
    days = _setting_int(WARN_DAYS_KEY, DEFAULT_WARN_DAYS)
    warn_at = _setting_int(WARN_COUNT_KEY, DEFAULT_WARN_COUNT)
    stamps = list(ReturnRecord.objects.filter(account=account, created_at__gte=now - timedelta(days=days))
                  .values_list('created_at', flat=True))
    trips = len({timezone.localdate(t) for t in stamps})
    return {'trips': trips, 'items': len(stamps), 'days': days, 'warn_at': warn_at, 'warning': trips >= warn_at}


def credit_share() -> Decimal:
    """The share of what was paid (tax included), and of ThriftBucks, a return gives back and takes back (0.80)."""
    try:
        raw = _setting(SHARE_KEY)
        value = Decimal(str(raw)) if raw not in (None, '') else DEFAULT_SHARE
    except Exception:
        return DEFAULT_SHARE
    return value if Decimal('0') <= value <= Decimal('1') else DEFAULT_SHARE


def deadline(sold_on: date) -> date:
    """The last day a return is taken: 3 calendar days after the sale day. Nothing extends it (W2)."""
    return sold_on + timedelta(days=WINDOW_DAYS)


_NOTE_CACHE: dict[tuple, str] = {}


def _day(d: date) -> str:
    return f'{d:%a} {d:%b} {d.day}'


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


def closed_note(sold_on: date | None = None) -> str:
    """What to tell a member when the store is closed on a day of this sale's 3-day window (owner 2026-10-20): the
    window doesn't grow (W2), so they hear it at the sale. '' when every day is open. Closed days are the store hours
    in Dash (weekly closed days and holiday closures). Never raises; cached a minute (the app's lists call it per item)."""
    import time

    sold_on = sold_on or timezone.localdate()
    key = (sold_on, int(time.time() // 60))
    if key in _NOTE_CACHE:
        return _NOTE_CACHE[key]
    try:
        from apps.webstore.services.hours import _active_overrides, get_hours_config, is_open_day

        cfg, overrides = get_hours_config(), _active_overrides()
        window = [sold_on + timedelta(days=n) for n in range(1, WINDOW_DAYS + 1)]
        closed = [d for d in window if not is_open_day(d, cfg=cfg, overrides=overrides)]
        if not closed:
            note = ''
        else:
            last = max((d for d in window if d not in closed), default=sold_on)
            end = 'today only' if last == sold_on else f'{_day(last)}'
            note = f"Heads up: we're closed {_join([_day(d) for d in closed])}. Returns for today's items end {end}."
    except Exception:
        note = ''
    _NOTE_CACHE.clear()
    _NOTE_CACHE[key] = note
    return note


# ── Which items qualify (W6, W10) ──────────────────────────────────────────────


@dataclass(frozen=True)
class Guide:
    categories: frozenset
    words: tuple
    min_price: Decimal


def guide() -> Guide:
    """W6's starting guide, read once (the settings)."""
    return Guide(
        categories=frozenset(c.lower() for c in _setting_list(CATEGORIES_KEY, DEFAULT_CATEGORIES)),
        words=tuple(_setting_list(WORDS_KEY, DEFAULT_WORDS)), min_price=min_price(),
    )


def why_as_is(item, *, price: Decimal | None = None, reward: Decimal = ZERO, rules: Guide | None = None) -> str:
    """Why this item is sold AS IS, or '' when it is a 3-day return item. ``price`` is the unit price after any
    percent sale (default: the tag) and ``reward`` the ThriftBucks it collects per unit."""
    if item is None:
        return 'Only items can come back.'
    rules = rules or guide()
    if item.condition == 'salvage':
        return 'Sold for parts: AS IS.'
    profile = getattr(item.product, 'profile', None) if item.product_id else None
    if profile is not None and ({(profile.category or '').lower(), (profile.subcategory or '').lower()} & rules.categories):
        return f'{profile.subcategory or profile.category}: sold AS IS.'
    text = ' '.join([
        item.product.title if item.product_id else '', item.notes or '',
        ' '.join(str(f) for f in (profile.flags if profile is not None else []) or []),
    ]).lower()
    for word in rules.words:
        if re.search(rf'\b{re.escape(word.lower())}\b', text):  # whole words: "canvas island" is not "as is"
            return f'Marked "{word}": sold AS IS.'
    price = (item.price or ZERO) if price is None else price
    if price - max(ZERO, reward or ZERO) <= rules.min_price:
        return f'${rules.min_price:.2f} or less after ThriftBucks: sold AS IS.'
    return ''


def qualifies(item, *, price: Decimal | None = None, reward: Decimal = ZERO, rules: Guide | None = None) -> bool:
    """A 3-day return item (W6's guide until the AI marks exist, owner 2026-10-14)."""
    return not why_as_is(item, price=price, reward=reward, rules=rules)


def mark_for(item, *, price: Decimal | None = None, reward: Decimal = ZERO, rules: Guide | None = None) -> tuple[str, str]:
    """The receipt line's mark and, for AS IS, why."""
    why = why_as_is(item, price=price, reward=reward, rules=rules)
    return (MARK_AS_IS, why) if why else (MARK_RETURN, '')


def line_price(line) -> Decimal:
    """The line's unit price after its percent sale (what the guide compares)."""
    pct = line.sale_percent or ZERO
    return ((line.unit_price or ZERO) * (Decimal('1') - pct / Decimal('100'))).quantize(CENT, rounding=ROUND_HALF_UP)


# ── What a return gives back (W3, W4) ──────────────────────────────────────────


def _snapshot(line) -> dict:
    snap = (line.meta or {}).get('thrift_plus') if isinstance(line.meta, dict) else None
    return snap if isinstance(snap, dict) and 'paid' in snap else {}


def _kept_from_ledger(line) -> Decimal:
    """ThriftBucks a line sold before the snapshot kept: its sale or re-ring rows."""
    rows = LedgerEntry.objects.filter(cart_line_id=line.pk, kind__in=[LedgerEntry.KIND_BANK, LedgerEntry.KIND_COVER],
                                      reason__in=('sale', 'rering'), amount__gt=0)
    return sum((r.amount for r in rows), ZERO)


def refund_parts(line, *, rules: Guide | None = None) -> dict:
    """Everything a return of this line gives back and takes back, from the line's snapshot at the sale (or worked
    out from the sale for lines sold before it)."""
    share = credit_share()
    rate = line.cart.tax_rate or ZERO
    snap = _snapshot(line)
    if snap:
        paid = Decimal(str(snap.get('paid') or '0'))
        bucks_used = Decimal(str(snap.get('bucks_used') or '0'))
        kept = Decimal(str(snap.get('kept') or '0'))
        mark, why = snap.get('mark') or MARK_AS_IS, snap.get('why') or ''
    else:
        from apps.pos.models import CartLine

        cart_lines = list(CartLine.objects.filter(cart_id=line.cart_id).order_by('pk'))
        paid = paid_by_line(cart_lines, {}).get(line.pk, max(ZERO, line.line_total or ZERO))
        bucks_used = ZERO
        kept = _kept_from_ledger(line)
        qty = line.quantity or 1
        mark, why = mark_for(line.item, price=line_price(line), reward=(kept / qty).quantize(CENT), rules=rules)
    refund = (paid * (Decimal('1') + rate) * share).quantize(CENT, rounding=ROUND_HALF_UP)
    taxable_back = (paid * share).quantize(CENT, rounding=ROUND_HALF_UP)
    return {
        'paid': paid, 'refund': refund, 'taxable_back': taxable_back, 'tax_back': refund - taxable_back,
        'bucks_used': bucks_used, 'kept': kept,
        'bucks_back': (bucks_used * share).quantize(CENT, rounding=ROUND_HALF_UP),
        'bucks_take': (kept * share).quantize(CENT, rounding=ROUND_DOWN),  # the member keeps 20%, in their favor
        'mark': mark, 'why': why,
    }


def problems(line, account, today: date | None = None, *, late_ok: bool = False, training: bool = False,
             parts: dict | None = None) -> list[str]:
    """Everything that stops this line coming back for this membership (empty: it can)."""
    today = today or timezone.localdate()
    cart = line.cart
    out = []
    if line.line_kind != 'item' or line.item_id is None:
        out.append('Only items can come back.')
    if cart.status not in (('completed', 'training') if training else ('completed',)) or not cart.completed_at:
        out.append('That sale was not completed.')
    member = CartMember.objects.filter(cart_id=cart.pk).first()
    if member is None or member.account_id != account.pk:
        out.append('It was not bought on this Thrift+ membership. Non-member sales are final.')
    if ReturnRecord.objects.filter(cart_line_id=line.pk).exists():
        out.append('It was already returned.')
    if cart.completed_at and not late_ok:
        last = deadline(timezone.localdate(cart.completed_at))
        if today > last:
            out.append(f'The 3-day return window closed {last:%b} {last.day}.')
    if line.item_id is not None:
        parts = parts or refund_parts(line)
        if parts['mark'] != MARK_RETURN:
            out.append(parts['why'] or 'Sold AS IS: not a 3-day return item.')
    return out


def purchases(code: str = '', *, person=None, days: int = 10, training: bool = False) -> dict:
    """A member's recent purchases, each with its mark, what a return gives back, and why not when it can't. The member
    is their QR scanned (``code``) or found by phone (``person``, an id; owner 2026-10-14)."""
    from apps.pos.models import CartLine

    who, _ = found(code, person)
    account = who.account
    since = timezone.now() - timedelta(days=days)
    statuses = ['completed', 'training'] if training else ['completed']
    lines = (
        CartLine.objects.filter(cart__thrift_member__account=account, cart__status__in=statuses,
                                cart__completed_at__gte=since, line_kind='item')
        .select_related('cart', 'item__product__profile').order_by('-cart__completed_at', 'pk')
    )
    rules = guide()
    rows = []
    for line in lines:
        parts = refund_parts(line, rules=rules)
        issues = problems(line, account, training=training, parts=parts)
        # Only the 3 days stand in the way: the owner may allow it (O1, W2).
        late_only = bool(issues) and not problems(line, account, training=training, parts=parts, late_ok=True)
        rows.append({
            'cart_line': line.pk, 'cart': line.cart_id, 'sku': line.item.sku if line.item_id else '',
            'title': line.description, 'paid': str(parts['refund']), 'refund': str(parts['refund']),
            'mark': parts['mark'], 'bucks_back': str(parts['bucks_back']), 'bucks_take': str(parts['bucks_take']),
            'sold_at': line.cart.completed_at, 'deadline': deadline(timezone.localdate(line.cart.completed_at)).isoformat(),
            'photos': [p.photo.url for p in SalePhoto.objects.filter(cart_line=line)],
            'ok': not issues, 'problems': issues, 'problem': ' '.join(issues), 'late_only': late_only,
        })
    return {
        'member': {'name': f'{who.first_name} {who.last_name}'.strip(), 'account_id': account.pk,
                   'photo_url': who.photo.url if who.photo else None, **ledger.balances(account)},
        'lines': rows,
    }


def is_late(line, today: date | None = None) -> bool:
    """The 3 days are over for this line's sale."""
    return bool(line.cart.completed_at) and (today or timezone.localdate()) > deadline(timezone.localdate(line.cart.completed_at))


LATE_REASONS = dict(LateReturnMark.REASON_CHOICES)


def do_return(line, code: str = '', *, person=None, note: str = '', user=None, training: bool = False,
              late_ok: bool = False, late_reason: str = '', by_pin: bool = False, approved_by=None) -> dict:
    """Take the line back (W3, W4, W11): Thrift+ credit for 80% of what was paid, tax included; 80% of the ThriftBucks
    used on it back as fresh ThriftBucks; 80% of the ThriftBucks it collected taken back, soonest first, any shortfall
    off the credit. On a training register the result is worked out and nothing is written.

    The member is their QR scanned (``code``) or found by phone (``person``, an id). ``late_ok`` (the owner signed in or
    the owner PIN, O1; the view checks) lets a return past the window through; it is logged and, with ``late_reason``,
    marked against Retail (``LateReturnMark``)."""
    who, card = found(code, person)
    account = who.account
    parts = refund_parts(line)
    issues = problems(line, account, late_ok=late_ok, training=training, parts=parts)
    if issues:
        raise RegisterError('NOT_RETURNABLE', ' '.join(issues))
    today = timezone.localdate()
    late = bool(line.cart.completed_at) and today > deadline(timezone.localdate(line.cart.completed_at))
    note = (note or '').strip()
    if training:
        taken = min(parts['bucks_take'], ledger.bucks_total(account, today) + parts['bucks_back'])
        shortfall = parts['bucks_take'] - taken
        credit = max(ZERO, parts['refund'] - shortfall)
        return {'id': None, 'credit': str(credit), 'bucks_back': str(parts['bucks_back']), 'bucks_taken': str(taken),
                'shortfall': str(shortfall), 'training': True}
    with transaction.atomic():
        Account.objects.select_for_update().filter(pk=account.pk).first()  # one return at a time per membership
        if ReturnRecord.objects.filter(cart_line_id=line.pk).exists():
            raise RegisterError('NOT_RETURNABLE', 'It was already returned.')
        ledger.record(account, LedgerEntry.KIND_BANK, parts['bucks_back'], 'return', cart=line.cart, line=line,
                      actor=user, note='ThriftBucks back on a 3-day return')
        taken = min(parts['bucks_take'], ledger.bucks_total(account, today))
        ledger.record(account, LedgerEntry.KIND_BANK, -taken, 'return', cart=line.cart, line=line, actor=user,
                      note='ThriftBucks taken back on a 3-day return')
        shortfall = parts['bucks_take'] - taken
        credit = max(ZERO, parts['refund'] - shortfall)
        ledger.record(account, LedgerEntry.KIND_CREDIT, credit, 'return', cart=line.cart, line=line, actor=user,
                      note=note[:200])
        record = ReturnRecord.objects.create(
            account=account, person=who, cart_line=line, item=line.item, paid=parts['refund'], credit=credit,
            taxable_back=parts['taxable_back'], tax_back=parts['tax_back'], bucks_back=parts['bucks_back'],
            bucks_taken=taken, shortfall=shortfall, note=note, returned_by=user,
            late_ok_by=(approved_by or user) if late and late_ok else None,
        )
        members.log('return', account=account, person=who, card=card, actor=user, cart=line.cart_id,
                    cart_line=line.pk, credit=str(credit), refund=str(parts['refund']),
                    bucks_back=str(parts['bucks_back']), bucks_taken=str(taken), shortfall=str(shortfall))
        if late and late_ok:
            members.log('return_late_ok', account=account, person=who, card=card, actor=user,
                        cart=line.cart_id, cart_line=line.pk, why=note[:200])
            cashier = line.cart.cashier
            LateReturnMark.objects.create(
                return_record=record, cashier=cashier, cashier_name=(cashier.full_name or cashier.email) if cashier else '',
                reason=late_reason if late_reason in LATE_REASONS else LateReturnMark.REASON_OWNER, note=note[:500],
                entered_by=user, approved_by=approved_by, by_pin=by_pin,
            )
    return {'id': record.pk, 'credit': str(credit), 'bucks_back': str(parts['bucks_back']), 'bucks_taken': str(taken),
            'shortfall': str(shortfall), 'training': False}


def needs_photo(line) -> bool:
    """A $100+ item bought by a member: photograph its serial number and condition at the sale."""
    return line.line_kind == 'item' and (line.unit_price or 0) >= PHOTO_OVER and not SalePhoto.objects.filter(cart_line=line).exists()


# ── The Returns page: several lines at once, and the Late returns list (owner 2026-10-20) ──────────────────────────


def preview(lines: list, account, *, training: bool = False) -> dict:
    """The summary before Confirm: per line and in all, the Thrift+ credit, ThriftBucks given back and taken back, and the
    shortfall (ThriftBucks already spent come off the credit). The lines are worked in order, as ``batch`` writes them.
    The 3 days are not a problem here: ``late`` says so, and the page asks for the owner PIN."""
    today = timezone.localdate()
    available = ledger.bucks_total(account, today)
    rules = guide()
    rows, totals = [], {'credit': ZERO, 'refund': ZERO, 'bucks_back': ZERO, 'bucks_taken': ZERO, 'shortfall': ZERO}
    for line in lines:
        parts = refund_parts(line, rules=rules)
        issues = problems(line, account, today, late_ok=True, training=training, parts=parts)
        available += parts['bucks_back']
        taken = min(parts['bucks_take'], available)
        available -= taken
        shortfall = parts['bucks_take'] - taken
        credit = max(ZERO, parts['refund'] - shortfall)
        rows.append({
            'cart_line': line.pk, 'sku': line.item.sku if line.item_id else '', 'title': line.description,
            'refund': str(parts['refund']), 'credit': str(credit), 'bucks_back': str(parts['bucks_back']),
            'bucks_taken': str(taken), 'shortfall': str(shortfall), 'late': is_late(line, today), 'problems': issues,
        })
        for key, value in (('credit', credit), ('refund', parts['refund']), ('bucks_back', parts['bucks_back']),
                           ('bucks_taken', taken), ('shortfall', shortfall)):
            totals[key] += value
    return {'lines': rows, 'totals': {k: str(v) for k, v in totals.items()}, 'late': any(r['late'] for r in rows),
            'ok': all(not r['problems'] for r in rows)}


def batch(lines: list, code: str = '', *, person=None, note: str = '', user=None, training: bool = False,
          late_ok: bool = False, late_reason: str = '', by_pin: bool = False, approved_by=None) -> dict:
    """Take several lines of one receipt back in one go: all of them, or none (one transaction). The owner's OK for a
    late line is checked by the caller before this (a wrong PIN must be counted even though the return stops)."""
    results = []
    if training:  # worked out and nothing written, line by line in order, so the shortfall is right
        who, _ = found(code, person)
        shown = preview(lines, who.account, training=True)
        if not shown['ok']:
            raise RegisterError('NOT_RETURNABLE', ' '.join(p for r in shown['lines'] for p in r['problems']))
        return {'returns': shown['lines'], 'totals': shown['totals'], 'training': True, 'person_id': who.pk,
                'account_id': who.account_id}
    with transaction.atomic():
        for line in lines:
            results.append(do_return(line, code, person=person, note=note, user=user, late_ok=late_ok,
                                     late_reason=late_reason, by_pin=by_pin, approved_by=approved_by))
        who, _ = found(code, person)
    totals = {
        'credit': sum((Decimal(r['credit']) for r in results), ZERO),
        'bucks_back': sum((Decimal(r['bucks_back']) for r in results), ZERO),
        'bucks_taken': sum((Decimal(r['bucks_taken']) for r in results), ZERO),
        'shortfall': sum((Decimal(r['shortfall']) for r in results), ZERO),
    }
    return {'returns': results, 'totals': {k: str(v) for k, v in totals.items()}, 'training': False, 'person_id': who.pk,
            'account_id': who.account_id, **ledger.balances(who.account)}


def late_list(limit: int = 200) -> list[dict]:
    """The Late returns list (mark against Retail): newest first."""
    marks = (LateReturnMark.objects.select_related('return_record__person', 'return_record__cart_line__cart__receipt',
                                                   'return_record__item', 'entered_by', 'approved_by')
             .order_by('-created_at')[:limit])
    rows = []
    for m in marks:
        record = m.return_record
        cart = record.cart_line.cart
        receipt = getattr(cart, 'receipt', None)
        sold = timezone.localdate(cart.completed_at) if cart.completed_at else None
        rows.append({
            'id': m.pk, 'created_at': m.created_at, 'department': m.department,
            'receipt_number': receipt.receipt_number if receipt else f'Sale {cart.pk}', 'cart': cart.pk,
            'sold_at': cart.completed_at, 'days_late': (timezone.localdate(m.created_at) - deadline(sold)).days if sold else None,
            'sku': record.item.sku if record.item_id else '', 'title': record.cart_line.description,
            'member': f'{record.person.first_name} {record.person.last_name}'.strip(), 'credit': str(record.credit),
            'cashier': m.cashier_name, 'reason': m.reason, 'reason_label': LATE_REASONS.get(m.reason, m.reason),
            'note': m.note, 'entered_by': (m.entered_by.full_name or m.entered_by.email) if m.entered_by else '',
            'approved_by': (m.approved_by.full_name or m.approved_by.email) if m.approved_by else '',
            'by_pin': m.by_pin,
        })
    return rows
