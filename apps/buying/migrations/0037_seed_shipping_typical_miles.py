from django.db import migrations

KEY = 'buying_shipping_typical_miles'


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(key=KEY, defaults={
        'value': 0,
        'description': (
            'Buying: the distance (miles) the shipping formula uses for a lot whose city is unknown. '
            '0 = off: pallets x $ per pallet instead. The median of recent listings was 1,176 mi (2026-09-24).'
        ),
    })


def unseed(apps, schema_editor):
    apps.get_model('core', 'AppSetting').objects.filter(key=KEY).delete()


class Migration(migrations.Migration):
    dependencies = [('buying', '0036_seed_price_target_assumptions')]
    operations = [migrations.RunPython(seed, unseed)]
