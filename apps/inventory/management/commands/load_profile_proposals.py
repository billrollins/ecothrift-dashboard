"""
Load a profile backfill file (JSONL or JSONL.gz, one line per normalized-title group) as ProductProposal rows.

    python manage.py load_profile_proposals workspace/backfill/pilot_out.jsonl \
        --second workspace/backfill/pilot_out.second.jsonl --batch spark-mixed-2026-09-23 [--dry-run]

The logic lives in ``apps/inventory/services/proposal_load.py``, which is shared with the Requests
kind ``inventory.load_profile_proposals`` (the way production loads happen: staged, then
approved by the owner). Idempotent per (product, field, batch). It writes proposals only.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.inventory.services.proposal_load import load, summarize


class Command(BaseCommand):
    help = 'Load a profile backfill JSONL as ProductProposal rows (auto or pending).'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--second', default='', help='Second-opinion JSONL keyed by group.')
        parser.add_argument('--batch', required=True, help='Name for this load, e.g. spark-mixed-2026-09-23.')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, path, second, batch, dry_run, **options):
        info = summarize(path, second)
        if not info['groups']:
            raise CommandError(f'No rows in {path}')
        self.stdout.write(f"groups: {info['auto']} auto, {info['pending']} pending; products named: {info['products']}")
        if dry_run:
            self.stdout.write('Dry run: nothing written.')
            return
        counts = load(path, batch=batch, second=second)
        self.stdout.write(self.style.SUCCESS(
            f"Added {counts['added']} proposals in batch {batch}; "
            f"product ids no longer in the catalog: {counts['missing_products']}."
        ))
