"""Staff purchases (owner, 2026-10-07): payroll deduction at the register, and Thrift+ free for staff.

Both start switched off in the owner's setting ``pos.staff_purchases``.

**Payroll deduction.** A staff member pays for a sale out of their next paycheck:

- A sale comes off the paycheck for the pay period it was rung in (the next one paid), all of it, never split over
  more than one.
- Everything bought that way in one pay period stays at or under ``payroll_max_percent`` (25 by default) of their
  *last* paycheck: the gross for the pay period before (hours on the time clock times their pay rate). With no last
  paycheck yet (a new hire), they don't qualify.
- Someone else rings it up (never your own sale), and an item has been on the floor for a day (``listed_at``).
- Nothing goes in the drawer. Each pay period's list is entered in QuickBooks Payroll by hand, then marked entered.

**Thrift+ free for staff.** A membership linked to an active staff member pays no monthly cover, so every reward is
theirs (``apps.thriftplus.services.ledger.cover``).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.core.models import AppSetting, AppSettingHistory

SETTING_KEY = 'pos.staff_purchases'
DEFAULTS = {'payroll_deduction': False, 'payroll_max_percent': 25, 'thrift_plus_free': False}
SETTING_DESCRIPTION = 'Staff purchases: payroll deduction at the register (cap: % of the last paycheck), and Thrift+ free for staff.'
STAFF_ROLES = ('Employee', 'Manager', 'Admin')
FLOOR_HOURS = 24
ZERO = Decimal('0.00')


class StaffPurchaseError(Exception):
    def __init__(self, message: str, code: str = 'NOT_ALLOWED'):
        super().__init__(message)
        self.code = code


# ── The setting ─────────────────────────────────────────────────────────────


def settings_value() -> dict:
    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    stored = row.value if row and isinstance(row.value, dict) else {}
    return {**DEFAULTS, **{k: stored[k] for k in DEFAULTS if k in stored}}


def save_settings(raw: dict, *, user) -> dict:
    current = settings_value()
    new = dict(current)
    for key in ('payroll_deduction', 'thrift_plus_free'):
        if key in raw:
            new[key] = raw[key] in (True, 'true', '1', 1)
    if 'payroll_max_percent' in raw:
        try:
            percent = int(raw['payroll_max_percent'])
        except (TypeError, ValueError):
            percent = 0
        if not 1 <= percent <= 100:
            raise StaffPurchaseError('The cap is a whole percent from 1 to 100.', 'BAD_PERCENT')
        new['payroll_max_percent'] = percent
    row, created = AppSetting.objects.get_or_create(
        key=SETTING_KEY, defaults={'value': new, 'description': SETTING_DESCRIPTION, 'updated_by': user},
    )
    if not created and row.value != new:
        old = row.value
        row.value, row.updated_by = new, user
        row.save(update_fields=['value', 'updated_by', 'updated_at'])
        AppSettingHistory.objects.create(key=SETTING_KEY, old_value=old, new_value=new, changed_by=user)
    return new


def thrift_plus_free_on() -> bool:
    return bool(settings_value()['thrift_plus_free'])


# ── Who and how much ────────────────────────────────────────────────────────


def is_staff_member(user) -> bool:
    return bool(user and user.is_active and getattr(user, 'role', None) in STAFF_ROLES)


def _period(day: date) -> tuple[date, date]:
    from apps.hr.services.payroll_periods import payroll_period_bounds
    return payroll_period_bounds(day)


def last_paycheck(user, *, today: date | None = None) -> dict:
    """The gross for the pay period before this one: time-clock hours times the pay rate."""
    from apps.hr.models import TimeEntry
    from apps.hr.services.roster import shift_hours

    start, _ = _period(today or timezone.localdate())
    last_start, last_end = _period(start - timedelta(days=1))
    profile = getattr(user, 'employee', None) if hasattr(user, 'employee') else None
    rate = Decimal(getattr(profile, 'pay_rate', 0) or 0)
    entries = TimeEntry.objects.filter(employee=user, date__gte=last_start, date__lte=last_end, deleted_at__isnull=True)
    hours = sum((shift_hours(e) for e in entries), Decimal('0'))
    return {'start': last_start, 'end': last_end, 'hours': hours.quantize(Decimal('0.01')),
            'gross': (hours * rate).quantize(Decimal('0.01'))}


def _day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Store-time midnight at the start, and midnight after the end."""
    tz = timezone.get_current_timezone()
    return (timezone.make_aware(datetime.combine(start, time.min), tz),
            timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz))


def payroll_carts(user, start: date, end: date):
    from apps.pos.models import Cart

    since, until = _day_bounds(start, end)
    return Cart.objects.filter(payment_method='payroll', status='completed', payroll_employee=user,
                               completed_at__gte=since, completed_at__lt=until)


def amount_of(cart) -> Decimal:
    return (cart.total - (cart.thrift_credit or ZERO)).quantize(Decimal('0.01'))


def eligibility(user, *, cashier=None, amount: Decimal | None = None, today: date | None = None) -> dict:
    """Can this person pay by payroll deduction now, and how much is left this pay period?"""
    today = today or timezone.localdate()
    cfg = settings_value()
    start, end = _period(today)
    last = last_paycheck(user, today=today) if user else {'start': None, 'end': None, 'hours': ZERO, 'gross': ZERO}
    limit = (last['gross'] * Decimal(cfg['payroll_max_percent']) / 100).quantize(Decimal('0.01'))
    used = sum((amount_of(c) for c in payroll_carts(user, start, end)), ZERO) if user else ZERO
    out = {
        'eligible': False, 'reason': '', 'percent': cfg['payroll_max_percent'],
        'employee': {'id': user.pk, 'name': (user.full_name or '').strip() or user.email} if user else None,
        'last_paycheck': {'start': last['start'], 'end': last['end'], 'hours': last['hours'], 'gross': last['gross']},
        'deduct_from': {'start': start, 'end': end},
        'limit': limit, 'used': used, 'available': max(ZERO, limit - used),
    }
    if not cfg['payroll_deduction']:
        out['reason'] = 'Payroll deduction is switched off (Settings → Store).'
    elif not is_staff_member(user):
        out['reason'] = 'Only active staff can pay by payroll deduction.'
    elif cashier is not None and cashier.pk == user.pk:
        out['reason'] = 'Someone else rings up your purchase. Never ring your own sale.'
    elif last['gross'] <= 0:
        out['reason'] = ('No paycheck in the last pay period yet, so nothing to take it from. New hires qualify after '
                         'their first paycheck.')
    elif amount is not None and amount > out['available']:
        out['reason'] = (f'That is more than is left this pay period: ${out["available"]} of ${limit} '
                         f'({cfg["payroll_max_percent"]}% of the last paycheck).')
    else:
        out['eligible'] = True
    return out


def check_floor_day(cart) -> None:
    """Staff may buy an item once it has been on the floor for a day (the handbook). Older items have no date."""
    cutoff = timezone.now() - timedelta(hours=FLOOR_HOURS)
    for line in cart.lines.select_related('item').filter(item__isnull=False):
        listed = line.item.listed_at
        if listed and listed > cutoff:
            raise StaffPurchaseError(
                f'{line.item.sku} went on the floor less than a day ago. Staff may buy it after '
                f'{timezone.localtime(listed + timedelta(hours=FLOOR_HOURS)):%a %b %d, %I:%M %p}.', 'FLOOR_DAY')


# ── The list for QuickBooks ─────────────────────────────────────────────────


def deductions(for_day: date | None = None) -> dict:
    """One pay period's payroll-deduction purchases, per person, and whether each was entered in QuickBooks."""
    from apps.pos.models import Cart, PayrollDeductionMark

    start, end = _period(for_day or timezone.localdate())
    since, until = _day_bounds(start, end)
    carts = (Cart.objects.filter(payment_method='payroll', status='completed', completed_at__gte=since,
                                 completed_at__lt=until)
             .select_related('payroll_employee', 'cashier', 'receipt').order_by('completed_at'))
    people: dict[int, dict] = {}
    for cart in carts:
        user = cart.payroll_employee
        row = people.setdefault(user.pk, {
            'employee': {'id': user.pk, 'name': (user.full_name or '').strip() or user.email}, 'total': ZERO,
            'sales': [],
        })
        amount = amount_of(cart)
        row['total'] += amount
        row['sales'].append({
            'cart': cart.pk, 'receipt': getattr(getattr(cart, 'receipt', None), 'receipt_number', ''),
            'at': cart.completed_at, 'amount': amount,
            'cashier': (cart.cashier.full_name or cart.cashier.email) if cart.cashier_id else '',
        })
    marks = {m.employee_id: m for m in PayrollDeductionMark.objects.filter(period_start=start)}
    for user_id, row in people.items():
        mark = marks.get(user_id)
        row['entered'] = None if mark is None else {
            'amount': mark.amount, 'at': mark.marked_at,
            'by': (mark.marked_by.full_name or mark.marked_by.email) if mark.marked_by_id else '',
            'matches': mark.amount == row['total'],
        }
    prev_start, _ = _period(start - timedelta(days=1))
    return {
        'start': start, 'end': end, 'previous_start': prev_start, 'next_start': end + timedelta(days=1),
        'people': sorted(people.values(), key=lambda r: r['employee']['name']),
        'total': sum((r['total'] for r in people.values()), ZERO),
    }


def mark_entered(*, employee_id: int, period_start: date, by) -> None:
    from apps.pos.models import PayrollDeductionMark

    data = deductions(period_start)
    row = next((r for r in data['people'] if r['employee']['id'] == employee_id), None)
    if row is None:
        raise StaffPurchaseError('Nothing to enter for this person in this pay period.', 'NOTHING')
    PayrollDeductionMark.objects.update_or_create(
        employee_id=employee_id, period_start=data['start'],
        defaults={'period_end': data['end'], 'amount': row['total'], 'marked_by': by, 'marked_at': timezone.now()},
    )

