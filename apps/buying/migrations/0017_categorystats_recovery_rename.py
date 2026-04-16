# CategoryStats: rename sell-through fields to recovery (dollar ratio aggregates).

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('buying', '0016_remove_categorywantvote'),
    ]

    operations = [
        migrations.RenameField(
            model_name='categorystats',
            old_name='sell_through_rate',
            new_name='recovery_rate',
        ),
        migrations.RenameField(
            model_name='categorystats',
            old_name='sell_through_numerator',
            new_name='recovery_sold_amount',
        ),
        migrations.RenameField(
            model_name='categorystats',
            old_name='sell_through_denominator',
            new_name='recovery_retail_amount',
        ),
    ]
