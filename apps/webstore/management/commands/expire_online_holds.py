"""Expire due Online Sales holds and release reserved quantity.

Usage:
    python manage.py expire_online_holds
    python manage.py expire_online_holds --dry-run
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.webstore.models import Reservation
from apps.webstore.services.reservations import expire_due_reservations


class Command(BaseCommand):
    help = 'Expire confirmed/ready Online Sales holds past expires_at and release reserved qty.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count due holds without releasing them.',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        due_qs = Reservation.objects.filter(
            status__in=('confirmed', 'ready_for_pickup'),
            expires_at__isnull=False,
            expires_at__lte=now,
        )
        due_count = due_qs.count()
        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(f'Dry run: {due_count} hold(s) would expire.')
            )
            return
        released = expire_due_reservations(now=now)
        self.stdout.write(
            self.style.SUCCESS(f'Expired {released} hold(s) (due count was {due_count}).')
        )
