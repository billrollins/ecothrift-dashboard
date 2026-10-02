"""
Read the warehouse without locking it: an in-memory DuckDB with one view per Parquet file.

    from warehouse.db import connect
    con = connect()
    con.execute('select count(*) from item_outcome').fetchone()

Notebooks and the model factory use this, so a rebuild never waits on an open notebook (on Windows, an open
DuckDB file can't be replaced).
"""
from __future__ import annotations

from pathlib import Path

import duckdb

PARQUET = Path(__file__).resolve().parent.parent / 'workspace' / 'warehouse' / 'parquet'


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET TimeZone = 'America/Chicago'")
    for f in sorted(PARQUET.glob('*.parquet')):
        con.execute(f"CREATE VIEW {f.stem} AS SELECT * FROM read_parquet('{f.as_posix()}')")
    return con
