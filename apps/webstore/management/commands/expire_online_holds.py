"""Expire due Online Sales holds and release reserved quantity.

Usage:
    python manage.py expire_online_holds
    python manage.py expire_online_holds --dry-run
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.webstore.models import Reservation
from apps.webstore.services.reservations import expire_due_reservations


class Command(BaseCommand):
    help = (
        'Expire confirmed/ready Online Sales holds past expires_at, plus untriaged '
        'requested holds past ONLINE_SALES_REQUEST_TRIAGE_HOURS; release reserved qty.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count due holds without releasing them.',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        confirmed_due = Reservation.objects.filter(
            status__in=('confirmed', 'ready_for_pickup'),
            expires_at__isnull=False,
            expires_at__lte=now,
        ).count()
        triage_hours = int(getattr(settings, 'ONLINE_SALES_REQUEST_TRIAGE_HOURS', 48))
        stale_requests = Reservation.objects.filter(
            status='requested',
            created_at__lte=now - timedelta(hours=triage_hours),
        ).count()
        due_count = confirmed_due + stale_requests
        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(
                    f'Dry run: {due_count} hold(s) would expire '
                    f'({confirmed_due} confirmed/ready, {stale_requests} untriaged requests).'
                )
            )
            return
        released = expire_due_reservations(now=now)
        self.stdout.write(
            self.style.SUCCESS(
                f'Expired {released} hold(s) '
                f'({confirmed_due} confirmed/ready, {stale_requests} untriaged requests).'
            )
        )
