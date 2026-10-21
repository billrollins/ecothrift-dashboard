"""The register's two sales.

- **Store sale** (Labor Day): every eligible line, on in its calendar window or by the owner's override
  (AppSetting ``pos.labor_day_sale``: start, end, override). Its name and percent are owner settings
  ``pos.store_sale_name`` and ``pos.store_sale_percent`` (a fraction, 0.10 = 10%).
- **Line sale** (was the always-on "Summer 50%" tile, critic review REG-21): lines the cashier marks. Off unless the
  owner turns on ``pos.line_sale_on``; its name and percent are ``pos.line_sale_name`` and ``pos.line_sale_percent``.

Only the owner (Admin or superuser) changes these settings or turns the store sale on or off.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from apps.core.models import AppSetting
from apps.pos.models import CartLine

SETTING_KEY = 'pos.labor_day_sale'
DEFAULT_PERCENT = Decimal('10')
SUMMER_PERCENT = Decimal('50')
STORE_SALE_NAME_KEY = 'pos.store_sale_name'
STORE_SALE_PERCENT_KEY = 'pos.store_sale_percent'
LINE_SALE_ON_KEY = 'pos.line_sale_on'
LINE_SALE_NAME_KEY = 'pos.line_sale_name'
LINE_SALE_PERCENT_KEY = 'pos.line_sale_percent'
SALE_SETTING_KEYS = (STORE_SALE_NAME_KEY, STORE_SALE_PERCENT_KEY, LINE_SALE_ON_KEY, LINE_SALE_NAME_KEY, LINE_SALE_PERCENT_KEY)
DEFAULT_STORE_SALE_NAME = 'Labor Day'
DEFAULT_LINE_SALE_NAME = 'Summer'
ASSEMBLY_PRICE = Decimal('35.00')
SALE_LABEL_LABOR_DAY = CartLine.SALE_LABEL_LABOR_DAY
SALE_LABEL_SUMMER = CartLine.SALE_LABEL_SUMMER


def labor_day_window(year: int) -> tuple[date, date]:
    """First Monday of September through +5 days (that Saturday)."""
    sept_1 = date(year, 9, 1)
    start = sept_1 + timedelta(days=(0 - sept_1.weekday()) % 7)
    return start, start + timedelta(days=5)


def _parse_date(raw) -> date | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    text = str(raw).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _parse_percent(raw) -> Decimal:
    if raw is None or raw == '':
        return DEFAULT_PERCENT
    try:
        pct = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        return DEFAULT_PERCENT
    if pct < 0 or pct > 100:
        return DEFAULT_PERCENT
    return pct.quantize(Decimal('0.01')) if pct != pct.to_integral_value() else pct


def _read_setting() -> dict:
    try:
        row = AppSetting.objects.get(key=SETTING_KEY)
    except AppSetting.DoesNotExist:
        return {}
    value = row.value
    if isinstance(value, dict):
        return value
    return {}


def _value(key: str, default):
    row = AppSetting.objects.filter(key=key).only('value').first()
    return default if row is None or row.value in (None, '') else row.value


def _name(key: str, default: str) -> str:
    text = str(_value(key, default) or '').strip()[:40]
    return text or default


def _fraction_percent(key: str, default: Decimal) -> Decimal:
    """A fraction setting (0.5) as a percent (50); ``default`` when missing or out of 0-1."""
    raw = _value(key, None)
    if raw is None:
        return default
    try:
        frac = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        return default
    if frac < 0 or frac > 1:
        return default
    pct = (frac * 100).quantize(Decimal('0.01'))
    return pct.to_integral_value() if pct == pct.to_integral_value() else pct


def line_sale() -> dict:
    """The line sale the cashier can mark: on (owner switch, default off), name and percent."""
    return {
        'on': _value(LINE_SALE_ON_KEY, False) is True,
        'name': _name(LINE_SALE_NAME_KEY, DEFAULT_LINE_SALE_NAME),
        'percent': _fraction_percent(LINE_SALE_PERCENT_KEY, SUMMER_PERCENT),
    }


def store_sale_name() -> str:
    return _name(STORE_SALE_NAME_KEY, DEFAULT_STORE_SALE_NAME)


def _calendar_window(today: date, raw: dict) -> tuple[date, date]:
    start = _parse_date(raw.get('start'))
    end = _parse_date(raw.get('end'))
    if start is None or end is None:
        return labor_day_window(today.year)
    return start, end


def get_sale_mode(today: date | None = None) -> dict:
    """Return Labor Day mode: active, source, window, percent, and override."""
    today = today or timezone.localdate()
    raw = _read_setting()
    start, end = _calendar_window(today, raw)
    percent = _fraction_percent(STORE_SALE_PERCENT_KEY, _parse_percent(raw.get('percent')))
    override = raw.get('override', None)
    if override is True:
        source = 'override'
        active = True
    elif override is False:
        source = 'override'
        active = False
    else:
        override = None
        source = 'calendar'
        active = start <= today <= end
    return {
        'active': active,
        'source': source,
        'start': start,
        'end': end,
        'percent': percent,
        'override': override,
        'name': store_sale_name(),
    }


def sale_mode_payload(today: date | None = None) -> dict:
    mode = get_sale_mode(today=today)
    line = line_sale()
    return {
        **mode,
        'start': mode['start'].isoformat(),
        'end': mode['end'].isoformat(),
        'percent': str(mode['percent']),
        'summer_percent': str(line['percent']),
        'line_sale': {**line, 'percent': str(line['percent'])},
        'assembly_price': str(ASSEMBLY_PRICE),
    }


def set_labor_day_override(value: bool | None, user=None) -> dict:
    raw = dict(_read_setting())
    raw['override'] = value
    if 'percent' not in raw:
        raw['percent'] = int(DEFAULT_PERCENT)
    AppSetting.objects.update_or_create(
        key=SETTING_KEY,
        defaults={
            'value': raw,
            'description': 'Labor Day sale window and override',
            'updated_by': user,
        },
    )
    return get_sale_mode()


def apply_sale_to_line(line: CartLine, mode: dict | None = None) -> CartLine:
    """Set or clear the store sale on an eligible line. Line-sale lines keep the percent they were marked at."""
    if mode is None:
        mode = get_sale_mode()
    if not line.is_sale_eligible():
        if line.sale_label or line.sale_percent:
            line.sale_label = ''
            line.sale_percent = Decimal('0')
            line.save()
        return line
    if line.sale_label == SALE_LABEL_SUMMER:
        return line
    if mode.get('active'):
        line.sale_label = SALE_LABEL_LABOR_DAY
        line.sale_percent = mode.get('percent') or DEFAULT_PERCENT
    else:
        line.sale_label = ''
        line.sale_percent = Decimal('0')
    line.save()
    return line


def set_line_sale(line: CartLine, sale: str, mode: dict | None = None) -> CartLine:
    """Apply summer (the line sale) / labor_day / none. ``none`` follows the current store sale.

    The line sale only while the owner has it on (``SALE_OFF`` otherwise).
    """
    if mode is None:
        mode = get_sale_mode()
    if not line.is_sale_eligible():
        raise ValueError('INVALID_TARGET')
    if sale == SALE_LABEL_SUMMER:
        current = line_sale()
        if not current['on']:
            raise ValueError('SALE_OFF')
        line.sale_label = SALE_LABEL_SUMMER
        line.sale_percent = current['percent']
        line.save()
        return line
    if sale == SALE_LABEL_LABOR_DAY:
        line.sale_label = SALE_LABEL_LABOR_DAY
        line.sale_percent = mode.get('percent') or DEFAULT_PERCENT
        line.save()
        return line
    if sale in ('none', '', None):
        line.sale_label = ''
        line.sale_percent = Decimal('0')
        return apply_sale_to_line(line, mode)
    raise ValueError('INVALID_SALE')


def sync_cart_sale(cart) -> None:
    mode = get_sale_mode()
    for line in cart.lines.all():
        apply_sale_to_line(line, mode)
    cart.recalculate()


def sale_display_label(line) -> str:
    """Customer-facing name for a sale line. New sales: add one branch here."""
    pct = line.sale_percent or Decimal('0')
    pct_text = f'{int(pct)}' if pct == pct.to_integral_value() else f'{pct.normalize()}'
    if line.sale_label == SALE_LABEL_LABOR_DAY:
        return f'{store_sale_name()} {pct_text}%'
    if line.sale_label == SALE_LABEL_SUMMER:
        return f'{line_sale()["name"]} {pct_text}%'
    return f'Sale {pct_text}%'


THRIFT_PLUS_SAVINGS_LABEL = 'Redeemed instantly'  # Thrift+ (B1, V4): dollars off today
THRIFT_PLUS_BUCKS_LABEL = 'ThriftBucks used'  # Thrift+ kept ThriftBucks used: a discount line before tax (T3)


def cart_savings(cart) -> dict:
    """Group every dollar the customer did not pay, by source, in first-seen order.

    Sale lines group by sale_display_label. Discount lines group by meta.reason
    ('Other' or blank becomes 'Discount'). Amounts are positive Decimals as str.
    """
    buckets: dict[str, Decimal] = {}

    def add(label: str, amount: Decimal) -> None:
        if amount > 0:
            buckets[label] = buckets.get(label, Decimal('0')) + amount

    for line in cart.lines.all():
        thrift = line.thrift_savings or Decimal('0')  # Thrift+ member rebate, its own bucket
        if line.line_kind == CartLine.LINE_KIND_DISCOUNT:
            if isinstance(line.meta, dict) and line.meta.get('thrift') == 'bucks':  # only Thrift+ writes this line
                add(THRIFT_PLUS_BUCKS_LABEL, -line.line_total)
                continue
            reason = str((line.meta or {}).get('reason') or '').strip()
            add('Discount' if reason in ('', 'Other') else reason[:32], -line.line_total)
            continue
        if line.sale_label:
            add(sale_display_label(line), line.sale_savings - thrift)
        add(THRIFT_PLUS_SAVINGS_LABEL, thrift)
    lines = [{'label': k, 'amount': str(v.quantize(Decimal('0.01')))} for k, v in buckets.items()]
    total = sum((v for v in buckets.values()), Decimal('0')).quantize(Decimal('0.01'))
    return {'total': str(total), 'lines': lines}
