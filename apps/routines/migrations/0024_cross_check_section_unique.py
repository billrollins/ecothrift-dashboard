from django.db import migrations, models


def mark_cross_checks(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    RoutineRun = apps.get_model('routines', 'RoutineRun')
    routine_ids = list(
        Routine.objects.filter(system_key='retail.section_audit').values_list('pk', flat=True)
    )
    if routine_ids:
        RoutineRun.objects.filter(routine_id__in=routine_ids).update(section_scoped=True)


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0023_week_score_letter'),
    ]

    operations = [
        migrations.AddField(
            model_name='routinerun',
            name='section_scoped',
            field=models.BooleanField(
                default=False,
                help_text='True when this run is the one walk of its section for the day (cross-check or a today-only cover).',
            ),
        ),
        migrations.RunPython(mark_cross_checks, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='routinerun',
            name='routines_run_period_user',
        ),
        migrations.AddConstraint(
            model_name='routinerun',
            constraint=models.UniqueConstraint(
                condition=models.Q(('assigned_to__isnull', False), ('section_scoped', False)),
                fields=('routine', 'period_key', 'assigned_to'),
                name='routines_run_period_user',
            ),
        ),
        migrations.AddConstraint(
            model_name='routinerun',
            constraint=models.UniqueConstraint(
                condition=models.Q(('section_scoped', True), ('section__isnull', False)),
                fields=('routine', 'period_key', 'section'),
                name='routines_run_period_section',
            ),
        ),
    ]
