"""
Management command to benchmark the AI cleanup pipeline.

Usage:
    python manage.py test_ai_cleanup <order_id>
    python manage.py test_ai_cleanup <order_id> --batch-size=10 --model=claude-haiku-4-5
    python manage.py test_ai_cleanup <order_id> --save          # persist results to DB
    python manage.py test_ai_cleanup <order_id> --batches=3     # only run 3 batches
"""
import json
import re
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import ManifestRow, PurchaseOrder


class Command(BaseCommand):
    help = 'Benchmark AI cleanup pipeline with detailed per-batch timing'

    def add_arguments(self, parser):
        parser.add_argument('order_id', type=int, help='PurchaseOrder ID to test against')
        parser.add_argument('--batch-size', type=int, default=10, help='Rows per batch (default: 10)')
        parser.add_argument('--model', type=str, default='claude-haiku-4-5', help='Model ID (default: claude-haiku-4-5)')
        parser.add_argument('--save', action='store_true', help='Persist AI results to database (default: dry-run)')
        parser.add_argument('--batches', type=int, default=0, help='Max batches to run (0 = all)')
        parser.add_argument('--offset', type=int, default=0, help='Starting row offset')

    def handle(self, *args, **options):
        order_id = options['order_id']
        batch_size = options['batch_size']
        model_id = options['model']
        save = options['save']
        max_batches = options['batches']
        start_offset = options['offset']

        try:
            import anthropic as anthropic_lib
        except ImportError:
            raise CommandError('anthropic is not installed. Run: pip install anthropic')

        api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
        if not api_key:
            raise CommandError('ANTHROPIC_API_KEY not configured in settings.')

        try:
            order = PurchaseOrder.objects.get(pk=order_id)
        except PurchaseOrder.DoesNotExist:
            raise CommandError(f'PurchaseOrder {order_id} not found.')

        qs = ManifestRow.objects.filter(purchase_order=order).order_by('row_number')
        total_rows = qs.count()
        if total_rows == 0:
            raise CommandError(f'Order {order_id} has no manifest rows.')

        mode_label = 'LIVE (saving results)' if save else 'DRY-RUN (results discarded)'
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\nAI Cleanup Benchmark — {mode_label}'
        ))
        self.stdout.write(f'  Order:      #{order.order_number} (ID {order.id})')
        self.stdout.write(f'  Vendor:     {order.vendor_name}')
        self.stdout.write(f'  Total rows: {total_rows}')
        self.stdout.write(f'  Model:      {model_id}')
        self.stdout.write(f'  Batch size: {batch_size}')
        self.stdout.write(f'  Offset:     {start_offset}')
        self.stdout.write('')

        system_prompt = (
            "You are a product data specialist for a thrift store that processes liquidation manifests. "
            "For each row, review the description and any existing brand/model data. "
            "Suggest a clean, standardized Title, Brand, Model, and any relevant specifications.\n\n"
            "Guidelines:\n"
            "- Title should be concise and descriptive (e.g. 'Samsung 55\" 4K Smart TV')\n"
            "- Extract Brand from description if not already set\n"
            "- Extract Model number if identifiable\n"
            "- Specifications should be key-value pairs of notable product attributes\n"
            "- Search tags should be comma-separated keywords useful for search\n"
            "- Fix obvious typos and formatting issues\n"
            "- If the existing data looks correct, return it as-is\n\n"
            "Return ONLY valid JSON array:\n"
            '[{"row_id": N, "title": "Clean Title", "brand": "Brand", "model": "Model", '
            '"search_tags": "tag1, tag2", "specifications": {"key": "value"}, '
            '"reasoning": "brief explanation of changes"}]'
        )

        client = anthropic_lib.Anthropic(api_key=api_key)

        batch_reports = []
        offset = start_offset
        batch_num = 0
        grand_start = time.perf_counter()

        header = f'{"Batch":>5}  {"Rows":>5}  {"DB Fetch":>9}  {"Prompt":>8}  {"API Call":>10}  {"Parse":>8}  {"DB Save":>9}  {"Total":>9}  {"Tokens In":>10}  {"Tokens Out":>11}'
        separator = '-' * len(header)
        self.stdout.write(header)
        self.stdout.write(separator)

        while offset < total_rows:
            if max_batches and batch_num >= max_batches:
                break

            batch_num += 1
            timings = {}

            t0 = time.perf_counter()
            batch = list(qs[offset:offset + batch_size])
            timings['db_fetch'] = time.perf_counter() - t0

            if not batch:
                break

            t0 = time.perf_counter()
            batch_data = []
            for r in batch:
                batch_data.append({
                    'row_id': r.id,
                    'description': r.description,
                    'title': r.title,
                    'brand': r.brand,
                    'model': r.model,
                    'category': r.category,
                    'condition': r.condition,
                    'upc': r.upc,
                    'retail_value': str(r.retail_value) if r.retail_value else '',
                })
            payload_str = json.dumps(batch_data)
            timings['prompt_build'] = time.perf_counter() - t0

            t0 = time.perf_counter()
            try:
                response = client.messages.create(
                    model=model_id,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[{'role': 'user', 'content': payload_str}],
                    timeout=90.0,
                )
            except Exception as e:
                timings['api_call'] = time.perf_counter() - t0
                self.stdout.write(self.style.ERROR(
                    f'  Batch {batch_num} FAILED after {timings["api_call"]:.1f}s: {e}'
                ))
                batch_reports.append({**timings, 'error': str(e), 'rows': len(batch)})
                offset += batch_size
                continue
            timings['api_call'] = time.perf_counter() - t0

            input_tokens = getattr(response.usage, 'input_tokens', 0)
            output_tokens = getattr(response.usage, 'output_tokens', 0)

            t0 = time.perf_counter()
            content_text = ''
            for block in response.content:
                if block.type == 'text':
                    content_text += block.text

            rows_updated = 0
            json_match = re.search(r'\[[\s\S]*\]', content_text)
            suggestions_by_id = {}
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    suggestions_by_id = {
                        s['row_id']: s for s in parsed if isinstance(s, dict)
                    }
                except (json.JSONDecodeError, KeyError):
                    pass
            timings['parse'] = time.perf_counter() - t0

            t0 = time.perf_counter()
            rows_to_update = []
            for r in batch:
                suggestion = suggestions_by_id.get(r.id, {})
                if suggestion:
                    r.ai_suggested_title = (suggestion.get('title') or '')[:300]
                    r.ai_suggested_brand = (suggestion.get('brand') or '')[:200]
                    r.ai_suggested_model = (suggestion.get('model') or '')[:200]
                    r.ai_reasoning = suggestion.get('reasoning') or ''
                    if suggestion.get('search_tags'):
                        r.search_tags = suggestion['search_tags']
                    if isinstance(suggestion.get('specifications'), dict):
                        r.specifications = suggestion['specifications']
                    rows_to_update.append(r)

            if save and rows_to_update:
                ManifestRow.objects.bulk_update(rows_to_update, [
                    'ai_suggested_title', 'ai_suggested_brand',
                    'ai_suggested_model', 'ai_reasoning',
                    'search_tags', 'specifications',
                ])
            rows_updated = len(rows_to_update)
            timings['db_save'] = time.perf_counter() - t0

            timings['total'] = sum(v for v in timings.values() if isinstance(v, float))

            report = {
                **timings,
                'rows': len(batch),
                'rows_updated': rows_updated,
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
            }
            batch_reports.append(report)

            self.stdout.write(
                f'{batch_num:>5}  '
                f'{len(batch):>5}  '
                f'{timings["db_fetch"]*1000:>7.0f}ms  '
                f'{timings["prompt_build"]*1000:>6.0f}ms  '
                f'{timings["api_call"]*1000:>8.0f}ms  '
                f'{timings["parse"]*1000:>6.0f}ms  '
                f'{timings["db_save"]*1000:>7.0f}ms  '
                f'{timings["total"]*1000:>7.0f}ms  '
                f'{input_tokens:>10,}  '
                f'{output_tokens:>11,}'
            )

            offset += batch_size

        grand_elapsed = time.perf_counter() - grand_start
        self.stdout.write(separator)

        total_batches = len(batch_reports)
        total_processed = sum(r.get('rows', 0) for r in batch_reports)
        total_api_ms = sum(r.get('api_call', 0) for r in batch_reports) * 1000
        total_save_ms = sum(r.get('db_save', 0) for r in batch_reports) * 1000
        total_fetch_ms = sum(r.get('db_fetch', 0) for r in batch_reports) * 1000
        total_input_tokens = sum(r.get('input_tokens', 0) for r in batch_reports)
        total_output_tokens = sum(r.get('output_tokens', 0) for r in batch_reports)
        errors = sum(1 for r in batch_reports if 'error' in r)

        avg_api = (total_api_ms / total_batches) if total_batches else 0

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Summary'))
        self.stdout.write(f'  Batches run:       {total_batches}  ({errors} errors)')
        self.stdout.write(f'  Rows processed:    {total_processed} / {total_rows}')
        self.stdout.write(f'  Wall-clock time:   {grand_elapsed:.1f}s')
        self.stdout.write(f'  DB fetch total:    {total_fetch_ms:.0f}ms')
        self.stdout.write(f'  API call total:    {total_api_ms:.0f}ms  (avg {avg_api:.0f}ms/batch)')
        self.stdout.write(f'  DB save total:     {total_save_ms:.0f}ms')
        self.stdout.write(f'  Tokens in/out:     {total_input_tokens:,} / {total_output_tokens:,}')

        if total_batches and total_processed:
            per_row_ms = (grand_elapsed * 1000) / total_processed
            self.stdout.write(f'  Per-row avg:       {per_row_ms:.0f}ms')
            remaining = total_rows - start_offset - total_processed
            if remaining > 0:
                eta_s = (remaining * per_row_ms) / 1000
                self.stdout.write(f'  ETA remaining:     {eta_s:.0f}s ({remaining} rows)')

        self.stdout.write('')
        if not save:
            self.stdout.write(self.style.WARNING('  DRY-RUN: No data was saved. Use --save to persist results.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'  SAVED: {total_processed} rows updated in database.'))
