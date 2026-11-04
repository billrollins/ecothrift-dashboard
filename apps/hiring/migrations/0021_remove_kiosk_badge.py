"""The kiosk is gone (Dash Update #64, 2026-11-03), so the "Kiosk badge issued" onboarding item goes too.

Drops the item from the stored careers checklist (``hiring.careers`` → ``onboarding.items``) and deletes the
onboarding tasks copied from it. The handbook text is left as Bill published it.
"""
import copy

from django.db import migrations

SETTING_KEY = 'hiring.careers'


def drop_kiosk_badge(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSettingHistory = apps.get_model('core', 'AppSettingHistory')
    OnboardingTask = apps.get_model('hiring', 'OnboardingTask')

    OnboardingTask.objects.filter(key='kiosk_badge').delete()

    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    if row is None or not isinstance(row.value, dict):
        return
    onboarding = row.value.get('onboarding')
    if not isinstance(onboarding, dict) or not isinstance(onboarding.get('items'), list):
        return
    items = onboarding['items']
    kept = [i for i in items if not (isinstance(i, dict) and 'kiosk_badge' in (i.get('key'), i.get('auto')))]
    if len(kept) == len(items):
        return
    old = copy.deepcopy(row.value)
    row.value = {**row.value, 'onboarding': {**onboarding, 'items': kept}}
    row.save(update_fields=['value'])
    AppSettingHistory.objects.create(key=SETTING_KEY, old_value=old, new_value=row.value, changed_by=None)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_dash_fix_session'),
        ('hiring', '0020_handbook_schedule_call_ins'),
    ]

    operations = [
        migrations.RunPython(drop_kiosk_badge, migrations.RunPython.noop),
    ]
