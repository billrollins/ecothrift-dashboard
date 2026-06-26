"""Rename restoration waiting stage/fields to pending/hold vocabulary."""

from django.db import migrations, models

REASON_KEY_MAP = {
    'waiting_for_parts': 'parts_needed',
    'waiting_for_time': 'need_more_time',
    'waiting_for_testing': 'pending_test',
    'waiting_for_repair_time': 'repair_time_needed',
    'waiting_for_tools': 'tools_needed',
    'waiting_for_approval': 'needs_approval',
    'waiting_for_research_or_sop': 'research_sop',
    'blocked_by_safety_issue': 'safety_hold',
    'stored_between_steps': 'between_steps',
    'other': 'other',
}


def migrate_waiting_data(apps, schema_editor):
    RestorationJob = apps.get_model('inventory', 'RestorationJob')
    for job in RestorationJob.objects.all().iterator():
        changed = False
        if job.stage == 'waiting':
            job.stage = 'pending'
            changed = True
        if job.waiting_reason in REASON_KEY_MAP:
            job.waiting_reason = REASON_KEY_MAP[job.waiting_reason]
            changed = True
        ws = job.work_session if isinstance(job.work_session, dict) else {}
        if isinstance(ws, dict):
            new_ws = dict(ws)
            ws_changed = False
            if new_ws.get('workState') == 'waiting':
                new_ws['workState'] = 'pending'
                ws_changed = True
            if 'waiting' in new_ws:
                hold = dict(new_ws.pop('waiting') or {})
                if 'waitingStartedAt' in hold:
                    hold['pendingStartedAt'] = hold.pop('waitingStartedAt')
                reason = hold.get('reason')
                if reason in REASON_KEY_MAP:
                    hold['reason'] = REASON_KEY_MAP[reason]
                new_ws['pending'] = hold
                ws_changed = True
            if ws_changed:
                job.work_session = new_ws
                changed = True
        if changed:
            job.save(
                update_fields=[
                    'stage',
                    'waiting_reason',
                    'work_session',
                ],
            )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0073_restoration_job_timer_started_by'),
    ]

    operations = [
        migrations.RunPython(migrate_waiting_data, migrations.RunPython.noop),
        migrations.RenameField(
            model_name='restorationjob',
            old_name='waiting_reason',
            new_name='pending_reason',
        ),
        migrations.RenameField(
            model_name='restorationjob',
            old_name='waiting_notes',
            new_name='pending_notes',
        ),
        migrations.RenameField(
            model_name='restorationjob',
            old_name='waiting_storage_location',
            new_name='pending_storage_location',
        ),
        migrations.RenameField(
            model_name='restorationjob',
            old_name='waiting_started_at',
            new_name='pending_started_at',
        ),
        migrations.AlterField(
            model_name='restorationjob',
            name='stage',
            field=models.CharField(
                choices=[
                    ('queued', 'Queued'),
                    ('sent', 'Sent'),
                    ('bench', 'Bench'),
                    ('pending', 'Pending'),
                    ('executing', 'Executing'),
                    ('done', 'Done'),
                    ('returned', 'Returned to Processing'),
                ],
                db_index=True,
                default='queued',
                max_length=20,
            ),
        ),
    ]
