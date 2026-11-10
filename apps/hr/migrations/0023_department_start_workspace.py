"""Department "Starts in" (#86): the menu workspace a department's people open on.

Filled from the name for the departments the store has today; Office (and any other) stays blank, which means
the house default. Workspace ids are the front end's (`frontend/src/navigation/slotCNavLayout.ts`).
"""
from django.db import migrations, models


START_BY_NAME = {
    'retail': 'storeSales',
    'processing': 'processing',
    'restoration': 'restoration',
}


def fill(apps, schema_editor):
    Department = apps.get_model('hr', 'Department')
    for row in Department.objects.filter(start_workspace=''):
        start = START_BY_NAME.get(row.name.strip().lower())
        if start:
            row.start_workspace = start
            row.save(update_fields=['start_workspace'])


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0022_wifi_clock_join'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='start_workspace',
            field=models.CharField(blank=True, db_default='', default='', max_length=40),
        ),
        migrations.RunPython(fill, migrations.RunPython.noop),
    ]
