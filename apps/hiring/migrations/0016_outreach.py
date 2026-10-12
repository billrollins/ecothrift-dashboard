"""Reaching applicants (owner 2026-10-12): when the Initial and the Reminder went out, by email and by text. The
email times are filled in from the history (the interview link and "Don't miss out" emails already sent)."""
from django.db import migrations, models


def backfill(apps, schema_editor):
    Application = apps.get_model('hiring', 'Application')
    ApplicationEvent = apps.get_model('hiring', 'ApplicationEvent')
    for field, key in (('invite_emailed_at', 'interview_invite'), ('reminder_emailed_at', 'interview_nudge')):
        firsts = {}
        for row in (ApplicationEvent.objects.filter(kind='email', data__email=key)
                    .order_by('at').values('application_id', 'at', 'data')):
            if (row['data'] or {}).get('sent') is False:
                continue
            firsts.setdefault(row['application_id'], row['at'])
        for app_id, at in firsts.items():
            Application.objects.filter(pk=app_id).update(**{field: at})


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0015_interview_invite_v2'),
    ]

    operations = [
        migrations.AddField(model_name='application', name='invite_emailed_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='application', name='reminder_emailed_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='application', name='invite_texted_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='application', name='reminder_texted_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
