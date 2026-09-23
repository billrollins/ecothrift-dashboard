from django.db import migrations


def repair_orphan_section_drafts(apps, schema_editor):
    """Drop section drafts whose run is gone, and a blank tally beside a real one.

    A called-in park stays: that person has no second tally for the day.
    """
    Routine = apps.get_model('routines', 'Routine')
    RoutineRun = apps.get_model('routines', 'RoutineRun')
    RoutineSubmission = apps.get_model('routines', 'RoutineSubmission')

    orphans = RoutineSubmission.objects.filter(
        status='draft',
        run_id__isnull=True,
        routine__kind__in=('section_tally', 'section_audit'),
    )
    orphan_count = orphans.count()
    orphans.delete()

    tally_ids = list(
        Routine.objects.filter(system_key='retail.section_tally').values_list('pk', flat=True)
    )
    blanks = list(
        RoutineRun.objects.filter(
            routine_id__in=tally_ids,
            status='open',
            assigned_to__isnull=True,
            section_scoped=False,
        )
    )
    removed = 0
    for blank in blanks:
        names = [part.strip() for part in (blank.subject or '').split(',') if part.strip()]
        if not names:
            continue
        siblings = RoutineRun.objects.filter(
            routine_id=blank.routine_id,
            period_key=blank.period_key,
        ).exclude(pk=blank.pk)
        duplicate = False
        for sibling in siblings:
            kept = sibling.status == 'done' or (
                sibling.status == 'open' and sibling.assigned_to_id
            )
            if not kept:
                continue
            sibling_names = [
                part.strip() for part in (sibling.subject or '').split(',') if part.strip()
            ]
            if any(name in sibling_names for name in names):
                duplicate = True
                break
        if not duplicate:
            continue
        RoutineSubmission.objects.filter(run_id=blank.pk, status='draft').delete()
        blank.delete()
        removed += 1
    print(
        f'orphan section drafts deleted: {orphan_count}; '
        f'duplicate blank tallies deleted: {removed}'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0026_align_section_scope_constraint'),
    ]

    operations = [
        migrations.RunPython(repair_orphan_section_drafts, migrations.RunPython.noop),
    ]
