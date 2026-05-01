"""Step 3/5: seed CSV template ``Target Basic``."""
from __future__ import annotations

import sys

from django.db import migrations

from apps.inventory.bucket_csv_seed_payloads import (
    TARGET_HEADERS,
    TARGET_MAPPINGS,
    get_or_vendor,
    header_signature,
)


def _log(msg: str) -> None:
    sys.stderr.write(f'[migrate inventory] {msg}\n')
    sys.stderr.flush()


def forwards(apps, schema_editor):
    _log('0033_seed_bucket_csv_template_target_basic: START')
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    vendor = get_or_vendor(apps, 'Target', 'TRGET')
    sig = header_signature(TARGET_HEADERS)
    CSVTemplate.objects.update_or_create(
        vendor=vendor,
        header_signature=sig,
        defaults={
            'name': 'Target Basic',
            'column_mappings': TARGET_MAPPINGS,
            'is_default': True,
        },
    )
    _log('0033_seed_bucket_csv_template_target_basic: END')


def backwards(apps, schema_editor):
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    CSVTemplate.objects.filter(name='Target Basic').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0032_preprocessingrow_tracking_column'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
