"""Age out finished Online Sales work so the staff queues stay current.

Usage:
    python manage.py archive_online_sales --dry-run   # counts only, no writes
    python manage.py archive_online_sales             # archive (reversible)
    python manage.py archive_online_sales --purge     # archive + delete abandoned

Archiving is reversible and hides nothing from customers. `--purge` deletes
holds that were abandoned before the customer ever proved their email — run it
only after a few days of `--dry-run` output looks right.
"""
from django.core.management.base import BaseCommand

from apps.webstore.services import retention


class Command(BaseCommand):
    help = (
        'Archive released holds and resolved threads past their retention window; '
        'optionally purge never-verified abandoned holds.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without writing.',
        )
        parser.add_argument(
            '--purge',
            action='store_true',
            help='Also delete never-verified, never-messaged abandoned holds.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        purge = options['purge']

        hold_days = retention.released_hold_archive_days()
        thread_days = retention.resolved_thread_archive_days()
        purge_days = retention.abandoned_hold_purge_days()

        stale_holds = retention.stale_released_holds().count()
        stale_threads = retention.stale_resolved_threads().count()
        # Counted even without --purge so the number is visible for a while
        # before anyone turns deletion on.
        purge_eligible = retention.abandoned_holds().count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'Dry run: would archive {stale_holds} released hold(s) '
                    f'older than {hold_days}d and {stale_threads} resolved '
                    f'thread(s) older than {thread_days}d.'
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    f'Dry run: {purge_eligible} abandoned hold(s) older than '
                    f'{purge_days}d are purge-eligible '
                    f'({"would be deleted" if purge else "use --purge to delete"}).'
                )
            )
            return

        archived = retention.archive_stale()
        self.stdout.write(
            self.style.SUCCESS(
                f'Archived {archived["holds_archived"]} released hold(s) '
                f'(>{hold_days}d) and {archived["threads_archived"]} resolved '
                f'thread(s) (>{thread_days}d).'
            )
        )

        if not purge:
            if purge_eligible:
                self.stdout.write(
                    f'{purge_eligible} abandoned hold(s) are purge-eligible '
                    f'(>{purge_days}d). Re-run with --purge to delete them.'
                )
            return

        purged = retention.purge_abandoned()
        self.stdout.write(
            self.style.SUCCESS(
                f'Purged {purged["holds_purged"]} abandoned hold(s) (>{purge_days}d) '
                f'and {purged["threads_purged"]} thread(s) with no human messages.'
            )
        )
