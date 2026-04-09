"""Import historical transaction records from DB1 and DB2 into HistoricalTransaction.

Used for revenue reporting across all three database generations.

Usage:
    python manage.py import_historical_transactions
    python manage.py import_historical_transactions --dry-run
    python manage.py import_historical_transactions --source db2
    python manage.py import_historical_transactions --source db1

Expected:
    DB2: ~16,275 completed carts
    DB1: ~53,304 carts

Idempotent: skips rows where (source_db, legacy_cart_id) already exists.
"""

import psycopg2
import psycopg2.extras
from django.core.management.base import BaseCommand

from apps.pos.models import HistoricalTransaction

DB2_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'dbname': 'ecothrift_v2',
    'user': 'postgres',
    'password': 'password',
}

DB1_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'dbname': 'ecothrift_v1',
    'user': 'postgres',
    'password': 'password',
}

DB2_CART_QUERY = """
SELECT
    id::text                            AS legacy_cart_id,
    DATE(completed_at AT TIME ZONE 'UTC')  AS sale_date,
    subtotal,
    tax_amount,
    total,
    (SELECT COUNT(*) FROM pos_cart_line cl WHERE cl.cart_id = c.id)  AS item_count,
    'cash'                              AS payment_method
FROM pos_cart c
WHERE status = 'completed'
  AND completed_at IS NOT NULL
ORDER BY completed_at
{limit_clause}
"""

DB1_CART_QUERY = """
SELECT
    c.code                              AS legacy_cart_id,
    DATE(c.close_time AT TIME ZONE 'UTC')  AS sale_date,
    c.subtotal_amt                      AS subtotal,
    c.tax_amt                           AS tax_amount,
    c.total_amt                         AS total,
    (SELECT COUNT(*) FROM cart_line cl WHERE cl.cart_cde = c.code)  AS item_count,
    'cash'                              AS payment_method
FROM cart c
WHERE c.void = false
  AND c.close_time IS NOT NULL
ORDER BY c.close_time
{limit_clause}
"""

BATCH_SIZE = 500


class Command(BaseCommand):
    help = 'Import historical transactions from DB1/DB2 into HistoricalTransaction for reporting.'

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
            f'\n=== Historical Transactions Import ===\n'
            f'Source:  {source}\n'
            f'Dry run: {dry_run}\n'
            f'Limit:   {limit or "none"}\n'
        ))

        if source in ('db2', 'both'):
            self._import_source(dry_run, limit, 'db2', DB2_CONFIG, DB2_CART_QUERY)

        if source in ('db1', 'both'):
            self._import_source(dry_run, limit, 'db1', DB1_CONFIG, DB1_CART_QUERY)

        total = HistoricalTransaction.objects.count()
        db2_count = HistoricalTransaction.objects.filter(source_db='db2').count()
        db1_count = HistoricalTransaction.objects.filter(source_db='db1').count()
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. HistoricalTransaction totals: {total:,} total '
            f'({db1_count:,} DB1, {db2_count:,} DB2)\n'
        ))

    def _import_source(self, dry_run, limit, source_db, db_config, query):
        self.stdout.write(f'\n--- Fetching {source_db.upper()} cart records ---')
        clause = f'LIMIT {limit}' if limit else ''

        try:
            conn = psycopg2.connect(**db_config)
        except psycopg2.OperationalError as e:
            self.stderr.write(self.style.ERROR(f'{source_db.upper()} connection failed: {e}'))
            return

        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(query.format(limit_clause=clause))
                rows = cur.fetchall()
        finally:
            conn.close()

        self.stdout.write(f'Fetched {len(rows):,} rows from {source_db.upper()}.')

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN — skipping {source_db.upper()} write.'))
            return

        existing_ids = set(
            HistoricalTransaction.objects.filter(source_db=source_db)
            .values_list('legacy_cart_id', flat=True)
        )

        to_create = []
        skipped = 0
        for row in rows:
            cart_id = str(row['legacy_cart_id'])
            if cart_id in existing_ids:
                skipped += 1
                continue
            if not row['sale_date']:
                skipped += 1
                continue
            to_create.append(HistoricalTransaction(
                source_db=source_db,
                legacy_cart_id=cart_id,
                sale_date=row['sale_date'],
                subtotal=row['subtotal'] or 0,
                tax_amount=row['tax_amount'] or 0,
                total=row['total'] or 0,
                item_count=int(row['item_count'] or 0),
                payment_method=row['payment_method'] or 'cash',
            ))

        if to_create:
            HistoricalTransaction.objects.bulk_create(to_create, batch_size=BATCH_SIZE)
            self.stdout.write(self.style.SUCCESS(
                f'Created {len(to_create):,} {source_db.upper()} transaction records.'
            ))
        if skipped:
            self.stdout.write(f'Skipped {skipped:,} {source_db.upper()} rows (already imported or missing date).')
