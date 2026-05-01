"""
Step 1/5: add ``ManifestRow.tracking`` only (JSON column, no GIN).

Progress is printed to stderr before/after the DDL so you can see where time is spent.
For SQL detail: ``python manage.py migrate inventory -v 2`` (or ``-v 3``).

Optional GIN later (maintenance window)::

    CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_mr_tracking_gin
        ON inventory_manifestrow USING gin (tracking);
"""
from __future__ import annotations

import sys

from django.db import migrations, models


def _log(msg: str) -> None:
    sys.stderr.write(f'[migrate inventory] {msg}\n')
    sys.stderr.flush()


def before_manifestrow_tracking(apps, schema_editor):
    _log('0031_manifestrow_tracking_column: START AddField(ManifestRow.tracking)')


def after_manifestrow_tracking(apps, schema_editor):
    _log('0031_manifestrow_tracking_column: END   AddField(ManifestRow.tracking)')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0030_standard_manifest_refactor'),
    ]

    operations = [
        migrations.RunPython(before_manifestrow_tracking, migrations.RunPython.noop),
        migrations.AddField(
            model_name='manifestrow',
            name='tracking',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(after_manifestrow_tracking, migrations.RunPython.noop),
    ]
