"""One consent record per job application that ticked the text box (live since 2026-10-06, v2.137.0).

The application keeps its own copy (sms_consent, _at, _version, _text); this is the record texting checks.
Practice runs are left out. Running it twice adds nothing.
"""
import re

from django.db import migrations


def _digits(phone):
    raw = re.sub(r'\D', '', phone or '')
    if len(raw) == 11 and raw.startswith('1'):
        raw = raw[1:]
    return raw if len(raw) == 10 else ''


def forward(apps, schema_editor):
    Application = apps.get_model('hiring', 'Application')
    TextConsent = apps.get_model('texting', 'TextConsent')
    for app in Application.objects.filter(sms_consent=True, is_practice=False):
        number = _digits(app.phone)
        ref = f'hiring.application:{app.pk}'
        if not number or TextConsent.objects.filter(ref=ref).exists():
            continue
        TextConsent.objects.create(
            phone=number, kind='job', opted_in=True, at=app.sms_consent_at or app.created_at,
            how='Online job application (ecothrift.us/careers)', wording_version=app.sms_consent_version,
            wording=app.sms_consent_text, ref=ref,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('texting', '0001_initial'),
        ('hiring', '0013_texts'),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
