"""Import active DB2 items into TempLegacyItem staging table for the Retag v2 workflow.

Usage:
    python manage.py import_db2_staging
    python manage.py import_db2_staging --dry-run
    python manage.py import_db2_staging --include-sold      # also import sold items (for DS/ML)
    python manage.py import_db2_staging --update-existing   # overwrite rows that already exist

Connects directly to the local 'db2' postgres restore via psycopg2.
See docs/Database Audits/.config for connection details.

Expected runtime: < 30s for ~20K rows.
"""

import psycopg2
import psycopg2.extras
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.inventory.models import TempLegacyItem

DB2_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'dbname': 'db2',
    'user': 'postgres',
    'password': 'password',
}

# In DB2, status is derived from date fields (no status column on inventory_item)
# ACTIVE: on_shelf_at set, sold_at NULL
# SOLD: sold_at not null
# PROCESSING: processing_completed_at NULL, on_shelf_at NULL, sold_at NULL

ACTIVE_QUERY = """
SELECT
    i.sku,
    p.title,
    COALESCE(p.brand, '')  AS brand,
    COALESCE(p.model, '')  AS model,
    i.starting_price,
    i.retail_amt,
    CASE
        WHEN i.sold_at IS NOT NULL      THEN 'sold'
        WHEN i.on_shelf_at IS NOT NULL  THEN 'on_shelf'
        ELSE 'processing'
    END AS derived_status,
    COALESCE(
        (SELECT ih.condition
         FROM inventory_item_history ih
         WHERE ih.item_id = i.id
         ORDER BY ih.updated_on DESC
         LIMIT 1),
        ''
    ) AS condition
FROM inventory_item i
JOIN inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NULL
ORDER BY i.id
"""

SOLD_QUERY = """
SELECT
    i.sku,
    p.title,
    COALESCE(p.brand, '')  AS brand,
    COALESCE(p.model, '')  AS model,
    i.starting_price,
    i.retail_amt,
    'sold'                 AS derived_status,
    COALESCE(
        (SELECT ih.condition
         FROM inventory_item_history ih
         WHERE ih.item_id = i.id
         ORDER BY ih.updated_on DESC
         LIMIT 1),
        ''
    ) AS condition
FROM inventory_item i
JOIN inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NOT NULL
ORDER BY i.id
"""


class Command(BaseCommand):
    help = 'Import active DB2 items into TempLegacyItem staging table for Retag v2.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be imported without writing to DB3.',
        )
        parser.add_argument(
            '--include-sold',
            action='store_true',
            help='Also import sold/scrapped/returned items (useful for DS/ML data prep).',
        )
        parser.add_argument(
            '--update-existing',
            action='store_true',
            help='Overwrite TempLegacyItem rows that already exist (default: skip).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        include_sold = options['include_sold']
        update_existing = options['update_existing']

        self.stdout.write(self.style.HTTP_INFO(
            f'\n=== DB2 to DB3 Staging Import ===\n'
            f'Dry run:         {dry_run}\n'
            f'Include sold:    {include_sold}\n'
            f'Update existing: {update_existing}\n'
        ))

        # Connect to DB2
        try:
            conn = psycopg2.connect(**DB2_CONFIG)
        except psycopg2.OperationalError as e:
            self.stderr.write(self.style.ERROR(
                f'Cannot connect to db2 at localhost:5432. '
                f'Run backup_prod.bat then restore_dev.bat first.\n{e}'
            ))
            return

        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(ACTIVE_QUERY)
                active_rows = cur.fetchall()
                sold_rows = []
                if include_sold:
                    cur.execute(SOLD_QUERY)
                    sold_rows = cur.fetchall()
        finally:
            conn.close()

        rows = active_rows + sold_rows
        self.stdout.write(
            f'Fetched {len(active_rows):,} active rows'
            + (f' + {len(sold_rows):,} sold rows' if include_sold else '')
            + f' = {len(rows):,} total from DB2.'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes written.\n'))
            for row in rows[:10]:
                self.stdout.write(
                    f'  [{row["derived_status"]}] {row["sku"]} — '
                    f'{row["title"][:60]} | ${row["starting_price"]}'
                )
            if len(rows) > 10:
                self.stdout.write(f'  ... and {len(rows) - 10} more')
            return

        # Get existing SKUs to decide skip vs update
        existing_skus = set(
            TempLegacyItem.objects.filter(source_db='db2')
            .values_list('legacy_sku', flat=True)
        )

        to_create = []
        to_update = []
        skipped = 0

        for row in rows:
            sku = row['sku']
            data = {
                'source_db': 'db2',
                'title': row['title'] or '',
                'brand': row['brand'] or '',
                'model': row['model'] or '',
                'price': row['starting_price'],
                'retail_amt': row['retail_amt'],
                'condition': row['condition'] or '',
                'legacy_status': row['derived_status'] or '',
            }
            if sku in existing_skus:
                if update_existing:
                    to_update.append((sku, data))
                else:
                    skipped += 1
            else:
                to_create.append(TempLegacyItem(legacy_sku=sku, **data))

        # Bulk create new rows
        if to_create:
            TempLegacyItem.objects.bulk_create(to_create, batch_size=500)
            self.stdout.write(self.style.SUCCESS(f'Created {len(to_create):,} new rows.'))

        # Update existing rows one-by-one (small expected count)
        if to_update:
            update_fields = ['title', 'brand', 'model', 'price', 'retail_amt', 'condition', 'legacy_status']
            objs = TempLegacyItem.objects.filter(
                legacy_sku__in=[sku for sku, _ in to_update]
            ).in_bulk(field_name='legacy_sku')
            updated_objs = []
            for sku, data in to_update:
                obj = objs.get(sku)
                if obj:
                    for field, val in data.items():
                        if field != 'source_db':
                            setattr(obj, field, val)
                    updated_objs.append(obj)
            if updated_objs:
                TempLegacyItem.objects.bulk_update(updated_objs, update_fields, batch_size=500)
            self.stdout.write(self.style.SUCCESS(f'Updated {len(updated_objs):,} existing rows.'))

        if skipped:
            self.stdout.write(f'Skipped {skipped:,} already-existing rows (use --update-existing to overwrite).')

        # Summary
        total = TempLegacyItem.objects.filter(source_db='db2').count()
        retagged = TempLegacyItem.objects.filter(source_db='db2', retagged=True).count()
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. DB2 rows in TempLegacyItem: {total:,} total, {retagged:,} already retagged.\n'
        ))
