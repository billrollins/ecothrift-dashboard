"""The Drawer window (Retail 2 step 1, Bill 2026-11-02): one drawer as staff need to see it, in one call.

Who has it, when it opened, the cash in it now by bill and coin, every count with what Dash expected, the day's
sales and the day's journey (drops, paid in/out, covers with who and why). Read-only. Counts are blind (2026-10-21): while the drawer is open a non-manager sees
what was counted, never what Dash expected, the difference or the cash in it now (#36).
"""
from decimal import Decimal

from .models import Drawer
from .register_card import journey, money, name, today_sales
from .services.cash_counts import count_total
from .services.drawer_life import count_check


def _count(kind: str, at, who, counted: dict, expected: dict | None, *, blind: bool, bills_only: bool = False,
           coins_total=None, counted_total=None, expected_total=None, **extra) -> dict:
    """One count: what was counted, and (not blind) what Dash expected and the difference, by bill and coin."""
    check = count_check(counted or {}, expected or {}, coins_total=coins_total, bills_only=bills_only)
    counted_sum = counted_total if counted_total is not None else Decimal(check['counted_total'])
    row = {'kind': kind, 'at': at.isoformat() if at else None, 'who': who, 'bills_only': bills_only,
           'counted_total': money(counted_sum), **extra}
    if not blind and expected is None and expected_total is not None:  # counted as one total: no rows to set beside
        row.update(expected_total=money(expected_total), difference=money(counted_sum - expected_total), rows=[])
        return row
    if blind or expected is None:
        row.update(expected_total=None, difference=None,
                   rows=[{'key': r['key'], 'label': r['label'], 'counted': r['counted']} for r in check['rows']
                         if r['counted'] not in (0, '0', '0.00')])
        return row
    exp = expected_total if expected_total is not None else Decimal(check['expected_total'])
    row.update(expected_total=money(exp), difference=money(counted_sum - exp), rows=check['rows'])
    return row


def _counts(drawer: Drawer, *, blind: bool) -> list[dict]:
    out = [_count('opening', drawer.opened_at, name(drawer.opened_by), drawer.opening_count,
                  drawer.opening_expected, blind=blind, counted_total=drawer.opening_total)]
    for h in drawer.handoffs.select_related('outgoing_cashier', 'incoming_cashier').order_by('counted_at'):
        out.append(_count(
            'handoff', h.counted_at, name(h.incoming_cashier), h.count, h.expected_count if h.count else None,
            blind=blind, bills_only=h.bills_only, counted_total=h.counted_total, expected_total=h.expected_total,
            **{'from': name(h.outgoing_cashier), 'note': h.notes or ''},
        ))
    if drawer.status == 'closed' and drawer.closed_at:
        # Never blind: a closed drawer's count is no longer blind (only an open drawer's is).
        out.append(_count('close', drawer.closed_at, name(drawer.closed_by), drawer.closing_count or {},
                          drawer.closing_expected, blind=False, coins_total=drawer.coin_counter_total,
                          counted_total=drawer.closing_total, expected_total=drawer.expected_cash,
                          note=drawer.close_note or ''))
    return out


def card(drawer: Drawer, *, manager: bool = True) -> dict:
    open_ = drawer.status == 'open'
    blind = not manager and open_
    register = drawer.register
    cover = None
    if drawer.status == 'open':
        live = drawer.covers.filter(ended_at__isnull=True).select_related('user').first()
        cover = name(live.user) if live else None
    # The cash in it now: the live contents while open, the closing count once closed. While open it equals what Dash
    # expects, so it is blind too (Dash Update #36, Bill 2026-11-03: "hide 'Cash now' from cashiers during a blind
    # count; managers still see it"). The training register's practice money stays visible.
    now = (drawer.contents if drawer.status == 'open' else drawer.closing_count) or {}
    hide_cash = blind and not register.is_training
    return {
        'id': drawer.pk,
        'register': {'id': register.pk, 'name': register.name, 'code': register.code,
                     'is_training': register.is_training},
        'date': drawer.date.isoformat(),
        'status': drawer.status,
        'blind': blind,
        'cashier': name(drawer.current_cashier),
        'covered_by': cover,
        'opened_by': name(drawer.opened_by),
        'opened_at': drawer.opened_at.isoformat() if drawer.opened_at else None,
        'opening_total': money(drawer.opening_total),
        'closed_by': name(drawer.closed_by),
        'closed_at': drawer.closed_at.isoformat() if drawer.closed_at else None,
        'variance': None if blind or drawer.variance is None else money(drawer.variance),
        'cash_now': None if hide_cash else {
            'count': {k: v for k, v in now.items() if v},
            # Closed with the coin counter: the coins are one total, so the total is the closing total.
            'coins_total': None if open_ or drawer.coin_counter_total is None else money(drawer.coin_counter_total),
            'total': money(count_total(now) if open_ or drawer.closing_total is None else drawer.closing_total),
        },
        'counts': _counts(drawer, blind=blind),
        'close_out': drawer.close_out if drawer.status == 'closed' else None,
        'sales': today_sales(drawer, blind=blind),
        'journey': journey(drawer, blind=blind),
    }
