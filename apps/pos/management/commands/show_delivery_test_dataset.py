"""Inspect a named delivery test dataset."""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.pos.services.delivery_test_dataset import DeliveryDatasetError, show_dataset


class Command(BaseCommand):
    help = 'Show Days/Jobs/Runs/artifacts for a named delivery test dataset.'

    def add_arguments(self, parser):
        parser.add_argument('--key', required=True, help='Dataset key')

    def handle(self, *args, **options):
        try:
            payload = show_dataset(options['key'])
        except DeliveryDatasetError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(payload, indent=2, default=str))
