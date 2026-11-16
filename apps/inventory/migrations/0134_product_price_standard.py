# Dash Update #180: pricing standards. A product can be marked a commodity (name brand or store brand) or not one.
# db_default keeps rows written by code that does not know the field (other checkouts on a shared DB) valid.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0133_photo_sheet_contrast'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='price_standard',
            field=models.CharField(
                blank=True,
                choices=[
                    ('', 'Not decided'),
                    ('name_brand', 'Commodity, name brand'),
                    ('store_brand', 'Commodity, store brand'),
                    ('no', 'Not a commodity'),
                ],
                db_default='',
                default='',
                max_length=12,
            ),
        ),
    ]
