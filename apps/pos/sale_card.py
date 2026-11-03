"""The Transaction window (Retail 2, Dash Updates #15): what a sale's window adds to the sale record itself.

The money, lines and payment come from the cart's own API (``CartSerializer``); this adds what ties the sale to
everything else, in one call: its register, its Thrift+ member, each line's item (for the Item window), the lines that
came back as Thrift+ returns, and the sale's journey. Read-only. Event kinds go out as codes; the window words them.
"""
from django.core.exceptions import ObjectDoesNotExist

from .models import Cart, RegisterEvent


def _name(user) -> str | None:
    return user.full_name if user is not None else None


def _money(v) -> str:
    return f'{v:.2f}' if v is not None else '0.00'


def card(cart: Cart) -> dict:
    register = cart.drawer.register if cart.drawer_id else None
    try:
        tp = cart.thrift_member
        member = {'person_id': tp.person_id, 'name': f'{tp.person.first_name} {tp.person.last_name}'.strip()}
    except ObjectDoesNotExist:
        member = None

    lines = list(cart.lines.select_related('item', 'thrift_return__returned_by'))
    items = {str(l.pk): {'id': l.item_id, 'sku': l.item.sku} for l in lines if l.item_id and l.item is not None}
    returns = []
    for line in lines:
        try:
            r = line.thrift_return
        except ObjectDoesNotExist:
            continue
        returns.append({
            'line': line.pk, 'description': line.description, 'at': r.created_at.isoformat(),
            # The credit given is the refund (``paid`` is the 80% before any shortfall).
            'credit': _money(r.credit), 'bucks_taken': _money(r.bucks_taken),
            'status': r.status, 'by': _name(r.returned_by),
        })

    ev: list[dict] = [{'kind': 'opened', 'at': cart.created_at, 'who': _name(cart.cashier)}]
    if cart.completed_at:
        ev.append({'kind': 'completed', 'at': cart.completed_at, 'who': _name(cart.cashier)})
    for e in RegisterEvent.objects.filter(cart=cart).select_related('user'):
        ev.append({'kind': e.kind, 'at': e.created_at, 'who': _name(e.user), 'note': e.note})
    if cart.card_type_fixed_at:
        ev.append({'kind': 'card_fixed', 'at': cart.card_type_fixed_at, 'who': _name(cart.card_type_fixed_by),
                   'note': cart.card_type})
    for r in returns:
        ev.append({'kind': 'returned', 'at': r['at'], 'who': r['by'], 'note': r['description']})
    if cart.voided_at:
        ev.append({'kind': 'voided', 'at': cart.voided_at, 'who': _name(cart.voided_by), 'note': cart.void_reason})
    for e in ev:
        if not isinstance(e['at'], str):
            e['at'] = e['at'].isoformat()
    ev.sort(key=lambda e: e['at'], reverse=True)

    return {
        'id': cart.pk,
        'register': {'id': register.pk, 'name': register.name, 'is_training': register.is_training} if register else None,
        'drawer': cart.drawer_id,
        'member': member,
        'items': items,
        'returns': returns,
        'journey': ev,
    }
