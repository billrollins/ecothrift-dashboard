"""Helpers for Product identifiers and Product-owned search tags."""

from __future__ import annotations

from typing import Any

IDENTIFIER_KEY_ALIASES = {
    'barcode': 'upc',
    'upc/ean': 'upc',
    'vendor_item_number': 'sku',
    'vendor item number': 'sku',
    'item #': 'item_number',
    'item number': 'item_number',
    'part number': 'mpn',
    'manufacturer part number': 'mpn',
    'lot id': 'lot_id',
    'pallet id': 'pallet_id',
}

BARCODE_KEYS = {'upc', 'ean', 'gtin'}


def normalize_identifier_key(key: Any) -> str:
    text = str(key or '').strip().lower().replace('-', '_')
    text = '_'.join(text.split())
    return IDENTIFIER_KEY_ALIASES.get(text, text)


def normalize_identifier_value(key: str, value: Any) -> str:
    text = str(value or '').strip()
    if normalize_identifier_key(key) in BARCODE_KEYS:
        # Preserve leading zeroes; only remove separators/noise around barcode digits.
        digits = ''.join(ch for ch in text if ch.isdigit())
        return digits or text
    return text


def normalize_identifiers(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        key = normalize_identifier_key(raw_key)
        if not key:
            continue
        text = normalize_identifier_value(key, raw_value)
        if text:
            out[key] = text
    return out


def merge_identifiers(*values: Any) -> dict[str, str]:
    merged: dict[str, str] = {}
    for value in values:
        for key, text in normalize_identifiers(value).items():
            if key not in merged:
                merged[key] = text
    return merged


def identifier_value(identifiers: Any, key: str) -> str:
    normalized_key = normalize_identifier_key(key)
    if not isinstance(identifiers, dict):
        return ''
    direct = identifiers.get(normalized_key)
    if direct:
        return normalize_identifier_value(normalized_key, direct)
    for raw_key, raw_value in identifiers.items():
        if normalize_identifier_key(raw_key) == normalized_key:
            return normalize_identifier_value(normalized_key, raw_value)
    return ''


def product_upc(product: Any | None) -> str:
    if product is None:
        return ''
    return identifier_value(getattr(product, 'identifiers', None), 'upc')


def normalize_tags(value: Any, *, max_tags: int = 12, max_len: int = 40) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_parts = value.split(',')
    elif isinstance(value, list):
        raw_parts = value
    else:
        return []

    tags: list[str] = []
    seen: set[str] = set()
    for raw in raw_parts:
        tag = str(raw or '').strip()[:max_len]
        key = tag.lower()
        if not tag or key in seen:
            continue
        seen.add(key)
        tags.append(tag)
        if len(tags) >= max_tags:
            break
    return tags


def merge_tags(*values: Any) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for value in values:
        for tag in normalize_tags(value):
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(tag)
    return merged
