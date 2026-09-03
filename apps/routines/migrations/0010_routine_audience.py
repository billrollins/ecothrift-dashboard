"""Person / shift / department audience, separate from standing role."""
from django.db import migrations, models


def backfill(apps, schema_editor):
    from apps.routines.program import apply_audience
    Routine = apps.get_model('routines', 'Routine')
    through = Routine.assigned_users.through
    for row in Routine.objects.all():
        if row.system_key:
            continue
        user_ids = list(through.objects.filter(routine_id=row.pk).values_list('user_id', flat=True))
        if user_ids:
            row.audience_type = 'person'
            row.audience_all = False
        elif row.assigned_department_id:
            row.audience_type = 'department'
            row.audience_all = False
            row.assigned_department_ids = [row.assigned_department_id]
        else:
            row.audience_type = 'person'
            row.audience_all = True
        row.save()
    apply_audience(Routine)


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0009_routine_expire'),
    ]

    operations = [
        migrations.AlterField(
            model_name='routine',
            name='assignment',
            field=models.CharField(
                choices=[
                    ('pooled', 'One shared: anyone matching can complete it'),
                    ('per_person', 'Each: every match owes their own'),
                ],
                default='pooled',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='routine',
            name='audience_type',
            field=models.CharField(
                choices=[
                    ('person', 'Person'),
                    ('shift', 'Shift'),
                    ('department', 'Department'),
                ],
                default='person',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='routine',
            name='audience_all',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='routine',
            name='assigned_shifts',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='routine',
            name='assigned_department_ids',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
