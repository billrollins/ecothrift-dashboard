from django.db import migrations


def seed_shrink_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in (
        ('shrink_age_start_days', 90, 'Shrink by age: an item on the shelf unseen this many days starts to count as maybe gone.'),
        ('shrink_age_lost_days', 180, 'Shrink by age: unseen this many days, an item counts as lost.'),
        ('shrink_age_start_pct', 0.10, 'Shrink by age: the chance an item is gone at the start; it rises in a straight line to 100% at the lost limit.'),
        ('shrink_count_not_found_lost', True, 'Shrink by age: items the last full count did not find (no mark, not seen since) count as lost.'),
    ):
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0112_bstock_disputes'),
        ('core', '0012_app_error'),
    ]

    operations = [
        migrations.RunPython(seed_shrink_settings, migrations.RunPython.noop),
    ]
