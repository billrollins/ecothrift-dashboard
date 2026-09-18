"""Seed the six-person local roster. DEBUG only.

Usage:
    python manage.py seed_dev_roster
"""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.hr.dev_roster import apply_dev_roster


class Command(BaseCommand):
    help = 'Seed the mapped local roster (DEBUG only).'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Refusing to run seed_dev_roster when DEBUG=False.')
        with transaction.atomic():
            stats = apply_dev_roster(warn=lambda message: self.stdout.write(self.style.WARNING(message)))
        applied = len(stats['applied'])
        skipped = len(stats['skipped'])
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {applied} mapped user{"" if applied == 1 else "s"}'
            + (f'; skipped {skipped} missing' if skipped else '')
            + '.'
        ))
