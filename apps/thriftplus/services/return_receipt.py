"""
The return receipt (Bill 2026-11-10, Dash Update #90): "once it's done, it prints a receipt ... a receipt per
transaction": one return receipt per original sale, however many of its items came back.

The print server draws receipts (``printserver/routers/receipts.py``, ``POST /print/receipt``). A print server release
needs installs on the store's computers, so this builds a payload the server in the store today (1.9.13) already draws
honestly, out of the fields it already has:

- ``receipt_number``: "RETURN R-20261104-045" (the sale's ticket number) with the return's day and time, centered on
  one line. ``cashier`` is sent empty on purpose: with three parts the server places the day in the middle, and a
  number this long prints under it (seen 2026-11-11). Who took the return goes in the free line below instead;
- ``items``: one row per returned line, "Brass lamp. Reason: Does not work (buzzes)", priced at what came back for it
  (80% of what was paid, tax included, before any shortfall). Each is marked "3-day return", so the server sets them
  under its 3-DAY RETURN heading; that heading's own line reads "Returns through <day> · 80% of value as store
  credit", and ``returns_until`` makes the day the sale's last return day. ``bucks`` is the ThriftBucks given back;
- ``subtotal`` / ``tax`` / ``total``: the refund before tax, its tax part, and the Thrift+ credit given;
- ``tax_exempt``: the server prints this text as it is, bold, under the totals, and adds no words of its own. It is the
  one free line a receipt has, so it carries the sale's day and any ThriftBucks taken back or already spent;
- ``payment_method`` + ``amount_tendered``: "Thrift+ credit added $68.48";
- ``thrift_plus``: the member's first name for the bottom block ("THRIFT+ MEMBER Ana"), and the ThriftBucks given back.

**What the current server cannot do.** A later print server release can read ``kind: "return"`` and the ``return``
block (both are already here; the current server ignores them) and then print: a RETURN band across the top (today the
word is only in the receipt number line); each reason on its own line under its item; "ThriftBucks taken back" as a
row of its own; the sale's day as a row; BACK instead of PRICE over the amounts; and it can leave out the two lines
that are about a sale (the Google review line, and "Use them starting tomorrow" in the ThriftBucks words).

A practice return (the training register) carries ``training``: the server bands it TRAINING, top and bottom.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.utils import timezone

from apps.thriftplus.models import Person, ReturnRecord
from apps.thriftplus.services import returns

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')
PAID_AS = 'Thrift+ credit added'
PRACTICE_PAID_AS = 'Practice only: no Thrift+ credit given'
FREE_LINE_MAX = 160  # the print server cuts the free line there


def _day(d) -> str:
    return f'{d:%a} {d:%b} {d.day}'


def _dec(value) -> Decimal:
    return Decimal(str(value or '0'))


def short_name(user) -> str:
    """ "Carrie R.": who took the return, short enough to share the receipt's top line with its number and time."""
    if user is None:
        return ''
    first, last = (user.first_name or '').strip(), (user.last_name or '').strip()
    if first:
        return f'{first} {last[0]}.' if last else first
    return user.full_name or user.email


def why_words(reason: str, note: str) -> str:
    """ "Does not work (buzzes when on)": the reason as the receipt and the screens say it; '' when none was given."""
    label = returns.RETURN_REASONS.get(reason, '')
    note = (note or '').strip()
    if label and note:
        return f'{label} ({note})'
    return label or note


def rows_from_records(records) -> list[dict]:
    """One row per returned line, from what was written (``ReturnRecord``)."""
    return [{
        'title': r.cart_line.description, 'sku': r.item.sku if r.item_id else '', 'quantity': r.cart_line.quantity or 1,
        'reason': r.reason, 'reason_note': r.reason_note, 'refund': r.paid, 'taxable_back': r.taxable_back,
        'tax_back': r.tax_back, 'credit': r.credit, 'bucks_back': r.bucks_back, 'bucks_taken': r.bucks_taken,
        'shortfall': r.shortfall,
    } for r in records]


def rows_from_preview(lines, shown: list[dict], reasons: dict[int, tuple[str, str]]) -> list[dict]:
    """The same rows for a practice return, where nothing is written: from the lines and their worked-out summary."""
    by_line = {row['cart_line']: row for row in shown}
    out = []
    for line in lines:
        row, parts = by_line[line.pk], returns.refund_parts(line)
        reason, note = reasons.get(line.pk, ('', ''))
        out.append({
            'title': line.description, 'sku': line.item.sku if line.item_id else '', 'quantity': line.quantity or 1,
            'reason': reason, 'reason_note': note, 'refund': parts['refund'], 'taxable_back': parts['taxable_back'],
            'tax_back': parts['tax_back'], 'credit': _dec(row['credit']), 'bucks_back': _dec(row['bucks_back']),
            'bucks_taken': _dec(row['bucks_taken']), 'shortfall': _dec(row['shortfall']),
        })
    return out


def build(cart, rows: list[dict], *, first_name: str = '', cashier: str = '', when=None, training: bool = False) -> dict:
    """The print payload for one sale's return: ``rows`` are the lines that came back in this return."""
    when = timezone.localtime(when or timezone.now())
    receipt = getattr(cart, 'receipt', None)
    sale_number = receipt.receipt_number if receipt else f'Sale {cart.pk}'
    sold_on = timezone.localdate(cart.completed_at) if cart.completed_at else when.date()
    totals = {key: sum((_dec(r[key]) for r in rows), ZERO)
              for key in ('refund', 'taxable_back', 'tax_back', 'credit', 'bucks_back', 'bucks_taken', 'shortfall')}

    items = []
    for r in rows:
        title = str(r['title'] or 'Item').strip().rstrip('.')
        if r['quantity'] > 1:
            title = f"{title} × {r['quantity']}"
        why = why_words(r['reason'], r['reason_note'])
        item = {'name': f'{title}. Reason: {why}' if why else title, 'quantity': 1,
                'unit_price': float(r['refund']), 'line_total': float(r['refund']), 'mark': returns.MARK_RETURN}
        if _dec(r['bucks_back']) > 0:
            item['bucks'] = float(r['bucks_back'])
        items.append(item)

    free = [f'Taken by {cashier}'] if cashier else []
    free.append(f'From the sale of {_day(sold_on)}')
    if totals['bucks_taken'] > 0:
        free.append(f"{totals['bucks_taken']:.2f} ThriftBucks taken back")
    if totals['shortfall'] > 0:
        free.append(f"{totals['shortfall']:.2f} ThriftBucks already spent: credit is ${totals['shortfall']:.2f} less")

    data = {
        'receipt_number': f'RETURN {sale_number}',
        'date': when.date().isoformat(),
        'time': when.strftime('%I:%M %p').lstrip('0'),
        'cashier': '',  # see the module note: who took it is in the free line
        'items': items,
        'subtotal': float(totals['taxable_back']),
        'tax': float(totals['tax_back']),
        'total': float(totals['credit']),
        'tax_exempt': ' · '.join(free)[:FREE_LINE_MAX],
        'payment_method': PRACTICE_PAID_AS if training else PAID_AS,
        'returns_until': returns.deadline(sold_on).isoformat(),
        'thrift_plus': {
            'member': first_name, 'collected': float(totals['bucks_back']), 'use_by': None, 'instant_off': 0,
            'instant_bucks': 0, 'bucks_used': 0, 'credit_used': 0, 'balances': None, 'guest_all_as_is': False,
        },
        # For a later print server release (the current one ignores both keys): the return, said plainly.
        'kind': 'return',
        'return': {
            'sale_receipt': sale_number, 'sale_date': sold_on.isoformat(), 'returned_at': when.isoformat(),
            'taken_by': cashier,
            'member': first_name,
            'lines': [{
                'title': r['title'], 'sku': r['sku'], 'quantity': r['quantity'],
                'reason': returns.RETURN_REASONS.get(r['reason'], ''), 'reason_note': r['reason_note'],
                'refund': str(r['refund']), 'credit': str(r['credit']), 'bucks_back': str(r['bucks_back']),
                'bucks_taken': str(r['bucks_taken']), 'shortfall': str(r['shortfall']),
            } for r in rows],
            'totals': {key: str(value) for key, value in totals.items()},
        },
    }
    if not training:
        data['amount_tendered'] = float(totals['credit'])
    else:
        data['training'] = True
    return data


def for_batch(lines, result: dict, reasons: dict[int, tuple[str, str]], *, user=None) -> dict | None:
    """The return receipt for what ``returns.batch`` just did: one receipt for the sale, every line that came back in
    it. None when it cannot be made: the return is already settled by then, so that is never an error for the screen."""
    try:
        cart = lines[0].cart
        training = bool(result.get('training'))
        when = None
        if training:
            rows = rows_from_preview(lines, result['returns'], reasons)
        else:
            ids = [r['id'] for r in result['returns']]
            records = list(ReturnRecord.objects.filter(pk__in=ids).select_related('cart_line', 'item').order_by('pk'))
            rows = rows_from_records(records)
            when = records[0].created_at if records else None
        person = Person.objects.filter(pk=result.get('person_id')).first()
        return build(cart, rows, first_name=person.first_name if person else '',
                     cashier=short_name(user), when=when, training=training)
    except Exception:  # noqa: BLE001
        logger.exception('return receipt: could not build it for sale %s', lines[0].cart_id if lines else None)
        return None
