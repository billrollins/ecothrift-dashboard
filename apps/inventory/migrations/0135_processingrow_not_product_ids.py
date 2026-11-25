from django.db import migrations, models


class Migration(migrations.Migration):
    """Dash Update #223: remember "not this product" on a Processing row's likely products."""

    dependencies = [
        ('inventory', '0134_product_price_standard'),
    ]

    operations = [
        migrations.AddField(
            model_name='processingrow',
            name='not_product_ids',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
