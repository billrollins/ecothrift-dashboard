from django.db import migrations


def seed_review_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in (
        ('inventory_review_stale_days', 90, 'Inventory review: an item on the shelf longer than this many days is stale.'),
        ('inventory_review_overstock_weeks', 12, 'Inventory review: more weeks of supply than this flags Overstocked.'),
        ('inventory_review_short_weeks', 2, 'Inventory review: fewer weeks of supply than this flags Short.'),
        ('inventory_review_stale_heavy_share', 0.40, 'Inventory review: more of on hand stale than this flags Stale-heavy.'),
        ('inventory_review_slowing_share', 0.30, 'Inventory review: 4-week sales this far below the 12-week average flag Slowing.'),
        ('inventory_review_missing_share', 0.10, 'Inventory review: more of on hand with no retail or no check-in date than this flags Missing data.'),
    ):
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0118_product_search_spaceless'),
        ('core', '0012_app_error'),
    ]

    operations = [
        migrations.RunPython(seed_review_settings, migrations.RunPython.noop),
    ]
