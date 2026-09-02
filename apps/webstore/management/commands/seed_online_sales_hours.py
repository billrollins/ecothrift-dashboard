"""Seed AppSetting key online_sales.hours (Canfield Tue-Sat 9-6, closed Sun & Mon).

Usage:
    python manage.py seed_online_sales_hours
"""

from django.core.management.base import BaseCommand

from apps.core.models import AppSetting
from apps.webstore.services.hours import DEFAULT_HOURS


class Command(BaseCommand):
    help = 'Idempotently seed online_sales.hours AppSetting for hold expiry.'

    def handle(self, *args, **options):
        payload = dict(DEFAULT_HOURS)
        row, created = AppSetting.objects.get_or_create(
            key='online_sales.hours',
            defaults={
                'value': payload,
                'description': 'Online Sales hold expiry hours (Canfield).',
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created online_sales.hours: {payload}'))
            return
        # Do not overwrite operator edits - only fill missing keys.
        value = row.value if isinstance(row.value, dict) else {}
        merged = {**payload, **value}
        if merged != value:
            row.value = merged
            if not row.description:
                row.description = 'Online Sales hold expiry hours (Canfield).'
            row.save(update_fields=['value', 'description', 'updated_at'])
            self.stdout.write(self.style.SUCCESS(f'Updated online_sales.hours: {merged}'))
        else:
            self.stdout.write(f'online_sales.hours already set: {value}')
