"""Seed CategoryMapping from workspace cr.taxonomy_estimate (dev/staging)."""

from __future__ import annotations

import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.models import CategoryMapping


class Command(BaseCommand):
    help = (
        'Load manifest label → canonical mappings from workspace/notebooks/category-research '
        'cr/taxonomy_estimate.py. Refuses in production unless --force.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow running when DEBUG is False (staging/manual).',
        )

    def handle(self, *args, **options) -> None:
        force = options['force']
        if not getattr(settings, 'DEBUG', False) and not force:
            raise CommandError(
                'Refusing to seed: DEBUG is False. Run with DEBUG=True or pass --force.'
            )

        base = Path(settings.BASE_DIR)
        cr_root = base / 'workspace' / 'notebooks' / 'category-research'
        if not cr_root.is_dir():
            raise CommandError(f'category-research directory not found: {cr_root}')

        root_str = str(cr_root.resolve())
        if root_str not in sys.path:
            sys.path.insert(0, root_str)

        from cr.taxonomy_estimate import MANIFEST_TO_PROPOSED  # noqa: PLC0415

        created = 0
        updated = 0
        for key, (canonical_name, _ambiguous) in MANIFEST_TO_PROPOSED.items():
            source_key = key.strip()
            _obj, was_created = CategoryMapping.objects.update_or_create(
                source_key=source_key,
                defaults={
                    'canonical_category': canonical_name,
                    'rule_origin': CategoryMapping.RULE_SEEDED,
                    'ai_reasoning': '',
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. CategoryMapping rows: {created} created, {updated} updated '
                f'({created + updated} total keys).'
            )
        )
