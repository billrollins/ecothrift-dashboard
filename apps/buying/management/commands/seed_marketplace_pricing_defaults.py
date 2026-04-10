"""Set Marketplace.default_fee_rate and default_shipping_rate (Phase 5)."""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.models import Marketplace

# Placeholder defaults (fraction of purchase price). Replace via CSV from PO history.
_BUILTIN_SLUG_RATES: dict[str, tuple[str, str]] = {
    'amazon': ('0.0300', '0.3500'),
    'target': ('0.0300', '0.4000'),
    'walmart': ('0.0300', '0.3800'),
    'costco': ('0.0300', '0.3200'),
    'homedepot': ('0.0300', '0.3500'),
    'wayfair': ('0.0300', '0.4200'),
    'essendant': ('0.0300', '0.3000'),
}


class Command(BaseCommand):
    help = (
        'Load Marketplace.default_fee_rate and default_shipping_rate from CSV or built-in '
        'slugs. CSV columns: slug,default_fee_rate,default_shipping_rate (decimals as 0.03 = 3%).'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--input',
            type=str,
            default=None,
            help='CSV path (default: workspace/data/marketplace_pricing_defaults.csv if present).',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow running when DEBUG is False.',
        )

    def handle(self, *args, **options) -> None:
        force = options['force']
        if not getattr(settings, 'DEBUG', False) and not force:
            raise CommandError(
                'Refusing to seed: DEBUG is False. Run with DEBUG=True or pass --force.'
            )

        base = Path(settings.BASE_DIR)
        input_path = (
            Path(options['input']).resolve()
            if options['input']
            else base / 'workspace' / 'data' / 'marketplace_pricing_defaults.csv'
        )

        rows: dict[str, tuple[Decimal, Decimal]] = {}
        if input_path.is_file():
            with input_path.open(encoding='utf-8', newline='') as f:
                reader = csv.DictReader(f)
                need = {'slug', 'default_fee_rate', 'default_shipping_rate'}
                if not need.issubset(set(reader.fieldnames or [])):
                    raise CommandError(f'CSV missing columns. Need {sorted(need)}.')
                for row in reader:
                    slug = (row.get('slug') or '').strip()
                    if not slug:
                        continue
                    try:
                        fee = Decimal((row.get('default_fee_rate') or '0').strip())
                        ship = Decimal((row.get('default_shipping_rate') or '0').strip())
                    except InvalidOperation as e:
                        raise CommandError(f'Bad decimal for slug={slug!r}') from e
                    rows[slug] = (fee, ship)
            self.stdout.write(f'  Loaded {len(rows)} row(s) from {input_path}')
        else:
            self.stdout.write(
                self.style.WARNING(
                    f'No CSV at {input_path}; using built-in defaults for known slugs only.'
                )
            )
            for slug, (fee, ship) in _BUILTIN_SLUG_RATES.items():
                rows[slug] = (Decimal(fee), Decimal(ship))

        updated = 0
        missing: list[str] = []
        for slug, (fee, ship) in rows.items():
            mp = Marketplace.objects.filter(slug=slug).first()
            if mp is None:
                missing.append(slug)
                continue
            mp.default_fee_rate = fee
            mp.default_shipping_rate = ship
            mp.save(update_fields=['default_fee_rate', 'default_shipping_rate', 'updated_at'])
            updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Marketplace pricing defaults: {updated} marketplace(s) updated.'
            )
        )
        if missing:
            self.stdout.write(
                self.style.WARNING(
                    'No Marketplace row for slug(s): ' + ', '.join(sorted(missing)) + ' (skipped).'
                )
            )
