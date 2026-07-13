# Generated manually for DeliveryAvailability + DeliveryJob

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pos', '0010_cartline_line_kind_meta'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliveryAvailability',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True)),
                ('time_start', models.TimeField()),
                ('time_end', models.TimeField()),
                ('crew_size', models.PositiveSmallIntegerField(choices=[(1, '1 person'), (2, '2 people')], default=2)),
                ('assigned_to', models.CharField(blank=True, default='', help_text='Who is running deliveries that day (names).', max_length=200)),
                ('notes', models.CharField(blank=True, default='', max_length=300)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name_plural': 'delivery availabilities',
                'ordering': ['date', 'time_start'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryJob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scheduled_date', models.DateField(db_index=True)),
                ('customer_name', models.CharField(max_length=120)),
                ('phone', models.CharField(max_length=40)),
                ('address', models.CharField(max_length=200)),
                ('is_apt', models.BooleanField(default=False)),
                ('unit', models.CharField(blank=True, default='', max_length=40)),
                ('items_delivered', models.CharField(max_length=300)),
                ('item_count', models.PositiveSmallIntegerField(default=1)),
                ('tier', models.CharField(blank=True, default='', max_length=10)),
                ('fee', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('distance_miles', models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ('distance_mode', models.CharField(blank=True, default='', max_length=20)),
                ('status', models.CharField(choices=[('scheduled', 'Scheduled'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('failed', 'Failed')], db_index=True, default='scheduled', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('availability', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='jobs', to='pos.deliveryavailability')),
                ('cart', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_jobs', to='pos.cart')),
                ('cart_line', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_job', to='pos.cartline')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_jobs_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['scheduled_date', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='deliveryavailability',
            index=models.Index(fields=['date', 'is_active'], name='pos_deliver_date_0f3f3a_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryjob',
            index=models.Index(fields=['scheduled_date', 'status'], name='pos_deliver_schedul_8a1b2c_idx'),
        ),
    ]
