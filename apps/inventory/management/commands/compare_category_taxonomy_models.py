"""
Run the same categorization prompt against Claude Opus / Sonnet / Haiku for N rows (default 100).

Writes per-model CSVs, usage summary JSON, and PROMPT_REVIEW.md (system + sample user message).

Usage:
  python manage.py compare_category_taxonomy_models --bin bin2 \\
    --input workspace/notebooks/category-research/exports/bin2_2026_sold_pos_2026-04-06.csv \\
    --taxonomy workspace/notebooks/category-research/taxonomy_v1.example.json
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.category_research_paths import category_research_model_compare
from apps.inventory.management.commands.categorize_category_bins import (
    TAXONOMY_INPUT_FIELDS,
    _import_anthropic,
    get_anthropic_client,
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


DEFAULT_MODELS = [
    ('claude-opus-4-6', 'Claude Opus 4.6'),
    ('claude-sonnet-4-6', 'Claude Sonnet 4.6'),
    ('claude-haiku-4-5', 'Claude Haiku 4.5'),
]


class Command(BaseCommand):
    help = 'Compare Opus / Sonnet / Haiku on the same N categorization rows; save outputs + prompts.'

    def add_arguments(self, parser):
        parser.add_argument('--taxonomy', required=True, help='Path to taxonomy JSON')
        parser.add_argument('--bin', required=True, choices=['bin2', 'bin3'], help='Label for prompts')
        parser.add_argument('--input', required=True, help='Input CSV (bin2 or bin3 export)')
        parser.add_argument('--limit', type=int, default=100, help='Max rows to process (default 100)')
        parser.add_argument('--batch-size', type=int, default=25, help='Rows per API call (default 25)')
        parser.add_argument(
            '--models',
            default='',
            help='Comma-separated model ids (default: opus, sonnet, haiku 4.6/4.5)',
        )

    def handle(self, *args, **options):
        client = get_anthropic_client()
        if client is None:
            raise CommandError('ANTHROPIC_API_KEY is not configured.')

        tax_path = Path(options['taxonomy'])
        if not tax_path.is_file():
            raise CommandError(f'Taxonomy not found: {tax_path}')

        data = load_taxonomy(tax_path)
        index_map = taxonomy_index_map(data)
        thash = taxonomy_prompt_hash(data)
        version = str(data.get('version') or 'unknown')
        system_prompt = build_categorization_system_prompt(data, options['bin'])

        in_path = Path(options['input'])
        if not in_path.is_file():
            raise CommandError(f'Input not found: {in_path}')

        with in_path.open(newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)[: max(1, int(options['limit']))]

        if not rows:
            raise CommandError('No rows to process.')

        batch_size = max(1, int(options['batch_size']))
        raw_models = options['models'].strip()
        if raw_models:
            model_ids = [m.strip() for m in raw_models.split(',') if m.strip()]
        else:
            model_ids = [m[0] for m in DEFAULT_MODELS]

        base = Path(settings.BASE_DIR)
        out_dir = category_research_model_compare(base)
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
        run_dir = out_dir / f'run_{stamp}'
        run_dir.mkdir(parents=True, exist_ok=True)

        # First batch only — sample user message for PROMPT_REVIEW
        first_batch = rows[:batch_size]
        sample_payload = [row_dict_for_prompt(r, TAXONOMY_INPUT_FIELDS) for r in first_batch]
        sample_user = (
            f'Categorize each row. row_key must match exactly.\n'
            f'Rows JSON:\n{json.dumps(sample_payload, ensure_ascii=False)}'
        )

        prompt_review = run_dir / 'PROMPT_REVIEW.md'
        prompt_review.write_text(
            '# Categorization prompt (review)\n\n'
            '## System prompt\n\n```text\n'
            + system_prompt
            + '\n```\n\n## User message (first batch only; '
            + str(len(first_batch))
            + ' rows)\n\n```text\n'
            + sample_user
            + '\n```\n',
            encoding='utf-8',
        )

        anthropic_mod = _import_anthropic()

        extra_out = [
            'claude_model',
            'assigned_category_index',
            'assigned_category_name',
            'taxonomy_version',
            'taxonomy_file_hash',
            'validation_status',
            'validation_message',
        ]
        out_fields = fieldnames + [c for c in extra_out if c not in fieldnames]

        summary: dict = {
            'stamp': stamp,
            'taxonomy_version': version,
            'taxonomy_hash': thash,
            'input': str(in_path),
            'row_count': len(rows),
            'batch_size': batch_size,
            'models': {},
        }

        for model_id in model_ids:
            self.stdout.write(f'Running model: {model_id} ...')
            results: list[dict[str, str]] = []
            usage_in = 0
            usage_out = 0

            for start in range(0, len(rows), batch_size):
                batch = rows[start : start + batch_size]
                payload_rows = [row_dict_for_prompt(r, TAXONOMY_INPUT_FIELDS) for r in batch]
                user_content = (
                    f'Categorize each row. row_key must match exactly.\n'
                    f'Rows JSON:\n{json.dumps(payload_rows, ensure_ascii=False)}'
                )

                try:
                    response = client.messages.create(
                        model=model_id,
                        max_tokens=8192,
                        system=system_prompt,
                        messages=[{'role': 'user', 'content': user_content}],
                    )
                except anthropic_mod.APIError as e:
                    raise CommandError(f'{model_id} API error: {e}') from e

                text = ''
                for block in response.content:
                    if block.type == 'text':
                        text += block.text

                usage_in += response.usage.input_tokens
                usage_out += response.usage.output_tokens

                try:
                    parsed = extract_json_object(text)
                except json.JSONDecodeError as e:
                    for r in batch:
                        row_out = dict(r)
                        row_out['claude_model'] = model_id
                        row_out['assigned_category_index'] = ''
                        row_out['assigned_category_name'] = ''
                        row_out['taxonomy_version'] = version
                        row_out['taxonomy_file_hash'] = thash
                        row_out['validation_status'] = 'parse_error'
                        row_out['validation_message'] = str(e)
                        results.append(row_out)
                    continue

                assignments = {a['row_key']: a for a in parsed.get('assignments', [])}

                for r in batch:
                    rk = r.get('row_key', '')
                    row_out = dict(r)
                    row_out['claude_model'] = model_id
                    a = assignments.get(rk)
                    if not a:
                        row_out['assigned_category_index'] = ''
                        row_out['assigned_category_name'] = ''
                        row_out['taxonomy_version'] = version
                        row_out['taxonomy_file_hash'] = thash
                        row_out['validation_status'] = 'missing_assignment'
                        row_out['validation_message'] = ''
                        results.append(row_out)
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
                        results.append(row_out)
                        continue

                    ok, msg = validate_assignment(idx, name, index_map)
                    row_out['assigned_category_index'] = str(idx)
                    row_out['assigned_category_name'] = normalize_category_name(name)
                    row_out['taxonomy_version'] = version
                    row_out['taxonomy_file_hash'] = thash
                    row_out['validation_status'] = 'ok' if ok else 'validation_failed'
                    row_out['validation_message'] = msg if not ok else ''
                    results.append(row_out)

            safe_slug = model_id.replace('.', '_')
            csv_path = run_dir / f'{options["bin"]}_{safe_slug}_{stamp}.csv'
            with csv_path.open('w', newline='', encoding='utf-8') as outf:
                w = csv.DictWriter(outf, fieldnames=out_fields, extrasaction='ignore')
                w.writeheader()
                for row in results:
                    w.writerow(row)

            ok_n = sum(1 for r in results if r.get('validation_status') == 'ok')
            summary['models'][model_id] = {
                'csv': str(csv_path.relative_to(base)),
                'input_tokens': usage_in,
                'output_tokens': usage_out,
                'rows_ok_validation': ok_n,
            }
            self.stdout.write(self.style.SUCCESS(f'  -> {csv_path.name} ({ok_n} validated ok)'))

        summary_path = run_dir / 'summary.json'
        summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')

        self.stdout.write(
            self.style.NOTICE(
                f'Done. Review prompts: {prompt_review}\nSummary: {summary_path}'
            )
        )
