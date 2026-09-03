"""Missed-if-not-done clock, separate from Counts as late."""
from django.db import migrations, models


def seed_expire(apps, schema_editor):
    from apps.routines.program import apply_expire
    Routine = apps.get_model('routines', 'Routine')
    apply_expire(Routine)


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0008_retail_program_v2'),
    ]

    operations = [
        migrations.AddField(
            model_name='routine',
            name='expire_rule',
            field=models.CharField(
                choices=[
                    ('never', 'Never (can still fill it late)'),
                    ('end_of_day', 'End of that day'),
                    ('end_of_week', 'End of that week'),
                    ('after', 'After a duration'),
                ],
                default='never',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='routine',
            name='expire_count',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='routine',
            name='expire_unit',
            field=models.CharField(
                choices=[
                    ('hours', 'Hours'),
                    ('days', 'Days'),
                    ('weeks', 'Weeks'),
                    ('months', 'Months'),
                ],
                default='hours',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='routine',
            name='expire_from_time',
            field=models.TimeField(
                blank=True,
                help_text='When expire_unit is hours, the clock that duration starts from. Blank is midnight.',
                null=True,
            ),
        ),
        migrations.RunPython(seed_expire, migrations.RunPython.noop),
    ]
