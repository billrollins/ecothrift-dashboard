"""Reset a named delivery test dataset (dry-run by default)."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.pos.services.delivery_test_dataset import DeliveryDatasetError, reset_dataset


class Command(BaseCommand):
    help = (
        'Reset a named delivery test dataset. Dry-run by default. '
        'Production execute requires --allow-production --confirm-dataset KEY --execute.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--key', required=True, help='Dataset key')
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
        try:
            result = reset_dataset(
                key=options['key'],
                execute=options['execute'],
                allow_production=options['allow_production'],
                confirm_dataset=options['confirm_dataset'],
            )
        except DeliveryDatasetError as exc:
            raise CommandError(str(exc)) from exc
        if options['execute']:
            self.stdout.write(self.style.SUCCESS(f"Reset dataset {options['key']}"))
        else:
            self.stdout.write(self.style.WARNING(f"Dry-run for dataset {options['key']}"))
        self.stdout.write(json.dumps(result, indent=2, default=str))
