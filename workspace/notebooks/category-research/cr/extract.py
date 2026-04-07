"""Run unified bin SQL and return pandas DataFrames."""

from __future__ import annotations

import pickle
from pathlib import Path
from typing import Union

import pandas as pd
from django.db import connections

from .paths import cache_dir
from .sql_loader import sql_for_bin


def _pandas_db_connection(alias: str):
    """Open Django DB connection if needed; return raw connection for ``pandas.read_sql``."""
    db = connections[alias]
    db.ensure_connection()
    return db.connection


def run_extract(
    bin_name: str,
    *,
    alias: str = 'default',
) -> Union[pd.DataFrame, dict[str, pd.DataFrame]]:
    """
    Execute unified SQL for ``bin1``, ``bin2``, ``bin3``, or ``all``.

    For ``all``, returns a dict of three DataFrames. Otherwise a single DataFrame.

    Requires Django configured (``django.setup()``) and pandas installed.
    """
    key = bin_name.strip().lower()
    if key == 'all':
        return run_extract_all(alias=alias)
    sql = sql_for_bin(key)
    return pd.read_sql(sql, _pandas_db_connection(alias))


def run_extract_all(*, alias: str = 'default') -> dict[str, pd.DataFrame]:
    """Return ``{'bin1': df1, 'bin2': df2, 'bin3': df3}``."""
    conn = _pandas_db_connection(alias)
    out: dict[str, pd.DataFrame] = {}
    for b in ('bin1', 'bin2', 'bin3'):
        out[b] = pd.read_sql(sql_for_bin(b), conn)
    return out


def save_pickle(df: pd.DataFrame, path: str | None = None, *, bin_name: str | None = None) -> Path:
    """
    Write DataFrame to ``cache/extract_<bin>.pkl`` unless ``path`` is given.

    Returns the path written.
    """
    if path:
        out = Path(path)
    else:
        if not bin_name:
            raise ValueError('Pass path= or bin_name=')
        out = cache_dir() / f'extract_{bin_name.strip().lower()}.pkl'
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('wb') as f:
        pickle.dump(df, f, protocol=pickle.HIGHEST_PROTOCOL)
    return out


def load_pickle(path: str) -> pd.DataFrame:
    p = Path(path)
    with p.open('rb') as f:
        return pickle.load(f)


def load_extract_pickle(bin_name: str) -> pd.DataFrame:
    """Load ``cache/extract_<bin>.pkl`` (same layout as :func:`save_pickle`)."""
    p = cache_dir() / f'extract_{bin_name.strip().lower()}.pkl'
    return load_pickle(str(p))
