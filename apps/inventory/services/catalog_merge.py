"""
Reversible product merges and duplicate candidates (product_intelligence Phase 2 step 5, Phase 4).

``merge_products`` moves every row that points at the merged product onto the survivor and
records the ids; ``undo_merge`` moves exactly those rows back. Nothing is deleted.

``duplicate_candidates`` proposes pairs, strongest evidence first (R-022, R-029):
1. the same valid UPC **and** similar titles: the code has 11+ digits as stored and passes the
   check digit, and the titles are at least ``UPC_TITLE_SIMILARITY`` alike (on dev, 12% of
   same-UPC pairs were unrelated goods: shared or reused codes, item numbers stored as UPC);
2. the same normalized title and the same canonical brand, never for vague titles
   ("men s watch" joined five brands in R-022).
The survivor is the product with the most items (then the lowest id).
"""
from __future__ import annotations

import difflib
import re
from collections import defaultdict
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from apps.inventory.models import (
    BatchGroup,
    BrandAlias,
    CatalogMerge,
    Item,
    ManifestRow,
    Product,
    ProductProfile,
    RestorationJob,
    VendorProductRef,
)
from apps.inventory.services.product_profile import canonical_brand

# Every foreign key that points at Product and should follow a merge. Profile, proposals and
# vectors stay with the merged product (it keeps its own history); ProductMergeAudit is an audit.
MOVABLE = (
    (Item, 'product'),
    (ManifestRow, 'matched_product'),
    (RestorationJob, 'product'),
    (VendorProductRef, 'product'),
    (BatchGroup, 'product'),
)

VAGUE_TITLE_WORDS = 3  # a normalized title shorter than this is too vague to merge on
UPC_MIN_DIGITS = 11
UPC_TITLE_SIMILARITY = 0.5


def _key(model, field):
    return f'{model._meta.label}.{field}'


@transaction.atomic
def merge_products(survivor: Product, merged: Product, *, method: str, reason: str = '', user=None) -> CatalogMerge:
    if survivor.pk == merged.pk:
        raise ValueError('A product cannot be merged into itself.')
    if CatalogMerge.objects.filter(merged=merged, undone_at__isnull=True).exists():
        raise ValueError(f'Product {merged.pk} is already merged.')
    moved = {}
    for model, field in MOVABLE:
        qs = model.objects.select_for_update().filter(**{field: merged})
        ids = list(qs.values_list('pk', flat=True))
        if ids:
            model.objects.filter(pk__in=ids).update(**{field: survivor})
            moved[_key(model, field)] = ids
    was_active = merged.is_active
    Product.objects.filter(pk=merged.pk).update(is_active=False)
    ProductProfile.objects.update_or_create(product=merged, defaults={'merged_into': survivor})
    return CatalogMerge.objects.create(
        survivor=survivor, merged=merged, method=method, reason=reason[:300], moved=moved,
        merged_was_active=was_active, created_by=user,
    )


@transaction.atomic
def undo_merge(merge: CatalogMerge, *, user=None) -> CatalogMerge:
    if merge.undone_at:
        raise ValueError('This merge was already undone.')
    for model, field in MOVABLE:
        ids = merge.moved.get(_key(model, field)) or []
        if ids:
            model.objects.filter(pk__in=ids, **{field: merge.survivor_id}).update(**{field: merge.merged_id})
    Product.objects.filter(pk=merge.merged_id).update(is_active=merge.merged_was_active)
    ProductProfile.objects.filter(product_id=merge.merged_id, merged_into_id=merge.survivor_id).update(merged_into=None)
    merge.undone_at = timezone.now()
    merge.undone_by = user
    merge.save(update_fields=['undone_at', 'undone_by'])
    return merge


def normalize_title(title: str | None) -> str:
    t = re.sub(r'[^a-z0-9 ]', ' ', str(title or '').lower())
    return re.sub(r'\s+', ' ', t).strip()


def valid_upc(raw, min_digits: int = 1) -> str:
    """12-digit UPC-A with a passing check digit (shorter values zero-padded), else ''."""
    d = re.sub(r'[^0-9]', '', str(raw or ''))
    if not d or len(d) > 12 or len(d) < min_digits:
        return ''
    d = d.zfill(12)
    total = sum(int(x) * (3 if i % 2 == 0 else 1) for i, x in enumerate(d[:11]))
    return d if (10 - total % 10) % 10 == int(d[11]) and d != '0' * 12 else ''


def title_similarity(a: str | None, b: str | None) -> float:
    return difflib.SequenceMatcher(None, normalize_title(a), normalize_title(b)).ratio()


@dataclass
class Candidate:
    survivor_id: int
    merged_id: int
    method: str
    key: str


def duplicate_candidates(*, methods=('upc', 'title_brand'), limit: int = 0) -> list[Candidate]:
    """Pairs to merge, never touching a product that is already merged or inactive."""
    already = set(CatalogMerge.objects.filter(undone_at__isnull=True).values_list('merged_id', flat=True))
    rows = list(
        Product.objects.filter(is_active=True)
        .exclude(pk__in=already)
        .annotate(n_items=Count('items'))
        .values('pk', 'title', 'brand', 'identifiers', 'n_items')
    )
    aliases = {a.alias: a for a in BrandAlias.objects.all()}
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        ident = r['identifiers'] if isinstance(r['identifiers'], dict) else {}
        if 'upc' in methods:
            upc = valid_upc(ident.get('upc'), min_digits=UPC_MIN_DIGITS)
            if upc:
                groups[('upc', upc)].append(r)
                continue
        if 'title_brand' in methods:
            t = normalize_title(r['title'])
            if len(t.split()) >= VAGUE_TITLE_WORDS:
                groups[('title_brand', f"{t}|{canonical_brand(r['brand'], aliases).lower()}")].append(r)
    out: list[Candidate] = []
    for (method, key), members in groups.items():
        if len(members) < 2:
            continue
        members.sort(key=lambda m: (-m['n_items'], m['pk']))
        survivor = members[0]
        for m in members[1:]:
            if method == 'upc' and title_similarity(survivor['title'], m['title']) < UPC_TITLE_SIMILARITY:
                continue  # same code, different goods: leave for a person
            out.append(Candidate(survivor_id=survivor['pk'], merged_id=m['pk'], method=method, key=key))
            if limit and len(out) >= limit:
                return out
    return out
