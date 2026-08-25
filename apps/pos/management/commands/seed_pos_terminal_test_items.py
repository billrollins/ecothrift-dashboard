"""Seed dedicated on-shelf Items for POS terminal cart / scroll testing.

Creates stable SKUs ``POSTEST01`` … ``POSTEST{N}`` (default 25) plus one sold
SKU ``POSTESTSOLD`` for the sold-item / resale-copy path. Idempotent.

Each SKU has its own Product so cart line descriptions stay distinct.

Local only (DEBUG) unless ``--force``.

Examples::

    python manage.py seed_pos_terminal_test_items
    python manage.py seed_pos_terminal_test_items --reset
    python manage.py seed_pos_terminal_test_items --count 40
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Category, Item, Product
from apps.pos.models import CartLine

SKU_PREFIX = 'POSTEST'
SOLD_SKU = 'POSTESTSOLD'
ITEM_NOTES = 'Seeded by seed_pos_terminal_test_items — POS cart scroll QA only.'

# Short distinct titles so cart lines are easy to tell apart while scrolling.
LINE_TITLES = [
    'Floor Lamp',
    'Fire Pit',
    'Air Fryer',
    'Coffeemaker',
    'Pitcher Set',
    'Table Pack',
    'Throw Pillow',
    'Desk Fan',
    'Board Game',
    'Picture Frame',
    'Kitchen Scale',
    'Storage Bin',
    'Bluetooth Speaker',
    'Yoga Mat',
    'Mug Set',
    'LED Bulb 4pk',
    'Throw Blanket',
    'Wall Clock',
    'Plant Pot',
    'Cutting Board',
    'Power Strip',
    'Laundry Basket',
    'Vacuum Filter',
    'Candle Holder',
    'Tool Kit',
    'Extension Cord',
    'Pet Bed',
    'Shoe Rack',
    'Trash Can',
    'Mirror',
    'Lamp Shade',
    'Coat Hanger',
    'Book Bundle',
    'Puzzle 1000pc',
    'Water Bottle',
    'Lunch Box',
    'HDMI Cable',
    'Mouse Pad',
    'Desk Organizer',
    'Night Light',
]


def _sku(n: int) -> str:
    return f'{SKU_PREFIX}{n:02d}'


def _product_number(n: int | str) -> str:
    return f'PRD-POSTEST-{n}'


def _title_for(n: int) -> str:
    label = LINE_TITLES[(n - 1) % len(LINE_TITLES)]
    return f'POS QA {n:02d} {label}'


def _price_for(n: int) -> Decimal:
    return (Decimal('0.50') + Decimal('0.25') * Decimal(n - 1)).quantize(Decimal('0.01'))


class Command(BaseCommand):
    help = (
        'Seed POSTEST## on-shelf items (+ POSTESTSOLD) for POS terminal cart scroll testing. '
        'Use --reset to put them back on_shelf after a completed sale.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=25,
            help='How many on-shelf POSTEST## items to ensure (default 25, max 99).',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Force all POSTEST## items back to on_shelf and strip them from open carts.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow running when DEBUG is False.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print planned changes without writing.',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options['force']:
            raise CommandError('Refusing to seed: DEBUG is False. Pass --force.')

        count = options['count']
        if count < 1 or count > 99:
            raise CommandError('--count must be between 1 and 99.')

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Dry run — no writes.'))
            for n in range(1, count + 1):
                self.stdout.write(f'  {_sku(n)}\t{_price_for(n)}\t{_title_for(n)}')
            self.stdout.write(f'  {SOLD_SKU}\t1.00\tPOS QA Sold Sample (resale path)')
            if options['reset']:
                self.stdout.write('Would --reset matching items to on_shelf / clear open cart lines.')
            return

        category = Category.objects.order_by('id').first()
        if category is None:
            raise CommandError('No Category rows found. Seed categories first.')

        with transaction.atomic():
            created = 0
            updated = 0
            for n in range(1, count + 1):
                sku = _sku(n)
                price = _price_for(n)
                product = self._ensure_product(
                    product_number=_product_number(n),
                    title=_title_for(n),
                    category=category,
                )
                item, was_created = self._ensure_item(
                    sku=sku,
                    product=product,
                    price=price,
                    status='on_shelf',
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
                    if options['reset']:
                        self._reset_item(item, price=price)

            sold_product = self._ensure_product(
                product_number=_product_number('SOLD'),
                title='POS QA Sold Sample (resale path)',
                category=category,
            )
            sold_item, sold_created = self._ensure_item(
                sku=SOLD_SKU,
                product=sold_product,
                price=Decimal('1.00'),
                status='sold',
            )
            if sold_created:
                created += 1
            else:
                updated += 1
                if sold_item.status != 'sold':
                    sold_item.status = 'sold'
                    sold_item.sold_at = sold_item.sold_at or timezone.now()
                    sold_item.sold_for = sold_item.sold_for or sold_item.price
                    sold_item.save(defer_po_cost_recompute=True)

            if options['reset']:
                removed = self._strip_open_cart_lines(count)
                self.stdout.write(f'Removed {removed} open-cart line(s) referencing POSTEST SKUs.')

        self.stdout.write(
            self.style.SUCCESS(
                f'POS terminal test items ready: created={created} updated={updated} '
                f'on_shelf={count} sold=1.'
            )
        )
        self.stdout.write('Seeded POSTEST## SKUs for cart-scroll QA. See .ai/extended/pos-system.md.')

    def _ensure_product(self, *, product_number: str, title: str, category: Category) -> Product:
        product, created = Product.objects.get_or_create(
            product_number=product_number,
            defaults={
                'title': title,
                'brand': 'Eco-Thrift QA',
                'model': 'POSTEST',
                'category': category,
                'identifiers': {'sku_prefix': SKU_PREFIX, 'purpose': 'pos_terminal_cart_scroll'},
                'tags': ['pos-qa', 'do-not-sell-live'],
            },
        )
        if created:
            self.stdout.write(f'Created product {product_number}')
        elif product.title != title:
            product.title = title
            product.save(update_fields=['title', 'updated_at'])
        return product

    def _ensure_item(
        self,
        *,
        sku: str,
        product: Product,
        price: Decimal,
        status: str,
    ) -> tuple[Item, bool]:
        existing = Item.objects.filter(sku=sku).first()
        if existing:
            return existing, False

        now = timezone.now()
        item = Item(
            sku=sku,
            product=product,
            price=price,
            retail=price,
            cost=Decimal('0.10'),
            source='misc',
            status=status,
            condition='good',
            location='POS-QA',
            notes=ITEM_NOTES,
            listed_at=now,
            checked_in_at=now,
        )
        if status == 'sold':
            item.sold_at = now
            item.sold_for = price
        item.save(defer_po_cost_recompute=True)
        self.stdout.write(f'Created {sku} ({status}) @ {price}')
        return item, True

    def _reset_item(self, item: Item, *, price: Decimal) -> None:
        item.status = 'on_shelf'
        item.price = price
        item.retail = price
        item.sold_at = None
        item.sold_for = None
        item.notes = ITEM_NOTES
        item.location = 'POS-QA'
        item.save(defer_po_cost_recompute=True)
        self.stdout.write(f'Reset {item.sku} → on_shelf @ {price}')

    def _strip_open_cart_lines(self, count: int) -> int:
        skus = [_sku(n) for n in range(1, count + 1)] + [SOLD_SKU]
        deleted, _ = CartLine.objects.filter(
            cart__status='open',
            item__sku__in=skus,
        ).delete()
        return deleted
