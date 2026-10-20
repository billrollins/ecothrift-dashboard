"""Owner 2026-10-20: the offer carries a pay level, and the onboarding checklist gets the owner's list.

* ``Offer.level`` (blank = the level the pay rate falls in).
* The saved careers setting carries its own copy of the checklist, so a new default alone would not reach it:
  - still word for word the old default (never edited): replaced with the new default, in the owner's order;
  - edited by the owner: his items are kept as they are and the new ones he lacks (first-day email, WhatsApp, first
    payroll, the 30/60/90-day check-ins) are added at the end;
  - no saved checklist: nothing to do, the new default applies.
  Onboardings already started keep the checklist they were given.
"""
from django.db import migrations, models

KEY = 'hiring.careers'

OLD_ITEMS = [
    {'key': 'quickbooks_added', 'label': 'Added in QuickBooks Payroll (name, phone, email)', 'owner': 'owner',
     'due': 'before_day1', 'kind': 'tick', 'help': 'QuickBooks then emails them the W-4 and the direct deposit setup.'},
    {'key': 'schedule', 'label': 'On the schedule for their first two weeks', 'owner': 'manager',
     'due': 'before_day1', 'kind': 'auto', 'auto': 'schedule'},
    {'key': 'i9_section1', 'label': 'Form I-9 Section 1 filled in (on paper)', 'owner': 'new_hire', 'due': 'day1',
     'kind': 'tick', 'help': 'By the end of the first day. They fill it in themselves.'},
    {'key': 'i9_section2', 'label': 'Form I-9 Section 2: original documents seen in person, form and copies '
     'uploaded', 'owner': 'owner', 'due': 'i9', 'kind': 'i9',
     'help': 'Within 3 business days of the start. Kept apart from the employee record, Admin only.'},
    {'key': 'quickbooks_setup', 'label': 'QuickBooks setup finished (W-4 and direct deposit)', 'owner': 'new_hire',
     'due': 'day1', 'kind': 'tick', 'help': 'From the QuickBooks email. Bank numbers never go in Dash.'},
    {'key': 'emergency_contact', 'label': 'Emergency contact (ICE) on their profile', 'owner': 'new_hire',
     'due': 'day1', 'kind': 'auto', 'auto': 'emergency_contact'},
    {'key': 'dash_login', 'label': 'Signed in to Dash on their own phone', 'owner': 'new_hire', 'due': 'day1',
     'kind': 'auto', 'auto': 'dash_login', 'help': 'Show them the Set password code on day one.'},
    {'key': 'handbook', 'label': 'Handbook read and signed', 'owner': 'new_hire', 'due': 'day1', 'kind': 'handbook'},
    {'key': 'time_clock', 'label': 'Time clock explained', 'owner': 'manager', 'due': 'day1', 'kind': 'tick'},
    {'key': 'kiosk_badge', 'label': 'Kiosk badge issued', 'owner': 'manager', 'due': 'day1', 'kind': 'auto',
     'auto': 'kiosk_badge'},
    {'key': 'first_clock_in', 'label': 'First clock-in', 'owner': 'new_hire', 'due': 'day1', 'kind': 'auto',
     'auto': 'first_clock_in'},
    {'key': 'team_intro', 'label': 'Introduced to the team', 'owner': 'manager', 'due': 'day1', 'kind': 'tick'},
    {'key': 'shirts', 'label': 'T-shirts given', 'owner': 'manager', 'due': 'day1', 'kind': 'count',
     'help': 'How many, and what size.'},
    {'key': 'trained', 'label': 'Trained with their manager', 'owner': 'manager', 'due': 'week1', 'kind': 'tick'},
    {'key': 'new_hire_report', 'label': 'Nebraska new-hire report filed', 'owner': 'owner', 'due': 'day20',
     'kind': 'tick', 'help': 'Within 20 days of hire. Tick it when QuickBooks has filed it, or file it yourself.'},
]


def _same(a, b):
    """Item lists equal, ignoring blank help (the saved copy drops an empty one)."""
    def norm(items):
        return [{k: v for k, v in item.items() if not (k == 'help' and not v)} for item in items]

    return norm(a) == norm(b)


def update_checklist(apps, schema_editor):
    from apps.hiring.careers import DEFAULT_ONBOARDING

    AppSetting = apps.get_model('core', 'AppSetting')
    AppSettingHistory = apps.get_model('core', 'AppSettingHistory')
    row = AppSetting.objects.filter(key=KEY).first()
    if row is None or not isinstance(row.value, dict):
        return
    onboarding = row.value.get('onboarding')
    items = onboarding.get('items') if isinstance(onboarding, dict) else None
    if not isinstance(items, list):
        return
    new_items = [dict(item) for item in DEFAULT_ONBOARDING['items']]
    if _same(items, OLD_ITEMS):
        merged = new_items
    else:
        have = {item.get('key') for item in items if isinstance(item, dict)}
        added = [item for item in new_items if item['key'] not in have and item['key'] in (
            'first_day_email', 'whatsapp', 'first_payroll', 'checkin_30', 'checkin_60', 'checkin_90')]
        if not added:
            return
        merged = [*items, *added]
    before = row.value
    value = {**before, 'onboarding': {**onboarding, 'items': merged}}
    row.value = value
    row.save(update_fields=['value'])
    AppSettingHistory.objects.create(key=KEY, old_value=before, new_value=value, changed_by=None)


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0018_booking_code'),
        ('core', '0011_ai_model_prices'),
    ]

    operations = [
        migrations.AddField(
            model_name='offer',
            name='level',
            field=models.CharField(blank=True, default='', max_length=10),
        ),
        migrations.RunPython(update_checklist, migrations.RunPython.noop),
    ]
