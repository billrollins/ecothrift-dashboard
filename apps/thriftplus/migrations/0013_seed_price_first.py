"""The scanner's look (owner 2026-10-10): price first, with a switch to make ThriftBucks the big number."""
from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(key='thrift_plus_price_first', defaults={
        'value': True,
        'description': 'Thrift+ scanner: on, the price is the big number (item card and cart total) and ThriftBucks sit '
                       'smaller below it; off, ThriftBucks are the big number.',
    })


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0012_account_is_practice'),
        ('core', '0008_approval_request'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
