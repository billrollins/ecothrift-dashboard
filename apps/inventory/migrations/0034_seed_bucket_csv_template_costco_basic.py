"""Step 4/5: seed CSV template ``Costco Basic``."""
from __future__ import annotations

import sys

from django.db import migrations

from apps.inventory.bucket_csv_seed_payloads import (
    COSTCO_HEADERS,
    COSTCO_MAPPINGS,
    get_or_vendor,
    header_signature,
)


def _log(msg: str) -> None:
    sys.stderr.write(f'[migrate inventory] {msg}\n')
    sys.stderr.flush()


def forwards(apps, schema_editor):
    _log('0034_seed_bucket_csv_template_costco_basic: START')
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    vendor = get_or_vendor(apps, 'Costco', 'COSTCO')
    sig = header_signature(COSTCO_HEADERS)
    CSVTemplate.objects.update_or_create(
        vendor=vendor,
        header_signature=sig,
        defaults={
            'name': 'Costco Basic',
            'column_mappings': COSTCO_MAPPINGS,
            'is_default': True,
        },
    )
    _log('0034_seed_bucket_csv_template_costco_basic: END')


def backwards(apps, schema_editor):
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    CSVTemplate.objects.filter(name='Costco Basic').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0033_seed_bucket_csv_template_target_basic'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
