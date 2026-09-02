# Placeholder. Opening checklists are authored in the editor.

from django.db import migrations


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(noop, noop),
    ]
