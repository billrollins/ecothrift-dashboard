# The customer's signature (J5), owner 2026-10-16: Finalize Thrift+ on the cashier's phone.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0018_email_sign_in'),
    ]

    operations = [
        migrations.AddField(
            model_name='person',
            name='signature',
            field=models.FileField(blank=True, default='', upload_to='thriftplus/signatures/'),
        ),
        migrations.AddField(
            model_name='person',
            name='signed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='person',
            name='signed_terms_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
