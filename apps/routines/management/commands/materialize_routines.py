"""Create today's RoutineRun rows. Honour store hours (not Sun–Mon).

    python manage.py materialize_routines
    python manage.py materialize_routines --dry-run
"""
from django.core.management.base import BaseCommand

from apps.routines.models import Routine
from apps.routines.schedule import materialize_routines, should_run_on
from apps.webstore.services.hours import _local_now, is_open_day


class Command(BaseCommand):
    help = 'Materialize routine runs for the current local store day.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print how many routines would run today without creating rows.',
        )

    def handle(self, *args, **options):
        local, cfg, _tz = _local_now()
        day = local.date()
        if not is_open_day(day, cfg=cfg):
            self.stdout.write(f'Store is closed on {day.isoformat()}; nothing to materialize.')
            return
        if options['dry_run']:
            due = [
                routine.title
                for routine in Routine.objects.filter(is_active=True)
                if should_run_on(routine, day, cfg=cfg)
            ]
            self.stdout.write(f'{len(due)} active routines would run on {day.isoformat()}.')
            return
        created = materialize_routines(day)
        self.stdout.write(f'Created {created} routine run(s) for {day.isoformat()}.')
