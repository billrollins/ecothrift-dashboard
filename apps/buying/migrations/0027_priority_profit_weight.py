from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='buying_priority_profit_weight',
        defaults={
            'value': 0.5,
            'description': (
                "Buying: profit's share of auction Priority (0-1); the rest is Need. Auctions with "
                'no category mix use Need only.'
            ),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0026_category_stats_need_v2'),
        ('core', '0003_appsettinghistory'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
