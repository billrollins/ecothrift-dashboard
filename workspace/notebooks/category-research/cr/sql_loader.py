"""Load unified bin SQL from scripts/sql/."""

from __future__ import annotations

from pathlib import Path

from .paths import sql_dir

SQL_FILES = {
    'bin1': 'unified_bin1_public.sql',
    'bin2': 'unified_bin2_public.sql',
    'bin3': 'unified_bin3_public.sql',
}


def load_sql(filename: str) -> str:
    path = sql_dir() / filename
    if not path.is_file():
        raise FileNotFoundError(f'SQL file not found: {path}')
    return path.read_text(encoding='utf-8')


def sql_for_bin(bin_name: str) -> str:
    key = bin_name.strip().lower()
    if key not in SQL_FILES:
        raise ValueError(f'Unknown bin {bin_name!r}; use {list(SQL_FILES)} or "all"')
    return load_sql(SQL_FILES[key])
