"""Owner 2026-10-20: three pay levels and a weekly overtime allowance on the employee profile.

* ``level`` (entry / senior / manager): every existing employee lands in the level their pay rate falls in. Pay
  between two ranges (17.50) goes to the lower level; nothing set is Entry.
* ``overtime_allowance_hours``: 0 for everyone (no overtime). The lead coder sets Ashley's 5 through a request.
* The ranges are one owner-editable setting, ``hr.pay_levels``; it is created here with the defaults.
"""
from decimal import Decimal

from django.db import migrations, models

KEY = 'hr.pay_levels'
DEFAULT = {
    'entry': {'min': 15, 'max': 17},
    'senior': {'min': 18, 'max': 19},
    'manager': {'min': 20, 'max': None},
}


def backfill(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key=KEY).first()
    if row is None:
        AppSetting.objects.create(key=KEY, value=DEFAULT, description='Pay levels: Entry, Senior, Manager hourly ranges')
    senior, manager = Decimal('18'), Decimal('20')
    EmployeeProfile = apps.get_model('accounts', 'EmployeeProfile')
    for profile in EmployeeProfile.objects.all():
        rate = profile.pay_rate or Decimal('0')
        level = 'manager' if rate >= manager else 'senior' if rate >= senior else 'entry'
        if profile.level != level:
            profile.level = level
            profile.save(update_fields=['level'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_user_last_active_at'),
        ('core', '0011_ai_model_prices'),
    ]

    operations = [
        migrations.AddField(
            model_name='employeeprofile',
            name='level',
            field=models.CharField(choices=[('entry', 'Entry'), ('senior', 'Senior'), ('manager', 'Manager')],
                                   default='entry', max_length=10),
        ),
        migrations.AddField(
            model_name='employeeprofile',
            name='overtime_allowance_hours',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
