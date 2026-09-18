from django.db import migrations, models


def fill_empty_assignment_days(apps, schema_editor):
    ShiftAssignment = apps.get_model('hr', 'ShiftAssignment')
    for row in ShiftAssignment.objects.select_related('shift').all():
        if row.weekdays:
            continue
        shift_days = list(row.shift.weekdays or [])
        row.weekdays = shift_days if shift_days else [0, 1, 2, 3, 4, 5, 6]
        row.save(update_fields=['weekdays'])


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0008_shiftassignment_weekdays'),
    ]

    operations = [
        migrations.AlterField(
            model_name='shiftassignment',
            name='weekdays',
            field=models.JSONField(
                default=list,
                help_text='Subset of shift days, 0=Mon … 6=Sun. Empty means assigned, but no days.',
            ),
        ),
        migrations.RunPython(fill_empty_assignment_days, migrations.RunPython.noop),
    ]
