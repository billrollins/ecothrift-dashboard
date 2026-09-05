"""Labor Day / Summer sale mode driven by AppSetting ``pos.labor_day_sale``."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from apps.core.models import AppSetting
from apps.pos.models import CartLine

SETTING_KEY = 'pos.labor_day_sale'
DEFAULT_PERCENT = Decimal('10')
SUMMER_PERCENT = Decimal('50')
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
    percent = _parse_percent(raw.get('percent'))
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
    }


def sale_mode_payload(today: date | None = None) -> dict:
    mode = get_sale_mode(today=today)
    return {
        **mode,
        'start': mode['start'].isoformat(),
        'end': mode['end'].isoformat(),
        'percent': str(mode['percent']),
        'summer_percent': str(SUMMER_PERCENT),
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
    """Set or clear Labor Day on an eligible line. Summer lines are left alone."""
    if mode is None:
        mode = get_sale_mode()
    if not line.is_sale_eligible():
        if line.sale_label or line.sale_percent:
            line.sale_label = ''
            line.sale_percent = Decimal('0')
            line.save()
        return line
    if line.sale_label == SALE_LABEL_SUMMER:
        line.sale_percent = SUMMER_PERCENT
        line.save()
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
    """Apply summer / labor_day / none. ``none`` follows the current Labor Day mode."""
    if mode is None:
        mode = get_sale_mode()
    if not line.is_sale_eligible():
        raise ValueError('INVALID_TARGET')
    if sale == SALE_LABEL_SUMMER:
        line.sale_label = SALE_LABEL_SUMMER
        line.sale_percent = SUMMER_PERCENT
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
