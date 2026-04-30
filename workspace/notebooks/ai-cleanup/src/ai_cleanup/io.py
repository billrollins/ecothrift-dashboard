"""Load and validate standardized manifest CSV files."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ai_cleanup.config import MANIFEST_TARGET_FIELDS


def load_manifest_csv(path: str | Path, *, encoding: str = "utf-8-sig") -> pd.DataFrame:
    """Read a standardized manifest CSV into a DataFrame."""
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise FileNotFoundError(p)
    return pd.read_csv(p, dtype=str, encoding=encoding, keep_default_na=False)


def validate_manifest_columns(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    """
    Return (missing, extra) compared to MANIFEST_TARGET_FIELDS.
    Missing names are required for a strict round-trip; extra columns are preserved by pandas.
    """
    cols = list(df.columns)
    missing = [c for c in MANIFEST_TARGET_FIELDS if c not in cols]
    expected_set = set(MANIFEST_TARGET_FIELDS)
    extra = [c for c in cols if c not in expected_set]
    return missing, extra
