from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0003_add_temp_legacy_item_and_historical_transaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='cartline',
            name='resale_source_sku',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='cartline',
            name='resale_source_item_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
