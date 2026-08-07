"""Delete every Online Sales record so the workspace starts empty.

Usage:
    python manage.py purge_online_sales --dry-run
    python manage.py purge_online_sales --yes
    python manage.py purge_online_sales --yes --customers

Leaves inventory Items alone: Items at location='online_sales' stay available
in Listings -> To list so you can list one again. Refuses when DEBUG=False
unless --force-production is passed.
"""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.webstore.models import (
    ChannelPublication,
    Conversation,
    Message,
    Order,
    OrderLine,
    Reservation,
    ReservationEvent,
    WebListing,
    WebListingImage,
)


class Command(BaseCommand):
    help = 'Delete all Online Sales listings, holds, events, threads, and legacy orders.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Actually delete. Without this the command only reports counts.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report counts and exit (default behavior without --yes).',
        )
        parser.add_argument(
            '--customers',
            action='store_true',
            help='Also delete Customer-group users and their CustomerProfile rows.',
        )
        parser.add_argument(
            '--force-production',
            action='store_true',
            help='Allow running when DEBUG=False. Dangerous.',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options['force_production']:
            raise CommandError(
                'Refusing to purge Online Sales when DEBUG=False. '
                'Pass --force-production only if you really mean it.',
            )

        counts = {
            'reservation_events': ReservationEvent.objects.count(),
            'messages': Message.objects.count(),
            'conversations': Conversation.objects.count(),
            'reservations': Reservation.objects.count(),
            'order_lines': OrderLine.objects.count(),
            'orders': Order.objects.count(),
            'channel_publications': ChannelPublication.objects.count(),
            'listing_images': WebListingImage.objects.count(),
            'listings': WebListing.objects.count(),
        }

        customer_users = []
        if options['customers']:
            from apps.accounts.models import User

            customer_users = list(
                User.objects.filter(groups__name='Customer', is_staff=False)
                .values_list('id', 'email')
            )
            counts['customer_users'] = len(customer_users)

        for key, value in counts.items():
            self.stdout.write(f'  {key}: {value}')

        if not options['yes']:
            self.stdout.write(self.style.WARNING(
                'Dry run — nothing deleted. Re-run with --yes to purge.',
            ))
            return

        with transaction.atomic():
            # Order matters: Reservation.listing is PROTECT, so holds go first.
            ReservationEvent.objects.all().delete()
            Message.objects.all().delete()
            Conversation.objects.all().delete()
            Reservation.objects.all().delete()
            OrderLine.objects.all().delete()
            Order.objects.all().delete()
            ChannelPublication.objects.all().delete()
            WebListingImage.objects.all().delete()
            WebListing.objects.all().delete()

            if customer_users:
                from apps.accounts.models import MagicLinkToken, User

                emails = [email for _pk, email in customer_users]
                MagicLinkToken.objects.filter(email__in=emails).delete()
                User.objects.filter(pk__in=[pk for pk, _email in customer_users]).delete()

        self.stdout.write(self.style.SUCCESS(
            'Online Sales purged. Inventory Items were left untouched — '
            'items at location=online_sales still appear under Listings -> To list.',
        ))
