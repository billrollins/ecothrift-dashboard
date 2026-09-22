from django.db import migrations, models


def mark_cross_checks(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    RoutineRun = apps.get_model('routines', 'RoutineRun')
    routine_ids = list(
        Routine.objects.filter(system_key='retail.section_audit').values_list('pk', flat=True)
    )
    if routine_ids:
        RoutineRun.objects.filter(routine_id__in=routine_ids).update(section_scoped=True)


def drop_duplicate_section_runs(apps, schema_editor):
    """Keep one scoped run per section per day. Prefer a finished one, then an assignee."""
    RoutineRun = apps.get_model('routines', 'RoutineRun')
    groups = (
        RoutineRun.objects.filter(section_scoped=True, section_id__isnull=False)
        .values('routine_id', 'period_key', 'section_id')
        .order_by()
    )
    seen = {}
    for row in groups:
        key = (row['routine_id'], row['period_key'], row['section_id'])
        seen[key] = seen.get(key, 0) + 1
    for (routine_id, period_key, section_id), count in seen.items():
        if count < 2:
            continue
        rows = list(
            RoutineRun.objects.filter(
                routine_id=routine_id,
                period_key=period_key,
                section_id=section_id,
                section_scoped=True,
            )
        )

        def rank(row):
            finished = 0 if row.status == 'done' else 1
            assigned = 0 if row.assigned_to_id else 1
            return (finished, assigned, row.id)

        rows.sort(key=rank)
        for extra in rows[1:]:
            extra.delete()


class Migration(migrations.Migration):

    # Deletes fire row triggers. PostgreSQL refuses CREATE INDEX in that same
    # transaction, so each step commits on its own.
    atomic = False

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
        migrations.RunPython(drop_duplicate_section_runs, migrations.RunPython.noop),
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
