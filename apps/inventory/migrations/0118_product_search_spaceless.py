# Search ignores spaces ("barstool" finds "bar stool", owner 2026-10-26): a trigram index on the search line with its
# spaces taken out. Built concurrently so product saves are not held up while it builds (~5 s on 200k products).

import django.contrib.postgres.indexes
import django.db.models.functions.text
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('inventory', '0117_sale_facts_inventory_week'),
    ]

    operations = [
        AddIndexConcurrently(
            model_name='product',
            index=django.contrib.postgres.indexes.GinIndex(
                django.contrib.postgres.indexes.OpClass(
                    django.db.models.functions.text.Replace('search_text', models.Value(' '), models.Value('')),
                    name='gin_trgm_ops',
                ),
                name='inv_product_search_nosp_trgm',
            ),
        ),
    ]
