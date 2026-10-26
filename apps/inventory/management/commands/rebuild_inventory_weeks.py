"""Nightly ``InventoryWeek`` rollup (inventory review). Heroku Scheduler: daily, after ``compute_daily_category_stats``.

    python manage.py rebuild_inventory_weeks            # the last 8 weeks (all 2 years on the first run)
    python manage.py rebuild_inventory_weeks --full     # every week of the 2-year backfill
    python manage.py rebuild_inventory_weeks --weeks 12
"""
from __future__ import annotations

import time

from django.core.management.base import BaseCommand

from apps.inventory.services import inventory_week


class Command(BaseCommand):
    help = 'Rebuild the weekly inventory rollup (InventoryWeek) from items.'

    def add_arguments(self, parser):
        parser.add_argument('--full', action='store_true', help='Rebuild every week of the 2-year backfill.')
        parser.add_argument('--weeks', type=int, default=inventory_week.RECENT_WEEKS)

    def handle(self, *args, full, weeks, **options):
        began = time.monotonic()
        n_weeks, n_rows = inventory_week.nightly(full=full, weeks=max(1, weeks))
        self.stdout.write(self.style.SUCCESS(
            f'InventoryWeek: {n_weeks} weeks, {n_rows:,} rows in {time.monotonic() - began:.1f}s'))
