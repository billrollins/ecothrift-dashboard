"""Read-only report of Delivery Day migration conflicts."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.pos.services.delivery_migration_preflight import report_delivery_migration_conflicts


class Command(BaseCommand):
    help = (
        'Report Delivery Day migration conflicts (duplicate dates/runs, orphan jobs, '
        'item-count mismatches, attachment ownership). Read-only; does not mutate data.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--sample-limit',
            type=int,
            default=25,
            help='Max samples per conflict bucket (default 25)',
        )
        parser.add_argument(
            '--fail-on-blockers',
            action='store_true',
            help='Exit non-zero when blocker conflicts exist (use before 0022 constraints).',
        )

    def handle(self, *args, **options):
        report = report_delivery_migration_conflicts(sample_limit=options['sample_limit'])
        self.stdout.write(json.dumps(report, indent=2, default=str))
        if report['ok_for_constraints']:
            self.stdout.write(self.style.SUCCESS('No blocker conflicts; safe for constraints.'))
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"{report['blocker_count']} blocker conflict(s); resolve before 0022."
                )
            )
            if options['fail_on_blockers']:
                raise CommandError('Blocker conflicts present; constraint migration blocked.')
