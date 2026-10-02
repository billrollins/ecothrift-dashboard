"""
The standardize and dedupe results, carried from the owner's PC to production (2026-10-02).

The pipeline (`standardize.py`, `dedupe.py`) ran on a copy of production pulled 2026-09-24. Its **final state** is
exported to three files in `apps/inventory/data/backfill/` (`export_standard_backfill`), shipped with a release, and
loaded in production by three Requests the owner approves (`approval_kinds.py`):

1. **standard**: the profile fields of every standardized product (`load_standard`, undo `undo_standard`).
2. **merges** (with the dedupe decisions): the duplicate merges, in the order they were made (`apply_merges`).
3. vectors are not shipped: production builds them from the vector text (`embed_standard`).

**Guards.** Product ids are the same in both databases, because the copy came from production. A row is used only
when the product still exists and its title is still the one the pipeline saw; anything else is counted and left
alone. A value a person set is never replaced. Everything resumes from a cursor and can run twice.
"""
from __future__ import annotations

import gzip
import json
import time
from itertools import islice
from pathlib import Path
from typing import Any, Callable, Iterator

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import CatalogMerge, DedupeDecision, Product, ProductProfile, ProductVector
from apps.inventory.services.catalog_merge import merge_products, normalize_title, undo_merge
from apps.inventory.services.inventory_search import rebuild_search_text
from apps.inventory.services.product_profile import _clean

DATA_DIR = Path(__file__).resolve().parents[1] / 'data' / 'backfill'
FIELDS = ('display_title', 'short_name', 'vector_text', 'brand', 'model_number', 'category', 'subcategory',
          'key_specs', 'aliases')
CHUNK = 1000
MERGE_METHOD = 'spark_dedupe'


def resolve(name: str) -> Path:
    p = Path(name)
    return p if p.is_absolute() else DATA_DIR / name


def read(name: str) -> tuple[dict, Iterator[dict]]:
    """The file's header (its first line) and an iterator over its rows."""
    f = gzip.open(resolve(name), 'rt', encoding='utf-8')
    header = json.loads(f.readline())['header']

    def rows() -> Iterator[dict]:
        with f:
            for line in f:
                if line.strip():
                    yield json.loads(line)

    return header, rows()


def _chunks(rows: Iterator[dict], size: int) -> Iterator[list[dict]]:
    while True:
        chunk = list(islice(rows, size))
        if not chunk:
            return
        yield chunk


# ── 1. The standard ────────────────────────────────────────────────────────────

def _usable(row: dict, titles: dict[int, str]) -> str:
    """'' when the row may be used, else why not."""
    if row['id'] not in titles:
        return 'missing'
    return '' if normalize_title(titles[row['id']]) == row['t'] else 'changed'


def summarize_standard(name: str) -> dict[str, Any]:
    """What loading would do, from this database. Changes nothing."""
    header, rows = read(name)
    counts = {'rows': 0, 'usable': 0, 'missing': 0, 'changed': 0, 'already': 0, 'human_fields': 0}
    by_category: dict[str, int] = {}
    sample: list[dict] = []
    for chunk in _chunks(rows, 5000):
        ids = [r['id'] for r in chunk]
        titles = dict(Product.objects.filter(pk__in=ids).values_list('pk', 'title'))
        profiles = {p['product_id']: p for p in ProductProfile.objects.filter(product_id__in=ids).values(
            'product_id', 'vector_text', 'category', 'subcategory', 'field_meta')}
        for r in chunk:
            counts['rows'] += 1
            why = _usable(r, titles)
            if why:
                counts[why] += 1
                continue
            counts['usable'] += 1
            now = profiles.get(r['id']) or {}
            if now.get('vector_text') == r['f'].get('vector_text'):
                counts['already'] += 1
            counts['human_fields'] += sum(1 for f in r['f'] if ((now.get('field_meta') or {}).get(f) or {}).get('source') == 'human')
            cat = r['f'].get('category') or '(none)'
            by_category[cat] = by_category.get(cat, 0) + 1
            if len(sample) < 20 and counts['usable'] % 997 == 1:
                sample.append({
                    'product': titles[r['id']][:60], 'now': ' > '.join(x for x in (now.get('category'), now.get('subcategory')) if x) or '-',
                    'title': r['f'].get('display_title', ''), 'tag name': r['f'].get('short_name', ''),
                    'category': ' > '.join(x for x in (r['f'].get('category'), r['f'].get('subcategory')) if x),
                })
    return {'header': header, 'counts': counts, 'by_category': by_category, 'sample': sample}


def load_standard(name: str, *, request_id: int, start: int = 0,
                  on_chunk: Callable[[int, dict], None] | None = None) -> dict[str, int]:
    """Set the profile fields from the file, from row `start`. Idempotent; a person's value is kept."""
    header, rows = read(name)
    counts = {'products': 0, 'fields_set': 0, 'unchanged': 0, 'kept_human': 0, 'missing': 0, 'changed': 0}
    index = start
    for chunk in _chunks(islice(rows, start, None), CHUNK):
        ids = [r['id'] for r in chunk]
        titles = dict(Product.objects.filter(pk__in=ids).values_list('pk', 'title'))
        usable = [r for r in chunk if not _usable(r, titles)]
        for r in chunk:
            why = _usable(r, titles)
            if why:
                counts[why] += 1
        with transaction.atomic():
            have = set(ProductProfile.objects.filter(product_id__in=[r['id'] for r in usable]).values_list('product_id', flat=True))
            ProductProfile.objects.bulk_create([ProductProfile(product_id=r['id']) for r in usable if r['id'] not in have],
                                               batch_size=1000, ignore_conflicts=True)
            profiles = {p.product_id: p for p in ProductProfile.objects.select_for_update().filter(product_id__in=[r['id'] for r in usable])}
            now = timezone.now()
            touched, fields = [], set()
            for r in usable:
                profile = profiles[r['id']]
                meta = dict(profile.field_meta or {})
                changed = False
                for field in FIELDS:
                    if field not in r['f']:
                        continue
                    value = _clean(field, r['f'][field])
                    old_meta = meta.get(field) or {}
                    if old_meta.get('source') == 'human':
                        counts['kept_human'] += 1
                        continue
                    if getattr(profile, field) == value and old_meta.get('source') == r['s']:
                        counts['unchanged'] += 1
                        continue
                    prev = {'v': getattr(profile, field), 'm': {k: v for k, v in old_meta.items() if k != 'prev'}}
                    setattr(profile, field, value)
                    meta[field] = {'source': r['s'], 'confidence': r.get('c', ''), 'set_at': now.isoformat(),
                                   'rules_version': header['rules_version'], 'request': request_id, 'prev': prev}
                    fields.add(field)
                    counts['fields_set'] += 1
                    changed = True
                if changed:
                    profile.field_meta = meta
                    profile.updated_at = now
                    touched.append(profile)
                    counts['products'] += 1
            if touched:
                ProductProfile.objects.bulk_update(touched, [*fields, 'field_meta', 'updated_at'], batch_size=500)
                # bulk_update sends no signal: refresh the inventory search line of these products here.
                rebuild_search_text([profile.product_id for profile in touched])
        index += len(chunk)
        if on_chunk:
            on_chunk(index, counts)
    return counts


def undo_standard(request_id: int) -> dict[str, int]:
    """Put back what each field held before this load (the value is kept beside the field's provenance)."""
    restored = profiles_touched = 0
    last = 0
    while True:
        chunk = list(ProductProfile.objects.filter(pk__gt=last).exclude(vector_text='').order_by('pk')[:CHUNK])
        if not chunk:
            break
        last = chunk[-1].pk
        touched, fields = [], set()
        for profile in chunk:
            meta = dict(profile.field_meta or {})
            mine = [f for f in FIELDS if (meta.get(f) or {}).get('request') == request_id]
            for field in mine:
                prev = meta[field].get('prev') or {}
                setattr(profile, field, prev.get('v') if prev.get('v') is not None else ProductProfile._meta.get_field(field).get_default())
                if prev.get('m'):
                    meta[field] = prev['m']
                else:
                    meta.pop(field, None)
                fields.add(field)
                restored += 1
            if mine:
                profile.field_meta = meta
                touched.append(profile)
        if touched:
            ProductProfile.objects.bulk_update(touched, [*fields, 'field_meta'], batch_size=500)
            profiles_touched += len(touched)
    return {'fields_restored': restored, 'products': profiles_touched}


# ── 2. The merges (and the decisions behind them) ──────────────────────────────

def _merge_block(row: dict, titles: dict[int, str], merged_away: set[int]) -> str:
    """'' when the merge may run, else why not."""
    s, m = row['s'], row['m']
    if s not in titles or m not in titles:
        return 'missing'
    if normalize_title(titles[s]) != row['st'] or normalize_title(titles[m]) != row['mt']:
        return 'changed'
    if m in merged_away:
        return 'already'
    if s in merged_away:
        return 'survivor_merged'
    return ''


def _merge_state(rows: list[dict]) -> tuple[dict[int, str], set[int]]:
    ids = {r['s'] for r in rows} | {r['m'] for r in rows}
    titles = dict(Product.objects.filter(pk__in=ids).values_list('pk', 'title'))
    merged_away = set(CatalogMerge.objects.filter(merged_id__in=ids, undone_at__isnull=True).values_list('merged_id', flat=True))
    return titles, merged_away


def summarize_merges(name: str) -> dict[str, Any]:
    header, rows = read(name)
    counts = {'rows': 0, 'usable': 0, 'missing': 0, 'changed': 0, 'already': 0, 'survivor_merged': 0, 'items_moved': 0}
    sample: list[dict] = []
    from django.db.models import Count

    for chunk in _chunks(rows, 5000):
        titles, merged_away = _merge_state(chunk)
        items = dict(Product.objects.filter(pk__in=[r['m'] for r in chunk]).annotate(n=Count('items')).values_list('pk', 'n'))
        for r in chunk:
            counts['rows'] += 1
            why = _merge_block(r, titles, merged_away)
            if why:
                counts[why] += 1
                continue
            counts['usable'] += 1
            counts['items_moved'] += items.get(r['m'], 0)
            if len(sample) < 20 and counts['usable'] % 499 == 1:
                sample.append({'keep': titles[r['s']][:60], 'merge': titles[r['m']][:60], 'items moved': items.get(r['m'], 0),
                               'why': r.get('r', '')[:80]})
    return {'header': header, 'counts': counts, 'sample': sample}


def load_decisions(name: str) -> int:
    """The pipeline's same / different answers, so production never asks a decided pair again."""
    _header, rows = read(name)
    added = 0
    for chunk in _chunks(rows, 2000):
        ids = {r['a'] for r in chunk} | {r['b'] for r in chunk}
        exist = set(Product.objects.filter(pk__in=ids).values_list('pk', flat=True))
        objs = [DedupeDecision(product_a_id=r['a'], product_b_id=r['b'], decision=r['d'], similarity=r.get('sim'),
                               reason=(r.get('r') or '')[:300], source=r['src'], rules_version=r['v'])
                for r in chunk if r['a'] in exist and r['b'] in exist]
        added += len(DedupeDecision.objects.bulk_create(objs, batch_size=2000, ignore_conflicts=True))
    return added


def apply_merges(name: str, *, start: int = 0, counts: dict[str, int] | None = None,
                 on_step: Callable[[int, dict], None] | None = None, every: int = 100) -> dict[str, int]:
    """Replay the merges in the order they were made, from row `start`. A merge that no longer fits is skipped."""
    _header, rows = read(name)
    counts = dict(counts or {})
    for key in ('merged', 'missing', 'changed', 'already', 'survivor_merged'):
        counts.setdefault(key, 0)
    index = start
    for chunk in _chunks(islice(rows, start, None), every):
        for r in chunk:
            with transaction.atomic():
                titles, merged_away = _merge_state([r])
                why = _merge_block(r, titles, merged_away)
                if why:
                    counts[why] += 1
                else:
                    both = Product.objects.in_bulk([r['s'], r['m']])
                    merge_products(both[r['s']], both[r['m']], method=MERGE_METHOD, reason=r.get('r', ''))
                    counts['merged'] += 1
        index += len(chunk)
        if on_step:
            on_step(index, counts)
    return counts


def undo_merges(started_at, finished_at) -> dict[str, int]:
    undone = 0
    qs = CatalogMerge.objects.filter(method=MERGE_METHOD, undone_at__isnull=True, created_at__gte=started_at)
    if finished_at:
        qs = qs.filter(created_at__lte=finished_at)
    for merge in qs.order_by('-pk'):
        undo_merge(merge)
        undone += 1
    return {'undone': undone}


# ── 3. Vectors ─────────────────────────────────────────────────────────────────

def vectors_queryset():
    """Standardized products that are still their own product (a merged-away product needs no vector)."""
    return Product.objects.filter(profile__merged_into__isnull=True, profile__vector_text__gt='')


def vectors_needed() -> dict[str, int]:
    from apps.inventory.services.product_vectors import MODEL_NAME, product_text, text_hash

    have = dict(ProductVector.objects.filter(model_name=MODEL_NAME).values_list('product_id', 'text_hash'))
    total = stale = 0
    for profile in ProductProfile.objects.filter(merged_into__isnull=True).exclude(vector_text='').only(
            'product_id', 'vector_text', 'category', 'subcategory').iterator(chunk_size=5000):
        total += 1
        if have.get(profile.product_id) != text_hash(product_text(Product(pk=profile.product_id), profile)):
            stale += 1
    return {'standardized': total, 'to_build': stale}


def embed_standard(*, start: int = 0, pause: float = 0.3, size: int = 500,
                   on_chunk: Callable[[int, dict], None] | None = None) -> dict[str, int]:
    """Build the vector of every standardized product from its vector text, after product id `start`."""
    from apps.inventory.services.product_vectors import embed_products

    counts = {'created': 0, 'updated': 0, 'skipped': 0}
    last = start
    while True:
        chunk = list(vectors_queryset().filter(pk__gt=last).order_by('pk')[:size])
        if not chunk:
            break
        for k, v in embed_products(chunk).items():
            counts[k] += v
        last = chunk[-1].pk
        if on_chunk:
            on_chunk(last, counts)
        if pause:
            time.sleep(pause)  # the web process shares its CPU with the register
    return counts
