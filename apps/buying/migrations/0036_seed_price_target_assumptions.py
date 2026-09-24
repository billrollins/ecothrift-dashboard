from django.db import migrations

SEEDS = [
    (
        'buying_profit_factor',
        2.0,
        'Buying: revenue / all-in cost the price target must make (2.0 = double the money). '
        "An auction's own profit target overrides it.",
    ),
    (
        'buying_labor_per_item',
        0,
        'Buying: $ of labor to process one unit; counts in the landed cost and the price target. '
        '0 = not counted.',
    ),
    (
        'buying_disposal_per_pallet',
        0,
        'Buying: $ to throw away what does not sell, per pallet; counts in the landed cost and the '
        'price target. 0 = not counted.',
    ),
]


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in SEEDS:
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0035_buyer_max_notes'),
        ('core', '0007_ai_provider_meta'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
