"""The 10-12 Thrift+ policy's settings (owner answers 2026-10-14). Nothing here can break the POS: every reader falls
back to its default.

- the monthly cover and the banking bonus are retired: their settings go;
- ``thrift_plus_return_credit_share``: 0.80 (money tax included, ThriftBucks used, ThriftBucks taken back), only if the
  owner never changed it from 0.95;
- new: ``thrift_plus_instant_share`` 0.50 (B1) and ``thrift_plus_return_min_price`` 10.00 (W6);
- ``thrift_plus_nonreturnable_words``: crossbows are no longer left out as a group (W6);
- ``pos.staff_purchases``: the "Thrift+ free for staff" key goes with the cover;
- the scanner app asks no choice any more: stale answers are cleared;
- open register sales go back to kept, the Default (B1);
- returns made before this release: the credit they gave was their ``paid``.
"""
from decimal import Decimal, InvalidOperation

from django.db import migrations

RETIRED = ['thrift_plus_cover_amount', 'thrift_plus_bank_bonus']
SHARE_KEY = 'thrift_plus_return_credit_share'
SHARE_DESCRIPTION = ('Thrift+ 3-day returns: this share of what was paid for the item, tax included, comes back as '
                     'Thrift+ credit; the same share of ThriftBucks used on it comes back, and of ThriftBucks it '
                     'collected is taken back (0.80).')
NEW = [
    ('thrift_plus_instant_share', '0.50',
     'Thrift+: redeeming a trip\'s ThriftBucks instantly takes this share of their value off today\'s price (0.50). '
     'Never above 1.'),
    ('thrift_plus_return_min_price', '10.00',
     'Thrift+ 3-day returns: items at this price or less after ThriftBucks are sold AS IS (W6).'),
]
WORDS_KEY = 'thrift_plus_nonreturnable_words'
STAFF_KEY = 'pos.staff_purchases'


def forward(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppCart = apps.get_model('thriftplus', 'AppCart')
    CartMember = apps.get_model('thriftplus', 'CartMember')
    ReturnRecord = apps.get_model('thriftplus', 'ReturnRecord')

    AppSetting.objects.filter(key__in=RETIRED).delete()

    row = AppSetting.objects.filter(key=SHARE_KEY).first()
    if row is None:
        AppSetting.objects.create(key=SHARE_KEY, value='0.80', description=SHARE_DESCRIPTION)
    else:
        try:
            unchanged = Decimal(str(row.value)) == Decimal('0.95')
        except (InvalidOperation, TypeError, ValueError):
            unchanged = False
        if unchanged:
            row.value = '0.80'
        row.description = SHARE_DESCRIPTION
        row.save()

    for key, value, description in NEW:
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})

    words = AppSetting.objects.filter(key=WORDS_KEY).first()
    if words is not None and isinstance(words.value, list):
        kept = [w for w in words.value if str(w).strip().lower() != 'crossbow']
        if kept != words.value:
            words.value = kept
            words.save()

    staff = AppSetting.objects.filter(key=STAFF_KEY).first()
    if staff is not None and isinstance(staff.value, dict) and 'thrift_plus_free' in staff.value:
        value = dict(staff.value)
        value.pop('thrift_plus_free')
        staff.value = value
        staff.save()

    AppCart.objects.exclude(reward_choice='', choice_at=None).update(reward_choice='', choice_at=None)
    CartMember.objects.filter(cart__status='open').exclude(reward_choice='bank').update(reward_choice='bank')
    for record in ReturnRecord.objects.filter(credit=0).exclude(paid=0):
        record.credit = record.paid
        record.save(update_fields=['credit'])


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0016_register_10_12'),
        ('core', '0001_initial'),
        ('pos', '0036_thrift_credit_help'),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
