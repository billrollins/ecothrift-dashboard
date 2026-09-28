"""
Write the AI supervisor's daily brief (data_platform Phase 2): the Context snapshot for a day,
then the brief from it. Schedule it each morning (Heroku Scheduler, for example 6:00 AM Central):

    python manage.py build_daily_brief                 # yesterday
    python manage.py build_daily_brief --day 2026-09-28
    python manage.py build_daily_brief --snapshot-only # numbers only, no AI call
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from apps.core.services.daily_brief import default_day, snapshot_for, write


class Command(BaseCommand):
    help = "Build the Context snapshot and the AI supervisor's brief for a day (default: yesterday)."

    def add_arguments(self, parser):
        parser.add_argument('--day', default='', help='YYYY-MM-DD (default: yesterday).')
        parser.add_argument('--snapshot-only', action='store_true')

    def handle(self, *args, day, snapshot_only, **options):
        try:
            which = date.fromisoformat(day) if day else default_day()
        except ValueError as exc:
            raise CommandError('--day must be YYYY-MM-DD') from exc
        if snapshot_only:
            snap = snapshot_for(which)
            errors = snap.data.get('errors') or {}
            self.stdout.write(self.style.SUCCESS(f'Snapshot for {which}: {len(snap.data) - 3} sections, {len(errors)} errors {errors or ""}'))
            return
        brief = write(which)
        if brief.status != brief.STATUS_READY:
            raise CommandError(f'Brief for {which} failed: {brief.error[:300]}')
        self.stdout.write(self.style.SUCCESS(f"Brief for {which}: {brief.body.get('headline')}"))
