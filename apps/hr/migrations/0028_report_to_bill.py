"""Dash Update #183, "Report it to Bill" (Bill, 2026-11-17).

- ``hr.incident_alerts_to``: who is texted on every new incident report (a user id; Settings > People > Incidents).
  Seeded with Bill: the active superuser named Bill Rollins, or blank when there is none (local or test databases).
- The policy "Report It to Bill the Same Day" as an e-sign template (kind ``policy``), its words as Bill wrote them.
  Nothing is sent here: Bill sends it from HR > Requests > Documents > Sent to everyone, which shows who has signed.
"""
from django.db import migrations

ALERT_SETTING = 'hr.incident_alerts_to'
TEMPLATE_NAME = 'Report It to Bill the Same Day'

SECTIONS = [
    {'heading': 'Applies to',
     'body': 'Everyone who works at Eco-Thrift, including owners, managers, family members and volunteers.'},
    {'heading': 'The rule',
     'body': 'If you see, hear or receive any of the things below, report it to Bill the same day:\n\n'
             '- An injury or near miss, to anyone (staff, customer, vendor), however small, even if the person says '
             'they are fine.\n'
             '- Something someone says that could turn into a claim: "I\'ll get it checked out," "I hurt my back '
             'lifting that," "I\'m going to call a lawyer," "I\'ll report you."\n'
             '- An accident or damage: falls, vehicles in the lot, property damage, theft.\n'
             '- A complaint about pay, hours, treatment, harassment or safety.\n'
             '- A letter, email or call from a government agency, court, attorney, insurer or landlord.\n'
             '- A bill, past-due notice or payment request.\n'
             '- Anything you are unsure about. If you are asking yourself whether to report it, report it.'},
    {'heading': 'How to report',
     'body': 'Use Dash → HR → Incidents (fastest; Bill is notified right away), or text or tell Bill directly. Mail '
             'goes in the office mail tray unopened; only Bill empties it.'},
    {'heading': 'Whoever hears it, reports it',
     'body': 'Telling a coworker, a manager or another owner does not count as reporting it to Bill. If someone tells '
             'you, you report it.'},
    {'heading': 'What happens next',
     'body': 'Bill handles the follow-up: insurance, paperwork and answers. Do not promise anything, pay anything or '
             'decide anything yourself.'},
    {'heading': 'No retaliation',
     'body': 'No one will be disciplined for reporting an injury, a complaint or a mistake in good faith. Not '
             'reporting is what breaks this policy.'},
    {'heading': 'Breaking this policy',
     'body': 'Breaking this policy (not reporting, or holding something back) is a policy violation and can lead to '
             'discipline, up to and including dismissal.'},
]
ACKNOWLEDGMENTS = ['I have read this policy and will follow it.']


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    User = apps.get_model('accounts', 'User')
    Template = apps.get_model('esign', 'Template')
    TemplateVersion = apps.get_model('esign', 'TemplateVersion')

    bill = (User.objects.filter(is_superuser=True, is_active=True, first_name__iexact='Bill',
                                last_name__iexact='Rollins').order_by('pk').first())
    AppSetting.objects.get_or_create(key=ALERT_SETTING, defaults={
        'value': bill.pk if bill else '',
        'description': 'Incident alerts go to: texted on every new incident report (the Dash message to owners stays).',
    })

    if not Template.objects.filter(name=TEMPLATE_NAME).exists():
        template = Template.objects.create(name=TEMPLATE_NAME, kind='policy', created_by=bill)
        TemplateVersion.objects.create(
            template=template, number=1, title='Policy: Report It to Bill the Same Day', sections=SECTIONS,
            fields=[], acknowledgments=ACKNOWLEDGMENTS, note='First version (Dash Update #183)', created_by=bill)


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0027_schedule_request_change'),
        ('core', '0017_photo_drop'),
        ('esign', '0002_pdf_batches_purge'),
        ('accounts', '0023_staff_photo_next_review'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
