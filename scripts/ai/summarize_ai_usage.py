#!/usr/bin/env python3
"""Summarize workspace/logs/ai_usage.jsonl (Phase 4.1B).

Cache hit % (when cache fields present):
  cache_read / (input_tokens + cache_creation_tokens + cache_read_tokens)
  i.e. share of input-side (billable) tokens that were served from cache reads.
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Repo root: scripts/ai/ -> parents[2]
REPO_ROOT = Path(__file__).resolve().parents[2]
LOG_PATH = REPO_ROOT / 'workspace' / 'logs' / 'ai_usage.jsonl'


def load_lines() -> list[dict]:
    if not LOG_PATH.is_file():
        return []
    out: list[dict] = []
    with open(LOG_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def main() -> int:
    records = load_lines()
    n = len(records)
    total_in = sum(int(r.get('input_tokens') or 0) for r in records)
    total_out = sum(int(r.get('output_tokens') or 0) for r in records)
    total_cc = sum(int(r.get('cache_creation_tokens') or 0) for r in records)
    total_cr = sum(int(r.get('cache_read_tokens') or 0) for r in records)
    total_cost = sum(float(r.get('estimated_cost_usd') or 0) for r in records)

    print('=== AI usage (all time) ===')
    print(f'Calls: {n}')
    print(f'Input tokens (uncached): {total_in:,}')
    print(f'Output tokens: {total_out:,}')
    print(f'Cache creation tokens: {total_cc:,}')
    print(f'Cache read tokens: {total_cr:,}')
    print(f'Estimated cost (USD): ${total_cost:.4f}')
    denom = total_in + total_cc + total_cr
    if denom > 0 and (total_cc > 0 or total_cr > 0):
        pct = 100.0 * total_cr / denom
        print(f'Cache read share (of input-side tokens): {pct:.1f}%')
    print()

    by_source: dict[str, list] = defaultdict(lambda: [0, 0, 0, 0.0, 0, 0])
    for r in records:
        src = r.get('source') or '(unknown)'
        t = by_source[src]
        t[0] += 1
        t[1] += int(r.get('input_tokens') or 0)
        t[2] += int(r.get('output_tokens') or 0)
        t[3] += float(r.get('estimated_cost_usd') or 0)
        t[4] += int(r.get('cache_creation_tokens') or 0)
        t[5] += int(r.get('cache_read_tokens') or 0)

    print('=== By source ===')
    print(
        f'{"source":<32} {"calls":>8} {"in_tok":>10} {"out_tok":>10} '
        f'{"cache_w":>10} {"cache_r":>10} {"est_$":>12}'
    )
    for src in sorted(by_source.keys()):
        c, i, o, co, cc, cr = by_source[src]
        print(f'{src:<32} {c:>8} {i:>10,} {o:>10,} {cc:>10,} {cr:>10,} {co:>12.4f}')
    print()

    by_mp: dict[str, list] = defaultdict(lambda: [0, 0, 0, 0.0, 0, 0])
    for r in records:
        mp = r.get('marketplace')
        if mp is None or mp == '':
            key = '—'
        else:
            key = str(mp)
        t = by_mp[key]
        t[0] += 1
        t[1] += int(r.get('input_tokens') or 0)
        t[2] += int(r.get('output_tokens') or 0)
        t[3] += float(r.get('estimated_cost_usd') or 0)
        t[4] += int(r.get('cache_creation_tokens') or 0)
        t[5] += int(r.get('cache_read_tokens') or 0)

    print('=== By marketplace ===')
    print(
        f'{"marketplace":<24} {"calls":>8} {"in_tok":>10} {"out_tok":>10} '
        f'{"cache_w":>10} {"cache_r":>10} {"est_$":>12}'
    )
    for mp in sorted(by_mp.keys()):
        c, i, o, co, cc, cr = by_mp[mp]
        print(f'{mp:<24} {c:>8} {i:>10,} {o:>10,} {cc:>10,} {cr:>10,} {co:>12.4f}')
    print()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    by_date: dict[str, list] = defaultdict(lambda: [0, 0.0])
    for r in records:
        ts = r.get('timestamp') or ''
        try:
            dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if dt < cutoff:
            continue
        dkey = dt.strftime('%Y-%m-%d')
        by_date[dkey][0] += 1
        by_date[dkey][1] += float(r.get('estimated_cost_usd') or 0)

    print('=== Last 7 days (by date) ===')
    print(f'{"date":<12} {"calls":>8} {"est_$":>12}')
    for d in sorted(by_date.keys()):
        c, co = by_date[d]
        print(f'{d:<12} {c:>8} {co:>12.4f}')
    print()

    last10 = records[-10:]
    print('=== Last 10 calls ===')
    for r in last10:
        cc = int(r.get('cache_creation_tokens') or 0)
        cr = int(r.get('cache_read_tokens') or 0)
        print(
            f"{r.get('timestamp','')} | {r.get('source',''):<28} | {r.get('model',''):<24} | "
            f"in={r.get('input_tokens')} out={r.get('output_tokens')} "
            f"cc={cc} cr={cr} "
            f"${float(r.get('estimated_cost_usd') or 0):.4f} | {str(r.get('detail',''))[:60]}"
        )
    print()

    if not sys.stdin.isatty():
        return 0
    try:
        choice = input('Clear logs? (0=no, 1=older than 7 days, 2=all): ').strip()
    except EOFError:
        return 0

    if choice == '0' or choice == '':
        return 0
    if choice == '2':
        if LOG_PATH.is_file():
            LOG_PATH.unlink()
            print('Deleted', LOG_PATH)
        return 0
    if choice == '1':
        if not LOG_PATH.is_file():
            return 0
        kept: list[str] = []
        for r in records:
            ts = r.get('timestamp') or ''
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                kept.append(json.dumps(r, ensure_ascii=False) + '\n')
                continue
            if dt >= cutoff:
                kept.append(json.dumps(r, ensure_ascii=False) + '\n')
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, 'w', encoding='utf-8') as f:
            f.writelines(kept)
        print(f'Kept {len(kept)} line(s); removed older than 7 days.')
        return 0

    return 0


if __name__ == '__main__':
    os.chdir(REPO_ROOT)
    raise SystemExit(main())
