from django.db import migrations


def seed_recovery_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in (
        ('inventory_recovery_estimate', False, "Recovery estimate (owner's switch): show what similar items keep of retail at Preprocessing and check-in, price from it when there is no trained model, and flag categories priced high or low on Inventory review."),
        ('inventory_recovery_prior_n', 30, 'Recovery estimate: how many sales a source needs before it counts as much as its parent (each source is pulled toward its parent by this many sales).'),
        ('inventory_recovery_band_share', 0.20, 'Recovery estimate: the suggested price band, this far either side of retail x recovery.'),
        ('inventory_review_price_gap_share', 0.25, 'Inventory review: flag Priced high or Priced low when the shelf asks this much more or less of retail than sold items kept.'),
        ('inventory_review_price_min_n', 20, 'Inventory review: the priced high / low flags need at least this many sales with a retail over 12 weeks.'),
    ):
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0123_restoration_request'),
        ('core', '0012_app_error'),
    ]

    operations = [
        migrations.RunPython(seed_recovery_settings, migrations.RunPython.noop),
    ]
