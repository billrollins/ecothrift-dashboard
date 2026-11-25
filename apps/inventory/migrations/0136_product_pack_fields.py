import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Dash Update #224: the pack standard on Product (count per unit, unit name, units in the pack, base product)."""

    dependencies = [
        ('inventory', '0135_processingrow_not_product_ids'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='unit_count',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='unit_name',
            field=models.CharField(blank=True, db_default='', default='', max_length=40),
        ),
        migrations.AddField(
            model_name='product',
            name='pack_units',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='base_product',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='packs', to='inventory.product',
            ),
        ),
    ]
