"""
The nightly data QA run (data_platform Phase 3).

    python manage.py run_qa               # every check, then the AI triage and fix requests
    python manage.py run_qa --no-triage   # skip the model call

Schedule it after the other nightly jobs (Heroku Scheduler, 07:00 UTC), before the morning brief.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.qa.services import runner


class Command(BaseCommand):
    help = 'Run every data QA check, triage the changes, and stage fix requests.'

    def add_arguments(self, parser):
        parser.add_argument('--no-triage', action='store_true')

    def handle(self, *args, **opts):
        run = runner.run(triage=not opts['no_triage'])
        worse = [f'{f.check_id} {f.count} (was {f.previous})' for f in run.findings.all() if f.delta and f.delta > 0]
        self.stdout.write(self.style.SUCCESS(f'QA run {run.pk}: {run.counts}'))
        if worse:
            self.stdout.write('Worse since last run: ' + ', '.join(worse))
