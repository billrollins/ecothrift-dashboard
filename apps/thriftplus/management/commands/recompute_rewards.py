"""
Thrift+ nightly reward recompute (thrift_plus_rewards Phase 2).

    python manage.py recompute_rewards              # tonight: step every floor item once for today
    python manage.py recompute_rewards --dry-run    # print what members would pay tomorrow; writes nothing
    python manage.py recompute_rewards --day 2026-10-21

Schedule it just after midnight Chicago time (Heroku Scheduler, 06:00 UTC). It runs while the
Thrift+ switch is off too: the rewards are computed dark and nothing reads them until launch.
Re-running for a day changes nothing, because items already computed for that day are skipped.
"""
from __future__ import annotations

import json
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from apps.thriftplus.services import rewards


class Command(BaseCommand):
    help = "Step every floor item's Thrift+ reward once for the day (the nightly job)."

    def add_arguments(self, parser):
        parser.add_argument('--day', help='YYYY-MM-DD (default: today; with --dry-run, tomorrow).')
        parser.add_argument('--dry-run', action='store_true', help='Print the plan; write nothing.')

    def handle(self, *args, **opts):
        day = None
        if opts['day']:
            try:
                day = date.fromisoformat(opts['day'])
            except ValueError as exc:
                raise CommandError('--day must be YYYY-MM-DD') from exc
        if opts['dry_run']:
            report = rewards.summarize(rewards.plan(day), top=10)
            self.stdout.write(json.dumps({k: report[k] for k in ('day', 'rules', 'totals', 'by_status', 'bands', 'families')}, indent=1))
            self.stdout.write(f"exit list: {report['exit_list']['count']} items; to close: {report['to_close']}")
            return
        run = rewards.recompute(day)
        if run.error:
            raise CommandError(f'Reward run {run.pk} for {run.day} failed: {run.error.splitlines()[0]}')
        self.stdout.write(self.style.SUCCESS(f'Reward run {run.pk} for {run.day}: {json.dumps(run.counts)}'))
