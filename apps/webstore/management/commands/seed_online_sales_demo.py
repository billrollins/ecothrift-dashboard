"""Idempotent Online Sales demo fixtures (Phase 0 F1–F9 + threads + customer).

Usage:
    python manage.py seed_online_sales_demo
    python manage.py seed_online_sales_demo --wipe

Refuses to run when DEBUG is False (production/staging safety).
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import CustomerProfile, User
from apps.core.models import S3File
from apps.webstore.models import (
    Conversation,
    Order,
    Reservation,
    WebListing,
    WebListingImage,
)
from apps.webstore.services.conversations import open_inquiry, post_message, resolve_conversation
from apps.webstore.services.reservations import confirm_reservation, create_hold, release_reservation

DEMO_PREFIX = 'demo-os-'
DEMO_CUSTOMER_EMAIL = 'demo.customer@ecothrift.example'


class Command(BaseCommand):
    help = 'Seed Online Sales demo listings, holds, threads, and a Customer user (DEBUG only).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--wipe',
            action='store_true',
            help='Delete prior demo-os-* fixtures before reseeding.',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Refusing to run seed_online_sales_demo when DEBUG=False.')

        if options['wipe']:
            self._wipe()
            self.stdout.write(self.style.WARNING('Wiped prior demo Online Sales fixtures.'))

        with transaction.atomic():
            f1 = self._listing(
                slug=f'{DEMO_PREFIX}f1-unique',
                title='Demo F1 Unique Lamp',
                on_hand=1,
                status='published',
                with_item=True,
            )
            f2 = self._listing(
                slug=f'{DEMO_PREFIX}f2-multi',
                title='Demo F2 Multi Qty Basket',
                on_hand=5,
                status='published',
                with_item=False,
            )
            for status, label in [
                ('draft', 'Draft'),
                ('ready', 'Ready'),
                ('published', 'Published'),
                ('paused', 'Paused'),
                ('sold', 'Sold'),
                ('archived', 'Archived'),
            ]:
                self._listing(
                    slug=f'{DEMO_PREFIX}f3-{status}',
                    title=f'Demo F3 {label}',
                    on_hand=1 if status != 'sold' else 0,
                    status=status,
                    with_item=False,
                )
            f4 = self._listing(
                slug=f'{DEMO_PREFIX}f4-photos',
                title='Demo F4 Photo Gallery',
                on_hand=1,
                status='published',
                with_item=False,
                image_count=3,
            )
            self._listing(
                slug=f'{DEMO_PREFIX}f5-manual',
                title='Demo F5 Manual Unlinked',
                on_hand=1,
                status='published',
                with_item=False,
            )

            # F6 requested + confirmed on F1 (need qty — use F2 for second hold)
            if not Reservation.objects.filter(idempotency_key=f'{DEMO_PREFIX}f6-requested').exists():
                create_hold(
                    listing=f1,
                    quantity=1,
                    customer_name='Demo Requested',
                    email='demo.requested@ecothrift.example',
                    customer_note='Demo F6 requested',
                    idempotency_key=f'{DEMO_PREFIX}f6-requested',
                )
            # F1 is now reserved; confirmed hold on F2
            if not Reservation.objects.filter(idempotency_key=f'{DEMO_PREFIX}f6-confirmed').exists():
                conf = create_hold(
                    listing=f2,
                    quantity=1,
                    customer_name='Demo Confirmed',
                    email='demo.confirmed@ecothrift.example',
                    customer_note='Demo F6 confirmed',
                    idempotency_key=f'{DEMO_PREFIX}f6-confirmed',
                )
                confirm_reservation(conf)

            # F7 expired with qty released
            if not Reservation.objects.filter(idempotency_key=f'{DEMO_PREFIX}f7-expired').exists():
                exp = create_hold(
                    listing=f2,
                    quantity=1,
                    customer_name='Demo Expired',
                    email='demo.expired@ecothrift.example',
                    idempotency_key=f'{DEMO_PREFIX}f7-expired',
                )
                confirm_reservation(exp)
                release_reservation(exp, 'expired')

            # F8 held linked item for POS guard — another published linked listing
            f8 = self._listing(
                slug=f'{DEMO_PREFIX}f8-pos-guard',
                title='Demo F8 POS Guard Item',
                on_hand=1,
                status='published',
                with_item=True,
            )
            if not Reservation.objects.filter(idempotency_key=f'{DEMO_PREFIX}f8-hold').exists():
                create_hold(
                    listing=f8,
                    quantity=1,
                    customer_name='Demo POS Hold',
                    email='demo.pos@ecothrift.example',
                    idempotency_key=f'{DEMO_PREFIX}f8-hold',
                )

            # F9 legacy empty Order
            Order.objects.get_or_create(
                order_number='ETWDEMO9',
                defaults={
                    'customer_name': 'Demo Legacy',
                    'email': 'demo.legacy@ecothrift.example',
                    'status': 'cancelled',
                    'payment_status': 'unpaid',
                    'fulfillment': 'pickup',
                    'subtotal': Decimal('0'),
                    'total': Decimal('0'),
                },
            )

            # Inquiry + unread + resolved threads
            if not Conversation.objects.filter(guest_email='demo.inquiry@ecothrift.example').exists():
                open_inquiry(
                    listing=f4,
                    name='Demo Inquiry',
                    email='demo.inquiry@ecothrift.example',
                    body='Is the gallery piece still available?',
                )

            unread_email = 'demo.unread@ecothrift.example'
            conv_unread = Conversation.objects.filter(guest_email=unread_email).first()
            if conv_unread is None:
                conv_unread = open_inquiry(
                    listing=f4,
                    name='Demo Unread',
                    email=unread_email,
                    body='First message',
                )
                post_message(conv_unread, author_kind='customer', body='Follow-up — still interested!')

            resolved_email = 'demo.resolved@ecothrift.example'
            conv_res = Conversation.objects.filter(guest_email=resolved_email).first()
            if conv_res is None:
                conv_res = open_inquiry(
                    listing=f4,
                    name='Demo Resolved',
                    email=resolved_email,
                    body='Quick question',
                )
                resolve_conversation(conv_res)

            # Customer account for magic-link testing
            group, _ = Group.objects.get_or_create(name='Customer')
            user = User.objects.filter(email__iexact=DEMO_CUSTOMER_EMAIL).first()
            if user is None:
                user = User(
                    email=DEMO_CUSTOMER_EMAIL,
                    first_name='Demo',
                    last_name='Customer',
                    is_staff=False,
                    is_active=True,
                )
                user.set_unusable_password()
                user.save()
            if not user.groups.filter(name='Customer').exists():
                user.groups.add(group)
            CustomerProfile.objects.get_or_create(
                user=user,
                defaults={'customer_number': CustomerProfile.generate_customer_number()},
            )

        self.stdout.write(self.style.SUCCESS(
            f'Demo Online Sales seed complete. Customer email: {DEMO_CUSTOMER_EMAIL} '
            f'(request magic link). Listings slug prefix: {DEMO_PREFIX}',
        ))

    def _wipe(self):
        from apps.inventory.models import Item

        Reservation.objects.filter(idempotency_key__startswith=DEMO_PREFIX).delete()
        Reservation.objects.filter(listing__slug__startswith=DEMO_PREFIX).delete()
        Conversation.objects.filter(listing__slug__startswith=DEMO_PREFIX).delete()
        Conversation.objects.filter(guest_email__endswith='@ecothrift.example').delete()
        Order.objects.filter(order_number='ETWDEMO9').delete()
        # Unlink then delete demo Items so SKUs can be recreated (do not leave orphans).
        item_ids = list(
            WebListing.objects.filter(slug__startswith=DEMO_PREFIX)
            .exclude(item_id=None)
            .values_list('item_id', flat=True)
        )
        WebListing.objects.filter(slug__startswith=DEMO_PREFIX).delete()
        if item_ids:
            Item.objects.filter(pk__in=item_ids).delete()
        Item.objects.filter(sku__startswith='DEMO-').filter(location='online_sales').delete()
        User.objects.filter(email__iexact=DEMO_CUSTOMER_EMAIL).delete()

    def _listing(
        self,
        *,
        slug: str,
        title: str,
        on_hand: int,
        status: str,
        with_item: bool,
        image_count: int = 1,
    ) -> WebListing:
        listing, created = WebListing.objects.get_or_create(
            slug=slug,
            defaults={
                'title': title,
                'price': Decimal('49.00'),
                'on_hand': on_hand,
                'reserved': 0,
                'status': status,
                'return_policy': 'final_sale',
                'description': f'Demo fixture {slug}',
            },
        )
        if with_item and listing.item_id is None:
            from apps.inventory.models import Category, Item, Product
            category = Category.objects.order_by('id').first()
            if category is None:
                self.stdout.write(self.style.WARNING(
                    f'Could not attach Item for {slug}: no inventory Category available',
                ))
            else:
                sku = f'DEMO-{slug[-12:].upper().replace("-", "")[:16]}'
                item = Item.objects.filter(sku=sku).first()
                if item is None:
                    product = Product.objects.create(
                        title=title,
                        brand='Demo',
                        category=category,
                    )
                    item = Item.objects.create(
                        product=product,
                        sku=sku,
                        status='on_shelf',
                        location='online_sales',
                        price=Decimal('49.00'),
                        cost=Decimal('10.00'),
                    )
                listing.item = item
                listing.sku = item.sku
                listing.save(update_fields=['item', 'sku', 'updated_at'])

        existing_images = listing.images.count()
        for i in range(existing_images, image_count):
            s3, _ = S3File.objects.get_or_create(
                key=f'demo/{slug}-{i}.jpg',
                defaults={
                    'filename': f'{slug}-{i}.jpg',
                    'size': 12,
                    'content_type': 'image/jpeg',
                },
            )
            WebListingImage.objects.get_or_create(
                listing=listing,
                s3_file=s3,
                defaults={'position': i},
            )

        if created or listing.on_hand != on_hand or listing.status != status:
            listing.on_hand = on_hand
            listing.status = status
            listing.sync_stock_mirror()
            listing.save()
        else:
            listing.sync_stock_mirror()
            listing.save(update_fields=['stock', 'updated_at'])
        return listing
