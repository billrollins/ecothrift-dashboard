from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0027_purchase_order_order_pallet_count'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='csvtemplate',
            index=models.Index(fields=['vendor_id', 'header_signature'], name='inv_csvtpl_vendor_sig_idx'),
        ),
    ]
