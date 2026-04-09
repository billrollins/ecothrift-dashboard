"""
Assign canonical taxonomy categories to Bin 2 or Bin 3 export CSVs using Claude.

Requires ANTHROPIC_API_KEY. Logs every run under workspace/notebooks/category-research/logs/categorization/.

Each API batch is written immediately to categorized_exports/_chunks/<run_id>/chunk_NNNNN.csv
so progress is visible on disk and the process does not buffer the full result set until the end.
The final CSV is built by concatenating those chunk files in order.

Usage:
  python manage.py categorize_category_bins --taxonomy path/to/taxonomy_v1.json --bin bin2 \\
    --input path/to/bin2_....csv --output path/to/out.csv

  python manage.py categorize_category_bins --taxonomy ... --bin bin3 --input ... --dry-run

  # Merge existing chunks (e.g. after interrupt) without calling the API:
  python manage.py categorize_category_bins --concat-only --chunks-dir path/to/_chunks/bin2_2026-04-06T12-00-00Z --output out.csv

  # Same, but use the newest bin2_* or bin3_* folder under _chunks/ (no timestamp to type):
  python manage.py categorize_category_bins --concat-only --concat-latest --bin bin2
"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.category_research_paths import (
    category_research_categorized_exports,
    category_research_categorization_logs,
    chunk_run_dir,
    chunks_root,
)
from apps.inventory.services.category_taxonomy import (
    build_categorization_system_prompt,
    extract_json_object,
    load_taxonomy,
    normalize_category_name,
    row_dict_for_prompt,
    taxonomy_index_map,
    taxonomy_prompt_hash,
    validate_assignment,
)


def _import_anthropic():
    import anthropic as _anthropic
    return _anthropic


def get_anthropic_client():
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', None)
    if not api_key:
        return None
    anthropic = _import_anthropic()
    return anthropic.Anthropic(api_key=api_key)


def latest_chunk_run_dir(base: Path, bin_label: str) -> Path | None:
    """Newest subdir of _chunks/ named {bin_label}_* that contains at least one chunk_*.csv."""
    root = chunks_root(base)
    if not root.is_dir():
        return None
    prefix = f'{bin_label}_'
    candidates: list[Path] = []
    for p in root.iterdir():
        if not p.is_dir() or not p.name.startswith(prefix):
            continue
        if any(p.glob('chunk_*.csv')):
            candidates.append(p)
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def concat_chunk_csvs(chunk_dir: Path, out_path: Path) -> int:
    """Merge chunk_*.csv files in order into out_path. Returns data row count."""
    files = sorted(chunk_dir.glob('chunk_*.csv'), key=_chunk_sort_key)
    if not files:
        raise CommandError(f'No chunk_*.csv files in {chunk_dir}')
    total_rows = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open('w', newline='', encoding='utf-8') as outf:
        w = None
        expected_fields = None
        for fp in files:
            with fp.open(newline='', encoding='utf-8') as inf:
                reader = csv.DictReader(inf)
                fn = reader.fieldnames
                if not fn:
                    raise CommandError(f'Chunk has no header: {fp}')
                if w is None:
                    expected_fields = fn
                    w = csv.DictWriter(outf, fieldnames=expected_fields, extrasaction='ignore')
                    w.writeheader()
                elif list(fn) != list(expected_fields):
                    raise CommandError(
                        f'Chunk header mismatch in {fp}: expected {expected_fields}, got {fn}'
                    )
                for row in reader:
                    w.writerow(row)
                    total_rows += 1
    return total_rows


_CHUNK_RE = re.compile(r'^chunk_(\d+)\.csv$')


def _chunk_sort_key(path: Path) -> tuple[int, str]:
    m = _CHUNK_RE.match(path.name)
    if m:
        return (int(m.group(1)), path.name)
    return (10**9, path.name)


TAXONOMY_INPUT_FIELDS = [
    'bin',
    'row_key',
    'item_id',
    'sku',
    'manifest_row_id',
    'manifest_has_row',
    'manifest_category',
    'manifest_subcategory',
    'manifest_description',
    'manifest_retail_value',
    'product_title',
    'product_brand',
    'product_model',
    'item_retail_amt',
    'item_starting_price',
    'item_title',
    'item_brand',
    'condition',
]


class Command(BaseCommand):
    help = 'Categorize Bin 2 or Bin 3 CSV rows using a taxonomy JSON file and Claude.'

    def add_arguments(self, parser):
        parser.add_argument('--taxonomy', default='', help='Path to taxonomy_v1.json')
        parser.add_argument(
            '--bin',
            default='',
            help='bin2 or bin3 (required unless --concat-only)',
        )
        parser.add_argument('--input', default='', help='Input CSV path')
        parser.add_argument(
            '--output',
            default='',
            help='Output CSV (default: categorized_exports/<bin>_categorized_<ts>.csv)',
        )
        parser.add_argument(
            '--chunks-dir',
            default='',
            help='Directory with chunk_*.csv (for --concat-only; omit if using --concat-latest)',
        )
        parser.add_argument(
            '--concat-latest',
            action='store_true',
            help='With --concat-only: use newest _chunks/<bin>_* run that has chunk files',
        )
        parser.add_argument(
            '--concat-only',
            action='store_true',
            help='Merge chunk CSVs into --output; no API calls',
        )
        parser.add_argument('--batch-size', type=int, default=25)
        parser.add_argument('--model', default='claude-sonnet-4-6')
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Build prompts but do not call the API',
        )

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        if options['concat_only']:
            if options['concat_latest']:
                bin_label = options['bin']
                if bin_label not in ('bin2', 'bin3'):
                    raise CommandError('--bin bin2 or bin3 is required with --concat-latest')
                chunk_dir = latest_chunk_run_dir(base, bin_label)
                if chunk_dir is None:
                    raise CommandError(
                        f'No {bin_label}_* folder with chunk_*.csv under {chunks_root(base)}. '
                        f'Run a full categorize first.'
                    )
            elif options['chunks_dir']:
                chunk_dir = Path(options['chunks_dir'])
            else:
                raise CommandError(
                    'With --concat-only, pass --chunks-dir PATH or --concat-latest --bin bin2|bin3'
                )
            if not chunk_dir.is_dir():
                raise CommandError(f'Not a directory: {chunk_dir}')
            out_dir = category_research_categorized_exports(base)
            if options['output']:
                out_path = Path(options['output'])
            else:
                mstamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
                if options['bin'] in ('bin2', 'bin3'):
                    bin_for_name = options['bin']
                else:
                    bin_for_name = chunk_dir.name.split('_', 1)[0]
                out_path = out_dir / f'{bin_for_name}_categorized_merged_{mstamp}.csv'
            n = concat_chunk_csvs(chunk_dir, out_path)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Merged {n} rows from {chunk_dir} into {out_path}'
                )
            )
            return

        if not options['taxonomy']:
            raise CommandError('--taxonomy is required')
        bin_label = options['bin']
        if bin_label not in ('bin2', 'bin3'):
            raise CommandError('--bin must be bin2 or bin3')
        if not options['input']:
            raise CommandError('--input is required')

        tax_path = Path(options['taxonomy'])
        if not tax_path.is_file():
            raise CommandError(f'Taxonomy file not found: {tax_path}')

        data = load_taxonomy(tax_path)
        index_map = taxonomy_index_map(data)
        thash = taxonomy_prompt_hash(data)
        version = str(data.get('version') or 'unknown')

        in_path = Path(options['input'])
        if not in_path.is_file():
            raise CommandError(f'Input CSV not found: {in_path}')

        log_dir = category_research_categorization_logs(base)
        log_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
        log_path = log_dir / f'categorize_{bin_label}_{stamp}.jsonl'

        out_dir = category_research_categorized_exports(base)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = (
            Path(options['output'])
            if options['output']
            else out_dir / f'{bin_label}_categorized_{stamp}.csv'
        )

        chunk_dir = chunk_run_dir(base, bin_label, stamp)
        chunk_dir.mkdir(parents=True, exist_ok=True)

        client = get_anthropic_client()
        if client is None and not options['dry_run']:
            raise CommandError('ANTHROPIC_API_KEY is not configured.')
        anthropic_mod = _import_anthropic()

        system_prompt = build_categorization_system_prompt(data, bin_label)

        with in_path.open(newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)

        extra_out = [
            'assigned_category_index',
            'assigned_category_name',
            'taxonomy_version',
            'taxonomy_file_hash',
            'validation_status',
            'validation_message',
        ]
        out_fields = fieldnames + [c for c in extra_out if c not in fieldnames]

        batch_size = max(1, int(options['batch_size']))
        total_batches = (len(rows) + batch_size - 1) // batch_size if rows else 0

        if not rows:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open('w', newline='', encoding='utf-8') as outf:
                w = csv.DictWriter(outf, fieldnames=out_fields, extrasaction='ignore')
                w.writeheader()
            self.stdout.write(
                self.style.WARNING(
                    f'Input had 0 data rows; wrote header-only {out_path}; log {log_path}'
                )
            )
            return

        for batch_index, start in enumerate(range(0, len(rows), batch_size)):
            batch = rows[start : start + batch_size]
            payload_rows = []
            for r in batch:
                payload_rows.append(row_dict_for_prompt(r, TAXONOMY_INPUT_FIELDS))

            user_content = (
                f'Categorize each row. row_key must match exactly.\n'
                f'Rows JSON:\n{json.dumps(payload_rows, ensure_ascii=False)}'
            )

            log_entry = {
                'ts': datetime.now(timezone.utc).isoformat(),
                'batch_start': start,
                'batch_size': len(batch),
                'batch_index': batch_index,
                'chunk_dir': str(chunk_dir),
                'taxonomy_version': version,
                'taxonomy_hash': thash,
                'user_content_preview': user_content[:2000],
            }

            batch_out: list[dict[str, str]] = []

            if options['dry_run']:
                log_entry['dry_run'] = True
                with log_path.open('a', encoding='utf-8') as lf:
                    lf.write(json.dumps(log_entry) + '\n')
                for r in batch:
                    row_out = dict(r)
                    row_out['assigned_category_index'] = ''
                    row_out['assigned_category_name'] = ''
                    row_out['taxonomy_version'] = version
                    row_out['taxonomy_file_hash'] = thash
                    row_out['validation_status'] = 'skipped_dry_run'
                    row_out['validation_message'] = ''
                    batch_out.append(row_out)
            else:
                assert client is not None
                try:
                    response = client.messages.create(
                        model=options['model'],
                        max_tokens=8192,
                        system=system_prompt,
                        messages=[{'role': 'user', 'content': user_content}],
                    )
                    from apps.core.services.ai_usage_log import log_ai_usage_from_response

                    log_ai_usage_from_response(
                        'categorize_category_bins',
                        response,
                        model=options['model'],
                        detail='categorize_category_bins',
                    )
                except anthropic_mod.APIError as e:
                    raise CommandError(f'Anthropic API error: {e}') from e

                text = ''
                for block in response.content:
                    if block.type == 'text':
                        text += block.text

                log_entry['response_id'] = getattr(response, 'id', None)
                log_entry['usage'] = {
                    'input_tokens': response.usage.input_tokens,
                    'output_tokens': response.usage.output_tokens,
                }
                log_entry['response_text'] = text

                try:
                    parsed = extract_json_object(text)
                except json.JSONDecodeError as e:
                    log_entry['parse_error'] = str(e)
                    with log_path.open('a', encoding='utf-8') as lf:
                        lf.write(json.dumps(log_entry) + '\n')
                    raise CommandError(f'Could not parse JSON from model: {e}\n{text[:500]}')

                assignments = {a['row_key']: a for a in parsed.get('assignments', [])}

                with log_path.open('a', encoding='utf-8') as lf:
                    lf.write(json.dumps(log_entry) + '\n')

                for r in batch:
                    rk = r.get('row_key', '')
                    row_out = dict(r)
                    a = assignments.get(rk)
                    if not a:
                        row_out['assigned_category_index'] = ''
                        row_out['assigned_category_name'] = ''
                        row_out['taxonomy_version'] = version
                        row_out['taxonomy_file_hash'] = thash
                        row_out['validation_status'] = 'missing_assignment'
                        row_out['validation_message'] = 'no assignment for row_key'
                        batch_out.append(row_out)
                        continue

                    try:
                        idx = int(a['category_index'])
                        name = str(a['category_name'])
                    except (KeyError, TypeError, ValueError) as e:
                        row_out['assigned_category_index'] = ''
                        row_out['assigned_category_name'] = ''
                        row_out['taxonomy_version'] = version
                        row_out['taxonomy_file_hash'] = thash
                        row_out['validation_status'] = 'bad_assignment_shape'
                        row_out['validation_message'] = str(e)
                        batch_out.append(row_out)
                        continue

                    ok, msg = validate_assignment(idx, name, index_map)
                    row_out['assigned_category_index'] = str(idx)
                    row_out['assigned_category_name'] = normalize_category_name(name)
                    row_out['taxonomy_version'] = version
                    row_out['taxonomy_file_hash'] = thash
                    row_out['validation_status'] = 'ok' if ok else 'validation_failed'
                    row_out['validation_message'] = msg if not ok else ''
                    batch_out.append(row_out)

            chunk_path = chunk_dir / f'chunk_{batch_index:05d}.csv'
            with chunk_path.open('w', newline='', encoding='utf-8') as cf:
                cw = csv.DictWriter(cf, fieldnames=out_fields, extrasaction='ignore')
                cw.writeheader()
                for row in batch_out:
                    cw.writerow(row)

            end_row = start + len(batch)
            try:
                chunk_display = str(chunk_path.relative_to(base))
            except ValueError:
                chunk_display = str(chunk_path)
            self.stdout.write(
                f'Chunk {batch_index + 1}/{total_batches} rows {start + 1}-{end_row} '
                f'-> {chunk_display}'
            )

        row_count = concat_chunk_csvs(chunk_dir, out_path)

        self.stdout.write(
            self.style.SUCCESS(
                f'Wrote {row_count} rows to {out_path}; chunks {chunk_dir}; log {log_path}'
            )
        )
