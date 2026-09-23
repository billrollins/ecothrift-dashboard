"""Scheduler backstop for B-Stock manifest pulls: resume a job whose runner died, prune old rows."""

from __future__ import annotations

import time

from django.core.management.base import BaseCommand

from apps.buying.models import Auction
from apps.buying.services import scraper
from apps.buying.services.bstock_token_store import current_token
from apps.buying.services.buying_settings import get_manifest_pull_max_per_run
from apps.buying.services.manifest_pull import (
    prune_auto_manifests,
    pull_manifest_for_auction,
    resume_claimable_jobs,
    shortlist_queryset,
)


class Command(BaseCommand):
    help = (
        'Heroku Scheduler, every 10 minutes. Resumes a manifest pull job whose thread died '
        '(a queued job, or a running one that has gone silent) and fails it when the B-Stock '
        'login handed over from the "Pull B-Stock manifests" routine has run out. Never starts '
        'a new pull: only the routine\'s Pull button does. Also prunes auto-pulled rows for '
        'auctions that ended two weeks ago and were not won or bid on.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-minutes',
            type=float,
            default=6,
            help='Time budget for all resumed jobs together, checked between pages too (default 6).',
        )
        parser.add_argument(
            '--auction-id',
            type=int,
            default=None,
            help='Pull this one auction now with the saved login, replacing any rows it has.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List what a Pull would take now; no B-Stock calls, no writes.',
        )

    def handle(self, *args, **options):
        if options['dry_run']:
            self._print_shortlist()
            return
        if options['auction_id'] is not None:
            self._pull_one(options['auction_id'])
            return

        deadline = time.monotonic() + options['max_minutes'] * 60
        pruned = prune_auto_manifests()
        if pruned:
            self.stdout.write(f'Pruned auto-pulled rows from {pruned} ended auction(s).')
        jobs = resume_claimable_jobs(deadline=deadline)
        if not jobs:
            self.stdout.write('No pull to resume.')
        for job in jobs:
            self.stdout.write(
                f'job {job.pk}: {job.status}, {job.ok_count} of {job.total} pulled'
                f'{" - " + job.error if job.error else ""}'
            )

    def _pull_one(self, auction_id: int) -> None:
        if not current_token():
            self.stdout.write('No B-Stock login. Hand one over from the "Pull B-Stock manifests" routine.')
            return
        auction = Auction.objects.select_related('marketplace').get(pk=auction_id)
        try:
            r = pull_manifest_for_auction(auction, force=True)
        except (scraper.BStockAuthError, scraper.BStockUnavailable) as e:
            self.stdout.write(self.style.ERROR(str(e)))
            return
        line = f'{r.rows} lines, {r.api_calls} calls, {r.seconds:.0f}s' if r.ok else r.error
        self.stdout.write(f'auction {r.auction_id}: {line}')

    def _print_shortlist(self):
        cap = get_manifest_pull_max_per_run()
        total = shortlist_queryset().count()
        self.stdout.write(f'A Pull now would take {min(cap, total)} of {total} (cap {cap}):')
        for a in shortlist_queryset()[:cap]:
            watch = 'watch' if a.on_watchlist else '     '
            self.stdout.write(
                f'{a.pk:>8}  {watch}  p={a.priority or "-":>2}  ends {a.end_time:%m-%d %H:%M}  '
                f'{a.marketplace.slug:<10} {a.title[:70]}'
            )
