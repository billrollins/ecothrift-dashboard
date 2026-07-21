# Allow POS delivery without a booked date (needs_scheduling).

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0012_delivery_index_names'),
    ]

    operations = [
        migrations.AlterField(
            model_name='deliveryjob',
            name='availability',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='jobs',
                to='pos.deliveryavailability',
            ),
        ),
        migrations.AlterField(
            model_name='deliveryjob',
            name='scheduled_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name='deliveryjob',
            name='status',
            field=models.CharField(
                choices=[
                    ('needs_scheduling', 'Needs scheduling'),
                    ('scheduled', 'Scheduled'),
                    ('completed', 'Completed'),
                    ('cancelled', 'Cancelled'),
                    ('failed', 'Failed'),
                ],
                db_index=True,
                default='scheduled',
                max_length=20,
            ),
        ),
    ]
