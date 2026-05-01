"""
Single source of truth for preprocessing / manifest CSV standard field metadata.
"""
from __future__ import annotations

import re
from typing import Any

from django.utils.text import slugify

FLAT_FIELDS: dict[str, dict[str, Any]] = {
    'quantity': {'required': True, 'label': 'Quantity', 'ai_locked': True},
    'unit_retail': {'required': True, 'label': 'Unit Retail', 'ai_locked': True},
    'description': {'required': True, 'label': 'Description', 'ai_locked': False},
    'brand': {'required': False, 'label': 'Brand', 'ai_locked': False},
    'model': {'required': False, 'label': 'Model', 'ai_locked': False},
    'condition': {'required': False, 'label': 'Condition', 'ai_locked': False},
    'notes': {'required': False, 'label': 'Notes', 'ai_locked': False},
    'search_tags': {'required': False, 'label': 'Search Tags', 'ai_locked': False},
}

# suggested_keys = UI/autocomplete and LLM hints only; never a validation gate for mappings.
BUCKETS: dict[str, dict[str, Any]] = {
    'identifiers': {
        'label': 'Identifiers',
        'suggested_keys': ['upc', 'asin', 'sku', 'mpn', 'ean', 'item_number', 'gtin'],
        'open': True,
        'ai_locked': True,
    },
    'taxonomy': {
        'label': 'Taxonomy',
        'suggested_keys': [
            'category',
            'subcategory',
            'department',
            'product_class',
            'seller_category',
            'division',
            'gl_description',
            'category_code',
        ],
        'open': True,
        'ai_locked': True,
    },
    'specifications': {
        'label': 'Specifications',
        'suggested_keys': [],
        'open': True,
    },
    'tracking': {
        'label': 'Tracking',
        'suggested_keys': ['lot_id', 'pallet_id', 'lpn', 'location'],
        'open': True,
        'ai_locked': True,
    },
}

BUCKET_ORDER: tuple[str, ...] = ('identifiers', 'taxonomy', 'specifications', 'tracking')

BUCKET_LABELS: dict[str, str] = {bid: meta['label'] for bid, meta in BUCKETS.items()}

AI_LOCKED_FIELDS = {k for k, v in FLAT_FIELDS.items() if v.get('ai_locked')}
AI_LOCKED_BUCKETS = {bid for bid, v in BUCKETS.items() if v.get('ai_locked')}
FLAT_KEYS_ORDER = tuple(FLAT_FIELDS.keys())

LEGACY_MAPPING_TARGET_REMAP: dict[str, str] = {
    'retail_value': 'unit_retail',
    'category': 'taxonomy.category',
    'upc': 'identifiers.upc',
    'vendor_item_number': 'identifiers.sku',
}

OPTIONAL_FLAT_TARGETS: frozenset[str] = frozenset({'title'})

IDENTIFIER_LOOKUP_ORDER: tuple[str, ...] = (
    'upc',
    'asin',
    'ean',
    'sku',
    'item_number',
    'mpn',
    'gtin',
)

# Sub-key validation for bucket.subkey (right side of first dot).
SUBKEY_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')


def ai_locked_flat_keys_set() -> set[str]:
    return set(AI_LOCKED_FIELDS)


def coerce_mapping_target(target: str) -> str:
    t = (target or '').strip()
    return LEGACY_MAPPING_TARGET_REMAP.get(t, t)


def default_formula_mapping_targets_in_order() -> tuple[str, ...]:
    seq: list[str] = []
    for k in FLAT_KEYS_ORDER:
        seq.append(k)
    for bid in BUCKET_ORDER:
        for sub in BUCKETS[bid]['suggested_keys']:
            seq.append(f'{bid}.{sub}')
    return tuple(seq)


def all_source_alias_candidates() -> dict[str, tuple[str, ...]]:
    """Lowercase aliases for default column heuristic (flat + dotted)."""
    lc = legacy_source_alias_candidates()
    out: dict[str, tuple[str, ...]] = {k: tuple(v) for k, v in lc.items()}
    out['identifiers.upc'] = ('upc', 'upc/ean', 'barcode')
    out['identifiers.asin'] = ('asin', 'amazon asin', 'amazon asin/')
    out['identifiers.sku'] = (
        'sku',
        'vendor item number',
        'vendor_item_number',
        'item #',
        'item number',
        'tcin',
        'walmart item id',
    )
    out['identifiers.mpn'] = ('mpn', 'manufacturer part number', 'part number', 'mfgr part')
    out['identifiers.ean'] = ('ean',)
    out['identifiers.item_number'] = ('item number', 'item #', 'item_number', 'style number')
    out['identifiers.gtin'] = ('gtin',)
    out['taxonomy.category'] = ('category',)
    out['taxonomy.subcategory'] = ('subcategory',)
    out['taxonomy.department'] = ('department', 'dept')
    out['taxonomy.product_class'] = ('product class', 'product_class', 'class')
    out['taxonomy.seller_category'] = ('seller category', 'seller_category', 'listing category')
    out['taxonomy.division'] = ('division',)
    out['taxonomy.gl_description'] = ('gl description', 'gl_description')
    out['taxonomy.category_code'] = ('category code', 'category_code')
    out['tracking.lot_id'] = ('lot id', 'lot_id')
    out['tracking.pallet_id'] = ('pallet id', 'pallet_id')
    out['tracking.lpn'] = ('lpn',)
    out['tracking.location'] = ('location',)
    return out


def validate_mapping_target(target: str) -> str | None:
    """
    Validate target token. Return None if valid, error message otherwise.

    Bucket sub-keys are validated only via SUBKEY_PATTERN; suggested_keys are not consulted.
    """
    if not isinstance(target, str) or not target.strip():
        return 'empty_target'
    t = target.strip()
    if '.' not in t:
        if t not in FLAT_FIELDS and t not in OPTIONAL_FLAT_TARGETS:
            return f'unknown_flat_target:{t}'
        return None
    bucket, subkey = t.split('.', 1)
    if bucket not in BUCKETS:
        return f'unknown_bucket:{bucket}'
    if not SUBKEY_PATTERN.fullmatch(subkey):
        return f'invalid_subkey:{t}'
    return None


def legacy_source_alias_candidates() -> dict[str, tuple[str, ...]]:
    """Lowercase aliases for suggested default mappings (formula builder hints)."""
    return {
        'quantity': ('quantity', 'qty', 'units', 'count', 'qnty'),
        'unit_retail': (
            'unit retail',
            'unit_retail',
            'unit retail price',
            'retail price',
            'msrp',
            'list price',
            'stated retail',
            'vendor retail',
            'original retail',
            'ext retail',
            'ext. retail',
            'extended retail',
            'total retail',
            'retail value',
            'retail_value',
            'price',
            'unit_cost',
            'unit cost',
            'cost',
        ),
        'description': ('description', 'item description', 'product', 'item'),
        'brand': ('brand', 'manufacturer', 'vendor'),
        'model': ('model', 'model_number', 'model number'),
        'condition': (
            'condition',
            'item condition',
            'current_condition',
            'used_fair',
            'used_good',
            'used_like_new',
        ),
        'notes': ('notes', 'comment'),
        'search_tags': ('tags', 'search_tags', 'tag'),
    }


def manifest_field_metadata_payload() -> dict[str, Any]:
    """Pinned GET /inventory/manifest-fields/ response."""
    flat = []
    for key in FLAT_KEYS_ORDER:
        meta = FLAT_FIELDS[key]
        flat.append({
            'key': key,
            'label': meta['label'],
            'required': bool(meta.get('required')),
            'ai_locked': bool(meta.get('ai_locked')),
        })
    buckets = {}
    for bid in BUCKET_ORDER:
        meta = BUCKETS[bid]
        buckets[bid] = {
            'label': meta['label'],
            'suggested_keys': list(meta.get('suggested_keys', [])),
            'open': bool(meta.get('open')),
        }
    return {'flat': flat, 'buckets': buckets}


def first_identifier_hit(identifiers: dict[str, Any] | None, order: tuple[str, ...]) -> str:
    """First non-empty string value for ordered keys."""
    blob = identifiers or {}
    for k in order:
        v = blob.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ''


def slugify_formula_search_tags(scalar_formula_output: str) -> list[str]:
    """Comma-split, trim, slugify lower, dedupe; single normalization gate for search_tags."""
    out: list[str] = []
    seen: set[str] = set()

    chunk = scalar_formula_output or ''
    for part in chunk.split(','):
        raw = part.strip().lower()
        if not raw:
            continue
        slug = slugify(raw.replace('_', '-'))
        if slug and slug not in seen:
            seen.add(slug)
            out.append(slug)
    return out


def prune_empty_bucket_values(blob: dict[str, str]) -> dict[str, str]:
    """Drop keys whose string value is blank after strip."""
    return {k: v for k, v in blob.items() if str(v).strip()}
