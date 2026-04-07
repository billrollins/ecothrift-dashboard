"""
AI categorization over unified extract pickles: sample run, full chunked run, summaries.

Requires ``ANTHROPIC_API_KEY`` (env or Django settings) and ``anthropic`` + ``tqdm``.
"""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from .extract import load_extract_pickle
from .paths import categorized_chunks_dir, categorized_exports_dir
from .prompts import SYSTEM_PROMPT, build_user_prompt, taxonomy_category_names


def _api_key() -> str:
    k = (os.environ.get('ANTHROPIC_API_KEY') or '').strip()
    if k:
        return k
    try:
        from django.conf import settings

        return (getattr(settings, 'ANTHROPIC_API_KEY', None) or '').strip()
    except Exception:
        return ''


_client = None


def get_anthropic_client():
    """Single process-wide client (Anthropic ``messages.create`` is thread-safe)."""
    global _client
    if _client is None:
        import anthropic

        key = _api_key()
        if not key:
            raise RuntimeError(
                'ANTHROPIC_API_KEY is not set (environment or Django settings).',
            )
        _client = anthropic.Anthropic(api_key=key)
    return _client


def get_sample(bin_name: str, n: int, *, random_state: int | None = 42) -> pd.DataFrame:
    """Load extract pickle and return ``n`` random rows (full columns)."""
    df = load_extract_pickle(bin_name)
    n = min(int(n), len(df))
    if n <= 0:
        return df.iloc[0:0].copy()
    return df.sample(n=n, random_state=random_state).reset_index(drop=True)


def _mixed_label() -> str:
    for x in taxonomy_category_names():
        if 'mixed' in x.lower() and 'uncategor' in x.lower():
            return x
    return 'Mixed lots & uncategorized'


def _coerce_category(raw: str) -> str:
    from apps.inventory.services.category_taxonomy import normalize_category_name

    raw_n = normalize_category_name(raw)
    allowed = taxonomy_category_names()
    by_norm = {normalize_category_name(a): a for a in allowed}
    if raw_n in by_norm:
        return by_norm[raw_n]
    for a in allowed:
        if a.lower() == raw_n.lower():
            return a
    return _mixed_label()


def _parse_ai_response(text: str) -> tuple[str, str]:
    """Returns (category_name, confidence high|medium|low)."""
    from apps.inventory.services.category_taxonomy import extract_json_object

    try:
        obj = extract_json_object(text)
    except Exception:
        return _mixed_label(), 'low'
    cat = str(obj.get('category', '')).strip()
    conf = str(obj.get('confidence', 'low')).strip().lower()
    if conf not in ('high', 'medium', 'low'):
        conf = 'low'
    return _coerce_category(cat), conf


def _one_row(
    row: pd.Series,
    model: str,
    *,
    row_index: int,
) -> tuple[int, str, str]:
    client = get_anthropic_client()
    user_text = build_user_prompt(row)
    msg = client.messages.create(
        model=model,
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': user_text}],
    )
    text = ''
    for block in msg.content:
        if getattr(block, 'type', None) == 'text' and hasattr(block, 'text'):
            text += block.text
        elif hasattr(block, 'text'):
            text += block.text
    cat, conf = _parse_ai_response(text)
    return row_index, cat, conf


def ai_categorize(data: pd.DataFrame, model: str, n_jobs: int) -> pd.DataFrame:
    """
    Categorize **every** row in ``data`` (no manifest filtering). In-memory only.
    Adds ``ai_category`` and ``ai_confidence``.
    """
    if data.empty:
        out = data.copy()
        out['ai_category'] = pd.Series(dtype='object')
        out['ai_confidence'] = pd.Series(dtype='object')
        return out

    df = data.reset_index(drop=True)
    n = len(df)
    n_jobs = max(1, int(n_jobs))

    cats: list[str | None] = [None] * n
    confs: list[str | None] = [None] * n

    try:
        from tqdm.auto import tqdm
    except ImportError:
        tqdm = lambda x, **_: x  # noqa: E731

    with ThreadPoolExecutor(max_workers=n_jobs) as ex:
        futures = {
            ex.submit(_one_row, df.iloc[i], model, row_index=i): i
            for i in range(n)
        }
        for fut in tqdm(as_completed(futures), total=n, desc='ai_categorize'):
            i = futures[fut]
            try:
                _, cat, conf = fut.result()
            except Exception:
                cat, conf = _mixed_label(), 'low'
            cats[i] = cat
            confs[i] = conf

    out = df.copy()
    out['ai_category'] = cats
    out['ai_confidence'] = confs
    return out


_CHUNK_RE = re.compile(r'^(.+)_(\d+)\.csv$')


def _chunk_index_from_name(name: str) -> tuple[str, int] | None:
    m = _CHUNK_RE.match(name)
    if not m:
        return None
    return m.group(1), int(m.group(2))


def _count_csv_rows(path: Path) -> int:
    with path.open(encoding='utf-8') as f:
        return max(0, sum(1 for _ in f) - 1)


def _resume_state(bin_name: str) -> tuple[int, int]:
    """
    Returns (rows_already_written, next_chunk_index) from ``chunks/{bin}_N.csv``.
    """
    chunks_dir = categorized_chunks_dir()
    files: list[tuple[int, Path]] = []
    for p in chunks_dir.glob(f'{bin_name}_*.csv'):
        parsed = _chunk_index_from_name(p.name)
        if parsed and parsed[0] == bin_name:
            files.append((parsed[1], p))
    if not files:
        return 0, 0
    files.sort(key=lambda x: x[0])
    total = 0
    max_idx = -1
    for idx, p in files:
        max_idx = max(max_idx, idx)
        total += _count_csv_rows(p)
    return total, max_idx + 1


def ai_categorize_full(
    bin_name: str,
    model: str,
    n_jobs: int,
    *,
    chunk_size: int = 500,
) -> pd.DataFrame:
    """
    Categorize all rows in the bin extract; write chunk CSVs; merge to ``{bin}_categorized.csv``.
    Resume: skips rows already present in chunk files (by row order).
    """
    bin_name = bin_name.strip().lower()
    df = load_extract_pickle(bin_name)
    if df.empty:
        out_path = categorized_exports_dir() / f'{bin_name}_categorized.csv'
        pd.DataFrame().to_csv(out_path, index=False)
        return df

    done_rows, next_chunk_idx = _resume_state(bin_name)
    n = len(df)
    done_rows = min(done_rows, n)
    if done_rows >= n:
        final_path = categorized_exports_dir() / f'{bin_name}_categorized.csv'
        if final_path.is_file():
            return pd.read_csv(final_path)
        # Chunks exist but final missing — rebuild from chunks
        return _concat_chunks_to_final(bin_name)

    remaining = df.iloc[done_rows:].reset_index(drop=True)
    chunks_dir = categorized_chunks_dir()
    chunk_size = max(1, int(chunk_size))
    n_jobs = max(1, int(n_jobs))

    start = 0
    chunk_idx = next_chunk_idx
    while start < len(remaining):
        part = remaining.iloc[start : start + chunk_size]
        labeled = ai_categorize(part, model, n_jobs=n_jobs)
        chunk_path = chunks_dir / f'{bin_name}_{chunk_idx}.csv'
        labeled.to_csv(chunk_path, index=False)
        start += len(part)
        chunk_idx += 1

    return _concat_chunks_to_final(bin_name)


def _concat_chunks_to_final(bin_name: str) -> pd.DataFrame:
    chunks_dir = categorized_chunks_dir()

    def _sort_key(p: Path) -> int:
        parsed = _chunk_index_from_name(p.name)
        return parsed[1] if parsed else -1

    files = sorted(
        [p for p in chunks_dir.glob(f'{bin_name}_*.csv') if _chunk_index_from_name(p.name)],
        key=_sort_key,
    )
    if not files:
        return pd.DataFrame()
    dfs = [pd.read_csv(p) for p in files]
    full = pd.concat(dfs, ignore_index=True)
    out_path = categorized_exports_dir() / f'{bin_name}_categorized.csv'
    full.to_csv(out_path, index=False)
    return full


def _pct_of_bin(mask_cat: pd.Series, bin_col: pd.Series, bin_val: str) -> float:
    bin_mask = bin_col.astype(str) == bin_val
    denom = int(bin_mask.sum())
    if denom == 0:
        return 0.0
    num = int((mask_cat & bin_mask).sum())
    return 100.0 * num / denom


def _summary_table(
    df: pd.DataFrame,
    group_col: str,
) -> pd.DataFrame:
    """One row per distinct group_col value: % bins + Bin 2 metrics."""
    bin_col = 'bin'
    if group_col not in df.columns or bin_col not in df.columns:
        return pd.DataFrame()

    # Normalize key for grouping
    key = df[group_col].fillna('').astype(str).str.strip()
    key = key.replace('', '(blank)')

    bins = ['bin1', 'bin2', 'bin3']
    rows: list[dict[str, Any]] = []

    for cat in sorted(key.unique(), key=lambda x: (x != '(blank)', str(x).lower())):
        mcat = key == cat
        row: dict[str, Any] = {group_col: cat}
        for b in bins:
            row[f'pct_{b}'] = round(_pct_of_bin(mcat, df[bin_col].astype(str), b), 4)

        b2 = (mcat) & (df[bin_col].astype(str) == 'bin2')
        sub = df.loc[b2]
        if len(sub) == 0:
            row['avg_sale_price_bin2'] = None
            row['avg_retail_bin2'] = None
            row['avg_margin_bin2'] = None
            row['avg_days_to_sell_bin2'] = None
        else:
            lt = pd.to_numeric(sub['line_total'], errors='coerce')
            retail = pd.to_numeric(sub['item_retail_amt'], errors='coerce')
            row['avg_sale_price_bin2'] = float(lt.mean()) if lt.notna().any() else None
            row['avg_retail_bin2'] = float(retail.mean()) if retail.notna().any() else None
            margin = lt / retail.replace(0, float('nan'))
            row['avg_margin_bin2'] = float(margin.mean()) if margin.notna().any() else None
            # Days to sell: cart_completed_at - processing_completed_at
            if 'cart_completed_at' in sub.columns and 'processing_completed_at' in sub.columns:
                c_end = pd.to_datetime(sub['cart_completed_at'], utc=True, errors='coerce')
                p_done = pd.to_datetime(sub['processing_completed_at'], utc=True, errors='coerce')
                ok = c_end.notna() & p_done.notna()
                if ok.any():
                    delta = (c_end[ok] - p_done[ok]).dt.total_seconds() / 86400.0
                    row['avg_days_to_sell_bin2'] = float(delta.mean())
                else:
                    row['avg_days_to_sell_bin2'] = None
            else:
                row['avg_days_to_sell_bin2'] = None
        rows.append(row)

    out = pd.DataFrame(rows)
    if group_col in ('ai_category', 'manifest_category') and not out.empty:
        out = out.sort_values('pct_bin2', ascending=False, na_position='last')
    return out


@dataclass
class CategorizationSummary:
    """``by_ai`` / ``by_manifest`` distribution tables."""

    by_ai: pd.DataFrame
    by_manifest: pd.DataFrame


def build_summary() -> CategorizationSummary:
    """
    Load ``bin{1,2,3}_categorized.csv`` from ``categorized_exports/`` and build
    parallel summaries grouped by ``ai_category`` and ``manifest_category``.
    Writes ``summary_ai.csv`` and ``summary_manifest.csv`` alongside.
    """
    root = categorized_exports_dir()
    parts: list[pd.DataFrame] = []
    for b in ('bin1', 'bin2', 'bin3'):
        p = root / f'{b}_categorized.csv'
        if p.is_file():
            parts.append(pd.read_csv(p))
    if not parts:
        empty = pd.DataFrame()
        return CategorizationSummary(empty, empty)

    all_bins = pd.concat(parts, ignore_index=True)
    by_ai = _summary_table(all_bins, 'ai_category')
    by_manifest = _summary_table(all_bins, 'manifest_category')

    by_ai.to_csv(root / 'summary_ai.csv', index=False)
    by_manifest.to_csv(root / 'summary_manifest.csv', index=False)

    return CategorizationSummary(by_ai, by_manifest)
