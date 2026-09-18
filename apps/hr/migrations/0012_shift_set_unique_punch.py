from django.db import migrations, models


def apply_set(apps, schema_editor):
    from apps.hr.shift_set import apply_shift_set
    apply_shift_set(apps=apps)


class Migration(migrations.Migration):

    # Seed writes Shift rows, then this file adds a unique index. Postgres
    # refuses CREATE INDEX in the same transaction as those writes.
    atomic = False

    dependencies = [
        ('hr', '0011_retail_and_management_names'),
        ('routines', '0014_shift_fk_expected'),
    ]

    operations = [
        migrations.RunPython(apply_set, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='shift',
            constraint=models.UniqueConstraint(
                condition=models.Q(('punch_code__gt', '')),
                fields=('punch_code',),
                name='hr_shift_punch_code_unique',
            ),
        ),
    ]
