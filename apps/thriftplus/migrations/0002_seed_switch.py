from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='thrift_plus_enabled',
        defaults={
            'value': False,
            'description': (
                'Thrift+: the launch switch. Off until launch (2026-10-20). While off, Thrift+ stays '
                'out of the register, receipts and the customer apps; staff screens stay superuser-only.'
            ),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0001_initial'),
        ('core', '0008_approval_request'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
