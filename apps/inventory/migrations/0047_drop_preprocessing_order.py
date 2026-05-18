# Drop inventory_preprocessingorder; PreprocessingRow keyed by purchase_order only.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0046_intake_wave1_po_preprocessing_receiving'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='preprocessingrow',
            name='inventory_preproc_row_unique_order_rn',
        ),
        migrations.RemoveIndex(
            model_name='preprocessingrow',
            name='inventory_p_preproc_5eb9ad_idx',
        ),
        migrations.RemoveField(
            model_name='preprocessingrow',
            name='preprocessing_order',
        ),
        migrations.AddConstraint(
            model_name='preprocessingrow',
            constraint=models.UniqueConstraint(
                fields=('purchase_order', 'row_number'),
                name='inventory_preproc_row_unique_po_rn',
            ),
        ),
        migrations.AlterModelOptions(
            name='preprocessingrow',
            options={'ordering': ['purchase_order', 'row_number']},
        ),
        migrations.DeleteModel(
            name='PreprocessingOrder',
        ),
    ]
