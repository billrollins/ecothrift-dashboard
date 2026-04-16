"""Process the manifest pull queue during a local time window (default 10 PM–5 AM America/Chicago)."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.buying.services import pipeline

logger = logging.getLogger(__name__)


def _in_window(local_now: datetime, start_hour: int, end_hour: int) -> bool:
    """True when local clock is in [start_hour, 24) or [0, end_hour) for windows that span midnight."""
    h = local_now.hour
    if start_hour > end_hour:
        return h >= start_hour or h < end_hour
    return start_hour <= h < end_hour


def _window_end_utc(*, tz: ZoneInfo, start_h: int, end_h: int) -> datetime | None:
    """
    Return UTC moment when the current overnight window ends, or None if unparseable.

    For start_h > end_h (e.g. 22–05): end is next 05:00 after the current segment
    (today 05:00 if we are in 00:00–05:00, else tomorrow 05:00 if we are in 22:00–24:00).
    """
    local_now = timezone.now().astimezone(tz)
    if start_h > end_h:
        if local_now.hour >= start_h:
            d = local_now.date() + timedelta(days=1)
        else:
            d = local_now.date()
        end_local = datetime.combine(d, time(end_h, 0), tzinfo=tz)
    else:
        end_local = datetime.combine(local_now.date(), time(end_h, 0), tzinfo=tz)
        if local_now >= end_local:
            return None
    return end_local.astimezone(dt_timezone.utc)


class Command(BaseCommand):
    help = (
        'Repeatedly pull next batches from the manifest queue while the local time window is open. '
        'Ordering: watched auctions first, then watchlist priority, then auction priority.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--start-hour',
            type=int,
            default=22,
            help='Inclusive local hour when the window opens (default 22 = 10 PM).',
        )
        parser.add_argument(
            '--end-hour',
            type=int,
            default=5,
            help='Exclusive local hour when the window closes (default 5 = 5 AM).',
        )
        parser.add_argument(
            '--timezone',
            type=str,
            default='America/Chicago',
            help='IANA timezone name (default America/Chicago).',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=50,
            help='Max auctions per batch iteration (default 50).',
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=1.0,
            help='Seconds to sleep after each auction manifest (default 1).',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-pull even if rows exist (replaces rows).',
        )
        parser.add_argument(
            '--no-prefetch',
            action='store_true',
            help='Disable overlapping fetch of the next auction manifest.',
        )

    def handle(self, *args, **options):
        tz_name = str(options.get('timezone') or 'America/Chicago')
        try:
            tz = ZoneInfo(tz_name)
        except Exception as e:
            raise CommandError(f'Invalid timezone {tz_name!r}: {e}') from e

        start_h = int(options['start_hour'])
        end_h = int(options['end_hour'])
        batch_size = int(options['batch_size'])
        delay = float(options['delay'])
        force = bool(options['force'])

        local_now = timezone.now().astimezone(tz)
        if not _in_window(local_now, start_h, end_h):
            self.stdout.write(
                self.style.WARNING(
                    f'Outside manifest window ({start_h}:00–{end_h}:00 {tz_name}). '
                    f'Local time is {local_now.strftime("%Y-%m-%d %H:%M %Z")}. Exiting.'
                )
            )
            return

        total_processed = 0
        total_rows = 0
        iterations = 0

        while True:
            local_now = timezone.now().astimezone(tz)
            if not _in_window(local_now, start_h, end_h):
                break

            cutoff = _window_end_utc(tz=tz, start_h=start_h, end_h=end_h)
            if cutoff is not None and timezone.now() >= cutoff:
                break

            summary = pipeline.run_manifest_pull(
                auction_ids=None,
                force=force,
                batch_size=batch_size,
                time_cutoff=cutoff,
                inter_auction_delay=delay,
                use_has_manifest_fallback=False,
                prefetch_next=not bool(options.get('no_prefetch')),
            )
            iterations += 1
            total_processed += int(summary.get('auctions_processed', 0))
            total_rows += int(summary.get('manifest_rows_saved', 0))

            self.stdout.write(str(summary))

            if summary.get('stopped_early_time_cutoff'):
                break
            if summary.get('auctions_processed', 0) == 0:
                break

        self.stdout.write(
            self.style.SUCCESS(
                f'pull_manifests_nightly done: iterations={iterations} '
                f'auctions_processed={total_processed} manifest_rows_saved={total_rows}'
            )
        )
        logger.info(
            'pull_manifests_nightly iterations=%s processed=%s rows=%s',
            iterations,
            total_processed,
            total_rows,
        )
