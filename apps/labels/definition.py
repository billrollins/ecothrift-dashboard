"""Validation for the Custom Label template ``definition`` JSON.

Shape (variables + monochrome text / QR / Code128):

    {
      "variables": [
        {"key": "title", "name": "Title", "kind": "text", "default": ""},
        {"key": "price", "name": "Price", "kind": "increment",
         "default_start": "1", "default_step": "1", "format": "plain"}
      ],
      "elements": [
        {"type": "text", "variable": "title", "x_pct": 10, "y_pct": 20,
         "font": "arial", "size_pt": 18, "align": "left", "bold": false},
        {"type": "qr", "variable": "sku", "x_pct": 70, "y_pct": 10,
         "w_pct": 25, "h_pct": 25, "ecc": "M"},
        {"type": "barcode", "variable": "sku", "x_pct": 10, "y_pct": 70,
         "w_pct": 80, "h_pct": 20, "show_text": true}
      ]
    }

Legacy docs with ``label`` / ``required`` are normalized (``name = label || key``;
``required`` dropped). Fonts are a fixed allowlist the print path can honor.
"""
from __future__ import annotations

import math
import re

ALLOWED_FONTS = ('arial', 'consolas', 'georgia')
ALLOWED_ALIGN = ('left', 'center', 'right')
ALLOWED_TYPES = ('text', 'qr', 'barcode')
ALLOWED_ECC = ('L', 'M', 'Q', 'H')
ALLOWED_VAR_KINDS = ('text', 'increment')
ALLOWED_INCREMENT_FORMATS = (
    'plain', 'integer', 'fixed_2', 'currency', 'pad_4', 'pad_6',
)
MAX_VARIABLES = 20
MAX_ELEMENTS = 50
_KEY_RE = re.compile(r'^[a-z][a-z0-9_]{0,39}$')


class DefinitionError(ValueError):
    """Raised when a template definition document is invalid."""


def _err(msg: str) -> None:
    raise DefinitionError(msg)


def _pct(el: dict, i: int, key: str, *, default: float, lo: float = 0, hi: float = 100) -> float:
    val = el.get(key, default)
    if not isinstance(val, (int, float)) or isinstance(val, bool) or not (lo <= val <= hi):
        _err(f'elements[{i}].{key} must be a number {lo}–{hi}')
    return float(val)


def _numeric_string(val, *, field: str) -> str:
    """Accept int/float/str that parse to a finite number; store as stripped string."""
    if isinstance(val, bool):
        _err(f'{field} must be a number')
    if isinstance(val, (int, float)):
        if not math.isfinite(float(val)):
            _err(f'{field} must be a finite number')
        # Prefer compact string without scientific notation for common cases.
        num = float(val)
        if num == int(num) and abs(num) < 1e15:
            return str(int(num))
        return format(num, 'f').rstrip('0').rstrip('.') or '0'
    if isinstance(val, str):
        s = val.strip()
        if not s:
            _err(f'{field} must be a non-empty number')
        try:
            num = float(s)
        except ValueError:
            _err(f'{field} must be a number')
        if not math.isfinite(num):
            _err(f'{field} must be a finite number')
        return s
    _err(f'{field} must be a number')


def _bind_source(el: dict, i: int, seen_keys: set[str]) -> dict:
    """Exactly one of variable / literal; returns the clean binding fields."""
    has_variable = 'variable' in el and el['variable'] is not None
    has_literal = 'literal' in el and el['literal'] is not None
    if has_variable == has_literal:
        _err(f'elements[{i}] must set exactly one of variable / literal')
    out: dict = {}
    if has_variable:
        if el['variable'] not in seen_keys:
            _err(f'elements[{i}].variable "{el["variable"]}" is not a defined variable')
        out['variable'] = el['variable']
    else:
        literal = el['literal']
        if not isinstance(literal, str) or len(literal) > 500:
            _err(f'elements[{i}].literal must be a string (max 500 chars)')
        out['literal'] = literal
    return out


def _clean_text(el: dict, i: int, seen_keys: set[str]) -> dict:
    clean: dict = {'type': 'text', **_bind_source(el, i, seen_keys)}
    clean['x_pct'] = _pct(el, i, 'x_pct', default=0)
    clean['y_pct'] = _pct(el, i, 'y_pct', default=0)
    font = el.get('font', ALLOWED_FONTS[0])
    if font not in ALLOWED_FONTS:
        _err(f'elements[{i}].font must be one of {ALLOWED_FONTS}')
    clean['font'] = font
    size_pt = el.get('size_pt', 12)
    if not isinstance(size_pt, (int, float)) or isinstance(size_pt, bool) or not (4 <= size_pt <= 200):
        _err(f'elements[{i}].size_pt must be a number 4–200')
    clean['size_pt'] = float(size_pt)
    align = el.get('align', 'left')
    if align not in ALLOWED_ALIGN:
        _err(f'elements[{i}].align must be one of {ALLOWED_ALIGN}')
    clean['align'] = align
    clean['bold'] = bool(el.get('bold', False))
    return clean


def _clean_sized(el: dict, i: int, seen_keys: set[str], *, etype: str) -> dict:
    clean: dict = {'type': etype, **_bind_source(el, i, seen_keys)}
    clean['x_pct'] = _pct(el, i, 'x_pct', default=0)
    clean['y_pct'] = _pct(el, i, 'y_pct', default=0)
    w = _pct(el, i, 'w_pct', default=20, lo=1, hi=100)
    h = _pct(el, i, 'h_pct', default=20, lo=1, hi=100)
    if etype == 'qr':
        # Enforce square: use the smaller of the two so the QR never overflows.
        side = min(w, h)
        clean['w_pct'] = side
        clean['h_pct'] = side
        ecc = el.get('ecc', 'M')
        if ecc not in ALLOWED_ECC:
            _err(f'elements[{i}].ecc must be one of {ALLOWED_ECC}')
        clean['ecc'] = ecc
    else:
        clean['w_pct'] = w
        clean['h_pct'] = h
        clean['show_text'] = bool(el.get('show_text', True))
    return clean


def _clean_variable(var: dict, i: int) -> dict:
    key = var.get('key')
    if not isinstance(key, str) or not _KEY_RE.match(key):
        _err(f'variables[{i}].key must match {_KEY_RE.pattern}')

    # Legacy: label → name; required ignored.
    name = var.get('name')
    if name is None or name == '':
        name = var.get('label') or key
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        _err(f'variables[{i}].name must be a non-empty string (max 80 chars)')
    name = name.strip()

    kind = var.get('kind', 'text')
    if kind not in ALLOWED_VAR_KINDS:
        _err(f'variables[{i}].kind must be one of {ALLOWED_VAR_KINDS}')

    if kind == 'text':
        default = var.get('default', '')
        if not isinstance(default, str) or len(default) > 200:
            _err(f'variables[{i}].default must be a string (max 200 chars)')
        return {'key': key, 'name': name, 'kind': 'text', 'default': default}

    default_start = _numeric_string(
        var.get('default_start', '1'),
        field=f'variables[{i}].default_start',
    )
    default_step = _numeric_string(
        var.get('default_step', '1'),
        field=f'variables[{i}].default_step',
    )
    if float(default_step) == 0:
        _err(f'variables[{i}].default_step must be non-zero')
    fmt = var.get('format', 'plain')
    if fmt not in ALLOWED_INCREMENT_FORMATS:
        _err(f'variables[{i}].format must be one of {ALLOWED_INCREMENT_FORMATS}')
    return {
        'key': key,
        'name': name,
        'kind': 'increment',
        'default_start': default_start,
        'default_step': default_step,
        'format': fmt,
    }


def validate_definition(doc) -> dict:
    """Validate and normalize a template definition. Returns the cleaned dict."""
    if not isinstance(doc, dict):
        _err('definition must be an object')

    variables = doc.get('variables', [])
    elements = doc.get('elements', [])
    if not isinstance(variables, list):
        _err('definition.variables must be a list')
    if not isinstance(elements, list):
        _err('definition.elements must be a list')
    if len(variables) > MAX_VARIABLES:
        _err(f'too many variables (max {MAX_VARIABLES})')
    if len(elements) > MAX_ELEMENTS:
        _err(f'too many elements (max {MAX_ELEMENTS})')

    clean_vars = []
    seen_keys = set()
    for i, var in enumerate(variables):
        if not isinstance(var, dict):
            _err(f'variables[{i}] must be an object')
        clean = _clean_variable(var, i)
        if clean['key'] in seen_keys:
            _err(f'duplicate variable key "{clean["key"]}"')
        seen_keys.add(clean['key'])
        clean_vars.append(clean)

    clean_elements = []
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            _err(f'elements[{i}] must be an object')
        etype = el.get('type')
        if etype not in ALLOWED_TYPES:
            _err(f'elements[{i}].type must be one of {ALLOWED_TYPES}')
        if etype == 'text':
            clean_elements.append(_clean_text(el, i, seen_keys))
        else:
            clean_elements.append(_clean_sized(el, i, seen_keys, etype=etype))

    return {'variables': clean_vars, 'elements': clean_elements}
