"""Reseed Open / Day / Close with the 52 items. History stays.

Definitions, titles, and due times update in place. Runs, submissions, and
idle prompts are left alone so a mid-week migrate cannot zero the dashboard.
Reverse is a no-op.
"""
from django.db import migrations

from apps.routines.program import apply_program


def reseed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    apply_program(Routine)


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0007_work_cycle_prompt'),
    ]

    operations = [
        migrations.RunPython(reseed, noop),
    ]
