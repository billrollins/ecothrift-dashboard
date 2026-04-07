"""
Aggregate categorized Bin 2 and Bin 3 CSVs by canonical category (assigned columns).

Usage:
  python manage.py report_category_bins --bin2 path/to/bin2_categorized.csv \\
    --bin3 path/to/bin3_categorized.csv --output workspace/notebooks/category-research/reports/summary.md
"""

from __future__ import annotations

import csv
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.category_research_paths import category_research_reports


def _dec(val: str | None) -> Decimal | None:
    if val is None or str(val).strip() == '':
        return None
    try:
        return Decimal(str(val).strip())
    except (InvalidOperation, ValueError):
        return None


def _cat_sort_key(k: str) -> int:
    try:
        return int(k.split('|')[0])
    except (ValueError, IndexError):
        return 0


class Command(BaseCommand):
    help = 'Build markdown report from categorized Bin 2 and Bin 3 CSVs.'

    def add_arguments(self, parser):
        parser.add_argument('--bin2', default='', help='Categorized Bin 2 CSV')
        parser.add_argument('--bin3', default='', help='Categorized Bin 3 CSV')
        parser.add_argument(
            '--output',
            default='',
            help='Output markdown path (default: reports/category_report_<ts>.md)',
        )

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        rep_dir = category_research_reports(base)
        rep_dir.mkdir(parents=True, exist_ok=True)

        lines: list[str] = ['# Category intelligence report', '']

        for label, path_opt, kind in (
            ('Bin 2 (2026 POS, validated rows)', options['bin2'], 'bin2'),
            ('Bin 3 (current ecothrift, validated rows)', options['bin3'], 'bin3'),
        ):
            if not path_opt or not str(path_opt).strip():
                lines.append(f'## {label}')
                lines.append('_No file provided._\n')
                continue
            p = Path(path_opt)
            if not p.is_file():
                raise CommandError(f'File not found: {p}')
            lines.append(f'## {label}')
            lines.extend(self._section(p, kind))
            lines.append('')

        out = options['output']
        if out:
            out_path = Path(out)
        else:
            from datetime import datetime, timezone

            ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
            out_path = rep_dir / f'category_report_{ts}.md'

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text('\n'.join(lines), encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f'Wrote {out_path}'))

    def _section(self, path: Path, kind: str) -> list[str]:
        with path.open(newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        ok = [r for r in rows if r.get('validation_status') == 'ok']
        bad = len(rows) - len(ok)

        by_cat: dict[str, list[dict]] = defaultdict(list)
        for r in ok:
            key = f"{r.get('assigned_category_index', '')}|{r.get('assigned_category_name', '')}"
            by_cat[key].append(r)

        out = [
            f'- Source: `{path}`',
            f'- Rows: {len(rows)}; validated `ok`: {len(ok)}; other: {bad}',
            '',
        ]

        if kind == 'bin2':
            out.append('| Category # | Category name | Lines | Qty | Revenue | Avg unit price |')
            out.append('|------------|---------------|------:|----:|--------:|---------------:|')
            for key in sorted(by_cat.keys(), key=_cat_sort_key):
                rs = by_cat[key]
                idx, name = key.split('|', 1)
                qty = sum(int(float(r.get('quantity') or 0)) for r in rs)
                rev = sum(_dec(r.get('line_total')) or Decimal(0) for r in rs)
                avg_up = (
                    (sum(_dec(r.get('unit_price')) or Decimal(0) for r in rs) / len(rs))
                    if rs
                    else Decimal(0)
                )
                out.append(
                    f'| {idx} | {name} | {len(rs)} | {qty} | {rev:.2f} | {avg_up:.2f} |'
                )
        else:
            out.append('| Category # | Category name | Items | Avg price | Avg retail |')
            out.append('|------------|---------------|------:|----------:|-----------:|')
            for key in sorted(by_cat.keys(), key=_cat_sort_key):
                rs = by_cat[key]
                idx, name = key.split('|', 1)
                prices = [p for p in (_dec(r.get('price')) for r in rs) if p is not None]
                retails = [t for t in (_dec(r.get('item_retail_amt')) for r in rs) if t is not None]
                ap = sum(prices) / len(prices) if prices else Decimal(0)
                ar = sum(retails) / len(retails) if retails else Decimal(0)
                out.append(
                    f'| {idx} | {name} | {len(rs)} | {ap:.2f} | {ar:.2f} |'
                )

        return out
