"""Import historical sold items from DB1 and DB2 into DB3's Item table.

These items become training data for the price estimation ML model
(train_price_model.py queries Item.objects.filter(status='sold')).

Usage:
    python manage.py import_historical_sold
    python manage.py import_historical_sold --dry-run
    python manage.py import_historical_sold --source db2
    python manage.py import_historical_sold --source db1
    python manage.py import_historical_sold --limit 1000     # for testing

Expected row counts (rough):
    DB2: ~34,762 sold items
    DB1: ~50K+ sold items (via cart_line join)

Idempotent: skips items whose notes already contain HISTORICAL:db2 or HISTORICAL:db1.
"""

import psycopg2
import psycopg2.extras
from django.core.management.base import BaseCommand
from django.utils import timezone as tz

from apps.inventory.models import Item

DB2_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'dbname': 'db2',
    'user': 'postgres',
    'password': 'password',
}

DB1_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'dbname': 'old_production_db',
    'user': 'postgres',
    'password': 'password',
}

DB2_SOLD_QUERY = """
SELECT
    i.sku                                           AS legacy_sku,
    p.title,
    COALESCE(p.brand, '')                           AS brand,
    i.starting_price                                AS price,
    i.retail_amt,
    COALESCE(i.sold_for, i.starting_price)          AS sold_for,
    i.sold_at,
    COALESCE(i.pricing_type, 'discounting')         AS pricing_type,
    COALESCE(
        (SELECT ih.condition
         FROM inventory_item_history ih
         WHERE ih.item_id = i.id
         ORDER BY ih.updated_on DESC
         LIMIT 1),
        'unknown'
    ) AS condition
FROM inventory_item i
JOIN inventory_product p ON p.id = i.product_id
WHERE i.sold_at IS NOT NULL
  AND i.sold_for IS NOT NULL
ORDER BY i.sold_at DESC
{limit_clause}
"""

DB1_DIRECT_QUERY = """
SELECT
    i.code                                      AS legacy_sku,
    COALESCE(cl.line_description, '')           AS title,
    ''                                           AS brand,
    COALESCE(i.starting_price_amt, 0)           AS price,
    i.retail_amt,
    COALESCE(cl.unit_price_amt, i.starting_price_amt, 0)  AS sold_for,
    c.close_time                                AS sold_at,
    CASE WHEN i.is_static THEN 'static' ELSE 'discounting' END  AS pricing_type,
    'unknown'                                    AS condition
FROM item i
JOIN cart_line cl ON cl.item_cde = i.code
JOIN cart c ON c.code = cl.cart_cde
WHERE c.close_time IS NOT NULL
  AND c.void = false
ORDER BY c.close_time DESC
{limit_clause}
"""

BATCH_SIZE = 500


def _fetch_db2_sold(limit=None):
    clause = f'LIMIT {limit}' if limit else ''
    conn = psycopg2.connect(**DB2_CONFIG)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(DB2_SOLD_QUERY.format(limit_clause=clause))
            return cur.fetchall()
    finally:
        conn.close()


def _fetch_db1_sold(limit=None):
    """Query old_production_db directly for sold items via cart + cart_line join."""
    clause = f'LIMIT {limit}' if limit else ''
    conn = psycopg2.connect(**DB1_CONFIG)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(DB1_DIRECT_QUERY.format(limit_clause=clause))
            return cur.fetchall(), 'db1_direct'
    finally:
        conn.close()


def _get_existing_notes_prefixes(source_db):
    prefix = f'HISTORICAL:{source_db}:'
    return set(
        Item.objects.filter(notes__startswith=prefix)
        .values_list('notes', flat=True)
        .distinct()
    )


class Command(BaseCommand):
    help = 'Import historical sold items from DB1/DB2 into DB3 for ML price model training.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show counts without writing anything.',
        )
        parser.add_argument(
            '--source',
            choices=['db1', 'db2', 'both'],
            default='both',
            help='Which source database to import from (default: both).',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit rows per source for testing.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        source = options['source']
        limit = options['limit']

        self.stdout.write(self.style.HTTP_INFO(
            f'\n=== Historical Sold Items Import ===\n'
            f'Source:  {source}\n'
            f'Dry run: {dry_run}\n'
            f'Limit:   {limit or "none"}\n'
        ))

        if source in ('db2', 'both'):
            self._import_db2_sold(dry_run, limit)

        if source in ('db1', 'both'):
            self._import_db1_sold(dry_run, limit)

        total = Item.objects.filter(notes__contains='HISTORICAL:').count()
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Total historical sold items in DB3: {total:,}\n'
        ))

    @staticmethod
    def _next_sku_counter():
        """Return a starting counter for sequential SKU generation."""
        last = Item.objects.order_by('-id').first()
        if last:
            try:
                return int(last.sku.replace('ITM', '')) + 1
            except (ValueError, AttributeError):
                return Item.objects.count() + 1
        return 1

    def _import_db2_sold(self, dry_run, limit):
        self.stdout.write('\n--- Fetching DB2 sold items ---')
        try:
            rows = _fetch_db2_sold(limit)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'DB2 connection failed: {e}'))
            return

        self.stdout.write(f'Fetched {len(rows):,} rows from DB2.')
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — skipping write.'))
            return

        existing_notes = _get_existing_notes_prefixes('db2')
        existing_skus = {n.split('HISTORICAL:db2:')[1].split(' ')[0] for n in existing_notes if 'HISTORICAL:db2:' in n}

        sku_counter = self._next_sku_counter()
        new_items = []
        skipped = 0
        for row in rows:
            legacy_sku = str(row['legacy_sku'])
            if legacy_sku in existing_skus:
                skipped += 1
                continue
            new_items.append(Item(
                sku=f'ITM{sku_counter:07d}',
                title=row['title'] or '',
                brand=row['brand'] or '',
                price=row['price'] or 0,
                cost=None,
                source='purchased',
                status='sold',
                condition=row['condition'] or 'unknown',
                sold_for=row['sold_for'],
                sold_at=row['sold_at'],
                notes=f'HISTORICAL:db2:{legacy_sku}',
                listed_at=row['sold_at'],
            ))
            sku_counter += 1

        if new_items:
            Item.objects.bulk_create(new_items, batch_size=BATCH_SIZE)
            self.stdout.write(self.style.SUCCESS(f'Created {len(new_items):,} DB2 sold items.'))
        if skipped:
            self.stdout.write(f'Skipped {skipped:,} already-imported DB2 items.')

    def _import_db1_sold(self, dry_run, limit):
        self.stdout.write('\n--- Fetching DB1 sold items ---')
        try:
            rows, method = _fetch_db1_sold(limit)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'DB1 connection failed: {e}'))
            return

        self.stdout.write(f'Fetched {len(rows):,} rows from DB1 (via {method}).')
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — skipping write.'))
            return

        existing_notes = _get_existing_notes_prefixes('db1')
        existing_skus = {n.split('HISTORICAL:db1:')[1].split(' ')[0] for n in existing_notes if 'HISTORICAL:db1:' in n}

        sku_counter = self._next_sku_counter()
        new_items = []
        skipped = 0
        for row in rows:
            legacy_sku = str(row['legacy_sku'])
            if legacy_sku in existing_skus:
                skipped += 1
                continue
            new_items.append(Item(
                sku=f'ITM{sku_counter:07d}',
                title=row['title'] or '',
                brand=row['brand'] or '',
                price=row['price'] or 0,
                cost=None,
                source='purchased',
                status='sold',
                condition='unknown',
                sold_for=row['sold_for'],
                sold_at=row['sold_at'],
                notes=f'HISTORICAL:db1:{legacy_sku}',
                listed_at=row['sold_at'],
            ))
            sku_counter += 1

        if new_items:
            Item.objects.bulk_create(new_items, batch_size=BATCH_SIZE)
            self.stdout.write(self.style.SUCCESS(f'Created {len(new_items):,} DB1 sold items.'))
        if skipped:
            self.stdout.write(f'Skipped {skipped:,} already-imported DB1 items.')
