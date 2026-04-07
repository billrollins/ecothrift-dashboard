"""
Execute one or more SQL statements against Django's default DB.

Resolves the SQL file in this order:
  1) ai_scripts/sql/<name>
  2) scripts/sql/<name> (repo root; unified_bin*_public.sql live here)

Usage (from repo root):
  python workspace/notebooks/category-research/ai_scripts/ai_execute_sql.py \\
    category_research_discovery.sql category_research_discovery

Writes ai_scripts/output/{name}_1.csv, {name}_2.csv, ... (one file per SELECT).
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

# Repo root: .../ecothrift-dashboard
_SCRIPT = Path(__file__).resolve()
_REPO_ROOT = _SCRIPT.parents[4]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ecothrift.settings')

import django  # noqa: E402

django.setup()

from django.db import connection  # noqa: E402


def _first_sql_line(code_lines: list[str]) -> str:
    for ln in code_lines:
        s = ln.strip()
        if s and not s.startswith('--'):
            return s.upper()
    return ''


def _split_sql_statements(raw: str) -> list[str]:
    """Split on semicolon + newline. Skips blocks that are only comments or non-SELECT."""
    text = raw.replace('\r\n', '\n').strip()
    if not text:
        return []
    if not text.endswith('\n'):
        text = text + '\n'
    parts = text.split(';\n')
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if p.endswith(';'):
            p = p[:-1].strip()
        lines = [ln for ln in p.split('\n') if ln.strip()]
        code_lines = [ln for ln in lines if not ln.strip().startswith('--')]
        if not code_lines:
            continue
        head = _first_sql_line(code_lines)
        if not (
            head.startswith('SELECT')
            or head.startswith('WITH')
            or head.startswith('(')
        ):
            continue
        out.append(p)
    return out


def _rows_to_csv(path: Path, columns: list[str], rows: list[tuple]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(columns)
        for row in rows:
            w.writerow(['' if v is None else v for v in row])


def _empty_result_csv(path: Path, note: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['_note'])
        w.writerow([note])


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Run SQL file(s) against Django default DB, write CSVs.',
    )
    parser.add_argument(
        'sql_file',
        help='SQL filename (ai_scripts/sql/ or scripts/sql/)',
    )
    parser.add_argument(
        'output_basename',
        help='Output base name (no extension); writes output/{base}_N.csv',
    )
    args = parser.parse_args()

    local_sql = _SCRIPT.parent / 'sql' / args.sql_file
    scripts_sql = _REPO_ROOT / 'scripts' / 'sql' / args.sql_file
    sql_path = local_sql if local_sql.is_file() else scripts_sql
    out_dir = _SCRIPT.parent / 'output'
    if not sql_path.is_file():
        print(
            f'ERROR: SQL file not found in ai_scripts/sql/ or scripts/sql/: {args.sql_file}',
            file=sys.stderr,
            flush=True,
        )
        return 1

    raw = sql_path.read_text(encoding='utf-8')
    statements = _split_sql_statements(raw)
    if not statements:
        print(
            'ERROR: No executable SELECT statements found after splitting.',
            file=sys.stderr,
            flush=True,
        )
        return 1

    cursor = connection.cursor()

    for idx, stmt in enumerate(statements, start=1):
        out_path = out_dir / f'{args.output_basename}_{idx}.csv'
        sql_run = stmt if stmt.rstrip().endswith(';') else stmt + ';'
        try:
            cursor.execute(sql_run)
        except Exception as e:
            print(f'--- Statement {idx} ERROR ---', flush=True)
            print(f'Failed: {e}', file=sys.stderr, flush=True)
            _empty_result_csv(out_path, f'EXECUTION_ERROR: {e}')
            print(f'[{idx}] wrote {out_path.name} (error placeholder)', flush=True)
            continue

        if cursor.description is None:
            print(f'--- Statement {idx} (no result set) ---', flush=True)
            _empty_result_csv(out_path, 'No result set (not a SELECT?)')
            print(f'[{idx}] rows=0 cols=0 -> {out_path.name} (placeholder)', flush=True)
            continue

        columns = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        n = len(rows)
        if n == 0:
            _empty_result_csv(out_path, 'Query returned 0 rows')
            print(f'--- Statement {idx} ---', flush=True)
            print(f'columns: {columns}', flush=True)
            print(f'[{idx}] rows=0 (empty) -> {out_path.name}', flush=True)
        else:
            _rows_to_csv(out_path, columns, rows)
            print(f'--- Statement {idx} ---', flush=True)
            print(f'columns: {columns}', flush=True)
            print(f'[{idx}] rows={n} -> {out_path.name}', flush=True)

    cursor.close()
    print(f'Done. Output directory: {out_dir}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
