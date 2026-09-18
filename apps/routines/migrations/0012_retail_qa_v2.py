from datetime import time

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

from apps.routines.settings import DEFAULTS, RETIRED_KEYS, SETTING_HELP


NEW_KEYS = {
    f'retail_qa.{name}': (value, SETTING_HELP.get(name, ''))
    for name, value in DEFAULTS.items()
}
OLD_KEYS = [f'retail_qa.{name}' for name in RETIRED_KEYS]


def seed_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, (value, description) in NEW_KEYS.items():
        row, created = AppSetting.objects.get_or_create(
            key=key, defaults={'value': value, 'description': description},
        )
        if not created and key == 'retail_qa.spot_check_count' and row.value == 2:
            row.value = 3
            row.description = description
            row.save(update_fields=['value', 'description'])
    AppSetting.objects.filter(key__in=OLD_KEYS).delete()


def unseed_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.filter(key__in=NEW_KEYS.keys()).delete()


def seed_shifts(apps, schema_editor):
    Department = apps.get_model('hr', 'Department')
    Shift = apps.get_model('hr', 'Shift')
    retail = (
        Department.objects.filter(name__iexact='Retail').first()
        or Department.objects.filter(name__icontains='retail').first()
    )
    if retail is None:
        return
    weekdays = [1, 2, 3, 4, 5]
    templates = [
        ('Retail Opening', time(9, 0), time(12, 0), 'retail_open'),
        ('Retail Day', time(10, 0), time(17, 0), 'retail_day'),
        ('Retail Close', time(16, 0), time(18, 0), 'retail_close'),
        ('Retail CS', time(10, 0), time(18, 0), 'retail_cs'),
    ]
    for name, time_in, time_out, punch in templates:
        Shift.objects.get_or_create(
            department_id=retail.pk,
            name=name,
            defaults={
                'time_in': time_in,
                'time_out': time_out,
                'weekdays': weekdays,
                'punch_code': punch,
                'is_active': True,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('routines', '0011_remove_routine_subject_pool'),
        ('core', '0003_appsettinghistory'),
        ('hr', '0007_shift_schedule'),
    ]

    operations = [
        migrations.CreateModel(
            name='SectionObservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('observed_at', models.DateTimeField()),
                ('kind', models.CharField(choices=[
                    ('tally', 'Section tally'),
                    ('audit', 'Cross-check'),
                    ('spot', 'Owner spot'),
                    ('walk', 'Work-cycle walk'),
                ], max_length=12)),
                ('items_inspected', models.PositiveIntegerField(default=0)),
                ('count_facing', models.PositiveIntegerField(default=0)),
                ('count_reshelf', models.PositiveIntegerField(default=0)),
                ('count_reprep', models.PositiveIntegerField(default=0)),
                ('count_security', models.PositiveIntegerField(default=0)),
                ('total', models.PositiveIntegerField(default=0)),
                ('safety', models.BooleanField(default=False)),
                ('hours_since_tally', models.FloatField(blank=True, null=True)),
                ('in_baseline', models.BooleanField(default=True)),
                ('excluded_reason', models.CharField(blank=True, default='', max_length=80)),
                ('actor', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='section_observations', to=settings.AUTH_USER_MODEL,
                )),
                ('run', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='observations', to='routines.routinerun',
                )),
                ('section', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='observations', to='routines.section',
                )),
                ('submission', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='observations', to='routines.routinesubmission',
                )),
                ('tally_run', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='spot_observations', to='routines.routinerun',
                )),
            ],
            options={'ordering': ['-observed_at']},
        ),
        migrations.AddIndex(
            model_name='sectionobservation',
            index=models.Index(fields=['section', 'kind', 'observed_at'], name='routines_ob_sec_kind_idx'),
        ),
        migrations.AddIndex(
            model_name='sectionobservation',
            index=models.Index(fields=['actor', 'kind', 'observed_at'], name='routines_ob_act_kind_idx'),
        ),
        migrations.AddIndex(
            model_name='sectionobservation',
            index=models.Index(fields=['in_baseline', 'kind'], name='routines_ob_base_kind_idx'),
        ),
        migrations.CreateModel(
            name='CheckerFlag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[
                    ('low_findings', 'Low trailing findings'),
                    ('owner_followup', 'Owner follow-up'),
                    ('speed', 'Too fast'),
                    ('batch', 'Batch submit'),
                    ('pairing', 'Pairing'),
                    ('rubber_stamp', 'Rubber-stamp verify'),
                ], max_length=20)),
                ('raised_at', models.DateTimeField()),
                ('window_start', models.DateField()),
                ('window_end', models.DateField()),
                ('evidence', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(choices=[
                    ('open', 'Open'),
                    ('acknowledged', 'Acknowledged'),
                    ('cleared', 'Cleared'),
                    ('escalated', 'Escalated'),
                ], default='open', max_length=16)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('note', models.TextField(blank=True, default='')),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='checker_flags_reviewed', to=settings.AUTH_USER_MODEL,
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='checker_flags', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-raised_at']},
        ),
        migrations.AddIndex(
            model_name='checkerflag',
            index=models.Index(fields=['user', 'status', 'kind'], name='routines_fl_user_st_idx'),
        ),
        migrations.CreateModel(
            name='SectionAssignmentEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[
                    ('owner', 'Section owner'),
                    ('cross_checker', 'Cross-checker'),
                    ('closed_for_day', 'Closed for the day'),
                    ('reopened', 'Reopened'),
                ], max_length=20)),
                ('for_date', models.DateField()),
                ('at', models.DateTimeField(auto_now_add=True)),
                ('assigned_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='section_assignments_made', to=settings.AUTH_USER_MODEL,
                )),
                ('previous_user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to=settings.AUTH_USER_MODEL,
                )),
                ('section', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assignment_events', to='routines.section',
                )),
                ('user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='section_assignment_events', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-at']},
        ),
        migrations.AddIndex(
            model_name='sectionassignmentevent',
            index=models.Index(fields=['section', 'for_date', 'kind'], name='routines_as_sec_day_idx'),
        ),
        migrations.CreateModel(
            name='SectionBaselineSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_monday', models.DateField()),
                ('n', models.PositiveIntegerField(default=0)),
                ('mean', models.FloatField(default=0)),
                ('var', models.FloatField(default=0)),
                ('warm', models.BooleanField(default=True)),
                ('store_mean', models.FloatField(default=0)),
                ('store_var', models.FloatField(default=0)),
                ('section', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='baseline_snapshots', to='routines.section',
                )),
            ],
            options={'ordering': ['-week_monday']},
        ),
        migrations.AddConstraint(
            model_name='sectionbaselinesnapshot',
            constraint=models.UniqueConstraint(fields=('section', 'week_monday'), name='routines_baseline_section_week'),
        ),
        migrations.CreateModel(
            name='WeekScoreSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_monday', models.DateField(unique=True)),
                ('score', models.FloatField(blank=True, null=True)),
                ('letter', models.CharField(blank=True, default='', max_length=1)),
                ('doing', models.FloatField(blank=True, null=True)),
                ('cross', models.FloatField(blank=True, null=True)),
                ('owner', models.FloatField(blank=True, null=True)),
                ('settings', models.JSONField(blank=True, default=dict)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('finalized_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['-week_monday']},
        ),
        migrations.RunPython(seed_settings, unseed_settings),
        migrations.RunPython(seed_shifts, migrations.RunPython.noop),
    ]
