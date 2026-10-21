"""Owner 2026-10-21: the handbook draft matches what Dash does. No sick leave; the week schedule (Retail fixed, other
areas flex); call-ins are recorded; overtime at 1.5; nobody changes their own hours.

Only the stored draft (AppSetting ``hiring.careers`` → ``handbook.text``) changes, and only where it still has the old
sentences word for word: a passage the owner rewrote is left alone. Published (signed) versions never change; the
owner publishes a new version from People → Onboarding → Handbook.
"""
from django.db import migrations

KEY = 'hiring.careers'
PAIRS = [
    ('- Your schedule is in Dash. Check it every week.\n',
     '- Your schedule is in Dash (Me, My week). Check it every week; your manager posts the next week ahead.\n'
     '- Retail shifts are fixed times. Other areas flex: the times are the plan. On a slow day you may go home '
     'early, and on a busy one you may be asked to come in early or stay late. Your manager decides.\n'),
    ("Call or text your manager at least 2 hours before your shift. A message to a coworker doesn't count. "
     'Missing a shift without telling anyone (a no-call, no-show) twice can end your job.\n',
     "Call or text your manager at least 2 hours before your shift. A message to a coworker doesn't count. "
     'Every call-in is written down in Dash (the day, the shift and the reason) so a pattern is easy to see, and '
     'your manager will talk with you if they add up. Missing a shift without telling anyone (a no-call, '
     'no-show) twice can end your job.\n'),
    ("- Hours over 40 in a week (Monday to Sunday) are paid at time and a half. Get your manager's OK before "
     'working them.\n',
     '- Hours over 40 in a week (Monday to Sunday) are overtime, paid at time and a half (1.5 times your rate). '
     "Get your manager's OK before working them.\n"),
    ('- Your hours and pay are in Dash. If something looks wrong, tell Bill right away.\n',
     '- Your hours and pay are in Dash. If something looks wrong, send a time change request in Dash the same '
     'day. Nobody can change their own hours.\n'),
    ("- Sick days are unpaid for now. Tell your manager as early as you can. Paid sick leave, under Nebraska's "
     'paid sick leave rules, starts at the beginning of 2027.\n',
     '- There is no paid sick leave. If you are sick, call in as above, as early as you can.\n'),
]


def update(text: str) -> str:
    for old, new in PAIRS:
        text = text.replace(old, new)
    return text


def forwards(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSettingHistory = apps.get_model('core', 'AppSettingHistory')
    row = AppSetting.objects.filter(key=KEY).first()
    if row is None or not isinstance(row.value, dict):
        return
    handbook = row.value.get('handbook')
    if not isinstance(handbook, dict) or not isinstance(handbook.get('text'), str):
        return
    new_text = update(handbook['text'])
    if new_text == handbook['text']:
        return
    old_value = row.value
    row.value = {**row.value, 'handbook': {**handbook, 'text': new_text}}
    row.save(update_fields=['value', 'updated_at'])
    AppSettingHistory.objects.create(key=KEY, old_value=old_value, new_value=row.value, changed_by=None)


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0019_offer_level_checklist'),
        ('core', '0011_ai_model_prices'),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
