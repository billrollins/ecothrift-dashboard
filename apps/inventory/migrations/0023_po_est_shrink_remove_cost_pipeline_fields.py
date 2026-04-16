import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0022_category_stats_auction_lifecycle_item_indexes'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='vendor',
            name='avg_fulfillment',
        ),
        migrations.RemoveField(
            model_name='vendor',
            name='avg_sell_through',
        ),
        migrations.RemoveField(
            model_name='vendor',
            name='misfit_rate',
        ),
        migrations.RemoveField(
            model_name='vendor',
            name='shrinkage_rate',
        ),
        migrations.RemoveField(
            model_name='purchaseorder',
            name='misfit_sales_amt',
        ),
        migrations.RemoveField(
            model_name='purchaseorder',
            name='mistracked_retail',
        ),
        migrations.RemoveField(
            model_name='purchaseorder',
            name='shrink_retail_est',
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='est_shrink',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0.1500'),
                help_text=(
                    'Estimated shrinkage fraction (0–1). Item cost allocates total_cost over '
                    'expected recoverable retail: PO.retail_value × (1 - est_shrink). Changing '
                    'this recomputes item costs for this PO.'
                ),
                max_digits=5,
                validators=[
                    django.core.validators.MinValueValidator(Decimal('0')),
                    django.core.validators.MaxValueValidator(Decimal('0.9999')),
                ],
            ),
        ),
    ]
