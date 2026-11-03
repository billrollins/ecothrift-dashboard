"""The Register window (Retail 2, Bill 2026-11-02): one register as staff need to see it, in one call.

``money``, ``name``, ``today_sales`` and ``journey`` are shared with the Drawer window (``drawer_card``).

Which drawer is in it, who is on it, today's sales, status, and today's journey (the week is the Transactions window's).
Read-only. Event kinds go out as codes; the window words them (English and Spanish).
"""
from decimal import Decimal

from django.db.models import Count, F, Sum
from django.utils import timezone

from .models import Cart, Drawer, Register, RegisterEvent

LAST_SALES = 5


def money(v) -> str:
    return str((v or Decimal('0')).quantize(Decimal('0.01')))


def name(user) -> str | None:
    return (user.full_name or '').strip() or None if user is not None else None


def _status(register: Register, drawer: Drawer | None) -> str:
    if not register.is_active:
        return 'off'
    if drawer is None:
        return 'not_opened'
    return 'open' if drawer.status == 'open' else 'closed'


def today_sales(drawer: Drawer | None, *, blind: bool) -> dict:
    carts = Cart.objects.filter(drawer=drawer) if drawer is not None else Cart.objects.none()
    done = carts.filter(status='completed')
    totals = done.aggregate(count=Count('id'), total=Sum('total'))
    count = totals['count'] or 0
    total = totals['total'] or Decimal('0')
    by_method = {row['payment_method']: money(row['total'])
                 for row in done.values('payment_method').annotate(total=Sum('total')).order_by()}
    if blind:  # Counts are blind (2026-10-21): the cashier does not see the running cash, as on the Drawers page.
        by_method = {k: v for k, v in by_method.items() if k not in ('cash', 'split')}
    last = done.order_by('-completed_at').values_list('completed_at', flat=True).first()
    return {
        'count': count,
        'total': money(total),
        'average': money(total / count) if count else '0.00',
        'by_method': by_method,
        'voided': carts.filter(status='voided').count(),
        'thrift_count': done.filter(thrift_member__isnull=False).count(),
        # A training register's sales are practice (status ``training``): counted, never money.
        'practice': carts.filter(status='training').count(),
        'last_sale_at': last.isoformat() if last else None,
    }


def _last_sales(drawer: Drawer | None) -> list[dict]:
    if drawer is None:
        return []
    carts = (Cart.objects.filter(drawer=drawer, status__in=('completed', 'voided', 'training'))
             .select_related('receipt', 'cashier')
             .order_by(F('completed_at').desc(nulls_last=True), '-pk')[:LAST_SALES])
    rows = []
    for c in carts:
        receipt = getattr(c, 'receipt', None)
        rows.append({
            'id': c.pk, 'receipt': receipt.receipt_number if receipt is not None else None, 'status': c.status,
            'at': (c.completed_at or c.created_at).isoformat(), 'cashier': name(c.cashier),
            'payment_method': c.payment_method, 'total': money(c.total),
        })
    return rows


def journey(drawer: Drawer | None, *, blind: bool) -> list[dict]:
    """Today at this register, newest first: drawer opened and closed, handoffs, covers, drops, paid in/out and the
    register's own events (Open drawer button, reprints, a receipt that did not print)."""
    if drawer is None:
        return []
    ev: list[dict] = [{'kind': 'opened', 'at': drawer.opened_at, 'who': name(drawer.opened_by),
                       'amount': money(drawer.opening_total)}]
    for h in drawer.handoffs.select_related('outgoing_cashier', 'incoming_cashier'):
        ev.append({'kind': 'handoff', 'at': h.counted_at, 'who': name(h.incoming_cashier),
                   'from': name(h.outgoing_cashier), 'variance': None if blind else money(h.variance)})
    for c in drawer.covers.select_related('user'):
        ev.append({'kind': 'cover', 'at': c.started_at, 'who': name(c.user)})
        if c.ended_at:
            ev.append({'kind': 'cover_end', 'at': c.ended_at, 'who': name(c.user), 'how': c.ended_how})
    for d in drawer.drops.select_related('dropped_by'):
        ev.append({'kind': 'drop', 'at': d.dropped_at, 'who': name(d.dropped_by), 'amount': money(d.total),
                   'note': d.reason or ''})
    for m in drawer.movements.select_related('performed_by'):
        ev.append({'kind': m.kind, 'at': m.created_at, 'who': name(m.performed_by), 'amount': money(m.total),
                   'note': m.reason})
    for e in RegisterEvent.objects.filter(drawer=drawer).select_related('user'):
        ev.append({'kind': e.kind, 'at': e.created_at, 'who': name(e.user), 'note': e.note, 'cart': e.cart_id})
    if drawer.status == 'closed' and drawer.closed_at:
        ev.append({'kind': 'closed', 'at': drawer.closed_at, 'who': name(drawer.closed_by),
                   'variance': money(drawer.variance) if drawer.variance is not None else None})
    ev.sort(key=lambda e: e['at'], reverse=True)
    for e in ev:
        e['at'] = e['at'].isoformat()
    return ev


def card(register: Register, *, manager: bool = True) -> dict:
    today = timezone.localdate()
    drawer = (Drawer.objects.filter(register=register, date=today)
              .select_related('current_cashier', 'opened_by', 'closed_by').first())
    # Counts are blind (2026-10-21): while the drawer is open a cashier sees no running cash and no count difference.
    blind = not manager and drawer is not None and drawer.status == 'open'
    cover = None
    last = None
    if drawer is None:  # "Not opened today": say which drawer was last in it.
        prev = Drawer.objects.filter(register=register, date__lt=today).order_by('-date').first()
        last = {'id': prev.pk, 'date': prev.date.isoformat(), 'status': prev.status} if prev else None
    if drawer is not None and drawer.status == 'open':
        live = drawer.covers.filter(ended_at__isnull=True).select_related('user').first()
        cover = name(live.user) if live else None
    return {
        'id': register.pk,
        'name': register.name,
        'code': register.code,
        'location': register.location.name if register.location_id else None,
        'is_active': register.is_active,
        'is_training': register.is_training,
        'starting_cash': money(register.starting_cash),
        'status': _status(register, drawer),
        'today': today.isoformat(),
        'drawer': None if drawer is None else {
            'id': drawer.pk,
            'status': drawer.status,
            'cashier': name(drawer.current_cashier),
            'covered_by': cover,
            'opened_by': name(drawer.opened_by),
            'opened_at': drawer.opened_at.isoformat() if drawer.opened_at else None,
            'opening_total': money(drawer.opening_total),
            'closed_by': name(drawer.closed_by),
            'closed_at': drawer.closed_at.isoformat() if drawer.closed_at else None,
            'variance': money(drawer.variance) if drawer.variance is not None else None,
        },
        'last_drawer': last,
        'sales': today_sales(drawer, blind=blind),
        'last_sales': _last_sales(drawer),
        'journey': journey(drawer, blind=blind),
    }
