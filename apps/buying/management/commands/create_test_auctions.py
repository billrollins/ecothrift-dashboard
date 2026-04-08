"""Create 10 Phase 4.1A test auctions (CSV upload manual test matrix)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.buying.models import Auction, Marketplace

# (external_id / lot_id stem, marketplace slug, title suffix after "{stem} - ")
_TEST_ROWS: list[tuple[str, str, str]] = [
    ('TGT104380', 'target', 'Target Beauty & Cosmetics (1,272 items)'),
    ('WAL124480', 'walmart', 'Walmart General Merchandise (803 items)'),
    ('AMZ16606', 'amazon', 'Amazon Mixed Home/Toys 16-col (1,167 items)'),
    ('AMZ32549', 'amazon', 'Amazon Toys & Pets 17-col (1,534 items)'),
    ('TGT116937', 'target', 'Target Electronics & Mixed (1,263 items)'),
    ('CST531214', 'costco', 'Costco Housewares (361 items) - UNSEEDED'),
    ('HMD52348', 'homedepot', 'Home Depot Mixed (210 items) - UNSEEDED'),
    ('WFR12113', 'wayfair', 'Wayfair Furniture & Decor (285 items) - UNSEEDED'),
    ('ESS4005', 'essendant', 'Essendant Office/Industrial (319 items) - UNSEEDED'),
    ('AMZ11754', 'amazon', 'Amazon Mixed with Shipping (116 items) - UNSEEDED'),
]


class Command(BaseCommand):
    help = 'Create or update 10 test auctions for Phase 4.1A CSV upload testing.'

    def handle(self, *args, **options) -> None:
        now = timezone.now()
        end_time = now + timedelta(days=7)

        created = 0
        updated = 0
        rows_out: list[tuple[int, str, str, str]] = []

        for external_id, slug, title_suffix in _TEST_ROWS:
            title = f'{external_id} - {title_suffix}'
            mp = Marketplace.objects.filter(slug=slug).first()
            if mp is None:
                if slug == 'essendant':
                    mp, was_created = Marketplace.objects.get_or_create(
                        slug='essendant',
                        defaults={
                            'name': 'Essendant',
                            'external_id': None,
                            'base_url': 'https://bstock.com/',
                            'notes': 'Created for Phase 4.1A test auctions (consultant matrix).',
                            'is_active': True,
                        },
                    )
                    if was_created:
                        self.stdout.write(
                            self.style.WARNING(
                                f'Created Marketplace row for slug={slug!r} (was missing).'
                            )
                        )
                else:
                    raise CommandError(
                        f'Marketplace slug={slug!r} not found. Seed marketplaces first.'
                    )

            obj, was_created = Auction.objects.update_or_create(
                marketplace=mp,
                external_id=external_id,
                defaults={
                    'lot_id': external_id,
                    'title': title,
                    'description': f'[Phase 4.1A test data] {title}',
                    'url': 'https://bstock.com/test/',
                    'category': 'Test',
                    'condition_summary': 'Test — mixed',
                    'listing_type': 'SPOT',
                    'status': Auction.STATUS_OPEN,
                    'has_manifest': False,
                    'end_time': end_time,
                    'time_remaining_seconds': int(timedelta(days=7).total_seconds()),
                    'current_price': Decimal('125.00'),
                    'starting_price': Decimal('100.00'),
                    'buy_now_price': Decimal('500.00'),
                    'total_retail_value': Decimal('10000.00'),
                    'bid_count': 3,
                    'lot_size': 100,
                    'last_updated_at': now,
                    'first_seen_at': now,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
            csv_name = f'{external_id}.csv'
            rows_out.append((obj.pk, csv_name, slug, title))

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Auctions: {created} created, {updated} updated ({created + updated} total).'
            )
        )
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Phase 4.1A manual test matrix (upload CSV per auction):'))
        self.stdout.write('-' * 96)
        header = f'{"#":<4} {"Auction ID":<12} {"CSV file":<16} {"Marketplace":<14} Expected'
        self.stdout.write(header)
        self.stdout.write('-' * 96)
        for i, (pk, csv_name, slug, title) in enumerate(rows_out, start=1):
            if i <= 5:
                expected = 'reviewed template exists'
            else:
                expected = 'UNSEEDED (stub on first upload)'
            self.stdout.write(f'{i:<4} {pk:<12} {csv_name:<16} {slug:<14} {expected}')
        self.stdout.write('-' * 96)
        self.stdout.write('')
        self.stdout.write('Titles (filename stem prefix):')
        for i, (pk, csv_name, slug, title) in enumerate(rows_out, start=1):
            self.stdout.write(f'  {i}. [{pk}] {title}')
        self.stdout.write('')
        for i, (pk, csv_name, slug, _title) in enumerate(rows_out, start=1):
            self.stdout.write(
                f'  {i}. Upload {csv_name!r} on auction detail page for auction id={pk} (marketplace={slug})'
            )
