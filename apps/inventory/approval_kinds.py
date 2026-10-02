"""
Inventory work that goes through Superuser → Requests (staged in production, approved there).

- ``inventory.load_profile_proposals``: add a backfill's proposals. This is staging: profiles and
  products are untouched. Undo deletes the proposals the load added that are not yet applied.
- ``inventory.apply_profile_proposals``: apply auto (or accepted) proposals to product profiles.
  A human value always wins. Undo clears the fields this apply set and puts the proposals back.
- ``inventory.seed_brand_aliases``: add the brand spellings from ``data/brand_aliases.csv`` that are
  not in the table yet. Undo deletes the ones it added.
- ``inventory.merge_duplicates``: merge the duplicate pairs found at staging (the plan is frozen in
  params, so approval applies exactly what was previewed). It is reversible through ``CatalogMerge``.
- ``inventory.load_standard``, ``inventory.merge_decided``, ``inventory.embed_standard``: the standardize and
  dedupe pipeline's results, exported from the owner's PC into ``data/backfill/`` and loaded here
  (``services/standard_load.py``). Run them in that order.
"""
from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Any

from django.db.models import Count, Sum

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register
from apps.inventory.models import BrandAlias, CatalogMerge, Product, ProductProfile, ProductProposal
from apps.inventory.services import proposal_load
from apps.inventory.services.catalog_merge import duplicate_candidates, merge_products, undo_merge
from apps.inventory.services.product_profile import apply_proposals

CHUNK = 2000


def _short(value: Any, n: int = 60) -> Any:
    text = value if isinstance(value, str) else ('' if value is None else str(value))
    return text if len(text) <= n else text[: n - 1] + '…'


# ── Load proposals ─────────────────────────────────────────────────────────────

def _load_preview(params: dict) -> dict:
    batch = params['batch']
    path, second = params.get('path'), params.get('second', '')
    if not path:
        path, second = proposal_load.BACKFILLS[batch]
    info = proposal_load.summarize(path, second)
    existing = ProductProposal.objects.filter(batch=batch).count()
    return {
        'params': {'path': path, 'second': second},
        'counts': {
            'Title groups': info['groups'], 'Auto-accepted groups': info['auto'], 'Groups for review': info['pending'],
            'Products named': info['products'], 'Proposals already in this batch': existing,
        },
        'changes': [
            f"Adds proposals (category, subcategory, short name, flags) for {info['products']:,} products in batch {batch}.",
            'Nothing on any product or profile changes: applying them is a separate request.',
            f"Sold dollars behind these groups: ${float(info['sold']):,.0f}.",
        ],
        'sample': info['sample'],
    }


def _load_apply(request: ApprovalRequest, progress: Progress) -> dict:
    p = request.params
    start = int(progress.cursor or 0)

    def on_chunk(next_index: int, total: int, added: int) -> None:
        progress.update(done=next_index, total=total, cursor=next_index,
                        log=f'{next_index:,} of {total:,} groups; {added:,} proposals added this run')

    counts = proposal_load.load(p['path'], batch=p['batch'], second=p.get('second', ''), start=start, on_chunk=on_chunk)
    return {'added': counts['added'], 'missing_products': counts['missing_products'], 'batch': p['batch']}


def _load_undo(request: ApprovalRequest) -> dict:
    batch = request.params['batch']
    applied = ProductProposal.objects.filter(batch=batch, status=ProductProposal.STATUS_APPLIED).count()
    if applied:
        raise ValueError(f'{applied:,} proposals in {batch} are already applied: undo that apply first.')
    deleted, _ = ProductProposal.objects.filter(
        batch=batch, status__in=[ProductProposal.STATUS_AUTO, ProductProposal.STATUS_PENDING],
        created_at__gte=request.started_at,
    ).delete()
    return {'deleted': deleted}


register(Kind(
    kind='inventory.load_profile_proposals', label='Load backfill proposals',
    preview=_load_preview, apply=_load_apply, undo=_load_undo,
))


# ── Apply proposals ────────────────────────────────────────────────────────────

def _apply_qs(params: dict):
    qs = ProductProposal.objects.filter(status=params.get('status', ProductProposal.STATUS_AUTO))
    if params.get('batch'):
        qs = qs.filter(batch=params['batch'])
    return qs


def _apply_preview(params: dict) -> dict:
    qs = _apply_qs(params)
    by_field = dict(qs.values_list('field').annotate(n=Count('id')))
    agg = qs.aggregate(n=Count('id'), products=Count('product', distinct=True), dollars=Sum('dollars'))
    sample = []
    for p in qs.select_related('product').order_by('-dollars', 'id')[:20]:
        current = ProductProfile.objects.filter(product_id=p.product_id).values_list(p.field, flat=True).first()
        sample.append({
            'product': _short(p.product.title), 'field': p.field, 'now': _short(current) or '-',
            'proposed': _short(p.value), 'confidence': p.confidence, 'sold $': str(p.dollars),
        })
    return {
        'counts': {'Proposals': agg['n'] or 0, 'Products': agg['products'] or 0, **{f'Field: {k}': v for k, v in by_field.items()}},
        'changes': [
            f"Sets profile fields on {agg['products'] or 0:,} products from {params.get('status', 'auto')} proposals"
            + (f" in batch {params['batch']}" if params.get('batch') else '') + '.',
            'A value a person set is never overwritten (that proposal is marked rejected).',
            f"Sold dollars behind them: ${float(agg['dollars'] or 0):,.0f}.",
        ],
        'sample': sample,
    }


def _apply_apply(request: ApprovalRequest, progress: Progress) -> dict:
    qs = _apply_qs(request.params).order_by('id')
    total = progress.state.get('total') or qs.count()
    last_id = int(progress.cursor or 0)
    done_so_far = int(progress.state.get('done') or 0)
    counts = Counter(progress.state.get('counts') or {})
    while True:
        chunk = list(qs.filter(id__gt=last_id)[:CHUNK])
        if not chunk:
            break
        counts.update(apply_proposals(chunk))
        last_id = chunk[-1].id
        done_so_far += len(chunk)
        progress.update(done=done_so_far, total=total, cursor=last_id, counts=dict(counts),
                        log=f"{done_so_far:,} of {total:,}; applied {counts['applied']:,}, kept human {counts['kept_human']:,}")
    return dict(counts)


def _apply_undo(request: ApprovalRequest) -> dict:
    fields_default = {f.name: f.get_default() for f in ProductProfile._meta.get_fields() if hasattr(f, 'get_default')}
    qs = ProductProposal.objects.filter(
        status=ProductProposal.STATUS_APPLIED, decided_at__gte=request.started_at, decided_at__lte=request.finished_at,
    )
    if request.params.get('batch'):
        qs = qs.filter(batch=request.params['batch'])
    restored = cleared = 0
    last_id = 0
    back_to = request.params.get('status', ProductProposal.STATUS_AUTO)
    while True:
        chunk = list(qs.filter(id__gt=last_id).order_by('id')[:CHUNK])
        if not chunk:
            break
        last_id = chunk[-1].id
        profiles = {pr.product_id: pr for pr in ProductProfile.objects.filter(product_id__in={p.product_id for p in chunk})}
        touched, fields = {}, set()
        for p in chunk:
            profile = profiles.get(p.product_id)
            meta = dict((profile.field_meta or {}) if profile else {})
            if profile and (meta.get(p.field) or {}).get('source') == p.source:
                setattr(profile, p.field, fields_default.get(p.field))
                meta.pop(p.field, None)
                profile.field_meta = meta
                touched[profile.pk] = profile
                fields.add(p.field)
                cleared += 1
            p.status = back_to
            p.decided_at = None
            p.decided_by = None
            restored += 1
        if touched:
            ProductProfile.objects.bulk_update(list(touched.values()), list(fields) + ['field_meta'], batch_size=1000)
        ProductProposal.objects.bulk_update(chunk, ['status', 'decided_at', 'decided_by'], batch_size=CHUNK)
    return {'proposals_restored': restored, 'fields_cleared': cleared}


register(Kind(
    kind='inventory.apply_profile_proposals', label='Apply proposals to product profiles',
    preview=_apply_preview, apply=_apply_apply, undo=_apply_undo,
))


# ── Brand aliases ──────────────────────────────────────────────────────────────

ALIASES_CSV = Path(__file__).resolve().parent / 'data' / 'brand_aliases.csv'


def _new_aliases() -> list[dict]:
    existing = set(BrandAlias.objects.values_list('alias', flat=True))
    rows, seen = [], set()
    with open(ALIASES_CSV, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['alias'] and r['alias'] not in existing and r['alias'] not in seen:
                seen.add(r['alias'])
                rows.append(r)
    return rows


def _aliases_preview(params: dict) -> dict:
    rows = _new_aliases()
    junk = sum(1 for r in rows if r['is_junk'] == '1')
    return {
        'counts': {'New aliases': len(rows), 'Marked junk (brand becomes blank)': junk, 'Already in the table': BrandAlias.objects.count()},
        'changes': [
            f'Adds {len(rows):,} brand spellings, each mapped to its canonical brand (R-023 clusters).',
            'Existing aliases are kept as they are. Intake, the backfill and short names read this table.',
        ],
        'sample': [{'spelling': r['alias'], 'brand': r['brand'] or '(unknown)', 'junk': r['is_junk'] == '1'} for r in rows[:20]],
    }


def _aliases_apply(request: ApprovalRequest, progress: Progress) -> dict:
    rows = _new_aliases()
    created = BrandAlias.objects.bulk_create(
        [BrandAlias(alias=r['alias'], brand=r['brand'], is_junk=r['is_junk'] == '1', source=r['source']) for r in rows],
        batch_size=1000,
    )
    ids = list(BrandAlias.objects.filter(alias__in=[r['alias'] for r in rows]).values_list('pk', flat=True))
    progress.update(done=len(created), total=len(rows), log=f'added {len(created):,} aliases')
    return {'added': len(created), 'ids': ids}


def _aliases_undo(request: ApprovalRequest) -> dict:
    deleted, _ = BrandAlias.objects.filter(pk__in=(request.result or {}).get('ids') or []).delete()
    return {'deleted': deleted}


register(Kind(
    kind='inventory.seed_brand_aliases', label='Add brand aliases',
    preview=_aliases_preview, apply=_aliases_apply, undo=_aliases_undo,
))


# ── Duplicate merges ───────────────────────────────────────────────────────────

def _merge_preview(params: dict) -> dict:
    methods = tuple(m.strip() for m in str(params.get('methods', 'upc')).split(',') if m.strip())
    cands = duplicate_candidates(methods=methods, limit=int(params.get('limit') or 0))
    ids = {c.survivor_id for c in cands} | {c.merged_id for c in cands}
    info = {p['pk']: p for p in Product.objects.filter(pk__in=ids).annotate(n=Count('items')).values('pk', 'title', 'brand', 'n')}
    by_method = Counter(c.method for c in cands)
    moved = sum((info.get(c.merged_id) or {}).get('n') or 0 for c in cands)
    return {
        'params': {'plan': [[c.survivor_id, c.merged_id, c.method, c.key[:300]] for c in cands]},
        'counts': {'Merges': len(cands), 'Items moved to the survivor': moved, **{f'By {k}': v for k, v in by_method.items()}},
        'changes': [
            f'Folds {len(cands):,} duplicate products into their survivor: items and manifest links move over.',
            'Nothing is deleted. The merged product is set inactive, and every merge can be undone.',
        ],
        'sample': [
            {
                'method': c.method,
                'keep': _short((info.get(c.survivor_id) or {}).get('title')), 'keep items': (info.get(c.survivor_id) or {}).get('n'),
                'merge': _short((info.get(c.merged_id) or {}).get('title')), 'merge items': (info.get(c.merged_id) or {}).get('n'),
            }
            for c in cands[:20]
        ],
    }


def _merge_apply(request: ApprovalRequest, progress: Progress) -> dict:
    plan = request.params.get('plan') or []
    start = int(progress.cursor or 0)
    merge_ids = list(progress.state.get('merge_ids') or [])
    skipped = int(progress.state.get('skipped') or 0)
    for i in range(start, len(plan)):
        survivor_id, merged_id, method, key = plan[i]
        survivor = Product.objects.filter(pk=survivor_id).first()
        merged = Product.objects.filter(pk=merged_id).first()
        if (
            survivor is None or merged is None
            or CatalogMerge.objects.filter(merged_id=merged_id, undone_at__isnull=True).exists()
            or CatalogMerge.objects.filter(merged_id=survivor_id, undone_at__isnull=True).exists()
        ):
            skipped += 1
        else:
            merge_ids.append(merge_products(survivor, merged, method=method, reason=key).pk)
        if (i + 1) % 100 == 0 or i + 1 == len(plan):
            progress.update(done=i + 1, total=len(plan), cursor=i + 1, merge_ids=merge_ids, skipped=skipped,
                            log=f'{i + 1:,} of {len(plan):,}; merged {len(merge_ids):,}, skipped {skipped:,}')
    return {'merged': len(merge_ids), 'skipped': skipped, 'merge_ids': merge_ids}


def _merge_undo(request: ApprovalRequest) -> dict:
    undone = 0
    for merge in CatalogMerge.objects.filter(pk__in=(request.result or {}).get('merge_ids') or [], undone_at__isnull=True).order_by('-pk'):
        undo_merge(merge)
        undone += 1
    return {'undone': undone}


register(Kind(
    kind='inventory.merge_duplicates', label='Merge duplicate products',
    preview=_merge_preview, apply=_merge_apply, undo=_merge_undo,
))


# ── The product standard, merges and vectors from the pipeline (services/standard_load.py) ─────────────

def _plus(base: dict, counts: dict) -> dict:
    """Counts from before a resume plus this run's (zeros kept, unlike Counter addition)."""
    return {k: int(base.get(k) or 0) + int(counts.get(k) or 0) for k in {*base, *counts}}


def _standard_preview(params: dict) -> dict:
    from apps.inventory.services import standard_load

    info = standard_load.summarize_standard(params['file'])
    c, h = info['counts'], info['header']
    top = sorted(info['by_category'].items(), key=lambda kv: -kv[1])[:8]
    return {
        'counts': {
            'Products in the file': c['rows'], 'Will be standardized': c['usable'],
            'Skipped: title changed since 09-24': c['changed'], 'Skipped: product no longer exists': c['missing'],
            'Already loaded': c['already'], 'Fields a person set (kept)': c['human_fields'],
            **{f'Category: {k}': v for k, v in top},
        },
        'changes': [
            f"Sets the standard on {c['usable']:,} products: title, tag name, brand, model, category, subcategory, "
            f"product specs, vector text (rules {h['rules_version']}).",
            'A value a person set is never replaced. Product titles, prices and items are not touched.',
            'Undo puts back what each field held before.',
        ],
        'sample': info['sample'],
    }


def _standard_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.inventory.services import standard_load

    total = (request.preview.get('counts') or {}).get('Products in the file') or 0
    base = dict(progress.state.get('counts') or {})

    def on_chunk(index: int, counts: dict) -> None:
        now = _plus(base, counts)
        progress.update(done=index, total=total, cursor=index, counts=now,
                        log=f"{index:,} of {total:,}; products {now['products']:,}, fields {now['fields_set']:,}, "
                            f"kept human {now['kept_human']:,}")

    counts = standard_load.load_standard(request.params['file'], request_id=request.pk, start=int(progress.cursor or 0),
                                         on_chunk=on_chunk)
    return _plus(base, counts)


def _standard_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.services import standard_load

    return standard_load.undo_standard(request.pk)


register(Kind(
    kind='inventory.load_standard', label='Load the product standard',
    preview=_standard_preview, apply=_standard_apply, undo=_standard_undo,
))


def _decided_preview(params: dict) -> dict:
    from apps.inventory.services import standard_load

    info = standard_load.summarize_merges(params['file'])
    c = info['counts']
    return {
        'counts': {
            'Merges in the file': c['rows'], 'Will be merged': c['usable'], 'Items moved to the survivor': c['items_moved'],
            'Skipped: title changed since 09-24': c['changed'], 'Skipped: product no longer exists': c['missing'],
            'Already merged': c['already'] + c['survivor_merged'],
        },
        'changes': [
            f"Folds {c['usable']:,} duplicate products into their survivor: items, manifest links and open order rows move over.",
            'Nothing is deleted. The merged product is set inactive, and every merge can be undone.',
            'Owner rule: a wrong merge is cheaper than a leftover duplicate.',
            'Also loads the same / different answers behind them, so no pair is asked again.',
        ],
        'sample': info['sample'],
    }


def _decided_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.inventory.services import standard_load

    p = request.params
    total = (request.preview.get('counts') or {}).get('Merges in the file') or 0
    decisions = progress.state.get('decisions')
    if decisions is None and p.get('decisions_file'):
        decisions = standard_load.load_decisions(p['decisions_file'])
        progress.update(decisions=decisions, log=f'{decisions:,} decisions loaded')

    def on_step(index: int, counts: dict) -> None:
        progress.update(done=index, total=total, cursor=index, counts=counts,
                        log=f"{index:,} of {total:,}; merged {counts['merged']:,}" if index % 1000 == 0 or index >= total else '')

    counts = standard_load.apply_merges(p['file'], start=int(progress.cursor or 0), counts=progress.state.get('counts'),
                                        on_step=on_step)
    return {**counts, 'decisions': decisions or 0}


def _decided_undo(request: ApprovalRequest) -> dict:
    from apps.inventory.services import standard_load

    return standard_load.undo_merges(request.started_at, request.finished_at)


register(Kind(
    kind='inventory.merge_decided', label='Merge the duplicates the pipeline decided',
    preview=_decided_preview, apply=_decided_apply, undo=_decided_undo,
))


def _vectors_preview(params: dict) -> dict:
    from apps.inventory.services import standard_load

    c = standard_load.vectors_needed()
    return {
        'counts': {'Standardized products': c['standardized'], 'Vectors to build': c['to_build']},
        'changes': [
            f"Builds the vector of {c['to_build']:,} products from their vector text, so matching and dedupe compare like with like.",
            'It runs slowly on purpose (the register shares the server). Best approved after closing.',
            'Nothing a person sees changes. There is no undo: a vector is rebuilt from the text at any time.',
        ],
        'sample': [],
    }


def _vectors_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.inventory.services import standard_load

    total = (request.preview.get('counts') or {}).get('Standardized products') or 0
    base = dict(progress.state.get('counts') or {})
    seen = int(progress.state.get('done') or 0)

    def on_chunk(last_id: int, counts: dict) -> None:
        now = _plus(base, counts)
        done = seen + counts['created'] + counts['updated'] + counts['skipped']
        progress.update(done=done, total=total, cursor=last_id, counts=now,
                        log=f"{done:,} of {total:,}; built {now['created'] + now['updated']:,}")

    counts = standard_load.embed_standard(start=int(progress.cursor or 0), on_chunk=on_chunk)
    return _plus(base, counts)


register(Kind(
    kind='inventory.embed_standard', label='Build product vectors',
    preview=_vectors_preview, apply=_vectors_apply,
))
