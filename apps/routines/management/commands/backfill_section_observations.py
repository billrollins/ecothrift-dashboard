from django.core.management.base import BaseCommand

from apps.routines.observations import backfill_observations


class Command(BaseCommand):
    help = 'Write SectionObservation rows from existing submitted section work.'

    def handle(self, *args, **options):
        count = backfill_observations()
        self.stdout.write(f'Wrote {count} observations.')
