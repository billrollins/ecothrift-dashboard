"""Seed the Retail QA program: seven routines and the numbers that grade them.

The three checklists ship with short placeholders on purpose. Open, Day, and
Close are the store's own words and belong in the editor, not in a migration;
what has to exist up front is the wiring - which routine verifies which, when
each nags, and how the day is scored.
"""
from datetime import time

from django.db import migrations

DEFAULTS = {
    'retail_qa.owner_weight': (0.5, "Weight of the owner's spot check on a day that has one."),
    'retail_qa.weekly_daily_weight': (0.75, 'Weight of the daily average in the weekly grade.'),
    'retail_qa.late_credit': (0.5, 'Credit a checklist keeps when it was done late.'),
    'retail_qa.grade_a': (90, 'Lowest score that still earns an A.'),
    'retail_qa.grade_b': (80, 'Lowest score that still earns a B.'),
    'retail_qa.grade_c': (70, 'Lowest score that still earns a C.'),
    'retail_qa.grade_d': (60, 'Lowest score that still earns a D.'),
    'retail_qa.audit_minor_max': (2, 'Issues in one cross-check category that still score 75.'),
    'retail_qa.audit_needs_work_max': (5, 'Issues in one cross-check category that still score 50.'),
    'retail_qa.audit_min_items': (20, 'Items an auditor must inspect before a cross-check counts.'),
    'retail_qa.spot_check_count': (2, "Random checks drawn into the owner's daily spot check."),
}


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


OPEN = _checklist('open', 'Opening', [
    ('lights', 'Lights and music on', 'pass_fail_strict'),
    ('register', 'Register counted and signed in', 'pass_fail_strict'),
    ('entry', 'Entry and walkway clear', 'pass_fail_strict'),
])

DAY = _checklist('day', 'Work cycle', [
    ('shelf', 'Shelf check done', 'pass_fail_strict'),
    ('non_shelf', 'Non-shelf check done', 'pass_fail_strict'),
    ('project', 'Project worked', 'text'),
])

CLOSE = _checklist('close', 'Closing', [
    ('floor', 'Floor walked and faced', 'pass_fail_strict'),
    ('register_out', 'Register counted and closed', 'pass_fail_strict'),
    ('locked', 'Doors locked, alarm set', 'pass_fail_strict'),
])

LOCKED = {'template_version': 1, 'sections': []}


def seed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    Department = apps.get_model('hr', 'Department')
    AppSetting = apps.get_model('core', 'AppSetting')
    User = apps.get_model('accounts', 'User')

    for key, (value, description) in DEFAULTS.items():
        AppSetting.objects.get_or_create(
            key=key, defaults={'value': value, 'description': description},
        )

    retail = Department.objects.filter(name__iexact='Retail').first()
    if retail is None:
        retail = Department.objects.filter(name__icontains='retail').first()
    department_id = retail.pk if retail else None

    def routine(system_key, **fields):
        row, _ = Routine.objects.get_or_create(
            system_key=system_key,
            defaults={
                'assigned_department_id': department_id,
                'assigned_role': 'Staff',
                'weekdays': [],
                'subject_pool': [],
                'late_after': 'end_of_day',
                'grace_days': 0,
                **fields,
            },
        )
        return row

    open_run = routine(
        'retail.open',
        title='Retail - Opening',
        intro='First hour of the day, and a look at how the store was left.',
        kind='checklist',
        definition=OPEN,
        trigger='daily',
        remind_time=time(9, 0),
        due_time=time(10, 0),
        assignment='pooled',
    )
    day_run = routine(
        'retail.day',
        title='Retail - Day shift',
        intro='Shelf checks, non-shelf checks, projects. Nobody sits down.',
        kind='checklist',
        definition=DAY,
        trigger='daily',
        remind_time=time(12, 0),
        due_time=None,
        assignment='pooled',
    )
    close_run = routine(
        'retail.close',
        title='Retail - Closing',
        intro='Leave it the way you want to find it.',
        kind='checklist',
        definition=CLOSE,
        trigger='daily',
        remind_time=time(17, 50),
        due_time=time(18, 0),
        assignment='pooled',
    )

    # Each shift signs off the one before it, so a slip is caught within a day.
    open_run.verifies_id = close_run.pk
    day_run.verifies_id = open_run.pk
    close_run.verifies_id = day_run.pk
    Routine.objects.bulk_update([open_run, day_run, close_run], ['verifies'])

    routine(
        'retail.section_tally',
        title='My section - daily check',
        intro='Walk your section and log what you had to put right.',
        kind='section_tally',
        definition=LOCKED,
        trigger='daily',
        remind_time=time(12, 0),
        due_time=None,
        assignment='per_person',
        subject_source='my_section',
    )
    routine(
        'retail.section_audit',
        title="Tuesday cross-check",
        intro="Somebody else's section, counted the way you would want yours counted.",
        kind='section_audit',
        definition=LOCKED,
        trigger='daily',
        weekdays=[1],
        remind_time=time(9, 0),
        due_time=None,
        assignment='per_person',
        subject_source='other_section',
    )
    spot = routine(
        'retail.owner_spot',
        title='Owner spot check',
        intro='Two checks at random and one section, top to bottom.',
        kind='owner_spot',
        definition=LOCKED,
        trigger='daily',
        remind_time=time(9, 0),
        due_time=None,
        assignment='per_person',
    )
    routine(
        'retail.work_cycle',
        title='Work cycle',
        intro='Shelf check, non-shelf check, or a project. Log it and carry on.',
        kind='checklist',
        definition=DAY,
        trigger='on_demand',
        remind_time=None,
        due_time=None,
        assignment='pooled',
    )

    superusers = list(User.objects.filter(is_superuser=True, is_active=True))
    if superusers and not spot.assigned_users.exists():
        spot.assigned_users.set(superusers)


def unseed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    AppSetting = apps.get_model('core', 'AppSetting')
    Routine.objects.filter(system_key__startswith='retail.').delete()
    AppSetting.objects.filter(key__startswith='retail_qa.').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0004_retail_qa_fields'),
        ('hr', '0001_initial'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
