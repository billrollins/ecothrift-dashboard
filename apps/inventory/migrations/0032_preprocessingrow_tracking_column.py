"""
Step 2/5: add ``PreprocessingRow.tracking`` only.

See 0031 docstring for verbosity flags.
"""
from __future__ import annotations

import sys

from django.db import migrations, models


def _log(msg: str) -> None:
    sys.stderr.write(f'[migrate inventory] {msg}\n')
    sys.stderr.flush()


def before_preprocessingrow_tracking(apps, schema_editor):
    _log('0032_preprocessingrow_tracking_column: START AddField(PreprocessingRow.tracking)')


def after_preprocessingrow_tracking(apps, schema_editor):
    _log('0032_preprocessingrow_tracking_column: END   AddField(PreprocessingRow.tracking)')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0031_manifestrow_tracking_column'),
    ]

    operations = [
        migrations.RunPython(before_preprocessingrow_tracking, migrations.RunPython.noop),
        migrations.AddField(
            model_name='preprocessingrow',
            name='tracking',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(after_preprocessingrow_tracking, migrations.RunPython.noop),
    ]
