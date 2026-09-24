"""
Product profiles and their proposals (initiative product_intelligence, Phase 2).

The only writer of ``ProductProfile``. Rules:
- every value carries a source and a confidence in ``field_meta``;
- a ``human`` value is never overwritten by a machine source;
- nothing here touches ``Product`` itself (POS, check-in and processing keep reading it as before).
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import BrandAlias, Product, ProductProfile, ProductProposal

PROFILE_FIELDS = (
    'short_name', 'display_title', 'brand', 'model_number', 'category', 'subcategory',
    'key_specs', 'flags', 'retail_estimate', 'price_band', 'description', 'search_keywords', 'dup_group',
)
MAX_LEN = {'short_name': 40, 'display_title': 120, 'brand': 200, 'model_number': 200,
           'category': 100, 'subcategory': 100, 'price_band': 10, 'dup_group': 64}

# Spellings that mean "no brand"; seeded as junk aliases (R-023: about 11.4k products).
PLACEHOLDER_BRANDS = (
    'generic', 'unbranded', 'unbraded', 'unknown', 'na', 'n a', 'none', 'no brand', 'not specified',
    'unspecified', 'misc', 'miscellaneous', 'various', 'assorted', 'null', 'brand', 'other', 'no name', 'noname',
)


def normalize_brand(text: str | None) -> str:
    """Case, spaces, punctuation, ™/®, and '&' vs 'and' ignored: the BrandAlias key."""
    t = str(text or '').lower().replace('™', '').replace('®', '')
    t = re.sub(r'\s*&\s*', ' and ', t)
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def canonical_brand(text: str | None, aliases: dict[str, BrandAlias] | None = None) -> str:
    """The canonical brand for a spelling; '' when it is junk or a placeholder."""
    key = normalize_brand(text)
    if not key or key in PLACEHOLDER_BRANDS:
        return ''
    row = aliases.get(key) if aliases is not None else BrandAlias.objects.filter(alias=key).first()
    if row is None:
        return str(text or '').strip()
    return '' if row.is_junk else row.brand


def _clean(field: str, value: Any) -> Any:
    if field in MAX_LEN and isinstance(value, str):
        return value.strip()[: MAX_LEN[field]]
    if field == 'retail_estimate' and value not in (None, ''):
        return Decimal(str(value)).quantize(Decimal('0.01'))
    if field == 'flags' and isinstance(value, str):
        return [f.strip() for f in value.split(',') if f.strip()]
    return value


def set_field(
    product: Product | int,
    field: str,
    value: Any,
    *,
    source: str,
    confidence: str = '',
    profile: ProductProfile | None = None,
) -> bool:
    """Set one profile field with provenance. False when refused (a human value) or unchanged."""
    if field not in PROFILE_FIELDS:
        raise ValueError(f'Unknown profile field {field!r}')
    pid = product if isinstance(product, int) else product.pk
    if profile is None:
        profile, _ = ProductProfile.objects.get_or_create(product_id=pid)
    meta = dict(profile.field_meta or {})
    prior = meta.get(field) or {}
    if prior.get('source') == 'human' and source != 'human':
        return False
    value = _clean(field, value)
    if getattr(profile, field) == value and prior.get('source') == source:
        return False
    setattr(profile, field, value)
    meta[field] = {'source': source, 'confidence': confidence, 'set_at': timezone.now().isoformat()}
    profile.field_meta = meta
    profile.save(update_fields=[field, 'field_meta', 'updated_at'])
    return True


def apply_proposals(proposals: Iterable[ProductProposal], *, user=None) -> dict[str, int]:
    """
    Apply proposals to profiles, one save per product. Each proposal becomes ``applied``, or
    ``rejected`` when the profile already holds a human value for that field.
    """
    counts = {'applied': 0, 'kept_human': 0}
    now = timezone.now()
    by_product: dict[int, list[ProductProposal]] = {}
    for p in proposals:
        by_product.setdefault(p.product_id, []).append(p)
    if not by_product:
        return counts
    with transaction.atomic():
        profiles = {pr.product_id: pr for pr in ProductProfile.objects.filter(product_id__in=list(by_product))}
        missing = [ProductProfile(product_id=pid) for pid in by_product if pid not in profiles]
        if missing:
            ProductProfile.objects.bulk_create(missing, batch_size=1000)
            profiles.update({pr.product_id: pr for pr in ProductProfile.objects.filter(product_id__in=[m.product_id for m in missing])})
        touched_profiles, touched_fields = [], set()
        for pid, items in by_product.items():
            profile = profiles[pid]
            meta = dict(profile.field_meta or {})
            changed = False
            for p in items:
                if p.field not in PROFILE_FIELDS:
                    raise ValueError(f'Unknown profile field {p.field!r}')
                if (meta.get(p.field) or {}).get('source') == 'human' and p.source != 'human':
                    p.status = ProductProposal.STATUS_REJECTED
                    counts['kept_human'] += 1
                else:
                    setattr(profile, p.field, _clean(p.field, p.value))
                    meta[p.field] = {'source': p.source, 'confidence': p.confidence, 'set_at': now.isoformat()}
                    touched_fields.add(p.field)
                    changed = True
                    p.status = ProductProposal.STATUS_APPLIED
                    counts['applied'] += 1
                p.decided_at = now
                if user is not None:
                    p.decided_by = user
            if changed:
                profile.field_meta = meta
                profile.updated_at = now
                touched_profiles.append(profile)
        if touched_profiles:
            ProductProfile.objects.bulk_update(
                touched_profiles, list(touched_fields) + ['field_meta', 'updated_at'], batch_size=1000
            )
        ProductProposal.objects.bulk_update(
            [p for items in by_product.values() for p in items], ['status', 'decided_at', 'decided_by'], batch_size=2000
        )
    return counts
