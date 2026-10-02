import django.contrib.postgres.indexes
from django.db import migrations, models


def fill(apps, schema_editor):
    from apps.inventory.services.inventory_search import rebuild_all

    rebuild_all()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0104_seed_category_from_profile_switch'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='search_text',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(fill, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='product',
            index=django.contrib.postgres.indexes.GinIndex(
                fields=['search_text'], name='inv_product_search_trgm', opclasses=['gin_trgm_ops']),
        ),
    ]
