"""Expire due Online Sales holds and release reserved quantity.

Usage:
    python manage.py expire_online_holds
    python manage.py expire_online_holds --dry-run
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.webstore.models import Conversation, Reservation
from apps.webstore.services.conversations import expire_unverified_inquiries
from apps.webstore.services.reservations import expire_due_reservations


class Command(BaseCommand):
    help = (
        'Expire Online Sales holds past expires_at (provisional, verified, ready) '
        'and delete stale unverified inquiries.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count due holds without releasing them.',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        active_due = Reservation.objects.filter(
            status__in=('requested', 'confirmed', 'ready_for_pickup'),
            expires_at__isnull=False,
            expires_at__lte=now,
        ).count()
        pending_due = Reservation.objects.filter(
            status='pending_verification',
            expires_at__isnull=False,
            expires_at__lte=now,
        ).count()
        inquiry_hours = int(getattr(settings, 'ONLINE_SALES_INQUIRY_VERIFY_HOURS', 24))
        stale_inquiries = Conversation.objects.filter(
            state='pending_verification',
            reservation__isnull=True,
            created_at__lte=now - timedelta(hours=inquiry_hours),
        ).count()
        due_count = active_due + pending_due
        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(
                    f'Dry run: {due_count} hold(s) would expire '
                    f'({active_due} past expires_at, {pending_due} pending verification); '
                    f'{stale_inquiries} unverified inquir(y/ies) would be deleted.'
                )
            )
            return
        released = expire_due_reservations(now=now)
        deleted = expire_unverified_inquiries(now=now)
        self.stdout.write(
            self.style.SUCCESS(
                f'Expired {released} hold(s) '
                f'({active_due} past expires_at, {pending_due} pending verification); '
                f'deleted {deleted} unverified inquir(y/ies).'
            )
        )
