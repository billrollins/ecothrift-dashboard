"""Purchase-line sections and the Parts-only cost-to-repair rule."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

PURCHASE_SECTIONS = ('parts', 'supplies', 'ffe')
SECTION_LABELS = {
    'parts': 'Parts',
    'supplies': 'Supplies',
    'ffe': 'FFE',
}
WAIT_KEYS = ('time', 'space', 'help', 'other')
WAIT_LABELS = {
    'time': 'time',
    'space': 'space',
    'help': 'help',
    'other': 'other',
}

LEGACY_HOLD_REASONS = {
    'parts_needed': 'Parts needed',
    'need_more_time': 'Need more time',
    'pending_test': 'Pending test',
    'repair_time_needed': 'Repair time needed',
    'tools_needed': 'Tools needed',
    'needs_approval': 'Needs approval',
    'research_sop': 'Research / SOP',
    'safety_hold': 'Safety hold',
    'between_steps': 'Between steps',
    'other': 'Other',
}


def normalize_purchase_section(value: Any) -> str:
    text = str(value or '').strip().lower()
    return text if text in PURCHASE_SECTIONS else 'parts'


def part_applies_to_grade(part: dict[str, Any], grade: str) -> bool:
    raw = part.get('grades') or []
    if not isinstance(raw, list):
        return True
    chips = [str(entry).strip() for entry in raw if isinstance(entry, str) and str(entry).strip()]
    return not chips or grade in chips


def _decimal(value: Any) -> Decimal:
    if value in (None, ''):
        return Decimal('0')
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal('0')


def part_line_cost(part: dict[str, Any]) -> Decimal:
    actual = _decimal(part.get('unitPriceActual') if 'unitPriceActual' in part else part.get('unit_price_actual'))
    estimate = _decimal(
        part.get('unitPriceEstimate') if 'unitPriceEstimate' in part else part.get('unit_price_estimate'),
    )
    unit = actual if actual > 0 else estimate
    qty = _decimal(part.get('qty') or 1)
    if qty <= 0:
        qty = Decimal('1')
    return unit * qty


def parts_cost_for_grade(session: dict[str, Any], grade: str) -> Decimal:
    """Cost-to-repair for one grade: live Parts-section lines only. No fees."""
    total = Decimal('0')
    for part in session.get('parts') or []:
        if not isinstance(part, dict):
            continue
        if str(part.get('status') or '') == 'skipped':
            continue
        if normalize_purchase_section(part.get('section')) != 'parts':
            continue
        if not part_applies_to_grade(part, grade):
            continue
        total += part_line_cost(part)
    return total


def derive_hold_label(
    *,
    needs_purchased: list[str],
    wait_for: dict[str, Any] | None,
    with_other_items: dict[str, Any] | None = None,
) -> str:
    bits: list[str] = []
    needs = [section for section in needs_purchased if section in SECTION_LABELS]
    if needs:
        bits.append('Needs ' + ', '.join(SECTION_LABELS[section] for section in needs))
    wait = wait_for if isinstance(wait_for, dict) else {}
    wait_keys = [key for key in WAIT_KEYS if str(wait.get(key) or '').strip()]
    if wait_keys:
        bits.append('Wait: ' + ', '.join(wait_keys))
    if with_other_items:
        bits.append('With other items')
    label = ' · '.join(bits) or 'On hold'
    return label[:64]


def hold_story(
    *,
    live_orders: list[dict[str, Any]] | None,
    wait_for: dict[str, Any] | None,
    storage_location: str = '',
) -> str:
    bits: list[str] = []
    for order in live_orders or []:
        name = str(order.get('name') or '').strip() or 'Order'
        sections = [SECTION_LABELS[s] for s in order.get('sections') or [] if s in SECTION_LABELS]
        status = str(order.get('status') or '').strip()
        detail = ', '.join(sections) if sections else 'Parts'
        if status:
            detail = f'{detail}, {status}'
        bits.append(f'{name} ({detail})')
    wait = wait_for if isinstance(wait_for, dict) else {}
    for key in WAIT_KEYS:
        text = str(wait.get(key) or '').strip()
        if text:
            bits.append(f'{WAIT_LABELS[key]}: {text}')
    loc = str(storage_location or '').strip()
    if loc:
        bits.append(loc)
    if not bits:
        return 'Held'
    return 'Held: ' + ' · '.join(bits)


def pending_from_legacy_reason(reason: str, notes: str = '') -> dict[str, Any]:
    if reason == 'parts_needed':
        return {'needsPurchased': ['parts'], 'waitFor': {}, 'withOtherItems': None, 'legacyReason': reason}
    if reason in {'need_more_time', 'repair_time_needed', 'between_steps', 'pending_test'}:
        return {
            'needsPurchased': [],
            'waitFor': {'time': LEGACY_HOLD_REASONS.get(reason) or notes or 'Time'},
            'withOtherItems': None,
            'legacyReason': reason,
        }
    if reason in {'tools_needed', 'needs_approval', 'research_sop', 'safety_hold'}:
        return {
            'needsPurchased': [],
            'waitFor': {'help': LEGACY_HOLD_REASONS.get(reason) or notes or 'Help'},
            'withOtherItems': None,
            'legacyReason': reason,
        }
    return {
        'needsPurchased': [],
        'waitFor': {},
        'withOtherItems': None,
        'legacyReason': reason or None,
    }


def hold_has_substance(
    *,
    needs_purchased: list[str],
    wait_for: dict[str, Any] | None,
    with_other_items: dict[str, Any] | None = None,
) -> bool:
    if needs_purchased:
        return True
    wait = wait_for if isinstance(wait_for, dict) else {}
    if any(str(wait.get(key) or '').strip() for key in WAIT_KEYS):
        return True
    return bool(with_other_items)
