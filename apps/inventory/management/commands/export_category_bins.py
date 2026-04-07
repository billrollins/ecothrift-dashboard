"""

Export category-bin CSVs (Bins 1–3) using schema-qualified SQL — no SET search_path.



Uses Django's **default** database connection only. Bins 1–2 query **`public.*`** (V2-era

tables); Bin 3 queries **`ecothrift.*`**. Same Postgres database typically holds both

schemas — no second DATABASES entry.



Usage:

  python manage.py export_category_bins --bins bin3

  python manage.py export_category_bins --bins all

"""



from __future__ import annotations



import csv

from datetime import date, datetime, timezone

from decimal import Decimal

from pathlib import Path



from django.conf import settings

from django.core.management.base import BaseCommand, CommandError

from django.db import connections

from apps.inventory.category_research_paths import (
    category_research_exports,
    category_research_logs,
)





def _csv_cell(v):

    if v is None:

        return ''

    if isinstance(v, (datetime, date)):

        return v.isoformat()

    if isinstance(v, Decimal):

        return format(v, 'f')

    return v





BIN_CONFIG = {

    'bin1': {

        'sql_file': 'public_bin1_2025_processed.sql',

        'csv_prefix': 'bin1_2025_processed',

    },

    'bin2': {

        'sql_file': 'public_bin2_2026_sold_pos.sql',

        'csv_prefix': 'bin2_2026_sold_pos',

    },

    'bin3': {

        'sql_file': 'ecothrift_bin3_all_items_detail.sql',

        'csv_prefix': 'bin3_ecothrift_current',

    },

}





class Command(BaseCommand):

    help = 'Export category research CSVs for Bin 1–3 (see scripts/sql/*.sql).'



    def add_arguments(self, parser):

        parser.add_argument(

            '--bins',

            default='all',

            help='Comma-separated: bin1, bin2, bin3, or all (default).',

        )

        parser.add_argument(

            '--output-dir',

            default='',

            help='Override output directory (default: workspace/notebooks/category-research/exports).',

        )



    def handle(self, *args, **options):

        raw = options['bins'].strip().lower().replace(' ', '')

        if raw == 'all':

            wanted = ['bin1', 'bin2', 'bin3']

        else:

            wanted = [b.strip() for b in raw.split(',') if b.strip()]



        if not wanted:

            raise CommandError('No bins specified. Use --bins bin1,bin2,bin3 or all.')



        for key in wanted:

            if key not in BIN_CONFIG:

                raise CommandError(f'Unknown bin {key!r}. Use bin1, bin2, bin3, or all.')



        base = Path(settings.BASE_DIR)

        out_dir = Path(options['output_dir']) if options['output_dir'] else category_research_exports(base)

        out_dir.mkdir(parents=True, exist_ok=True)

        log_path = category_research_logs(base) / 'extraction_runs.log'

        log_path.parent.mkdir(parents=True, exist_ok=True)

        stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        date_slug = datetime.now(timezone.utc).strftime('%Y-%m-%d')



        alias = 'default'

        conn = connections[alias]

        lines_out = []

        for key in wanted:

            cfg = BIN_CONFIG[key]

            sql_path = base / 'scripts' / 'sql' / cfg['sql_file']

            if not sql_path.is_file():

                raise CommandError(f'Missing SQL file: {sql_path}')



            sql = sql_path.read_text(encoding='utf-8')

            with conn.cursor() as cursor:

                cursor.execute(sql)

                rows = cursor.fetchall()

                colnames = [c[0] for c in (cursor.description or [])]



            csv_name = f"{cfg['csv_prefix']}_{date_slug}.csv"

            csv_path = out_dir / csv_name

            with csv_path.open('w', newline='', encoding='utf-8') as f:

                w = csv.writer(f)

                w.writerow(colnames)

                for row in rows:

                    w.writerow([_csv_cell(v) for v in row])



            n = len(rows)

            self.stdout.write(self.style.SUCCESS(f'{key}: {n} rows -> {csv_path}'))

            lines_out.append(

                f'{stamp} {key} rows={n} db={alias} csv={csv_path.relative_to(base)}'

            )



        with log_path.open('a', encoding='utf-8') as log:

            for line in lines_out:

                log.write(line + '\n')



        self.stdout.write(self.style.NOTICE(f'Appended {len(lines_out)} line(s) to {log_path}'))


