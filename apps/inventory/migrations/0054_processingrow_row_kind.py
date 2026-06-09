from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0053_preprocessingrow_manifest_spine'),
    ]

    operations = [
        migrations.AddField(
            model_name='processingrow',
            name='row_kind',
            field=models.CharField(
                choices=[
                    ('manifest', 'Manifest line'),
                    ('added', 'Added item (no manifest line)'),
                ],
                db_index=True,
                default='manifest',
                help_text='manifest = normal manifest-backed row; added = PO item with no manifest line.',
                max_length=16,
            ),
        ),
        migrations.AddIndex(
            model_name='processingrow',
            index=models.Index(fields=['purchase_order', 'row_kind'], name='inv_proc_po_row_kind_idx'),
        ),
    ]
