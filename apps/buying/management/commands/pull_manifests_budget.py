"""Pull anonymous manifests until a wall-clock budget expires (does not start a new auction past cutoff)."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.buying.services import pipeline

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Pull manifests from the nightly queue until `now + seconds` is reached. '
        'Does not interrupt an in-flight manifest fetch; only skips starting new '
        'auctions after the cutoff. Use for local testing with a time limit.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--seconds',
            type=float,
            required=True,
            help='Wall-clock budget in seconds from command start (required).',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=50,
            help='Max auctions considered per inner iteration (default 50).',
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=1.0,
            help='Seconds to sleep after each successful manifest (default 1).',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-pull even if rows exist (replaces rows).',
        )
        parser.add_argument(
            '--no-prefetch',
            action='store_true',
            help='Deprecated no-op: the two-worker API pipeline already overlaps fetch and processing.',
        )

    def handle(self, *args, **options):
        sec = float(options['seconds'])
        if sec <= 0:
            raise CommandError('--seconds must be positive')
        batch_size = int(options['batch_size'])
        delay = float(options['delay'])
        force = bool(options['force'])

        self.stdout.write(
            f'Budget: {sec}s; batch_size={batch_size} delay={delay}'
        )
        summary = pipeline.run_budget_manifest_pull(
            seconds=sec,
            batch_size=batch_size,
            inter_auction_delay=delay,
            force=force,
        )
        self.stdout.write(str(summary))
        self.stdout.write(
            self.style.SUCCESS(
                'pull_manifests_budget done: '
                f'iterations={summary["iterations"]} '
                f'auctions_processed={summary["auctions_processed"]} '
                f'manifest_rows_saved={summary["manifest_rows_saved"]}'
            )
        )
        logger.info(
            'pull_manifests_budget iterations=%s processed=%s rows=%s',
            summary['iterations'],
            summary['auctions_processed'],
            summary['manifest_rows_saved'],
        )
