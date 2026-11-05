"""The B-Stock call log (Dash #75): today's state and daily totals. --prune drops rows older than 14 days."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services import bstock_calls


class Command(BaseCommand):
    help = 'B-Stock anonymous call log: kill switch, cap, back-off, daily totals.'

    def add_arguments(self, parser) -> None:
        parser.add_argument('--days', type=int, default=14)
        parser.add_argument('--prune', action='store_true')

    def handle(self, *args, **options):
        if options['prune']:
            self.stdout.write(f"pruned={bstock_calls.prune()}")
        self.stdout.write(str(bstock_calls.status_now()))
        for d in bstock_calls.daily_totals(options['days']):
            self.stdout.write(f"{d['day']}  calls={d['calls']}  refused={d['refused']}  errors={d['errors']}  {d['by_kind']}")
