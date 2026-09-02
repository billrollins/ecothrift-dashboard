"""Validation gates for AI cleanup CSV rows (staging / wide format)."""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.inventory.cleanup_condition import normalize_cleanup_condition

KEY_SNAKE = re.compile(r'^[a-z][a-z0-9_]*$')


def _word_count(s: str) -> int:
    return len([w for w in str(s or '').split() if w.strip()])


def _parse_price(raw: str | None) -> tuple[Decimal | None, str | None]:
    """Return (decimal, error_detail). None decimal with no error means blank."""
    s = str(raw or '').strip()
    if not s:
        return None, None
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return None, 'not_a_decimal'
    if d != d.quantize(Decimal('0.01')):
        return None, 'max_two_decimal_places'
    return d, None


def validate_cleanup_specs_cell(raw: str | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Parse specifications_json; return (dict or None, hard errors)."""
    errs: list[dict[str, Any]] = []
    s = str(raw or '').strip()
    if not s:
        return None, errs
    try:
        val = json.loads(s)
    except json.JSONDecodeError:
        errs.append({
            'rule': 'HARD_SPECS_OBJECT',
            'column': 'specifications_json',
            'reason': 'invalid JSON',
        })
        return None, errs
    if not isinstance(val, dict):
        errs.append({
            'rule': 'HARD_SPECS_OBJECT',
            'column': 'specifications_json',
            'reason': 'must be a JSON object',
        })
        return None, errs
    for k, v in val.items():
        if not KEY_SNAKE.match(str(k)):
            errs.append({
                'rule': 'HARD_SPECS_KEYS',
                'column': 'specifications_json',
                'reason': f'invalid key {k!r}',
            })
            return None, errs
        if v is None or str(v).strip() == '':
            errs.append({
                'rule': 'HARD_SPECS_NO_EMPTY',
                'column': 'specifications_json',
                'reason': f'empty value for key {k!r}',
            })
            return None, errs
    return val, errs


def validate_cleanup_tags_cell(raw: str | None) -> tuple[list[str] | None, list[dict[str, Any]]]:
    errs: list[dict[str, Any]] = []
    s = str(raw or '').strip()
    if not s:
        return None, errs
    try:
        val = json.loads(s)
    except json.JSONDecodeError:
        errs.append({
            'rule': 'HARD_TAGS_ARRAY',
            'column': 'search_tags_json',
            'reason': 'invalid JSON',
        })
        return None, errs
    if not isinstance(val, list):
        errs.append({
            'rule': 'HARD_TAGS_ARRAY',
            'column': 'search_tags_json',
            'reason': 'must be a JSON array',
        })
        return None, errs
    out: list[str] = []
    for el in val:
        if not isinstance(el, str) or not str(el).strip():
            errs.append({
                'rule': 'HARD_TAGS_STRINGS',
                'column': 'search_tags_json',
                'reason': 'all elements must be non-empty strings',
            })
            return None, errs
        out.append(str(el).strip())
    return out, errs


def _emit_hard(line: int, row_id: int, rule: str, column: str, reason: str) -> dict[str, Any]:
    return {
        'line': line,
        'row_id': row_id,
        'rule': rule,
        'column': column,
        'reason': reason,
    }


def _emit_soft(line: int, row_id: int, rule: str, column: str, reason: str) -> dict[str, Any]:
    return _emit_hard(line, row_id, rule, column, reason)


def validate_cleanup_row_values(
    *,
    line: int,
    row_id: int,
    staging_wide: bool,
    norm: dict[str, Any],
    category: str,
    taxonomy_set: frozenset[str],
    unit_retail: Decimal | None,
    ideal_price: Decimal | None,
    display_title: str,
    condition_raw: str,
    proposed_price_raw: str,
    extra_description: str,
    brand_for_soft: str,
    category_for_soft: str,
    block_on_quality: bool = True,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    Decimal | None,
    dict[str, Any] | None,
    list[str] | None,
    list[dict[str, Any]],
]:
    """
    Returns (blocking_errors, soft_warnings, proposed_price_decimal, specs_dict, tags_list, quality_issues).

    When block_on_quality is False (Grok cleaned CSV import), former hard quality gates are returned
    in quality_issues and do not block the upload; invalid JSON in required blob cells still blocks.
    """
    blocking: list[dict[str, Any]] = []
    quality_issues: list[dict[str, Any]] = []
    soft: list[dict[str, Any]] = []

    def reject_q(rule: str, column: str, reason: str) -> None:
        rec = _emit_hard(line, row_id, rule, column, reason)
        if block_on_quality:
            blocking.append(rec)
        else:
            quality_issues.append(rec)

    wc = _word_count(display_title)
    if not (display_title or '').strip():
        reject_q('HARD_TITLE_PRESENT', 'title', 'title required')
    elif staging_wide:
        if wc < 3 or wc > 15:
            reject_q(
                'HARD_TITLE_LENGTH', 'title',
                f'title word count must be 3-15 inclusive, got {wc}',
            )

    if category not in taxonomy_set:
        reject_q(
            'HARD_CATEGORY_VALID', 'category',
            f'unknown category {category!r}',
        )

    if normalize_cleanup_condition(condition_raw) is None:
        reject_q(
            'HARD_CONDITION_VALID', 'condition',
            f'unknown condition {condition_raw!r}',
        )

    price, price_err = _parse_price(proposed_price_raw)
    if price_err:
        reject_q('HARD_PRICE_NUMERIC', 'proposed_price', price_err)
    elif staging_wide:
        if price is None:
            reject_q('HARD_PRICE_PRESENT', 'proposed_price', 'required')
        elif price < Decimal('0.01'):
            reject_q('HARD_PRICE_MIN', 'proposed_price', 'must be >= 0.01')
        elif price > Decimal('10000'):
            reject_q('HARD_PRICE_MAX', 'proposed_price', 'must be <= 10000')
    else:
        if proposed_price_raw.strip() and price is not None:
            if price < Decimal('0.01'):
                reject_q('HARD_PRICE_MIN', 'proposed_price', 'must be >= 0.01')
            elif price > Decimal('10000'):
                reject_q('HARD_PRICE_MAX', 'proposed_price', 'must be <= 10000')

    parsed_specs: dict[str, Any] | None = None
    parsed_tags: list[str] | None = None
    if staging_wide:
        if not (extra_description or '').strip():
            reject_q(
                'HARD_DESCRIPTION_PRESENT', 'description', 'required',
            )
        spec_cell = str(norm.get('specifications_json') or '').strip()
        tag_cell = str(norm.get('search_tags_json') or '').strip()

        if block_on_quality:
            if not spec_cell:
                reject_q(
                    'HARD_SPECS_OBJECT', 'specifications_json', 'required non-empty object',
                )
            else:
                parsed_specs, serrs = validate_cleanup_specs_cell(spec_cell)
                for e in serrs:
                    blocking.append(_emit_hard(line, row_id, e['rule'], e['column'], e['reason']))
                if not serrs and isinstance(parsed_specs, dict) and len(parsed_specs) == 0:
                    blocking.append(_emit_hard(
                        line, row_id, 'HARD_SPECS_NO_EMPTY', 'specifications_json',
                        'object must have at least one key',
                    ))

            if not tag_cell:
                reject_q(
                    'HARD_TAGS_ARRAY', 'search_tags_json', 'required non-empty array',
                )
            else:
                parsed_tags, terrs = validate_cleanup_tags_cell(tag_cell)
                for e in terrs:
                    blocking.append(_emit_hard(line, row_id, e['rule'], e['column'], e['reason']))
                if not terrs and isinstance(parsed_tags, list) and len(parsed_tags) == 0:
                    blocking.append(_emit_hard(
                        line, row_id, 'HARD_TAGS_STRINGS', 'search_tags_json',
                        'array must have at least one tag',
                    ))
        else:
            if not spec_cell:
                parsed_specs = {}
            else:
                try:
                    raw_sp = json.loads(spec_cell)
                except json.JSONDecodeError:
                    blocking.append(_emit_hard(
                        line, row_id, 'HARD_SPECS_OBJECT', 'specifications_json', 'invalid JSON',
                    ))
                else:
                    if not isinstance(raw_sp, dict):
                        blocking.append(_emit_hard(
                            line, row_id, 'HARD_SPECS_OBJECT', 'specifications_json', 'must be a JSON object',
                        ))
                    else:
                        parsed_specs = {
                            str(k): str(v)
                            for k, v in raw_sp.items()
                            if KEY_SNAKE.match(str(k)) and v is not None and str(v).strip() != ''
                        }

            if not tag_cell:
                parsed_tags = []
            else:
                try:
                    raw_tg = json.loads(tag_cell)
                except json.JSONDecodeError:
                    blocking.append(_emit_hard(
                        line, row_id, 'HARD_TAGS_ARRAY', 'search_tags_json', 'invalid JSON',
                    ))
                else:
                    if not isinstance(raw_tg, list):
                        blocking.append(_emit_hard(
                            line, row_id, 'HARD_TAGS_ARRAY', 'search_tags_json', 'must be a JSON array',
                        ))
                    else:
                        parsed_tags = [
                            str(x).strip()
                            for x in raw_tg
                            if isinstance(x, str) and str(x).strip()
                        ]

    if blocking:
        return blocking, soft, price, None, None, quality_issues

    # Soft checks (only when we have economics)
    if price is not None and unit_retail is not None and unit_retail > 0:
        low = unit_retail * Decimal('0.05')
        high = unit_retail * Decimal('1.50')
        if price < low or price > high:
            soft.append(_emit_soft(
                line, row_id, 'SOFT_PRICE_VS_RETAIL', 'proposed_price',
                'outside 5%-150% of unit_retail band',
            ))
    if price is not None and ideal_price is not None and ideal_price > 0:
        low_i = ideal_price * Decimal('0.10')
        high_i = ideal_price * Decimal('2.00')
        if price < low_i or price > high_i:
            soft.append(_emit_soft(
                line, row_id, 'SOFT_PRICE_VS_IDEAL', 'proposed_price',
                'outside 10%-200% of ideal_price band',
            ))

    desc_lc = (extra_description or '').lower()
    b = brand_for_soft.strip().lower() if brand_for_soft else ''
    if b and b in desc_lc:
        soft.append(_emit_soft(
            line, row_id, 'SOFT_DESC_NO_BRAND', 'description',
            'description contains brand string',
        ))
    c = category_for_soft.strip().lower() if category_for_soft else ''
    if c and c in desc_lc:
        soft.append(_emit_soft(
            line, row_id, 'SOFT_DESC_NO_CATEGORY', 'description',
            'description contains category string',
        ))

    return blocking, soft, price, parsed_specs, parsed_tags, quality_issues