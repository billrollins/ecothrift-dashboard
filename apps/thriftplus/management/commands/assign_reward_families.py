"""
Retired 2026-10-19 (rulebook P6): the supply rule replaced reward families, so nothing is asked of a model any more.
Kept as a no-op so a leftover Scheduler job finishes cleanly instead of failing every night; remove the job and then
this file.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Retired (2026-10-19): reward families were replaced by the supply rule. Does nothing.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        self.stdout.write('assign_reward_families is retired (rulebook P6, 2026-10-19): nothing to do.')
