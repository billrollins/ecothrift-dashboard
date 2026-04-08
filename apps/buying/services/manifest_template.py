"""Manifest CSV header signatures, templates, and fast_cat_key generation (Phase 4.1A)."""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal
from typing import Any

from apps.buying.models import ManifestTemplate, Marketplace
from apps.buying.services.normalize import (
    _manifest_retail_to_dollars,
    _str_or_empty,
    _to_int,
)

# Vendor-prefixed keys (see Phase 4.1A plan). Fallback: first segment of slug.
FAST_CAT_PREFIX_BY_SLUG: dict[str, str] = {
    'target': 'tgt',
    'walmart': 'wal',
    'amazon': 'amz',
    'costco': 'cos',
    'homedepot': 'hdp',
    'wayfair': 'wfy',
}

NO_KEY_SENTINEL = '__no_key__'


def marketplace_fast_prefix(marketplace: Marketplace) -> str:
    return FAST_CAT_PREFIX_BY_SLUG.get(
        marketplace.slug,
        re.sub(r'[^a-z0-9]', '', marketplace.slug.lower())[:4] or 'mp',
    )


def compute_header_signature(columns: list[str]) -> str:
    """Deterministic signature: strip, lower, spaces/underscores/dots -> hyphen, sort, comma-join."""
    normalized: list[str] = []
    for raw in columns:
        s = (raw or '').strip().lower()
        s = s.replace(' ', '-').replace('_', '-').replace('.', '-')
        s = re.sub(r'-+', '-', s).strip('-')
        normalized.append(s)
    normalized.sort()
    return ','.join(normalized)


def slugify_segment(value: str) -> str:
    """Slugify one category field value for fast_cat_key segments."""
    if not value or not str(value).strip():
        return ''
    s = str(value).strip().lower()
    s = re.sub(r'[\s_/\\&]+', '-', s)
    s = re.sub(r'[^a-z0-9-]+', '', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s


def build_fast_cat_key(
    marketplace: Marketplace,
    template: ManifestTemplate,
    raw_row: dict[str, Any],
    effective_fields: list[str],
) -> str:
    """Join slugified category field values; prefix vendor key; empty -> {prefix}-__no_key__."""
    prefix = marketplace_fast_prefix(marketplace)
    transforms = template.category_field_transforms or {}
    if isinstance(transforms, dict):
        pass
    else:
        transforms = {}

    segments: list[str] = []
    for field in effective_fields:
        raw_val = raw_row.get(field)
        if raw_val is None:
            continue
        s = str(raw_val).strip()
        tspec = transforms.get(field) if isinstance(transforms, dict) else None
        if isinstance(tspec, dict) and 'strip_prefix' in tspec:
            p = str(tspec['strip_prefix'])
            if s.lower().startswith(p.lower()):
                s = s[len(p) :].lstrip()
        seg = slugify_segment(s)
        if seg:
            segments.append(seg)

    if not segments:
        return f'{prefix}-{NO_KEY_SENTINEL}'

    return f"{prefix}-{'-'.join(segments)}"


def compute_fill_rates(rows: list[dict[str, Any]], columns: list[str]) -> dict[str, float]:
    """Per-column fill rate: fraction of rows with non-empty non-whitespace values."""
    if not rows:
        return {c: 0.0 for c in columns}
    n = len(rows)
    out: dict[str, float] = {}
    for col in columns:
        filled = 0
        for r in rows:
            v = r.get(col)
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            if v != '' and v is not False:
                filled += 1
        out[col] = round(filled / n, 6) if n else 0.0
    return out


def row_fill_rates_for_template(
    template: ManifestTemplate,
    raw_row: dict[str, Any],
) -> dict[str, float]:
    """Single-row fill rates (0 or 1 per category column) for renormalize without full CSV."""
    cats = template.category_fields or []
    if not isinstance(cats, list):
        return {}
    out: dict[str, float] = {}
    for name in cats:
        if not isinstance(name, str) or not name.strip():
            continue
        v = raw_row.get(name)
        filled = 1.0 if v is not None and str(v).strip() else 0.0
        out[name] = filled
    return out


def effective_category_fields(
    template: ManifestTemplate,
    fill_rates: dict[str, float],
) -> list[str]:
    """category_fields whose fill rate >= min_fill_threshold and exist in this manifest."""
    cats = template.category_fields or []
    if not isinstance(cats, list):
        return []
    thr = float(template.min_fill_threshold or 0)
    out: list[str] = []
    for name in cats:
        if not isinstance(name, str) or not name.strip():
            continue
        fr = fill_rates.get(name, 0.0)
        if fr >= thr:
            out.append(name)
    return out


def detect_template(marketplace: Marketplace, columns: list[str]) -> ManifestTemplate | None:
    sig = compute_header_signature(columns)
    return ManifestTemplate.objects.filter(
        marketplace=marketplace,
        header_signature=sig,
    ).first()


def create_template_stub(
    marketplace: Marketplace,
    columns: list[str],
    *,
    display_name: str | None = None,
) -> ManifestTemplate:
    sig = compute_header_signature(columns)
    label = display_name or (f'Auto {sig[:48]}…' if len(sig) > 48 else f'Auto {sig}')
    return ManifestTemplate.objects.create(
        marketplace=marketplace,
        header_signature=sig,
        display_name=label[:200],
        column_map={},
        category_fields=[],
        category_field_transforms={},
        is_reviewed=False,
        notes='Stub created by manifest upload; configure in Phase 4.1B or admin.',
    )


def _first_non_empty(raw_row: dict[str, Any], column_names: list[str]) -> str:
    for name in column_names:
        if not isinstance(name, str):
            continue
        v = raw_row.get(name)
        if v is None:
            continue
        s = _str_or_empty(v)
        if s:
            return s
    return ''


def standardize_row(template: ManifestTemplate, raw_row: dict[str, Any]) -> dict[str, Any]:
    """
    Apply column_map to raw CSV row. Keys: title, brand, model, sku, upc, quantity,
    retail_value, condition, notes (same scalar shape as normalize_manifest_row minus category).
    """
    cm = template.column_map or {}
    if not isinstance(cm, dict):
        cm = {}

    def pick(key: str) -> str:
        spec = cm.get(key)
        if spec is None:
            return ''
        if isinstance(spec, str):
            names = [spec]
        elif isinstance(spec, list):
            names = [x for x in spec if isinstance(x, str)]
        else:
            return ''
        return _first_non_empty(raw_row, names)

    title = pick('title')[:500]
    brand = pick('brand')[:300]
    model = pick('model')[:300]
    sku = pick('sku')[:200]
    upc = pick('upc')[:64]

    qty_spec = cm.get('quantity')
    qty_names = [x for x in qty_spec] if isinstance(qty_spec, list) else []
    quantity = _to_int(_first_non_empty(raw_row, qty_names)) if qty_names else None

    retail_val = None
    rv_spec = cm.get('retail_value')
    if isinstance(rv_spec, list):
        for col in rv_spec:
            if isinstance(col, str) and col in raw_row:
                retail_val = _manifest_retail_to_dollars(raw_row.get(col))
                if retail_val is not None:
                    break
    if retail_val is None:
        er_spec = cm.get('extended_retail')
        if isinstance(er_spec, list):
            for col in er_spec:
                if isinstance(col, str) and col in raw_row:
                    retail_val = _manifest_retail_to_dollars(raw_row.get(col))
                    if retail_val is not None:
                        break

    condition = pick('condition')[:200]

    notes_parts: list[str] = []
    notes_spec = cm.get('notes')
    if isinstance(notes_spec, list):
        for col in notes_spec:
            if not isinstance(col, str):
                continue
            s = _str_or_empty(raw_row.get(col))
            if s:
                notes_parts.append(f'{col}: {s}')
    notes = '; '.join(notes_parts)[:5000]

    return {
        'title': title,
        'brand': brand,
        'model': model,
        'sku': sku,
        'upc': upc,
        'quantity': quantity,
        'retail_value': retail_val,
        'condition': condition,
        'notes': notes,
    }


def parse_csv_dict_rows(file_content: bytes | str) -> tuple[list[str], list[dict[str, str]]]:
    """Decode CSV; return (header_columns, list of row dicts). Tries utf-8-sig, utf-8, latin-1."""
    if isinstance(file_content, bytes):
        text = None
        for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
            try:
                text = file_content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            text = file_content.decode('latin-1', errors='replace')
    else:
        text = file_content

    f = io.StringIO(text, newline='')
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames or []
    columns = [c for c in fieldnames if c is not None]
    rows: list[dict[str, str]] = []
    for row in reader:
        # Normalize keys to original header strings
        clean = {k: (v if v is not None else '') for k, v in row.items() if k is not None}
        rows.append(clean)
    return columns, rows
