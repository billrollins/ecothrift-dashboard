"""Step 5/5: seed CSV template ``Amazon Basic``."""
from __future__ import annotations

import sys

from django.db import migrations

from apps.inventory.bucket_csv_seed_payloads import (
    AMAZON_HEADERS,
    AMAZON_MAPPINGS,
    get_or_vendor,
    header_signature,
)


def _log(msg: str) -> None:
    sys.stderr.write(f'[migrate inventory] {msg}\n')
    sys.stderr.flush()


def forwards(apps, schema_editor):
    _log('0035_seed_bucket_csv_template_amazon_basic: START')
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    vendor = get_or_vendor(apps, 'Amazon', 'AMZN')
    sig = header_signature(AMAZON_HEADERS)
    CSVTemplate.objects.update_or_create(
        vendor=vendor,
        header_signature=sig,
        defaults={
            'name': 'Amazon Basic',
            'column_mappings': AMAZON_MAPPINGS,
            'is_default': True,
        },
    )
    _log('0035_seed_bucket_csv_template_amazon_basic: END')


def backwards(apps, schema_editor):
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    CSVTemplate.objects.filter(name='Amazon Basic').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0034_seed_bucket_csv_template_costco_basic'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
