"""One-time Retail QA cleanup: drop authored leftovers, lock the program.

Authored routines from the first pass (the extra opening checklist, any
scratch work) go away. The seven program rows keep their keys and get titles
without dashes, a Day list that is a leave-behind check, and Work cycle as
its own kind. Reverse is a no-op: the purge cannot be undone.
"""
from datetime import time

from django.db import migrations


def _checklist(section_id, title, checks):
    return {
        'template_version': 1,
        'sections': [{
            'id': section_id,
            'title': title,
            'checks': [
                {'id': cid, 'label': label, 'control': control, 'hint': '', 'unit': '', 'critical': False}
                for cid, label, control in checks
            ],
        }],
    }


DAY = _checklist('day', 'Before you leave', [
    ('shelf_logged', 'Shelf checks logged', 'pass_fail_strict'),
    ('non_shelf_logged', 'Non-shelf checks logged', 'pass_fail_strict'),
    ('project', 'Project moved', 'pass_fail_strict'),
    ('handoff', 'Floor handed off', 'pass_fail_strict'),
])

LOCKED = {'template_version': 1, 'sections': []}

TITLES = {
    'retail.open': ('Retail opening', 'First hour of the day, and a look at how the store was left.'),
    'retail.day': ('Retail day shift', 'Before you leave: the walks were logged, the project moved, the floor handed off.'),
    'retail.close': ('Retail closing', 'Leave it the way you want to find it.'),
    'retail.section_tally': ('My section daily check', 'Walk your section and log what you had to put right.'),
    'retail.section_audit': ("Tuesday cross-check", "Somebody else's section, counted the way you would want yours counted."),
    'retail.owner_spot': ('Owner spot check', 'Two checks at random and one section, top to bottom.'),
    'retail.work_cycle': ('Work cycle', 'Log a shelf check or a non-shelf check, then carry on.'),
}


def cleanup(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    RoutineSubmission = apps.get_model('routines', 'RoutineSubmission')
    AppSetting = apps.get_model('core', 'AppSetting')

    leftovers = Routine.objects.filter(system_key__isnull=True)
    leftover_ids = list(leftovers.values_list('pk', flat=True))
    # Submissions protect the routine. History of authored leftovers goes with
    # them; program rows and their runs stay.
    RoutineSubmission.objects.filter(run__routine_id__in=leftover_ids).delete()
    RoutineSubmission.objects.filter(routine_id__in=leftover_ids).delete()
    leftovers.delete()

    AppSetting.objects.get_or_create(
        key='retail_qa.idle_prompt_minutes',
        defaults={
            'value': 5,
            'description': 'Minutes with no cart on the register before the work-cycle prompt appears.',
        },
    )

    for key, (title, intro) in TITLES.items():
        Routine.objects.filter(system_key=key).update(title=title, intro=intro)

    Routine.objects.filter(system_key='retail.day').update(definition=DAY)
    Routine.objects.filter(system_key='retail.work_cycle').update(
        kind='work_cycle',
        definition=LOCKED,
        intro=TITLES['retail.work_cycle'][1],
    )


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0005_seed_retail_qa'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(cleanup, noop),
    ]
