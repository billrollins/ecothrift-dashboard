from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='category_from_profile',
        defaults={
            'value': False,
            'description': (
                'Buying numbers (Need, recovery, category stats) count an item under its product standard category when that is a real one, not the old product category. Changes buying valuations. true = on, false = off.'
            ),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0103_seed_intake_standard_switch'),
        ('core', '0008_approval_request'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
