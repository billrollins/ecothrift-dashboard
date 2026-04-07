"""Lightweight review helpers for extract DataFrames."""

from __future__ import annotations

from typing import Any

import pandas as pd

# Tier A (AI) columns — same labels as unified_bin*_public.sql headers.
TIER_A_COLUMNS = (
    'manifest_category',
    'vendor_name',
    'product_title',
    'product_brand',
    'manifest_retail_value',
    'item_retail_amt',
)


def _tier_a_text_missing(s: pd.Series) -> pd.Series:
    if s.dtype == 'object' or str(s.dtype).startswith('string'):
        t = s.astype('string')
        return t.isna() | (t.str.strip() == '')
    return s.isna()


def _tier_a_numeric_missing(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors='coerce').isna()


def summarize(df: pd.DataFrame) -> dict[str, Any]:
    """Row count, dtypes, null fraction per column."""
    out: dict[str, Any] = {
        'rows': len(df),
        'columns': list(df.columns),
        'dtypes': {c: str(t) for c, t in df.dtypes.items()},
        'null_frac': (df.isna().mean()).to_dict(),
    }
    return out


def sample_df(df: pd.DataFrame, n: int = 20, random_state: int | None = 42) -> pd.DataFrame:
    """Up to n rows (random sample if larger)."""
    if len(df) <= n:
        return df.copy()
    return df.sample(n=n, random_state=random_state)


def top_values(
    df: pd.DataFrame,
    column: str,
    n: int = 15,
) -> pd.Series:
    """Value counts for a column (excludes NA)."""
    if column not in df.columns:
        raise KeyError(f'No column {column!r}')
    return df[column].value_counts(dropna=True).head(n)


def print_tier_a_review(
    df: pd.DataFrame,
    *,
    top_n: int = 10,
    sample_n: int = 5,
    random_state: int = 42,
) -> None:
    """
    Print row count, Tier A missing rates, top manifest_category values, and sample rows.

    Text columns: missing = NaN or blank after strip.
    Numeric (manifest_retail_value, item_retail_amt): missing = not parseable as number (NaN).
    """
    print(f'rows: {len(df)}')
    print('Tier A missing rate:')
    for c in TIER_A_COLUMNS:
        if c not in df.columns:
            print(f'  {c}: (column absent)')
            continue
        if c in ('manifest_retail_value', 'item_retail_amt'):
            rate = float(_tier_a_numeric_missing(df[c]).mean())
        else:
            rate = float(_tier_a_text_missing(df[c]).mean())
        print(f'  {c}: {rate:.4f}')
    if 'manifest_category' in df.columns:
        vc = df['manifest_category'].astype('string')
        vc = vc.where(vc.notna() & (vc.str.strip() != ''), other=pd.NA)
        top = vc.value_counts(dropna=True).head(top_n)
        print(f'Top {top_n} manifest_category:')
        for k, v in top.items():
            print(f'  {k!r}: {v}')
    print(f'Sample {sample_n} rows (Tier A):')
    cols = [c for c in TIER_A_COLUMNS if c in df.columns]
    print(sample_df(df, sample_n, random_state=random_state)[cols].to_string())
