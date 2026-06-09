from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0055_item_dispute_type_choices'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProcessingCheckInBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('item_ids', models.JSONField(blank=True, default=list)),
                ('defaults_snapshot', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'created_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='+',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'processing_row',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='checkin_batches',
                        to='inventory.processingrow',
                    ),
                ),
                (
                    'product',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='+',
                        to='inventory.product',
                    ),
                ),
                (
                    'purchase_order',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='processing_checkin_batches',
                        to='inventory.purchaseorder',
                    ),
                ),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='processingcheckinbatch',
            index=models.Index(fields=['purchase_order', 'processing_row'], name='inventory_purchas_754ba4_idx'),
        ),
        migrations.AddIndex(
            model_name='processingcheckinbatch',
            index=models.Index(fields=['processing_row', 'created_at'], name='inventory_process_7d792e_idx'),
        ),
    ]
