"""Seed a named delivery test dataset for phone QA."""

from __future__ import annotations

import json
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from apps.pos.services.delivery_test_dataset import DeliveryDatasetError, seed_dataset


class Command(BaseCommand):
    help = (
        'Seed a named delivery QA dataset for local/DEBUG only (relative to today): '
        'Past 2 (good+bad), Today 4 (1/2/3/4 items), Future 3 (2 same day + 1 later). '
        'Rows look like real deliveries; ownership is tracked via DeliveryTestDataset for reset.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--key', required=True, help='Stable dataset key, e.g. phase1-smoke')
        parser.add_argument('--date', default=None, help='Target date YYYY-MM-DD (default today)')
        parser.add_argument('--date-offset', type=int, default=0, help='Days from today if --date omitted')
        parser.add_argument(
            '--test-phone',
            default='402-555-0142',
            help='Optional real test phone for SMS QA (default 402-555-0142)',
        )
        parser.add_argument(
            '--with-active-run',
            action='store_true',
            help='Also seed an open Today run with truthful contact/load state',
        )
        parser.add_argument(
            '--stage',
            default='calls',
            choices=['calls', 'load', 'truck', 'route', 'active', 'return'],
            help='Stage for --with-active-run (default calls)',
        )

    def handle(self, *args, **options):
        target = None
        if options['date']:
            try:
                target = datetime.strptime(options['date'], '%Y-%m-%d').date()
            except ValueError as exc:
                raise CommandError('Invalid --date; use YYYY-MM-DD') from exc
        created_by = None
        if options['with_active_run']:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            created_by = User.objects.filter(is_superuser=True).order_by('id').first()
            if created_by is None:
                created_by = User.objects.order_by('id').first()
            if created_by is None:
                raise CommandError('--with-active-run requires at least one user in the database')
        try:
            result = seed_dataset(
                key=options['key'],
                target_date=target,
                date_offset=options['date_offset'],
                test_phone=options['test_phone'],
                with_active_run=options['with_active_run'],
                active_run_stage=options['stage'],
                created_by=created_by,
            )
        except DeliveryDatasetError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Seeded dataset {options['key']}"))
        self.stdout.write(json.dumps(result, indent=2, default=str))
