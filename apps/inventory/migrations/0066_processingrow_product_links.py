from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0065_item_check_in_index_cleanup'),
    ]

    operations = [
        migrations.AddField(
            model_name='processingrow',
            name='product_links',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Per attached product manifest accounting: '
                    '{product_id: {role: set|part|null, check_ins: int, manifest_units: int}}. '
                    'X check-ins account for Y manifest row units (display only; each check-in still creates one Item).'
                ),
            ),
        ),
    ]
