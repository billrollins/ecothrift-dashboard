# CartLine assembly kind + per-line sale_label / sale_percent

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0026_drop_quality_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='cartline',
            name='sale_label',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='cartline',
            name='sale_percent',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=5),
        ),
        migrations.AlterField(
            model_name='cartline',
            name='line_kind',
            field=models.CharField(
                choices=[
                    ('item', 'Inventory item'),
                    ('manual', 'Manual / unscannable'),
                    ('discount', 'Discount / store credit'),
                    ('delivery', 'Delivery fee'),
                    ('assembly', 'Assembly'),
                ],
                db_index=True,
                default='item',
                max_length=20,
            ),
        ),
    ]
