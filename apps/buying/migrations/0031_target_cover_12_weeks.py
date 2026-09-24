"""Owner, 2026-09-24: turn the store over in about 12 weeks, so Need's target cover is 12.

Before this the setting was 0 (auto: the store's own cover, 42.7 weeks on 2026-09-23, inflated by
overstocked categories, runner R-034). A value the owner already changed by hand is left alone.
Need scores are rebuilt by the next daily stats run.
"""
from django.db import migrations


def set_twelve(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='buying_target_cover_weeks').first()
    if row is None:
        AppSetting.objects.create(
            key='buying_target_cover_weeks',
            value=12,
            description="Buying: weeks of stock (shelf + pipeline) to hold per category; 0 = the store's own average cover.",
        )
    elif str(row.value) in ('0', '0.0', 'None', ''):
        row.value = 12
        row.save(update_fields=['value'])


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0030_category_sell_through_speed'),
    ]

    operations = [migrations.RunPython(set_twelve, migrations.RunPython.noop)]
