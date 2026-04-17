"""Backfill: convert ``ManifestRow.retail_value`` from extended (line total) to per-unit MSRP.

Use after running ``diagnose_manifest_retail`` and confirming an auction is storing
extended retail (rather than per-unit). For each row in the target auction with
``quantity >= 2``, divides ``retail_value`` by ``quantity`` (rounded to cents).
Rows with ``quantity in (NULL, 0, 1)`` are left alone.

Always run with ``--dry-run`` first. After a real run, also re-run
``recompute_auction_full`` (or ``compute_daily_category_stats``) to refresh
auction valuation + category mix.

Usage::

    python manage.py normalize_stored_manifest_retail --auction 2619 --dry-run
    python manage.py normalize_stored_manifest_retail --auction 2619
    python manage.py normalize_stored_manifest_retail --auction 2619 --database production
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.buying.models import Auction, ManifestRow
from apps.buying.services.valuation import (
    load_category_stats_dict,
    recompute_auction_full,
)


class Command(BaseCommand):
    help = (
        'Convert ManifestRow.retail_value from extended (line total) to per-unit '
        'for one auction. Use after diagnose_manifest_retail confirms the issue.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--auction',
            type=int,
            required=True,
            help='Auction id to normalize.',
        )
        parser.add_argument(
            '--database',
            default='default',
            help='Django DB alias (default: default).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print changes only; do not write.',
        )
        parser.add_argument(
            '--skip-recompute',
            action='store_true',
            help='Skip recompute_auction_full after writes.',
        )

    def handle(self, *args, **options):
        db = options['database']
        if db not in settings.DATABASES:
            raise CommandError(
                f'Unknown database alias {db!r}. Configure it in settings or use "default".'
            )

        auction_id = options['auction']
        dry = bool(options.get('dry_run'))
        skip_re = bool(options.get('skip_recompute'))

        try:
            auction = Auction.objects.using(db).get(id=auction_id)
        except Auction.DoesNotExist:
            raise CommandError(f'Auction {auction_id} not found in {db!r}.')

        rows = (
            ManifestRow.objects.using(db)
            .filter(auction_id=auction_id)
            .only('id', 'quantity', 'retail_value')
        )

        candidates: list[tuple[int, int, Decimal, Decimal]] = []
        skipped_no_qty = 0
        skipped_qty_one = 0
        skipped_no_retail = 0
        for r in rows:
            if r.retail_value is None:
                skipped_no_retail += 1
                continue
            if r.quantity is None or r.quantity == 0:
                skipped_no_qty += 1
                continue
            if r.quantity == 1:
                skipped_qty_one += 1
                continue
            new_val = (r.retail_value / Decimal(r.quantity)).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            candidates.append((r.id, r.quantity, r.retail_value, new_val))

        self.stdout.write(
            self.style.NOTICE(
                f'auction={auction_id} db={db} rows_total={rows.count()} '
                f'to_normalize={len(candidates)} skip(no_qty)={skipped_no_qty} '
                f'skip(qty=1)={skipped_qty_one} skip(no_retail)={skipped_no_retail}'
            )
        )

        if not candidates:
            self.stdout.write(self.style.WARNING('No rows to normalize. Done.'))
            return

        sample = candidates[:10]
        self.stdout.write('Sample (first 10):')
        self.stdout.write(
            f"{'row_id':>10}  {'qty':>5}  {'old_retail':>12}  {'new_retail':>12}"
        )
        for rid, qty, old, new in sample:
            self.stdout.write(f'{rid:>10}  {qty:>5}  {old:>12,.2f}  {new:>12,.2f}')

        if dry:
            self.stdout.write(self.style.NOTICE('--dry-run: no writes performed.'))
            return

        with transaction.atomic(using=db):
            for rid, _qty, _old, new in candidates:
                ManifestRow.objects.using(db).filter(id=rid).update(retail_value=new)

        self.stdout.write(
            self.style.SUCCESS(f'Updated {len(candidates)} rows on auction {auction_id}.')
        )

        if skip_re:
            self.stdout.write('Skipped recompute (--skip-recompute).')
            return

        stats = load_category_stats_dict(using=db)
        recompute_auction_full(auction, stats=stats)
        self.stdout.write(self.style.SUCCESS(f'Recomputed valuation for auction {auction_id}.'))
