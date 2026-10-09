"""Bill, 2026-10-09: the interview link email gets a short bold top line and one "Pick your interview time" button.

The saved careers setting carries its own copy of the email, so a new default alone would not reach it. This
replaces the saved copy only when it is still word for word the old default; an edited email is left alone.
"""
from django.db import migrations

SIGN_OFF = 'Eco-Thrift\n8425 West Center Road, Omaha, NE 68124\nAnother Chance for Everything and Everyone'
OLD = {
    'subject': 'Pick your interview time at Eco-Thrift',
    'body': (
        "Hi {first_name},\n\nThanks for applying for {roles}. We'd like to meet you. Pick a time that works "
        'for you here:\n\n{link}\n\nInterviews are at our Canfield store, 8425 West Center Road, and take about '
        '{length} minutes. This link is just for you and works for {link_days} days; use it later to change or '
        'cancel.\n\n' + SIGN_OFF
    ),
}
NEW = {
    'subject': 'Pick your interview time at Eco-Thrift',
    'body': (
        "We'd like to meet you\n\n"
        'Hi {first_name},\n\nThanks for applying for {roles}. The next step is a short interview at our '
        'Canfield store.\n\n'
        'Pick your interview time: {link}\n\n'
        'Interviews are at 8425 West Center Road and take about {length} minutes. This link is just for you and '
        'works for {link_days} days. Use it later to change or cancel.\n\n' + SIGN_OFF
    ),
}
KEY = 'hiring.careers'


def swap(apps, old, new):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSettingHistory = apps.get_model('core', 'AppSettingHistory')
    row = AppSetting.objects.filter(key=KEY).first()
    if row is None or not isinstance(row.value, dict):
        return
    email = row.value.get('email')
    if not isinstance(email, dict):
        return
    current = email.get('interview_invite')
    if not isinstance(current, dict) or current.get('subject') != old['subject'] or current.get('body') != old['body']:
        return
    before = row.value
    value = {**before, 'email': {**email, 'interview_invite': dict(new)}}
    row.value = value
    row.save(update_fields=['value'])
    AppSettingHistory.objects.create(key=KEY, old_value=before, new_value=value, changed_by=None)


def forward(apps, schema_editor):
    swap(apps, OLD, NEW)


def backward(apps, schema_editor):
    swap(apps, NEW, OLD)


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0014_interview_days'),
        ('core', '0003_appsettinghistory'),
    ]

    operations = [migrations.RunPython(forward, backward)]
