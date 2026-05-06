from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0043_processingrow_search_string'),
    ]

    operations = [
        migrations.RenameField(
            model_name='processingrow',
            old_name='list_unit_price',
            new_name='shelf_price',
        ),
        migrations.AlterField(
            model_name='processingrow',
            name='shelf_price',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                null=True,
                blank=True,
                help_text=(
                    'Workspace-canonical shelf/tag unit price for Item Processor (queue + detail price); '
                    'seeded from preprocessing/finalize; processing mutations align Item.price; '
                    'refresh_processing_rows_denorm does not copy Item.price when manifest-linked.'
                ),
            ),
        ),
    ]
