"""
Pack sizes (Dash Update #224; Bill 2026-11-24, and the parked #207 "Sell as", words confirmed 11-23: "Sell as",
"Case of 48", "Single box", "New pack size").

The shared contract (`.ai/extended/processing-night-1124.md`): a product has a base unit and a pack, `count per unit` x
`units in the pack`, stored as numbers (`Product.unit_count`, `unit_name`, `pack_units`), written "3 boxes × 100"
(units first, then count per unit; a single unit is "100 ct"). Total pieces = unit_count x pack_units. A pack links to
its base product. A new pack's price and retail start at base x new pieces / base pieces and are free to edit; making
a pack changes nothing else (no other product, row or check-in).

Bill: "So I can go from 6 different products of 100 tampons and create 3 boxes of 200 if I really wanted to in a
couple clicks ... if 100 tampons is $1 then 3 box set of 200 is $6."
"""
from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import transaction

from apps.inventory.models import Product

TIMES = '×'
MAX_COUNT = 1_000_000

_IRREGULAR = {'box': 'boxes', 'case': 'cases', 'pack': 'packs', 'roll': 'rolls', 'bag': 'bags', 'bottle': 'bottles',
              'can': 'cans', 'jar': 'jars', 'tube': 'tubes', 'sleeve': 'sleeves', 'carton': 'cartons', 'pouch': 'pouches'}


class PackError(ValueError):
    """Plain words for the person (a count that is not a whole number above zero, and so on)."""


def plural(name: str, n: int) -> str:
    name = (name or '').strip().lower()
    if not name or n == 1:
        return name
    if name in _IRREGULAR:
        return _IRREGULAR[name]
    if re.search(r'(s|x|ch|sh)$', name):
        return f'{name}es'
    return f'{name}s'


def singular(name: str) -> str:
    name = (name or '').strip().lower()
    for one, many in _IRREGULAR.items():
        if name == many:
            return one
    if name.endswith('es') and re.search(r'(s|x|ch|sh)es$', name):
        return name[:-2]
    if name.endswith('s') and not name.endswith('ss'):
        return name[:-1]
    return name


def pack_label(unit_count: int | None, unit_name: str = '', pack_units: int | None = None) -> str:
    """The standard words: "3 boxes × 100", "100 ct", "3 boxes" (count unknown); "" when nothing is known."""
    units = pack_units or 1
    name = (unit_name or '').strip()
    if units > 1:
        what = plural(name, units) if name else 'units'
        return f'{units} {what} {TIMES} {unit_count}' if unit_count else f'{units} {what}'
    return f'{unit_count} ct' if unit_count else ''


def total_pieces(unit_count: int | None, pack_units: int | None) -> int | None:
    if not unit_count:
        return None
    return unit_count * (pack_units or 1)


# "3 boxes × 100", "3 x 100", "3-pack of 100": units, then count per unit.
_RE_PACK_OF = re.compile(
    r'(?P<units>\d{1,4})\s*(?:-\s*)?(?P<name>[a-z]+?)?\s*(?:×|x|\*|of)\s*(?P<count>\d{1,6})\b(?!\s*(?:in|oz|ft|lb|mm|cm|"))',
    re.I,
)
# "Pack of 100", "Box of 100", "Case of 48"
_RE_OF = re.compile(r'\b(?P<name>pack|box|case|bag|set|carton|roll)\s+of\s+(?P<count>\d{1,6})\b', re.I)
# "100 ct", "100-count", "100 Count", "100pk", "2-Pack"
_RE_CT = re.compile(r'\b(?P<count>\d{1,6})\s*(?:-\s*)?(?:ct|count|pk|pack|pc|pcs|pieces?)\b', re.I)


def parse_pack(title: str) -> dict[str, Any]:
    """Best guess at a title's pack words, for filling the "New pack size" boxes only (never stored from here).
    Returns {unit_count, unit_name, pack_units, span} with span = (start, end) of the words found, or {}."""
    text = title or ''
    m = _RE_PACK_OF.search(text)
    if m and m.group('name') and m.group('name').lower() not in ('of',):
        return {'unit_count': int(m.group('count')), 'unit_name': singular(m.group('name')),
                'pack_units': int(m.group('units')), 'span': m.span()}
    if m and not m.group('name'):
        return {'unit_count': int(m.group('count')), 'unit_name': '', 'pack_units': int(m.group('units')),
                'span': m.span()}
    m = _RE_OF.search(text)
    if m:
        return {'unit_count': int(m.group('count')), 'unit_name': '', 'pack_units': 1, 'span': m.span()}
    m = _RE_CT.search(text)
    if m:
        return {'unit_count': int(m.group('count')), 'unit_name': '', 'pack_units': 1, 'span': m.span()}
    return {}


def product_pack(product: Product) -> dict[str, Any]:
    """The product's pack: its own numbers when set, else a guess from its title (marked ``from_title``)."""
    if product.unit_count:
        return {'unit_count': product.unit_count, 'unit_name': product.unit_name or '',
                'pack_units': product.pack_units or 1, 'from_title': False}
    guess = parse_pack(product.title)
    if guess:
        return {'unit_count': guess['unit_count'], 'unit_name': guess['unit_name'], 'pack_units': guess['pack_units'],
                'from_title': True}
    return {'unit_count': None, 'unit_name': '', 'pack_units': 1, 'from_title': True}


def retitle(title: str, label: str) -> str:
    """The title with its pack words replaced by the standard label (or the label added at the end)."""
    title = (title or '').strip()
    found = parse_pack(title)
    if found:
        start, end = found['span']
        base = (title[:start] + title[end:]).strip(' -,·|()')
    else:
        base = title
    base = re.sub(r'\s{2,}', ' ', base).strip(' -,·|')
    return f'{base} - {label}'[:300] if label else base[:300]


def scale(amount, base_pieces: int | None, new_pieces: int | None) -> Decimal | None:
    """Price or retail of a new pack from its base: amount x new pieces / base pieces, to the cent."""
    if amount in (None, '') or not base_pieces or not new_pieces:
        return None
    try:
        value = Decimal(str(amount))
    except Exception:  # noqa: BLE001 - not a number
        return None
    return (value * Decimal(new_pieces) / Decimal(base_pieces)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _count(value, what: str, *, allow_none: bool = False) -> int | None:
    if value in (None, '') and allow_none:
        return None
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        raise PackError(f'{what} must be a whole number.') from None
    if n < 1 or n > MAX_COUNT:
        raise PackError(f'{what} must be at least 1.')
    return n


def pack_payload(product: Product) -> dict[str, Any]:
    """What a screen needs to show a product's pack."""
    pack = product_pack(product)
    return {
        'unit_count': product.unit_count,
        'unit_name': product.unit_name or '',
        'pack_units': product.pack_units,
        'base_product': product.base_product_id,
        'pack_label': pack_label(product.unit_count, product.unit_name, product.pack_units),
        'is_pack': bool(product.base_product_id) or (product.pack_units or 1) > 1,
        'guess': pack,
    }


@transaction.atomic
def make_pack(base: Product, data: dict, *, user=None) -> dict[str, Any]:
    """Make a new pack size from ``base``, linked to it. ``data``:

    - unit_count, unit_name, pack_units: the NEW pack (e.g. 200, "box", 3).
    - title (optional): the new product's title; default = the base title with the standard pack words.
    - base_unit_count / base_unit_name / base_pack_units (optional): what the base really is ("it was really 10").
      With ``fix_base`` true they are saved on the base product (its pack numbers and its title words); otherwise
      they are only used for the scale.
    - base_price / base_retail (optional): the base's price and retail to scale from (the check-in's values).

    Nothing else changes: no row, no check-in, no other product.
    """
    unit_count = _count(data.get('unit_count'), 'Count per unit')
    unit_name = singular(str(data.get('unit_name') or '')[:40])
    pack_units = _count(data.get('pack_units') or 1, 'Units in the pack')

    guess = product_pack(base)
    base_count = _count(data.get('base_unit_count'), 'The product\'s count', allow_none=True) or guess['unit_count']
    if not base_count:
        raise PackError('Say how many are in this product first (its count).')
    base_units = _count(data.get('base_pack_units'), 'The product\'s units', allow_none=True) or guess['pack_units'] or 1
    base_name = singular(str(data.get('base_unit_name') if data.get('base_unit_name') is not None
                             else guess['unit_name'] or '')[:40])

    fixed_base = False
    if data.get('fix_base'):
        base.unit_count, base.unit_name, base.pack_units = base_count, base_name, base_units
        label = pack_label(base_count, base_name, base_units)
        base.title = retitle(base.title, label)
        base.save(update_fields=['unit_count', 'unit_name', 'pack_units', 'title', 'updated_at'])
        fixed_base = True

    root = base.base_product if base.base_product_id else base
    label = pack_label(unit_count, unit_name, pack_units)
    title = str(data.get('title') or '').strip()[:300] or retitle(base.title, label)
    product = Product.objects.create(
        title=title,
        brand=base.brand or 'Generic',
        model=base.model or '',
        category=base.category,
        specifications=dict(base.specifications or {}),
        tags=list(base.tags or []),
        unit_count=unit_count,
        unit_name=unit_name,
        pack_units=pack_units,
        base_product=root,
    )
    from apps.inventory.services.inventory_search import rebuild_search_text

    rebuild_search_text([product.pk] + ([base.pk] if fixed_base else []))

    base_pieces = total_pieces(base_count, base_units)
    new_pieces = total_pieces(unit_count, pack_units)
    price = scale(data.get('base_price'), base_pieces, new_pieces)
    retail = scale(data.get('base_retail'), base_pieces, new_pieces)
    return {
        'product': {'id': product.pk, 'product_number': product.product_number, 'title': product.title,
                    'brand': product.brand, **pack_payload(product)},
        'base': {'id': base.pk, 'title': base.title, 'fixed': fixed_base, **pack_payload(base)},
        'label': label,
        'base_pieces': base_pieces,
        'new_pieces': new_pieces,
        'price': None if price is None else f'{price:.2f}',
        'retail': None if retail is None else f'{retail:.2f}',
    }
