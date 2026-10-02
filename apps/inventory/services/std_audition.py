"""
Audition the standardize writers (owner, 2026-09-29): the same random products go to several writer models
with the same prompt; the same models then judge every answer, blind (answers labelled A-D in a random order
per product). Consensus decides: a field is right when 3+ of 4 critics say ok, wrong at 0-1, disputed at 2
(disputes are reviewed by hand).

    python manage.py audition_standardize --name aud-001 --n 160

Writes `workspace/audition_std/<name>/`: sample.json, answers.json, verdicts.json, report.json.
"""
from __future__ import annotations

import json
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection

from apps.inventory.services import standardize as std

ROSTER = [  # name, model, effort (owner's picks)
    ('spark', 'muse-spark-1.3-contributor', 'high'),
    ('gemini', 'gemini-3.8-flash', 'high'),
    ('sonnet', 'claude-sonnet-5-5', 'medium'),
    ('opus', 'claude-opus-5-5', 'medium'),
]
FIELDS = ('category', 'subcategory', 'brand', 'key_specs', 'display_title', 'short_name', 'vector_text')
OUT = Path(settings.BASE_DIR) / 'workspace' / 'audition_std'


def sample(n: int, seed: int) -> list[dict]:
    """Random products with items, never standardized, not merged away."""
    done = std.done_ids()
    with connection.cursor() as cur:
        cur.execute("""
            SELECT p.id FROM inventory_product p
            LEFT JOIN inventory_productprofile pp ON pp.product_id = p.id
            WHERE pp.merged_into_id IS NULL AND EXISTS (SELECT 1 FROM inventory_item i WHERE i.product_id = p.id)
        """)
        ids = [r[0] for r in cur.fetchall() if r[0] not in done]
    random.Random(seed).shuffle(ids)
    pick = set(ids[:n])
    with connection.cursor() as cur:
        cur.execute("""
            SELECT p.id, p.title, p.brand, p.model, p.identifiers, pp.category, pp.subcategory,
                   coalesce(sum(i.sold_for) FILTER (WHERE i.status = 'sold'), 0) AS sold, count(i.id) AS items,
                   max(mr.title) AS manifest_title, max(mr.category) AS manifest_code
            FROM inventory_product p
            LEFT JOIN inventory_productprofile pp ON pp.product_id = p.id
            LEFT JOIN inventory_item i ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
            WHERE p.id = ANY(%s)
            GROUP BY p.id, pp.category, pp.subcategory
        """, [list(pick)])
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    order = {pid: i for i, pid in enumerate(ids)}
    return sorted(rows, key=lambda r: order[r['id']])[:n]


def _call(model: str, effort: str, system: str, user: Any, detail: str) -> tuple[Any, float]:
    from apps.core.services.llm_router import llm_complete

    started = time.time()
    for attempt in range(3):
        try:
            res = llm_complete(model_id=model, system=system, user=json.dumps(user, ensure_ascii=False, default=str),
                               max_tokens=32000, effort=effort, timeout=400, log_source='audition_standardize',
                               log_detail=detail)
            return std._parse(res.text), time.time() - started
        except Exception:  # noqa: BLE001
            time.sleep(5)
    return [], time.time() - started


def write(products: list[dict], *, log) -> dict[str, dict]:
    """Every writer answers every product (10 per call, same prompt). {writer: {id: answer}}."""
    system, cats = std.system_prompt(), std.canon()
    out: dict[str, dict] = {w: {} for w, _, _ in ROSTER}
    seconds: dict[str, float] = {w: 0.0 for w, _, _ in ROSTER}
    lock = threading.Lock()
    jobs = [(w, m, e, products[i:i + 10]) for w, m, e in ROSTER for i in range(0, len(products), 10)]

    def one(job):
        w, m, e, chunk = job
        answers, secs = _call(m, e, system, [std.payload(p) for p in chunk], f'write/{w}')
        got = {str(a.get('id')): a for a in answers if isinstance(a, dict)}
        with lock:
            seconds[w] += secs
            for p in chunk:
                a = got.get(str(p['id']))
                if a:
                    clean, problems = std.validate(a, cats, std.payload(p))
                    out[w][str(p['id'])] = {**clean, 'problems': problems}
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(one, jobs))
    log('  answers: ' + ', '.join(f'{w} {len(v)}' for w, v in out.items()))
    return {'answers': out, 'seconds': seconds}


def critic_prompt() -> str:
    return std.system_prompt().split('# Input')[0] + """
# Your job now
You are a critic. For each product you get its input and up to four answers labelled A-D, written by different
writers. Judge each answer against the rules, the examples and the input, field by field. A field is ok when it
is correct and follows the rules; wording can differ and still be ok. Be strict on category, subcategory, brand
and key_specs.
Reply with only a JSON array, one object per product and label:
{"id": <product id>, "label": "A", "category": true|false, "subcategory": true|false, "brand": true|false,
 "key_specs": true|false, "display_title": true|false, "short_name": true|false, "vector_text": true|false,
 "note": "<under 20 words, what is wrong>"}"""


def critique(products: list[dict], answers: dict[str, dict], seed: int, *, log) -> dict:
    """Every critic judges every writer's answer, blind. {critic: [{id, writer, field: bool ...}]}."""
    system = critic_prompt()
    rng = random.Random(seed)
    labels: dict[str, dict[str, str]] = {}
    shown = []
    for p in products:
        writers = [w for w in answers if str(p['id']) in answers[w]]
        rng.shuffle(writers)
        labels[str(p['id'])] = {'ABCD'[i]: w for i, w in enumerate(writers)}
        shown.append({'id': p['id'], 'input': std.payload(p),
                      'answers': {'ABCD'[i]: {k: answers[w][str(p['id'])].get(k) for k in
                                              (*std.FIELDS, 'item_details', 'confidence', 'flags')}
                                  for i, w in enumerate(writers)}})
    out: dict[str, list] = {c: [] for c, _, _ in ROSTER}
    seconds: dict[str, float] = {c: 0.0 for c, _, _ in ROSTER}
    lock = threading.Lock()
    jobs = [(c, m, e, shown[i:i + 8]) for c, m, e in ROSTER for i in range(0, len(shown), 8)]

    def one(job):
        c, m, e, chunk = job
        verdicts, secs = _call(m, e, system, chunk, f'critic/{c}')
        with lock:
            seconds[c] += secs
            for v in verdicts:
                if isinstance(v, dict):
                    w = labels.get(str(v.get('id')), {}).get(str(v.get('label')))
                    if w:
                        out[c].append({**v, 'writer': w})
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(one, jobs))
    log('  verdicts: ' + ', '.join(f'{c} {len(v)}' for c, v in out.items()))
    return {'verdicts': out, 'labels': labels, 'seconds': seconds}


def report(products: list[dict], answers: dict[str, dict], verdicts: dict[str, list]) -> dict:
    votes: dict[tuple, dict[str, bool]] = {}  # (id, writer, field) -> {critic: ok}
    for c, vs in verdicts.items():
        for v in vs:
            for f in FIELDS:
                if isinstance(v.get(f), bool):
                    votes.setdefault((str(v['id']), v['writer'], f), {})[c] = v[f]
    consensus: dict[tuple, str] = {}
    for key, vs in votes.items():
        yes = sum(vs.values())
        consensus[key] = 'right' if yes >= 3 else 'wrong' if yes <= len(vs) - 3 or yes <= 1 else 'disputed'
    writers = list(answers)
    by_writer = {}
    for w in writers:
        row = {}
        for f in FIELDS:
            ks = [k for k in consensus if k[1] == w and k[2] == f]
            row[f] = {'right': round(sum(consensus[k] == 'right' for k in ks) / max(len(ks), 1), 3),
                      'disputed': sum(consensus[k] == 'disputed' for k in ks)}
        core = [(pid, w) for pid in {k[0] for k in consensus if k[1] == w}]
        row['core_all_right'] = round(sum(all(consensus.get((pid, w, f)) == 'right' for f in std.CORE)
                                          for pid, _ in core) / max(len(core), 1), 3)
        row['answered'] = len(answers[w])
        by_writer[w] = row
    by_critic = {}
    for c, vs in verdicts.items():
        agree = [v.get(f) == (consensus.get((str(v['id']), v['writer'], f)) == 'right')
                 for v in vs for f in FIELDS if isinstance(v.get(f), bool)
                 and consensus.get((str(v['id']), v['writer'], f)) != 'disputed']
        own = [v.get(f) for v in vs for f in std.CORE if v['writer'] == c and isinstance(v.get(f), bool)]
        others_on_own = [vv.get(f) for cc, vvs in verdicts.items() if cc != c for vv in vvs
                         if vv['writer'] == c for f in std.CORE if isinstance(vv.get(f), bool)]
        by_critic[c] = {'agrees_with_consensus': round(sum(agree) / max(len(agree), 1), 3),
                        'ok_rate_on_own_answers': round(sum(own) / max(len(own), 1), 3),
                        'others_ok_rate_on_its_answers': round(sum(others_on_own) / max(len(others_on_own), 1), 3)}
    disputed = [{'id': k[0], 'writer': k[1], 'field': k[2], 'votes': votes[k]} for k, v in consensus.items()
                if v == 'disputed' and k[2] in std.CORE]
    return {'by_writer': by_writer, 'by_critic': by_critic, 'disputed_core': disputed}


def run(name: str, n: int = 160, seed: int = 29, *, log=print) -> dict:
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    products = sample(n, seed)
    (d / 'sample.json').write_text(json.dumps(products, default=str, indent=1), encoding='utf-8')
    log(f'{len(products)} products; rules {std.rules_version()}')
    w = write(products, log=log)
    (d / 'answers.json').write_text(json.dumps(w, default=str, indent=1, ensure_ascii=False), encoding='utf-8')
    c = critique(products, w['answers'], seed, log=log)
    (d / 'verdicts.json').write_text(json.dumps(c, default=str, indent=1, ensure_ascii=False), encoding='utf-8')
    r = report(products, w['answers'], c['verdicts'])
    r['seconds'] = {'write': w['seconds'], 'critic': c['seconds']}
    (d / 'report.json').write_text(json.dumps(r, default=str, indent=1, ensure_ascii=False), encoding='utf-8')
    return r


# --- strategy test (owner, 2026-09-29): answer twice, tiebreak on disagreement ---------------------------

def _write_all(model: str, effort: str, products: list[dict], tag: str) -> dict[str, dict]:
    system, cats = std.system_prompt(), std.canon()
    out, lock = {}, threading.Lock()

    def one(chunk):
        answers, _ = _call(model, effort, system, [std.payload(p) for p in chunk], f'strategy/{tag}')
        got = {str(a.get('id')): a for a in answers if isinstance(a, dict)}
        with lock:
            for p in chunk:
                a = got.get(str(p['id']))
                if a:
                    clean, problems = std.validate(a, cats, std.payload(p))
                    out[str(p['id'])] = {**clean, 'problems': problems}
    with ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(std.db_safe(one), [products[i:i + 10] for i in range(0, len(products), 10)]))
    return out


def core_key(a: dict | None) -> tuple:
    """The core fields, normalized: two answers agree when these are equal."""
    if not a:
        return ()
    specs = tuple(sorted((k, std.re.sub(r'[^a-z0-9.]+', '', str(v).lower())) for k, v in (a.get('key_specs') or {}).items()))
    return (a.get('category'), a.get('subcategory'), str(a.get('brand') or '').lower().strip(), specs)


def _matches(a: dict | None, b: dict | None) -> int:
    ka, kb = core_key(a), core_key(b)
    return sum(1 for x, y in zip(ka, kb) if x == y) if ka and kb else 0


def run_strategies(name: str, source: str = 'aud-001', *, log=print) -> dict:
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    products = json.loads((OUT / source / 'sample.json').read_text(encoding='utf-8'))
    log(f'{len(products)} products from {source}; rules {std.rules_version()}')
    spark = 'muse-spark-1.3-contributor'
    runs = {
        'spark_high': _write_all(spark, 'high', products, 'spark_high'),
        'spark_low': _write_all(spark, 'low', products, 'spark_low_a'),
        'spark_low_b': _write_all(spark, 'low', products, 'spark_low_b'),
        'opus': _write_all('claude-opus-5-5', 'medium', products, 'opus'),
    }
    log('  answers: ' + ', '.join(f'{k} {len(v)}' for k, v in runs.items()))
    # twice + tiebreak
    split = [p for p in products if core_key(runs['spark_low'].get(str(p['id']))) != core_key(runs['spark_low_b'].get(str(p['id'])))]
    tie = _write_all('gemini-3.8-flash', 'low', split, 'tiebreak') if split else {}
    x2, route = {}, {'agree': 0, 'tiebreak': 0, 'escalate': 0}
    for p in products:
        pid = str(p['id'])
        a, b = runs['spark_low'].get(pid), runs['spark_low_b'].get(pid)
        if a and core_key(a) == core_key(b):
            x2[pid], how = a, 'agree'
        else:
            g = tie.get(pid)
            best = max((a, b), key=lambda x: _matches(x, g))
            if g and _matches(best, g) >= 3:
                x2[pid], how = best, 'tiebreak'
            else:
                x2[pid], how = (g or a or b), 'escalate'
        x2[pid] = {**(x2[pid] or {}), 'route': how}
        route[how] += 1
    runs['spark_low_x2'] = x2
    del runs['spark_low_b']
    log(f'  twice: {route}')
    (d / 'answers.json').write_text(json.dumps(runs, default=str, indent=1, ensure_ascii=False), encoding='utf-8')
    # Gemini judges every strategy, blind
    global ROSTER
    saved = ROSTER
    ROSTER = [('gemini', 'gemini-3.8-flash', 'high')]
    try:
        c = critique(products, runs, 29, log=log)
    finally:
        ROSTER = saved
    (d / 'verdicts.json').write_text(json.dumps(c, default=str, indent=1, ensure_ascii=False), encoding='utf-8')
    scores = {}
    for w in runs:
        vs = [v for v in c['verdicts']['gemini'] if v['writer'] == w]
        scores[w] = {'judged': len(vs), 'core_all_right': round(sum(all(v.get(f) is True for f in std.CORE) for v in vs) / max(len(vs), 1), 3),
                     **{f: round(sum(v.get(f) is True for v in vs) / max(len(vs), 1), 3) for f in FIELDS}}
    x2v = [v for v in c['verdicts']['gemini'] if v['writer'] == 'spark_low_x2']
    by_route = {}
    for how in route:
        ids = {pid for pid, a in x2.items() if a.get('route') == how}
        vs = [v for v in x2v if str(v['id']) in ids]
        by_route[how] = {'n': route[how], 'core_all_right': round(sum(all(v.get(f) is True for f in std.CORE) for v in vs) / max(len(vs), 1), 3)}
    r = {'scores': scores, 'twice_routes': by_route}
    (d / 'report.json').write_text(json.dumps(r, indent=1), encoding='utf-8')
    return r
