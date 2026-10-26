"""CSV import for a supply list, with a template to download.

All or nothing: every row is checked first, and one bad row saves nothing (the answer names each bad row). A row
whose name is already on the list updates that item; any other row adds one.
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import transaction

from ..models import SupplyItem, SupplyList
from .orders import asin_from_url, is_amazon

COLUMNS = ['name', 'description', 'vendor', 'vendor_url', 'url', 'vendor_item_id', 'pack_size', 'unit', 'min', 'max', 'price']
EXAMPLE = ['Receipt paper rolls', '3 1/8 in thermal', 'Amazon', 'https://www.amazon.com',
           'https://www.amazon.com/dp/B000000000', 'B000000000', '50', 'roll', '10', '60', '39.99']
MAX_ROWS = 1000

_url = URLValidator(schemes=['http', 'https'])


def template_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)
    writer.writerow(EXAMPLE)
    return buf.getvalue()


def _whole(raw, field: str, *, default: int, low: int) -> int:
    text = str(raw or '').strip()
    if not text:
        return default
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError(f'{field} must be a whole number') from None
    if value != value.to_integral_value() or value < low:
        raise ValueError(f'{field} must be a whole number of {low} or more')
    return int(value)


def _price(raw):
    text = str(raw or '').strip().replace('$', '').replace(',', '')
    if not text:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError('price must be a number') from None
    if value < 0:
        raise ValueError('price cannot be below 0')
    return value.quantize(Decimal('0.01'))


def _link(raw, field: str) -> str:
    text = str(raw or '').strip()
    if not text:
        return ''
    try:
        _url(text)
    except ValidationError:
        raise ValueError(f'{field} is not a web address (start it with https://)') from None
    return text


def parse_row(row: dict, *, check_range: bool = True) -> dict:
    name = str(row.get('name') or '').strip()
    if not name:
        raise ValueError('name is blank')
    url = _link(row.get('url'), 'url')
    vendor = str(row.get('vendor') or '').strip()
    vendor_item_id = str(row.get('vendor_item_id') or '').strip()
    if not vendor_item_id and is_amazon(vendor, url):
        vendor_item_id = asin_from_url(url)
    out = {
        'name': name[:200],
        'description': str(row.get('description') or '').strip()[:500],
        'vendor': vendor[:120],
        'vendor_url': _link(row.get('vendor_url'), 'vendor_url'),
        'url': url,
        'vendor_item_id': vendor_item_id[:60],
        'pack_size': _whole(row.get('pack_size'), 'pack_size', default=1, low=1),
        'unit': (str(row.get('unit') or '').strip() or 'each')[:40],
        'min_qty': _whole(row.get('min'), 'min', default=0, low=0),
        'max_qty': _whole(row.get('max'), 'max', default=0, low=0),
        'price': _price(row.get('price')),
    }
    if check_range and out['max_qty'] < out['min_qty']:
        raise ValueError('max is below min')
    return out


def import_csv(supply_list: SupplyList, text: str) -> dict:
    """{'added': n, 'updated': n, 'errors': [{'row': n, 'error': '...'}]}. Nothing is saved when errors is not empty."""
    reader = csv.DictReader(io.StringIO(text.lstrip('﻿')))
    headers = [str(h or '').strip().lower() for h in (reader.fieldnames or [])]
    if 'name' not in headers:
        return {'added': 0, 'updated': 0, 'errors': [{'row': 1, 'error': 'No "name" column. Start from the template.'}]}
    parsed, errors = [], []
    for n, raw in enumerate(reader, start=2):
        row = {str(k or '').strip().lower(): v for k, v in raw.items()}
        if not any(str(v or '').strip() for v in row.values()):
            continue
        if len(parsed) + len(errors) >= MAX_ROWS:
            errors.append({'row': n, 'error': f'More than {MAX_ROWS} rows. Split the file.'})
            break
        try:
            parsed.append(parse_row(row))
        except ValueError as exc:
            errors.append({'row': n, 'error': str(exc)})
    if errors:
        return {'added': 0, 'updated': 0, 'errors': errors}
    added = updated = 0
    with transaction.atomic():
        by_name = {i.name.lower(): i for i in supply_list.items.all()}
        next_order = max((i.sort_order for i in by_name.values()), default=0)
        for fields in parsed:
            item = by_name.get(fields['name'].lower())
            if item:
                for key, value in fields.items():
                    setattr(item, key, value)
                item.is_active = True
                item.save()
                updated += 1
            else:
                next_order += 1
                by_name[fields['name'].lower()] = SupplyItem.objects.create(
                    supply_list=supply_list, sort_order=next_order, **fields,
                )
                added += 1
    return {'added': added, 'updated': updated, 'errors': []}
