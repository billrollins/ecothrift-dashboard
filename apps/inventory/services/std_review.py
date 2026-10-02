"""
Second-pass review of the standardized answers Spark was unsure about (confidence low or medium, or a code flag).

Stage 1: Spark judges every one of them (cheap; in the aud-001 audition it showed no self-preference).
Stage 2 (owner, 2026-10-01: anything escalated above Spark goes to Sonnet 5.5 at medium): only what Spark flags on a
core field is rewritten by Sonnet, whose answer is final (`escalated.jsonl`, used by `standardize.load` in place of
Spark's). A product is accepted (loaded as `auto`) when stage 1 says ok or Sonnet rewrote it, unless the answer has a
hard problem. Results: workspace/standardize/review.jsonl and escalated.jsonl (resumable).

    python manage.py review_standardized
"""
from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor

from apps.inventory.services import std_audition as aud
from apps.inventory.services import standardize as std

STAGE1 = ('muse-spark-1.3-contributor', 'high')
STAGE2 = ('claude-sonnet-5-5', 'medium')  # the escalation model: anything above Spark (owner, 2026-10-01)
ESCALATED = std.OUT_DIR / 'escalated.jsonl'
HARD = ('category not canon', 'subcategory not canon', 'answer does not match', 'vector_text empty',
        'short_name empty', 'display_title empty')
CHUNK = 8
REVIEW = std.OUT_DIR / 'review.jsonl'


def needs_review(r: dict) -> bool:
    return r.get('confidence') != 'high' or bool(r.get('problems'))


def hard_problem(r: dict) -> bool:
    return any(str(p).startswith(HARD) for p in r.get('problems') or [])


def load_rows(prefixes=('cat5', 'cat6')) -> list[dict]:
    rows = []
    for pre in prefixes:
        for f in sorted(std.OUT_DIR.glob(f'{pre}-*.jsonl')):
            rows += [json.loads(l) for l in f.open(encoding='utf-8') if l.strip()]
    return rows


def _done() -> dict[tuple, dict]:
    out: dict[tuple, dict] = {}
    if REVIEW.exists():
        for l in REVIEW.open(encoding='utf-8'):
            if l.strip():
                x = json.loads(l)
                out[(x['id'], x['stage'])] = x
    return out


def _judge(rows: list[dict], model: str, effort: str, stage: int, log) -> None:
    system = aud.critic_prompt()
    lock = threading.Lock()
    chunks = [rows[i:i + CHUNK] for i in range(0, len(rows), CHUNK)]
    count = {'n': 0}

    def one(chunk: list[dict]) -> None:
        shown = [{'id': r['id'], 'input': r['input'],
                  'answers': {'A': {k: r.get(k) for k in (*std.FIELDS, 'item_details', 'confidence', 'flags')}}}
                 for r in chunk]
        verdicts, _ = aud._call(model, effort, system, shown, f'review/s{stage}')
        got = {str(v.get('id')): v for v in verdicts if isinstance(v, dict)}
        with lock, REVIEW.open('a', encoding='utf-8') as f:
            for r in chunk:
                v = got.get(str(r['id']))
                if not v:
                    continue
                ok = all(v.get(c) is True for c in std.CORE)
                f.write(json.dumps({'id': r['id'], 'stage': stage, 'core_ok': ok, 'note': str(v.get('note') or '')[:200]},
                                   ensure_ascii=False) + '\n')
            count['n'] += len(chunk)
            if count['n'] % 800 < CHUNK:
                log(f'  stage {stage}: {count["n"]:,}/{len(rows):,}')

    with ThreadPoolExecutor(max_workers=10) as ex:  # each worker holds a local Postgres connection (limit 100 for the whole PC)
        list(ex.map(std.db_safe(one), chunks))


def run(*, log=print) -> dict:
    std.OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = [r for r in load_rows() if needs_review(r) and not hard_problem(r)]
    done = _done()
    todo1 = [r for r in rows if (r['id'], 1) not in done]
    log(f'{len(rows):,} to review; stage 1 todo {len(todo1):,} ({STAGE1[0]} {STAGE1[1]})')
    if todo1:
        _judge(todo1, *STAGE1, 1, log)
    done = _done()
    have = escalated_ids()
    flagged = [r for r in rows if (r['id'], 1) in done and not done[(r['id'], 1)]['core_ok'] and r['id'] not in have]
    log(f'stage 1 flagged {len(flagged) + len(have & {r["id"] for r in rows}):,}; Sonnet rewrites {len(flagged):,} ({STAGE2[0]} {STAGE2[1]})')
    if flagged:
        _rewrite(flagged, log)
    return summary(rows)


def escalated_ids() -> set[int]:
    if not ESCALATED.exists():
        return set()
    return {json.loads(l)['id'] for l in ESCALATED.open(encoding='utf-8') if l.strip()}


def _rewrite(rows: list[dict], log) -> None:
    """Sonnet writes the standardized answer itself for the products Spark's check flagged."""
    system, cats, version = std.system_prompt(), std.canon(), std.rules_version()
    lock = threading.Lock()
    chunks = [rows[i:i + 10] for i in range(0, len(rows), 10)]
    count = {'n': 0}

    def one(chunk: list[dict]) -> None:
        answers, _ = aud._call(*STAGE2[:2], system, [r['input'] for r in chunk], 'review/sonnet')
        got = {str(a.get('id')): a for a in answers if isinstance(a, dict)}
        with lock, ESCALATED.open('a', encoding='utf-8') as f:
            for r in chunk:
                a = got.get(str(r['id']))
                if not a:
                    continue
                clean, problems = std.validate(a, cats, r['input'])
                f.write(json.dumps({'id': r['id'], 'input': r['input'], **clean, 'problems': problems,
                                    'sold': r.get('sold'), 'items': r.get('items'), 'group_rep': None,
                                    'source': f'ai:{STAGE2[0]}', 'rules_version': version, 'effort': STAGE2[1],
                                    'escalated': True}, ensure_ascii=False, default=str) + chr(10))
            count['n'] += len(chunk)
            if count['n'] % 500 < 10:
                log(f'  sonnet: {count["n"]:,}/{len(rows):,}')

    with ThreadPoolExecutor(max_workers=8) as ex:  # each worker holds a local Postgres connection while it waits
        list(ex.map(std.db_safe(one), chunks))


def accepted_ids() -> set[int]:
    done = _done()
    ok = set()
    for (pid, stage), x in done.items():
        if stage == 1 and x['core_ok']:
            ok.add(pid)
    return ok | escalated_ids()


def summary(rows: list[dict]) -> dict:
    done = _done()
    acc = accepted_ids()
    ids = {r['id'] for r in rows}
    return {'reviewed': len(ids), 'stage1_ok': sum(1 for i in ids if done.get((i, 1), {}).get('core_ok')),
            'stage1_flagged': sum(1 for i in ids if (i, 1) in done and not done[(i, 1)]['core_ok']),
            'sonnet_rewrote': len(ids & escalated_ids()),
            'accepted': len(ids & acc), 'still_pending': len(ids - acc)}
