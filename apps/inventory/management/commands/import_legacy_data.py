"""
Import legacy data from the old Eco-Thrift database into the current schema.

USAGE
-----
Dry run (no writes, shows what would be imported):
    python manage.py import_legacy_data --dry-run

Full import:
    python manage.py import_legacy_data

Import specific tables only:
    python manage.py import_legacy_data --tables items sales

PREREQUISITES
-------------
1.  Run the schema discovery queries in docs/old-db-schema.md against ecothrift_v2.
2.  Paste the results into docs/old-db-schema.md.
3.  Update the COLUMN MAPPING sections below to match the actual old schema.
4.  Run with --dry-run first and review the output before committing.

STATUS
------
This command is a SKELETON waiting for the old DB schema.
Sections marked "TODO: FILL IN AFTER SCHEMA REVIEW" must be updated before running.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

logger = logging.getLogger(__name__)


# ── Connection name ────────────────────────────────────────────────────────────
# The legacy database must be configured in settings.py under DATABASES.
# Add this to your settings.py (or settings_local.py) before running:
#
#   DATABASES['legacy'] = {
#       'ENGINE': 'django.db.backends.postgresql',
#       'NAME': 'ecothrift_v2',        # same DB, different schema, OR old DB name
#       'USER': '...',
#       'PASSWORD': '...',
#       'HOST': 'localhost',
#       'PORT': '5432',
#       'OPTIONS': {'options': '-c search_path=legacy_schema'},  # if different schema
#   }
#
# If the legacy data is in the SAME database under the 'public' schema (most likely),
# set LEGACY_DB = 'default' and prefix table names with their schema below.
LEGACY_DB = 'legacy'


# ── TODO: FILL IN AFTER SCHEMA REVIEW ─────────────────────────────────────────
# Replace these placeholder table/column names with the actual names from
# docs/old-db-schema.md after you paste the schema query results.

# Old items table (the physical inventory items with SKUs, prices, etc.)
LEGACY_ITEMS_TABLE = 'TODO_items_table_name'
LEGACY_ITEMS_COLUMNS = {
    'id': 'id',                          # old primary key
    'sku': 'sku',                        # old SKU / barcode identifier
    'title': 'title',                    # item name/description
    'brand': 'brand',                    # brand
    'category': 'category',             # free-text category
    'price': 'price',                    # selling price
    'cost': 'cost',                      # cost / what you paid
    'condition': 'condition',            # item condition
    'status': 'status',                  # on_shelf / sold / etc.
    'source': 'source',                  # purchased / consignment / house
    'location': 'location',             # shelf location
    'notes': 'notes',                    # internal notes
    'sold_for': 'sold_for',             # actual sale price (if sold)
    'listed_at': 'listed_at',           # when put on shelf
    'sold_at': 'sold_at',               # when sold
    'created_at': 'created_at',         # record creation
}

# Old sales / transactions table (POS records)
LEGACY_SALES_TABLE = 'TODO_sales_table_name'
LEGACY_SALES_COLUMNS = {
    'id': 'id',
    'item_id': 'item_id',               # FK to items
    'sale_price': 'sale_price',         # price at time of sale
    'sold_at': 'sold_at',               # timestamp
    'cashier': 'cashier',               # who sold it
    'payment_method': 'payment_method',
}

# Old products / catalog table (if separate from items)
LEGACY_PRODUCTS_TABLE = 'TODO_products_table_name'  # set to None if no products table
LEGACY_PRODUCTS_COLUMNS = {
    'id': 'id',
    'title': 'title',
    'brand': 'brand',
    'model': 'model',
    'category': 'category',
    'upc': 'upc',
    'default_price': 'default_price',
}

# Status mapping: old status values -> new Item.STATUS_CHOICES
STATUS_MAP = {
    # TODO: update these once you see the actual status values in the old data
    # Example patterns — adjust to match:
    'active': 'on_shelf',
    'available': 'on_shelf',
    'on shelf': 'on_shelf',
    'on_shelf': 'on_shelf',
    'sold': 'sold',
    'processing': 'processing',
    'intake': 'intake',
    'returned': 'returned',
    'scrapped': 'scrapped',
    'broken': 'scrapped',
    'lost': 'lost',
    'missing': 'lost',
}

# Condition mapping: old condition values -> new Item.CONDITION_CHOICES
CONDITION_MAP = {
    # TODO: update these once you see the actual condition values in the old data
    'new': 'new',
    'like new': 'like_new',
    'like_new': 'like_new',
    'open box': 'like_new',
    'good': 'good',
    'used - good': 'good',
    'fair': 'fair',
    'used - fair': 'fair',
    'salvage': 'salvage',
    'parts only': 'salvage',
    'unknown': 'unknown',
    '': 'unknown',
}

# Source mapping: old source values -> new Item.SOURCE_CHOICES
SOURCE_MAP = {
    # TODO: update these once you see the actual source values in the old data
    'purchased': 'purchased',
    'liquidation': 'purchased',
    'bstock': 'purchased',
    'b-stock': 'purchased',
    'consignment': 'consignment',
    'consign': 'consignment',
    'house': 'house',
    'store': 'house',
}
# ── END TODO SECTION ──────────────────────────────────────────────────────────


def safe_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
        return d if d >= 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def safe_str(value: Any, max_len: int = 300) -> str:
    if value is None:
        return ''
    return str(value).strip()[:max_len]


def map_status(raw: str) -> str:
    return STATUS_MAP.get(str(raw).lower().strip(), 'intake')


def map_condition(raw: str) -> str:
    return CONDITION_MAP.get(str(raw or '').lower().strip(), 'unknown')


def map_source(raw: str) -> str:
    return SOURCE_MAP.get(str(raw or '').lower().strip(), 'purchased')


class Command(BaseCommand):
    help = 'Import legacy inventory and sales data into the new schema.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Show what would be imported without writing to the database.',
        )
        parser.add_argument(
            '--tables',
            nargs='+',
            choices=['items', 'products', 'sales'],
            default=['items', 'products', 'sales'],
            help='Which tables to import (default: all).',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit number of rows per table (useful for testing).',
        )
        parser.add_argument(
            '--skip-existing',
            action='store_true',
            default=True,
            help='Skip items whose legacy SKU already exists in the new DB (default: True).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        tables = options['tables']
        limit = options['limit']
        skip_existing = options['skip_existing']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be written.\n'))

        # Validate that the schema config has been filled in
        self._check_schema_configured()

        stats = {
            'items_imported': 0,
            'items_skipped': 0,
            'items_errors': 0,
            'products_imported': 0,
            'products_skipped': 0,
            'sales_linked': 0,
        }

        try:
            with connections[LEGACY_DB].cursor() as cursor:
                if 'products' in tables and LEGACY_PRODUCTS_TABLE:
                    self._import_products(cursor, dry_run, limit, stats)
                if 'items' in tables:
                    self._import_items(cursor, dry_run, limit, skip_existing, stats)
                if 'sales' in tables:
                    self._import_sales(cursor, dry_run, limit, stats)
        except Exception as exc:
            raise CommandError(f'Import failed: {exc}') from exc

        self._print_summary(stats, dry_run)

    def _check_schema_configured(self):
        """Abort early if the TODO placeholders have not been replaced."""
        unconfigured = [
            name for name in [
                LEGACY_ITEMS_TABLE,
                LEGACY_SALES_TABLE,
            ]
            if 'TODO' in str(name)
        ]
        if unconfigured:
            raise CommandError(
                'The import command has not been configured yet.\n'
                'Please:\n'
                '  1. Run the schema discovery SQL in docs/old-db-schema.md\n'
                '  2. Paste the results into that file\n'
                '  3. Update the COLUMN MAPPING sections at the top of this file\n'
                f'\nUnconfigured tables: {", ".join(unconfigured)}'
            )

    def _import_products(self, cursor, dry_run, limit, stats):
        from apps.inventory.models import Product

        self.stdout.write('Importing products...')
        cols = LEGACY_PRODUCTS_COLUMNS
        query = f'SELECT * FROM {LEGACY_PRODUCTS_TABLE} ORDER BY {cols["id"]}'
        if limit:
            query += f' LIMIT {limit}'
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        for row in rows:
            data = dict(zip(columns, row))
            title = safe_str(data.get(cols['title']), 300)
            if not title:
                continue
            if not dry_run:
                with transaction.atomic():
                    product, created = Product.objects.get_or_create(
                        title=title,
                        brand=safe_str(data.get(cols['brand']), 200),
                        defaults={
                            'model': safe_str(data.get(cols['model'], ''), 200),
                            'category': safe_str(data.get(cols['category'], ''), 200),
                            'upc': safe_str(data.get(cols['upc'], ''), 100),
                            'default_price': safe_decimal(data.get(cols['default_price'])),
                        },
                    )
                    if created:
                        stats['products_imported'] += 1
                    else:
                        stats['products_skipped'] += 1
            else:
                self.stdout.write(f'  [DRY] Would import product: {title}')
                stats['products_imported'] += 1

    def _import_items(self, cursor, dry_run, limit, skip_existing, stats):
        from django.utils import timezone
        from apps.inventory.models import Item, ItemHistory

        self.stdout.write('Importing items...')
        cols = LEGACY_ITEMS_COLUMNS
        query = f'SELECT * FROM {LEGACY_ITEMS_TABLE} ORDER BY {cols["id"]}'
        if limit:
            query += f' LIMIT {limit}'
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        items_to_create = []
        history_to_create = []

        for row in rows:
            data = dict(zip(columns, row))
            old_sku = safe_str(data.get(cols['sku']), 20)
            if not old_sku:
                stats['items_errors'] += 1
                logger.warning('Item with no SKU skipped: %s', data.get(cols['id']))
                continue

            # Check for existing item with the same legacy SKU
            if skip_existing and Item.objects.filter(sku=old_sku).exists():
                stats['items_skipped'] += 1
                continue

            price = safe_decimal(data.get(cols['price'])) or Decimal('0.00')
            cost = safe_decimal(data.get(cols['cost']))
            sold_for = safe_decimal(data.get(cols['sold_for']))

            new_item = Item(
                sku=old_sku,
                title=safe_str(data.get(cols['title']), 300) or 'Untitled Item',
                brand=safe_str(data.get(cols['brand']), 200),
                category=safe_str(data.get(cols['category']), 200),
                price=price,
                cost=cost,
                sold_for=sold_for,
                source=map_source(data.get(cols['source'], '')),
                status=map_status(data.get(cols['status'], '')),
                condition=map_condition(data.get(cols['condition'], '')),
                location=safe_str(data.get(cols['location'], ''), 100),
                notes=safe_str(data.get(cols['notes'], ''), 2000),
                listed_at=data.get(cols['listed_at']),
                sold_at=data.get(cols['sold_at']),
                created_at=data.get(cols['created_at']) or timezone.now(),
            )
            items_to_create.append(new_item)

            if dry_run:
                self.stdout.write(
                    f'  [DRY] Would import item: {old_sku} — {new_item.title[:60]} @ ${price}'
                )
                stats['items_imported'] += 1

        if not dry_run and items_to_create:
            batch_size = 500
            for i in range(0, len(items_to_create), batch_size):
                batch = items_to_create[i:i + batch_size]
                with transaction.atomic():
                    created = Item.objects.bulk_create(batch, ignore_conflicts=True)
                    stats['items_imported'] += len(created)
                    for item in created:
                        history_to_create.append(
                            ItemHistory(
                                item=item,
                                event_type='created',
                                new_value='legacy_import',
                                note='Imported from legacy database',
                            )
                        )
                self.stdout.write(f'  Imported items {i}–{i + len(batch)}...')

            if history_to_create:
                ItemHistory.objects.bulk_create(history_to_create, batch_size=1000)

    def _import_sales(self, cursor, dry_run, limit, stats):
        """
        Link sales data back to imported items.

        If the old DB has a separate transactions/sales table, this method
        updates Item.sold_for and Item.sold_at from those records.
        If Item.sold_for is already set from the items table, this is skipped
        to avoid double-updating.
        """
        from apps.inventory.models import Item

        if not LEGACY_SALES_TABLE or 'TODO' in str(LEGACY_SALES_TABLE):
            self.stdout.write('  Skipping sales table (not configured).')
            return

        self.stdout.write('Linking sales records...')
        cols = LEGACY_SALES_COLUMNS
        query = f'SELECT * FROM {LEGACY_SALES_TABLE} ORDER BY {cols["id"]}'
        if limit:
            query += f' LIMIT {limit}'
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        for row in rows:
            data = dict(zip(columns, row))
            # TODO: adjust the lookup logic here once you know the schema.
            # The goal is to find the matching Item and update sold_for/sold_at.
            sale_price = safe_decimal(data.get(cols['sale_price']))
            sold_at = data.get(cols['sold_at'])
            if not sale_price:
                continue
            if not dry_run:
                try:
                    pass  # TODO: implement lookup by item_id or sku
                except Exception as exc:
                    logger.warning('Could not link sale record: %s', exc)
            stats['sales_linked'] += 1

    def _print_summary(self, stats, dry_run):
        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write('\n' + '=' * 50)
        self.stdout.write(f'{prefix}Import Summary')
        self.stdout.write('=' * 50)
        self.stdout.write(f"  Products imported : {stats['products_imported']}")
        self.stdout.write(f"  Products skipped  : {stats['products_skipped']}")
        self.stdout.write(f"  Items imported    : {stats['items_imported']}")
        self.stdout.write(f"  Items skipped     : {stats['items_skipped']}")
        self.stdout.write(f"  Items errors      : {stats['items_errors']}")
        self.stdout.write(f"  Sales linked      : {stats['sales_linked']}")
        self.stdout.write('=' * 50)
        if dry_run:
            self.stdout.write(self.style.WARNING(
                '\nThis was a DRY RUN. Run without --dry-run to commit.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('\nImport complete.'))
