"""Reset a named delivery test dataset (dry-run by default)."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.pos.services.delivery_test_dataset import (
    DeliveryDatasetError,
    reset_all_local_datasets,
    reset_dataset,
)


class Command(BaseCommand):
    help = (
        'Reset a named delivery test dataset. Dry-run by default. '
        'Use --all-local --execute to wipe every local test dataset (DEBUG only). '
        'Production execute requires --allow-production --confirm-dataset KEY --execute.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--key',
            default='',
            help='Dataset key (required unless --all-local)',
        )
        parser.add_argument(
            '--all-local',
            action='store_true',
            help='Reset every active/resettable local dataset (DEBUG only)',
        )
        parser.add_argument(
            '--execute',
            action='store_true',
            help='Actually delete owned rows/storage (default is dry-run)',
        )
        parser.add_argument(
            '--allow-production',
            action='store_true',
            help='Required with --execute when DEBUG=False',
        )
        parser.add_argument(
            '--confirm-dataset',
            default='',
            help='Must equal --key when executing in production',
        )

    def handle(self, *args, **options):
        if options['all_local']:
            try:
                result = reset_all_local_datasets(execute=options['execute'])
            except DeliveryDatasetError as exc:
                raise CommandError(str(exc)) from exc
            if options['execute']:
                self.stdout.write(self.style.SUCCESS('Reset all local delivery test datasets'))
            else:
                self.stdout.write(self.style.WARNING('Dry-run for all local delivery test datasets'))
            self.stdout.write(json.dumps(result, indent=2, default=str))
            return

        key = (options['key'] or '').strip()
        if not key:
            raise CommandError('--key is required unless --all-local is set')
        try:
            result = reset_dataset(
                key=key,
                execute=options['execute'],
                allow_production=options['allow_production'],
                confirm_dataset=options['confirm_dataset'],
            )
        except DeliveryDatasetError as exc:
            raise CommandError(str(exc)) from exc
        if options['execute']:
            self.stdout.write(self.style.SUCCESS(f'Reset dataset {key}'))
        else:
            self.stdout.write(self.style.WARNING(f'Dry-run for dataset {key}'))
        self.stdout.write(json.dumps(result, indent=2, default=str))
