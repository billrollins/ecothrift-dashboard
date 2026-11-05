"""Quick check of B-Stock (Dash #75).

- No flag: one tick.
- ``--burst`` (the Heroku Scheduler line, every 10 minutes): inside a listing window, the first
  5 minutes after :00 or :30, it keeps ticking every 60-90 s until the window ends; outside, one
  tick. Measured 2026-11-05: 80% of lots (103 of 120 Buy Now lots) went live exactly on the hour,
  Wayfair on the half hour, so new lots are seen within 1-2 minutes at about 5 min of dyno an hour.
- ``--loop`` (an always-on worker, not used: a worker beside the Standard web dyno is
  Standard-1X, about $25 a month): a tick every 60-120 s until stopped.
"""

from __future__ import annotations

import random
import signal
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, connection
from django.utils import timezone

from apps.buying.services import quick_check

LOOP_SECONDS = (60.0, 120.0)
BURST_SECONDS = (60.0, 90.0)
WINDOW_MINUTES = 5  # :00-:04 and :30-:34
BURST_MAX_MINUTES = 7.0  # never outlive the next Scheduler run


def in_listing_window(now=None) -> bool:
    return (now or timezone.now()).minute % 30 < WINDOW_MINUTES


class Command(BaseCommand):
    help = 'New, Buy Now and watched B-Stock lots from the public search (one tick, --burst, or --loop).'

    def add_arguments(self, parser) -> None:
        parser.add_argument('--burst', action='store_true', help='Tick every 60-90 s while inside :00-:04 or :30-:34.')
        parser.add_argument('--loop', action='store_true', help='Keep ticking every 60-120 s until stopped.')
        parser.add_argument('--minutes', type=float, default=None, help='With --loop: stop after this many minutes.')

    def handle(self, *args, **options):
        stop = {'now': False}

        def _stop(*_):
            stop['now'] = True

        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)

        if options['burst']:
            deadline = time.monotonic() + BURST_MAX_MINUTES * 60
            self._tick()
            while not stop['now'] and in_listing_window() and time.monotonic() < deadline:
                self._wait(random.uniform(*BURST_SECONDS), stop)
                if not stop['now'] and in_listing_window():
                    self._tick()
            return
        if not options['loop']:
            self._tick()
            return
        deadline = time.monotonic() + options['minutes'] * 60 if options['minutes'] else None
        while not stop['now'] and (deadline is None or time.monotonic() < deadline):
            self._tick()
            self._wait(random.uniform(*LOOP_SECONDS), stop)

    def _tick(self) -> None:
        if not connection.in_atomic_block:  # a long run drops stale connections; never inside a test's transaction
            close_old_connections()
        try:
            out = quick_check.run_tick()
            out.pop('new_ids', None)
            self.stdout.write(str(out))
        except Exception as e:  # noqa: BLE001 - one bad tick never stops the run
            self.stderr.write(f'tick failed: {e}')

    @staticmethod
    def _wait(seconds: float, stop: dict) -> None:
        end = time.monotonic() + seconds
        while not stop['now'] and time.monotonic() < end:
            time.sleep(1)
