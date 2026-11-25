"""Step 3, Match products (code, no AI): each line to a product we have (``is`` / ``like`` + confidence) or new.

Evidence, strongest first:
1. **Past trucks**: the same seller title on an earlier truck whose items became one product.
2. **UPC** (rounded spreadsheet UPCs are ignored) and **the seller's item number** (``VendorProductRef``).
3. **Words**: the line's ``brand | title`` vector against every product vector (the HNSW index, 50 lines a query).

An ID only counts when the words agree (IDs on these manifests are often wrong). Identical lines are decided once.
The unsure middle is left ``like`` with its candidates; the AI judge (a button) decides those.
"""
from __future__ import annotations

import re
import time
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache
from typing import Any

from django.db import connection
from django.db.models import Count

from apps.prep_steps.models import PrepLine
from apps.prep_steps.services.load import upc_rounded
from apps.prep_steps.services.rules import _c, _staff, is_junk_title, product_stats

IS_SIM = 0.93       # the words alone say it is this product (same brand, no number clash)
AGREE = 0.80        # an ID hit is believed when the words agree this much
LIKE_SIM = 0.80     # below this, with no ID hit, it is a new product
NEAREST = 5
NO_BRAND = {'', 'generic', 'unbranded', 'unknown', 'na', 'none', 'no brand'}


def slug(text: Any) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', str(text or '').lower()).strip()


def line_text(x: PrepLine) -> str:
    b = slug(x.brand)
    parts = [x.brand if b not in NO_BRAND else '', x.title or x.src_title]
    return ' | '.join(p.strip() for p in parts if p and p.strip())


@lru_cache(maxsize=1)
def _embedder():
    from fastembed import TextEmbedding

    from apps.inventory.services.product_vectors import MODEL_NAME

    return TextEmbedding(MODEL_NAME)


def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return [v.tolist() for v in _embedder().embed(texts, batch_size=256)]


def _vec(v) -> str:
    return '[' + ','.join(f'{float(x):.6f}' for x in v) + ']'


def nearest(vectors: dict[int, list[float]], k: int = NEAREST) -> dict[int, list[tuple[int, float]]]:
    from apps.inventory.models import ProductVector
    from apps.inventory.services.product_vectors import MODEL_NAME

    out: dict[int, list[tuple[int, float]]] = defaultdict(list)
    ids = list(vectors)
    table = ProductVector._meta.db_table
    with connection.cursor() as cur:
        for i in range(0, len(ids), 50):
            chunk = ids[i:i + 50]
            values = ', '.join(['(%s::bigint, %s::vector)'] * len(chunk))
            args: list = []
            for lid in chunk:
                args += [lid, _vec(vectors[lid])]
            cur.execute(f"""
SELECT q.id, n.product_id, n.d FROM (VALUES {values}) AS q(id, v)
CROSS JOIN LATERAL (
    SELECT t.product_id, t.embedding <=> q.v AS d FROM {table} t WHERE t.model_name = %s
    ORDER BY t.embedding <=> q.v LIMIT {int(k)}) n""", args + [MODEL_NAME])
            for lid, pid, d in cur.fetchall():
                out[lid].append((pid, 1 - float(d)))
    return out


def _active(product_ids: set[int]) -> dict[int, int]:
    """{product id: the active product that stands for it (itself, or what it was merged into)}."""
    from apps.inventory.models import Product, ProductProfile

    merged = dict(ProductProfile.objects.filter(product_id__in=product_ids, merged_into__isnull=False)
                  .values_list('product_id', 'merged_into_id'))
    ends = {pid: merged.get(pid, pid) for pid in product_ids}
    alive = set(Product.objects.filter(pk__in=set(ends.values()), is_active=True).values_list('pk', flat=True))
    return {pid: end for pid, end in ends.items() if end in alive}


def _gtin_variants(upc: str) -> set[str]:
    return {upc, upc.lstrip('0'), upc.zfill(12), upc.zfill(13), upc.zfill(14)}


def upc_hits(lines: list[PrepLine]) -> dict[int, int]:
    from apps.inventory.models import Product

    by_upc: dict[str, list[int]] = defaultdict(list)
    for x in lines:
        if x.upc and not upc_rounded(x.upc):
            by_upc[x.upc.lstrip('0')].append(x.pk)
    if not by_upc:
        return {}
    variants = set()
    for u in by_upc:
        variants |= _gtin_variants(u)
    out: dict[int, int] = {}
    for pid, ids in (Product.objects.filter(identifiers__upc__in=list(variants), is_active=True)
                     .order_by('id').values_list('pk', 'identifiers')):
        u = str((ids or {}).get('upc') or '').lstrip('0')
        for lid in by_upc.get(u, []):
            out.setdefault(lid, pid)
    return out


def ref_hits(lines: list[PrepLine], vendor_id: int) -> dict[int, int]:
    from apps.inventory.models import VendorProductRef

    by_num: dict[str, list[int]] = defaultdict(list)
    for x in lines:
        if x.item_number:
            by_num[x.item_number].append(x.pk)
    out: dict[int, int] = {}
    for num, pid in VendorProductRef.objects.filter(vendor_id=vendor_id, vendor_item_number__in=list(by_num)) \
            .values_list('vendor_item_number', 'product_id'):
        for lid in by_num[num]:
            out[lid] = pid
    return out


def past_truck_hits(lines: list[PrepLine], order_id: int) -> dict[int, tuple[int, int]]:
    """{line id: (product id, items)}: the same seller title on an earlier truck became mostly this product."""
    from apps.inventory.models import Item

    by_title: dict[str, list[int]] = defaultdict(list)
    for x in lines:
        if x.src_title and not is_junk_title(x.src_title):
            by_title[x.src_title[:300]].append(x.pk)
    if not by_title:
        return {}
    best: dict[str, tuple[int, int]] = {}
    titles = list(by_title)
    for i in range(0, len(titles), 500):
        rows = (Item.objects.filter(manifest_row__title__in=titles[i:i + 500], product__isnull=False)
                .exclude(purchase_order_id=order_id)
                .values('manifest_row__title', 'product_id').annotate(n=Count('id')))
        for r in rows:
            t = r['manifest_row__title']
            if r['n'] > best.get(t, (0, 0))[1]:
                best[t] = (r['product_id'], r['n'])
    out = {}
    for t, hit in best.items():
        for lid in by_title.get(t, []):
            out[lid] = hit
    return out


_NUM = re.compile(r'\b(\d+(?:\.\d+)?)\s*(pk|pack|ct|count|pc|pcs|piece|pieces|oz|lb|lbs|qt|gal|in|inch|ft|gb|tb|'
                  r'quart|"|cup)\b', re.I)


def _nums(text: str) -> set[tuple[str, str]]:
    norm = {'pack': 'pk', 'count': 'ct', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc', 'inch': 'in', '"': 'in',
            'lbs': 'lb'}
    return {(m.group(1).rstrip('0').rstrip('.') if '.' in m.group(1) else m.group(1),
             norm.get(m.group(2).lower(), m.group(2).lower())) for m in _NUM.finditer(str(text or ''))}


def number_clash(a: str, b: str) -> bool:
    """Both name a size or count of the same kind and they differ (30 qt vs 45 qt, 2 pk vs 12 pk)."""
    na, nb = _nums(a), _nums(b)
    units_a = defaultdict(set)
    for n, u in na:
        units_a[u].add(n)
    for n, u in nb:
        if u in units_a and n not in units_a[u]:
            return True
    return False


def brand_ok(line_brand: str, product_brand: str) -> bool:
    a, b = slug(line_brand), slug(product_brand)
    return a in NO_BRAND or b in NO_BRAND or a == b or (len(a) >= 3 and (a in b or b in a))


def retail_ok(line_retail, product_retail) -> bool:
    if not line_retail or not product_retail:
        return True
    a, b = float(line_retail), float(product_retail)
    return max(a, b) / max(min(a, b), 0.01) <= 3.0


def decide(x: PrepLine, cands: list[dict], facts: dict[int, dict]) -> tuple[int | None, str, int, str]:
    """(product id, kind, confidence, why) by rule."""
    if not cands:
        return None, 'new', 90, 'Nothing like it in our products'
    top = cands[0]
    f = facts.get(top['product_id'], {})
    words = f"{f.get('brand', '')} {f.get('title', '')}"
    clash = number_clash(x.src_title, words)
    b_ok = brand_ok(x.brand, f.get('brand', ''))
    r_ok = retail_ok(x.src_retail, f.get('retail_avg'))
    sim = top['sim']
    num = f.get('number') or top['product_id']
    if top['id'] == 'past':
        conf = 97 if sim >= AGREE and not clash else 85
        return top['product_id'], 'is', conf, f"An earlier truck's same line became {num} ({top['items']} items)"
    if top['id'] in ('upc', 'ref'):
        name = 'UPC' if top['id'] == 'upc' else "seller's item number"
        if sim >= AGREE and not clash and r_ok:
            return top['product_id'], 'is', min(99, 85 + int((sim - AGREE) * 70)), f'Same {name}, words agree ({sim:.2f})'
        return top['product_id'], 'like', 60, f"Same {name} but the words differ ({sim:.2f})"
    if sim >= IS_SIM and b_ok and not clash and r_ok:
        return top['product_id'], 'is', min(98, int(sim * 100)), f'Same product by its words ({sim:.2f})'
    if sim >= LIKE_SIM:
        why = [f'Similar ({sim:.2f})']
        if not b_ok:
            why.append('brand differs')
        if clash:
            why.append('size or count differs')
        if not r_ok:
            why.append('retail far off')
        return top['product_id'], 'like', int(sim * 100) - (10 if (clash or not b_ok) else 0), ', '.join(why)
    return None, 'new', int((1 - sim) * 100) + 20, f'Closest is only {sim:.2f}: a new product'


def match_lines(lines: list[PrepLine], order, force: bool = False, progress=None) -> tuple[list[dict], dict]:
    """The match changes for these lines and a few counts."""
    started = time.monotonic()
    todo = [x for x in lines if force or not _staff(x, 'match_product_id')]
    if not todo:
        return [], {'lines': 0}
    # Identical lines: decide the first, copy to the rest.
    leaders: dict[str, PrepLine] = {}
    twin: dict[int, PrepLine] = {}
    texts: dict[int, str] = {}
    for x in todo:
        t = line_text(x)
        texts[x.pk] = t
        key = slug(t) + '|' + (x.upc or '')
        lead = leaders.setdefault(key, x)
        if lead is not x:
            twin[x.pk] = lead
    heads = [x for x in todo if x.pk not in twin]
    past = past_truck_hits(heads, order.pk)
    upcs = upc_hits(heads)
    refs = ref_hits(heads, order.vendor_id)
    if progress:
        progress('ids')
    to_embed = [x for x in heads if texts[x.pk] and not is_junk_title(x.title or x.src_title)]
    vecs = dict(zip([x.pk for x in to_embed], embed([texts[x.pk] for x in to_embed])))
    if progress:
        progress('embedded')
    near = nearest(vecs) if vecs else {}
    id_pids = set(upcs.values()) | set(refs.values()) | {p for p, _n in past.values()}
    all_pids = {pid for hits in near.values() for pid, _s in hits} | id_pids
    alive = _active(all_pids)
    # Score ID-hit products against the line's words when the vector search did not bring them.
    from apps.inventory.models import ProductVector
    from apps.inventory.services.product_vectors import MODEL_NAME

    pvec = {pid: emb for pid, emb in ProductVector.objects.filter(
        product_id__in={alive[p] for p in id_pids if p in alive}, model_name=MODEL_NAME)
        .values_list('product_id', 'embedding')}
    cands: dict[int, list[dict]] = {}
    for x in heads:
        pool: dict[int, dict] = {}
        for pid, sim in near.get(x.pk, []):
            end = alive.get(pid)
            if end:
                c = pool.setdefault(end, {'product_id': end, 'sim': 0.0, 'id': '', 'items': 0})
                c['sim'] = max(c['sim'], sim)
        for kind, pid, items in (('past', *past[x.pk]) if x.pk in past else (None, None, 0),
                                 ('upc', upcs.get(x.pk), 0), ('ref', refs.get(x.pk), 0)):
            end = alive.get(pid) if pid else None
            if not kind or not end:
                continue
            c = pool.setdefault(end, {'product_id': end, 'sim': 0.0, 'id': '', 'items': 0})
            if not c['id']:
                c['id'], c['items'] = kind, items
            if not c['sim'] and end in pvec and x.pk in vecs:
                c['sim'] = float(sum(float(a) * float(b) for a, b in zip(vecs[x.pk], pvec[end])))
        rank = {'past': 0.12, 'upc': 0.08, 'ref': 0.06, '': 0}
        cands[x.pk] = sorted(pool.values(), key=lambda c: (-(c['sim'] + rank[c['id']]), c['product_id']))[:3]
    facts = product_stats({c['product_id'] for cs in cands.values() for c in cs})
    from apps.inventory.models import ProductProfile

    for pid, cat in ProductProfile.objects.filter(product_id__in=list(facts)).values_list('product_id', 'category'):
        facts[pid]['category'] = cat
    changes: list[dict] = []
    counts: dict[str, int] = defaultdict(int)
    decided: dict[int, tuple] = {}
    for x in heads:
        cs = cands.get(x.pk, [])
        pid, kind, conf, why = decide(x, cs, facts)
        if is_junk_title(x.title or x.src_title) and kind != 'is':
            pid, kind, conf, why = None, 'new', 30, 'No real title to match on'
        decided[x.pk] = (pid, kind, conf, why, [
            {'product_id': c['product_id'], 'sim': round(c['sim'], 3), 'id': c['id'],
             'number': facts.get(c['product_id'], {}).get('number', ''),
             'title': facts.get(c['product_id'], {}).get('title', '')[:120],
             'brand': facts.get(c['product_id'], {}).get('brand', ''),
             'category': facts.get(c['product_id'], {}).get('category', ''),
             'retail_avg': facts.get(c['product_id'], {}).get('retail_avg'),
             'sold': facts.get(c['product_id'], {}).get('sold', 0),
             'avg_sold': facts.get(c['product_id'], {}).get('avg_sold')} for c in cs])
    for x in todo:
        lead = twin.get(x.pk)
        pid, kind, conf, why, cl = decided[lead.pk if lead else x.pk]
        if lead:
            why = f'Same as line {lead.row_number}: {why}'
        counts[kind] += 1
        changes += [_c(x, 'match_product_id', pid, why), _c(x, 'match_kind', kind, why),
                    _c(x, 'match_confidence', max(0, min(100, conf)), ''), _c(x, 'match_candidates', cl, '')]
    return changes, {'lines': len(todo), 'unique': len(heads), 'seconds': round(time.monotonic() - started, 1),
                     **counts}


def drop_weak(lines: list[PrepLine], below: int = 70) -> list[dict]:
    """``like`` matches under the bar become new products (they keep their candidates)."""
    out = []
    for x in lines:
        if x.match_kind == 'like' and (x.match_confidence or 0) < below:
            out += [_c(x, 'match_product_id', None, f'Like match under {below}%: new product'),
                    _c(x, 'match_kind', 'new', f'Like match under {below}%: new product')]
    return out


def take_candidate(lines: list[PrepLine], index: int = 0, kind: str = 'is') -> list[dict]:
    out = []
    for x in lines:
        cs = x.match_candidates or []
        if len(cs) > index:
            c = cs[index]
            why = f"Picked {c.get('number') or c['product_id']} by hand"
            out += [_c(x, 'match_product_id', c['product_id'], why), _c(x, 'match_kind', kind, why),
                    _c(x, 'match_confidence', 100 if kind == 'is' else 80, '')]
    return out


def mark_new(lines: list[PrepLine]) -> list[dict]:
    out = []
    for x in lines:
        out += [_c(x, 'match_product_id', None, 'New product (by hand)'), _c(x, 'match_kind', 'new', 'New product (by hand)'),
                _c(x, 'match_confidence', 100, '')]
    return out


def money(v) -> Decimal | None:
    return Decimal(str(v)) if v not in (None, '') else None
