"""Apply tier 1 + tier 3 categorization to manifest rows; optional tier 2 (AI) with --limit."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand

from apps.buying.models import ManifestRow
from apps.buying.services.categorize_manifest import run_categorize_manifest_command

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Set ManifestRow canonical_category from CategoryMapping (tier 1) and auction '
        'listing strings (tier 3). Use --ai for Claude tier 2; --limit caps AI calls per run.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--auction-id',
            type=int,
            default=None,
            help='Limit to rows for this auction primary key.',
        )
        parser.add_argument(
            '--marketplace',
            type=str,
            default=None,
            help='Limit to auctions in this marketplace slug.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Max manifest rows to process (after filters).',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Rows per bulk_update batch.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Do not write ManifestRow or CategoryMapping changes.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Recompute canonical_category even if already set.',
        )
        parser.add_argument(
            '--ai',
            dest='use_ai',
            action='store_true',
            help='Run tier 2: Claude for unknown manifest category strings (needs ANTHROPIC_API_KEY).',
        )
        parser.add_argument(
            '--ai-limit',
            type=int,
            default=10,
            help='Max Claude calls per run when --ai is set (default: 10).',
        )

    def handle(self, *args, **options) -> None:
        auction_id = options['auction_id']
        marketplace = options['marketplace']
        row_limit = options['limit']
        batch_size = max(1, int(options['batch_size']))
        dry_run = options['dry_run']
        force = options['force']
        use_ai = options['use_ai']
        ai_limit = max(0, int(options['ai_limit']))

        qs = ManifestRow.objects.all().order_by('pk')
        if auction_id is not None:
            qs = qs.filter(auction_id=auction_id)
        if marketplace:
            qs = qs.filter(auction__marketplace__slug=marketplace)
        if row_limit is not None:
            qs = qs[: int(row_limit)]

        stats = run_categorize_manifest_command(
            qs,
            use_ai=use_ai,
            ai_limit=ai_limit,
            force=force,
            dry_run=dry_run,
            batch_size=batch_size,
            log=logger,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Rows {'that would be ' if dry_run else ''}updated: {stats['rows_updated']}. "
                f"AI calls: {stats['ai_calls']}. "
                f"Limit hit: {stats['ai_limit_hit']}. "
                f"Remaining unknown patterns (after cap): {stats['remaining_unknown_patterns']}."
            )
        )
