from datetime import time

from django.db import migrations, models


# Like the B-Stock pull: no system_key (it stays out of Retail QA grading, and the owner can retime, reassign,
# pause, or retire it in Routine Control). It is found by its kind. Due 11:30 (late morning); the owner moves
# that with "Hard nag at" in Routine Control. It runs only on posting days the store is open (schedule.py).
KIND = 'social_post'


def seed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    Department = apps.get_model('hr', 'Department')
    if Routine.objects.filter(kind=KIND).exists():
        return
    retail = (
        Department.objects.filter(slug='retail-operations').first()
        or Department.objects.filter(name__iexact='Retail').first()
        or Department.objects.filter(name__icontains='retail').first()
    )
    Routine.objects.create(
        title="Today's post",
        intro="Make today's post in Studios > Social Studio, post it on Facebook, and paste its link.",
        kind=KIND,
        definition={'template_version': 1, 'sections': []},
        trigger='daily',
        weekdays=[],
        remind_time=time(9, 0),
        due_time=time(11, 30),
        late_after='end_of_day',
        grace_days=0,
        expire_rule='end_of_day',
        assignment='pooled',
        audience_type='department',
        assigned_department_ids=[retail.pk] if retail else [],
        assigned_department_id=retail.pk if retail else None,
    )


def unseed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    RoutineSubmission = apps.get_model('routines', 'RoutineSubmission')
    routines = Routine.objects.filter(kind=KIND)
    RoutineSubmission.objects.filter(routine__in=routines).delete()
    RoutineSubmission.objects.filter(run__routine__in=routines).delete()
    routines.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0029_fresh_tags_routine'),
        ('hr', '0015_kiosk'),
    ]

    operations = [
        migrations.AlterField(
            model_name='routine',
            name='kind',
            field=models.CharField(choices=[('checklist', 'Checklist'), ('section_tally', 'Section tally'), ('section_audit', 'Section cross-check'), ('owner_spot', 'Spot walk'), ('work_cycle', 'Register activity'), ('bstock_pull', 'B-Stock manifest pull'), ('fresh_tags', 'Fresh-tag check'), ('social_post', "Today's post")], default='checklist', max_length=20),
        ),
        migrations.RunPython(seed, unseed),
    ]
