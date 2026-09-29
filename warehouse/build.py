"""
Build the Analytical layer (data_platform Phase 4) on this PC from the local copy of production.

    python -m warehouse.build              # all tables
    python -m warehouse.build --only item   # SQL files whose name contains "item"

- **Source:** the local Postgres copy that `scripts/deploy/0_pull_prod_to_local.bat` refreshes
  (schema `ecothrift`), read by DuckDB. Nothing is written to Postgres or production.
- **Output:** `workspace/warehouse/ecothrift.duckdb`, one Parquet file per table under
  `workspace/warehouse/parquet/`, and `workspace/warehouse/build.json` (rows, seconds, checks).
- **Tables:** `warehouse/sql/NN_name.sql`, run in order. Each file creates its tables with
  `CREATE OR REPLACE TABLE`; the source tables are `pg.<table>`.
- **Data quality:** every fill-in is a column (`*_source`, `era`, flags) named after its register ID in
  `.ai/extended/data-quality.md`. `checks.sql` counts what should be zero; the build prints them.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = Path(__file__).resolve().parent / 'sql'
OUT = ROOT / 'workspace' / 'warehouse'
BACKUPS = ROOT / 'scripts' / 'deploy' / 'backups'

PG = os.environ.get(
    'WAREHOUSE_PG',
    'dbname=local_shared user=postgres password=password host=localhost port=5432',  # the pull script's local DB
)


def _source_date() -> str | None:
    """The date of the last production pull (the newest dump the pull script kept)."""
    dumps = sorted(BACKUPS.glob('prod_ecothrift_schema_*.dump'))
    m = re.search(r'_(\d{8})_', dumps[-1].name) if dumps else None
    return f'{m[1][:4]}-{m[1][4:6]}-{m[1][6:]}' if m else None


def _statements(sql: str) -> list[str]:
    body = '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
    return [s.strip() for s in body.split(';') if s.strip()]


def _created_tables(sql: str) -> list[str]:
    return re.findall(r'CREATE OR REPLACE TABLE\s+(\w+)', sql, flags=re.I)


def build(only: str | None = None) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'parquet').mkdir(exist_ok=True)
    con = duckdb.connect(str(OUT / 'ecothrift.duckdb'))
    # No progress bar: DuckDB 1.5 can crash (GIL) printing it from Python on a long query.
    con.execute("INSTALL postgres; LOAD postgres; SET TimeZone = 'America/Chicago'; SET enable_progress_bar = false;")
    con.sql(f"ATTACH '{PG}' AS pg (TYPE postgres, READ_ONLY, SCHEMA 'ecothrift')")
    report = {'built_at': datetime.now().isoformat(timespec='seconds'), 'source_pull': _source_date(),
              'tables': {}, 'checks': {}}
    files = sorted(SQL_DIR.glob('*.sql'))
    for f in files:
        if only and only not in f.stem and f.stem != '99_checks':
            continue
        sql = f.read_text(encoding='utf-8')
        t0 = time.time()
        for stmt in _statements(sql):
            con.execute(stmt)
        for table in _created_tables(sql):
            rows = con.sql(f'SELECT count(*) FROM {table}').fetchone()[0]
            con.sql(f"COPY {table} TO '{(OUT / 'parquet' / f'{table}.parquet').as_posix()}' (FORMAT parquet)")
            report['tables'][table] = {'rows': rows, 'seconds': round(time.time() - t0, 1), 'file': f.name}
            print(f'{table:<22} {rows:>9,} rows  {time.time() - t0:5.1f}s')
    failed = []
    if 'checks' in report['tables']:
        for name, count, should in con.sql('SELECT name, count, should_be FROM checks').fetchall():
            report['checks'][name] = {'count': count, 'should_be': should}
            if should is not None and count != should:
                failed.append(name)
            print(f"  check {name:<46} {count:>9,}{'  <-- FAILED' if name in failed else ''}")
    report['failed'] = failed
    con.close()
    (OUT / 'build.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"source pull {report['source_pull']}; wrote {OUT / 'ecothrift.duckdb'}")
    print(f"RESULT: {'RED (' + ', '.join(failed) + ')' if failed else 'GREEN'}")
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    p.add_argument('--only', help='Only SQL files whose name contains this (checks always run).')
    raise SystemExit(1 if build(p.parse_args().only)['failed'] else 0)
