"""Run compute_vendor_metrics, compute_po_cost_analysis, and compute_item_cost in order."""

from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)


class Command(BaseCommand):
    help = (
        'Run the cost pipeline: vendor metrics, PO cost analysis, then item cost allocation. '
        'Use --vendor-only or --po-only to stop early (PO analysis still needs vendor metrics).'
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Forward to each step; no database writes.',
        )
        parser.add_argument(
            '--vendor-only',
            action='store_true',
            help='Run compute_vendor_metrics only.',
        )
        parser.add_argument(
            '--po-only',
            action='store_true',
            help='Run vendor metrics and PO analysis only (skip item cost).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        vendor_only = options['vendor_only']
        po_only = options['po_only']
        db = resolve_database_alias(options['database'])
        no_input = options['no_input']
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=no_input,
            dry_run=dry_run,
        )
        # One confirmation for the pipeline; child steps skip their prompts.
        child_opts = {'dry_run': dry_run, 'database': db, 'no_input': True}

        self.stdout.write('Step 1: compute_vendor_metrics')
        call_command('compute_vendor_metrics', **child_opts)
        if vendor_only:
            self.stdout.write(self.style.SUCCESS('Stopped after vendor metrics (--vendor-only).'))
            return

        self.stdout.write('Step 2: compute_po_cost_analysis')
        call_command('compute_po_cost_analysis', **child_opts)
        if po_only:
            self.stdout.write(self.style.SUCCESS('Stopped after PO analysis (--po-only).'))
            return

        self.stdout.write('Step 3: compute_item_cost')
        call_command('compute_item_cost', **child_opts)
        self.stdout.write(self.style.SUCCESS('Cost pipeline complete.'))
