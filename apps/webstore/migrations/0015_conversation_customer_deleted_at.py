from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0014_reservation_customer_archived_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='conversation',
            name='customer_deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
