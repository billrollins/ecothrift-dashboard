"""
The dedupe loop (owner, 2026-09-29): standardize first, then find likely duplicates by similarity, and let Spark
make the final call under the same hard spec rules. It runs regularly; every merge is reversible.

1. **Find** (`candidates`): for each standardized product, its nearest neighbours by vector (the vector text,
   `product_vectors`) in the **same canon category and subcategory**, above SIMILARITY. A pair whose product
   specs disagree on a shared key (Queen vs King, 64GB vs 256GB) is dropped: by rule, different products.
   A pair already decided under the current rules version is never asked again.
2. **Decide** (`decide`): Spark sees both standardized products and the spec rules and answers same or
   different; each answer is a `DedupeDecision` row.
3. **Vet** (`vet`): Claude judges a random 200 "same" answers; merge only if 95% are right.
4. **Merge** (`merge_same`): the survivor keeps the most items (then sold dollars, then the lower id); the
   other's title, model, UPCs and brand go into the survivor's aliases; `merge_products` moves the items and
   records exactly what moved, so `undo_merge` can split them again.
"""
from __future__ import annotations

import json
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection, transaction

from apps.inventory import spec_rules
from apps.inventory.models import CatalogMerge, DedupeDecision, Product, ProductProfile
from apps.inventory.services import standardize
from apps.inventory.services.catalog_merge import merge_products
from apps.inventory.services.product_vectors import MODEL_NAME

SIMILARITY = 0.90
# Spark's "same" is trusted only at or above this similarity (2026-10-01 vet: 2-4% wrong above it, 17-29% below).
# Below it, the pair is escalated to Sonnet (the model ladder) before it can merge.
TRUST_SIMILARITY = 0.97
ESCALATE_TO = ('claude-sonnet-5-5', 'medium')
# Owner rule (2026-10-02): a wrong merge is cheaper than a leftover duplicate. Merging two products that are only
# close does little harm (past sales and reports just group them), while duplicates split the history and weaken
# every count. So when in doubt, merge: every pair Sonnet confirms merges, and the dedupe vet passes at 90%, not 95%.
ESCALATED_MIN = SIMILARITY
PASS_SHARE = 0.90
NEIGHBOURS = 5
PER_CALL = 10
OUT_DIR = Path(settings.BASE_DIR) / 'workspace' / 'dedupe'


def _norm(v: Any) -> str:
    return re.sub(r'[^a-z0-9.]+', '', str(v).lower())


def specs_conflict(a: dict, b: dict) -> list[str]:
    """Shared product-spec keys with different values (a different product by rule)."""
    return sorted(k for k in set(a or {}) & set(b or {}) if _norm(a[k]) and _norm(b[k]) and _norm(a[k]) != _norm(b[k]))


def candidates(limit: int = 0) -> list[dict[str, Any]]:
    """Likely-duplicate pairs among standardized, active products (not yet decided under these rules)."""
    version = standardize.rules_version()
    with connection.cursor() as cur:
        cur.execute("""
            SELECT a.product_id, n.product_id, n.sim
            FROM inventory_productvector a
            JOIN inventory_productprofile pa ON pa.product_id = a.product_id
            CROSS JOIN LATERAL (
                SELECT b.product_id, 1 - (a.embedding <=> b.embedding) AS sim
                FROM inventory_productvector b
                WHERE b.model_name = a.model_name AND b.product_id <> a.product_id
                ORDER BY a.embedding <=> b.embedding
                LIMIT %s
            ) n
            JOIN inventory_productprofile pb ON pb.product_id = n.product_id
            WHERE a.model_name = %s AND pa.vector_text <> '' AND pb.vector_text <> ''
              AND pa.merged_into_id IS NULL AND pb.merged_into_id IS NULL
              AND pa.category = pb.category AND pa.subcategory = pb.subcategory
              AND a.product_id < n.product_id AND n.sim >= %s
        """, [NEIGHBOURS, MODEL_NAME, SIMILARITY])
        pairs = cur.fetchall()
    decided = set(DedupeDecision.objects.filter(rules_version=version).values_list('product_a_id', 'product_b_id'))
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(
        product_id__in={x for a, b, _ in pairs for x in (a, b)})}
    out = []
    for a, b, sim in sorted(pairs, key=lambda r: -r[2]):
        if (a, b) in decided:
            continue
        clash = specs_conflict(profiles[a].key_specs, profiles[b].key_specs)
        if clash:
            continue
        out.append({'a': a, 'b': b, 'similarity': round(float(sim), 4)})
        if limit and len(out) >= limit:
            break
    return out


def _card(p: ProductProfile) -> dict[str, Any]:
    return {'id': p.product_id, 'title': p.display_title, 'brand': p.brand, 'model': p.model_number,
            'category': p.category, 'subcategory': p.subcategory, 'specs': p.key_specs}


def system_prompt() -> str:
    return f"""You decide whether two products in a thrift store's catalog are the SAME product.
Same product = a shopper would expect the same price for either, and one tag name fits both. Items keep
their own details (color, pattern, apparel size, condition), so those never make products different.

# {spec_rules.prompt_block()}

Rules for the call:
- Different when any product spec differs (size, capacity, count, storage, voltage, character, bed size ...),
  or the brand differs, or the product type differs.
- Same when only item details differ (color, finish, pattern, apparel size) or the wording differs.
- Model numbers that differ only by a color suffix are the same model (G6).
- When in doubt, SAME (owner rule): a wrong merge is cheaper than a leftover duplicate. Call a pair different only
  when a product spec, the brand or the product type clearly differs.

Input: a JSON list of pairs {{"pair": n, "a": {{...}}, "b": {{...}}}}.
Output: only a JSON array, one object per pair, same order:
{{"pair": n, "decision": "same" | "different", "reason": "<under 15 words>"}}. No prose."""


def decide(pairs: list[dict[str, Any]], *, log=print, workers: int = 20) -> dict[str, int]:
    """Spark answers each pair; answers are saved as DedupeDecision rows (skips pairs already decided)."""
    from apps.core.services.llm_router import llm_complete

    version, system = standardize.rules_version(), system_prompt()
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(
        product_id__in={x for pr in pairs for x in (pr['a'], pr['b'])})}
    lock, stats = threading.Lock(), {'pairs': 0, 'same': 0, 'different': 0, 'errors': 0}
    results: list[DedupeDecision] = []  # filled by the workers; saved by the main thread after each slice

    def one(chunk: list[dict]) -> None:
        shown = [{'pair': i, 'a': _card(profiles[p['a']]), 'b': _card(profiles[p['b']])} for i, p in enumerate(chunk)]
        answers = None
        for _ in range(3):
            try:
                res = llm_complete(model_id=standardize.MODEL, system=system, user=json.dumps(shown, ensure_ascii=False),
                                   max_tokens=6000, effort=standardize.EFFORT, timeout=180, log_source='dedupe_products')
                answers = {int(x.get('pair')): x for x in standardize._parse(res.text) if isinstance(x, dict)}
                break
            except Exception:  # noqa: BLE001
                time.sleep(5)
        with lock:
            if answers is None:
                stats['errors'] += 1
                return
            for i, p in enumerate(chunk):
                x = answers.get(i) or {}
                d = x.get('decision')
                if d not in (DedupeDecision.SAME, DedupeDecision.DIFFERENT):
                    continue
                results.append(DedupeDecision(
                    product_a_id=p['a'], product_b_id=p['b'], rules_version=version, decision=d,
                    similarity=p['similarity'], reason=str(x.get('reason') or '')[:300], source=f'ai:{standardize.MODEL}'))
                stats['pairs'] += 1
                stats[d] += 1
            if stats['pairs'] and stats['pairs'] % 500 < PER_CALL:
                log(f"  {stats['pairs']:,} pairs: {stats['same']:,} same")

    chunks = [pairs[i:i + PER_CALL] for i in range(0, len(pairs), PER_CALL)]
    per_slice = 200  # chunks (2,000 pairs) per slice: a crash loses at most one slice, and the database is only
    for i in range(0, len(chunks), per_slice):  # ever written from this (main) thread: no connection per worker
        # 20 workers (12 while the review ran): each holds a local Postgres connection while its AI call runs, and the server allows 100 in total
        # for every project on this PC (32 workers here plus 24 in the review locked everyone else out on 2026-10-01)
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(standardize.db_safe(one), chunks[i:i + per_slice]))
        DedupeDecision.objects.bulk_create(results, ignore_conflicts=True)
        log(f"  saved {stats['pairs']:,} decisions ({stats['same']:,} same)")
        results.clear()
    return stats


def mergeable():
    """The "same" decisions that may merge: Spark's at or above TRUST_SIMILARITY, and every one Sonnet confirmed."""
    from django.db.models import Q

    return DedupeDecision.objects.filter(
        Q(similarity__gte=TRUST_SIMILARITY) | Q(source=f'ai:{ESCALATE_TO[0]}', similarity__gte=ESCALATED_MIN),
        rules_version=standardize.rules_version(), decision=DedupeDecision.SAME, merge__isnull=True)


def root_map() -> dict[int, int]:
    """{merged product: the product that survives today}, resolved through chains, in memory."""
    into = dict(ProductProfile.objects.filter(merged_into__isnull=False).values_list('product_id', 'merged_into_id'))
    out = {}
    for pid in into:
        cur, seen = pid, set()
        while cur in into and cur not in seen:
            seen.add(cur)
            cur = into[cur]
        out[pid] = cur
    return out


def escalate(*, log=print, workers: int = 10) -> dict[str, int]:
    """Sonnet makes the final call on every unmerged Spark "same" below TRUST_SIMILARITY (20 pairs per call)."""
    from apps.core.services.llm_router import llm_complete

    todo = list(DedupeDecision.objects.filter(
        rules_version=standardize.rules_version(), decision=DedupeDecision.SAME, merge__isnull=True,
        similarity__lt=TRUST_SIMILARITY, source=f'ai:{standardize.MODEL}'))
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(
        product_id__in={x for d in todo for x in (d.product_a_id, d.product_b_id)})}
    system = system_prompt()
    lock, stats, changed = threading.Lock(), {'pairs': 0, 'same': 0, 'different': 0, 'errors': 0}, []

    def one(chunk: list[DedupeDecision]) -> None:
        shown = [{'pair': i, 'a': _card(profiles[d.product_a_id]), 'b': _card(profiles[d.product_b_id])}
                 for i, d in enumerate(chunk)]
        answers = None
        for _ in range(3):
            try:
                res = llm_complete(model_id=ESCALATE_TO[0], system=system, user=json.dumps(shown, ensure_ascii=False),
                                   max_tokens=12000, effort=ESCALATE_TO[1], timeout=300, log_source='dedupe_escalate')
                answers = {int(x.get('pair')): x for x in standardize._parse(res.text) if isinstance(x, dict)}
                break
            except Exception:  # noqa: BLE001
                time.sleep(5)
        with lock:
            if answers is None:
                stats['errors'] += 1
                return
            for i, d in enumerate(chunk):
                x = answers.get(i) or {}
                if x.get('decision') not in (DedupeDecision.SAME, DedupeDecision.DIFFERENT):
                    continue
                d.decision, d.source = x['decision'], f'ai:{ESCALATE_TO[0]}'
                d.reason = str(x.get('reason') or '')[:300]
                changed.append(d)
                stats['pairs'] += 1
                stats[x['decision']] += 1

    chunks = [todo[i:i + 20] for i in range(0, len(todo), 20)]
    log(f'{len(todo):,} pairs to {ESCALATE_TO[0]} ({ESCALATE_TO[1]})')
    for i in range(0, len(chunks), 50):  # save from this thread every 1,000 pairs
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(standardize.db_safe(one), chunks[i:i + 50]))
        DedupeDecision.objects.bulk_update(changed, ['decision', 'source', 'reason'], batch_size=500)
        changed.clear()
        log(f"  {stats['pairs']:,} decided: {stats['same']:,} same, {stats['different']:,} different")
    return stats


def vet(n: int = 200, *, log=print) -> dict[str, Any]:
    """Claude judges a random `n` of the unmerged "same" answers; merging is allowed at 95% right."""
    from apps.core.services.llm_router import llm_complete

    version = standardize.rules_version()
    roots = root_map()
    # only what would actually merge is vetted: pairs already one product through a chain are skipped
    same = [d for d in mergeable() if roots.get(d.product_a_id, d.product_a_id) != roots.get(d.product_b_id, d.product_b_id)]
    random.Random(0).shuffle(same)
    rows = same[:n]
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(
        product_id__in={x for d in rows for x in (d.product_a_id, d.product_b_id)})}
    system = system_prompt().replace('You decide whether', 'You review another model\'s decision whether') + (
        '\nFor each pair, say whether "same" is right. Output: [{"pair": n, "right": true|false, "why": "..."}].')
    verdicts: dict[int, dict] = {}
    for i in range(0, len(rows), 25):
        chunk = rows[i:i + 25]
        shown = [{'pair': i + j, 'a': _card(profiles[d.product_a_id]), 'b': _card(profiles[d.product_b_id]),
                  'decision': 'same', 'reason': d.reason} for j, d in enumerate(chunk)]
        for attempt in range(3):  # a malformed reply is asked again; a chunk that never parses is skipped
            try:
                res = llm_complete(model_id=standardize.JUDGE, system=system, user=json.dumps(shown, ensure_ascii=False),
                                   max_tokens=16000, timeout=300, effort='low', log_source='vet_dedupe')
                for v in standardize._parse(res.text):
                    if isinstance(v, dict):
                        verdicts[int(v.get('pair'))] = v
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    log(f'  chunk skipped: {str(exc)[:80]}')
        log(f'  judged {min(i + 25, len(rows))}/{len(rows)}')
    right = sum(1 for v in verdicts.values() if v.get('right'))
    report = {'rules_version': version, 'sampled': len(rows), 'judged': len(verdicts), 'right': right,
              'share_right': round(right / max(len(verdicts), 1), 3),
              'passed': len(verdicts) >= 0.9 * len(rows) and right / max(len(verdicts), 1) >= PASS_SHARE,
              'wrong': [{'a': rows[k].product_a_id, 'b': rows[k].product_b_id, 'why': v.get('why')}
                        for k, v in verdicts.items() if not v.get('right') and k < len(rows)]}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"vet-{version.replace(':', '_')}.json").write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def vet_passed() -> bool:
    """The last vet report under the current rules version passed."""
    f = OUT_DIR / f"vet-{standardize.rules_version().replace(':', '_')}.json"
    return f.exists() and bool(json.loads(f.read_text(encoding='utf-8')).get('passed'))


def _root(pid: int) -> int:
    """Follow merged_into to the product that survives today."""
    seen = set()
    while pid not in seen:
        seen.add(pid)
        nxt = ProductProfile.objects.filter(product_id=pid).values_list('merged_into_id', flat=True).first()
        if not nxt:
            return pid
        pid = nxt
    return pid


def _add_aliases(survivor: ProductProfile, merged: Product, merged_profile: ProductProfile | None) -> None:
    al = {k: list(v) for k, v in (survivor.aliases or {}).items()}
    ids = merged.identifiers if isinstance(merged.identifiers, dict) else {}
    for key, value in (('titles', merged.title), ('models', merged.model),
                       ('models', merged_profile.model_number if merged_profile else ''),
                       ('upcs', ids.get('upc')), ('brands', merged.brand)):
        if value and value not in al.setdefault(key, []):
            al[key].append(value)
    survivor.aliases = al
    survivor.save(update_fields=['aliases', 'updated_at'])


def merge_same(*, user=None, log=print) -> dict[str, int]:
    """Merge every unmerged "same" decision under the current rules (after a passed vet)."""
    version = standardize.rules_version()
    stats = {'merged': 0, 'already_one': 0}
    for d in mergeable():
        a, b = _root(d.product_a_id), _root(d.product_b_id)
        if a == b:
            stats['already_one'] += 1
            continue
        pa, pb = Product.objects.get(pk=a), Product.objects.get(pk=b)
        rank = {p.pk: (p.items.count(), p.pk * -1) for p in (pa, pb)}
        survivor, merged = (pa, pb) if rank[a] >= rank[b] else (pb, pa)
        with transaction.atomic():
            m = merge_products(survivor, merged, method='spark_dedupe', reason=f'{version}: {d.reason}'[:300], user=user)
            sp, _ = ProductProfile.objects.get_or_create(product=survivor)
            _add_aliases(sp, merged, ProductProfile.objects.filter(product=merged).first())
            d.merge = m
            d.save(update_fields=['merge'])
        stats['merged'] += 1
    return stats
