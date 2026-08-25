import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0087_drop_bench_plan_odds'),
    ]

    operations = [
        migrations.DeleteModel(name='RestorationPartsOrderLine'),
        migrations.DeleteModel(name='RestorationPartsOrder'),
        migrations.DeleteModel(name='RestorationPartsRequestLine'),
        migrations.DeleteModel(name='RestorationPartsRequestSite'),
        migrations.DeleteModel(name='RestorationPartsRequest'),
        migrations.CreateModel(
            name='RestorationPart',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('part_number', models.CharField(blank=True, default='', max_length=64)),
                ('description', models.CharField(blank=True, default='', max_length=300)),
                ('url', models.URLField(blank=True, default='')),
                ('qty', models.PositiveIntegerField(default=1)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('category', models.CharField(choices=[('parts', 'Parts'), ('supplies', 'Supplies'), ('ffe', 'FFE')], db_index=True, default='parts', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restoration_parts_created', to=settings.AUTH_USER_MODEL)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='parts', to='inventory.restorationjob')),
            ],
            options={'ordering': ['id']},
        ),
        migrations.CreateModel(
            name='RestorationPartsOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=128)),
                ('target_grade', models.CharField(blank=True, default='', max_length=64)),
                ('shipping', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('tax', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('fees', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('requested', 'Requested'), ('approved', 'Approved'), ('denied', 'Denied'), ('purchased', 'Purchased'), ('received', 'Received'), ('cancelled', 'Cancelled')], db_index=True, default='draft', max_length=20)),
                ('denied_reason', models.TextField(blank=True, default='')),
                ('est_shipping_days', models.PositiveIntegerField(blank=True, null=True)),
                ('requested_at', models.DateTimeField(blank=True, null=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('purchased_at', models.DateTimeField(blank=True, null=True)),
                ('received_at', models.DateTimeField(blank=True, null=True)),
                ('review_state', models.CharField(choices=[('ok', 'OK'), ('needs_review', 'Needs review'), ('reviewed', 'Reviewed')], db_index=True, default='ok', max_length=20)),
                ('review_note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restoration_parts_orders_approved', to=settings.AUTH_USER_MODEL)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='parts_orders', to='inventory.restorationjob')),
                ('purchased_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restoration_parts_orders_purchased', to=settings.AUTH_USER_MODEL)),
                ('received_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restoration_parts_orders_received', to=settings.AUTH_USER_MODEL)),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='restoration_parts_orders_requested', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='RestorationPartsOrderLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.PositiveIntegerField(default=1)),
                ('unit_cost', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='inventory.restorationpartsorder')),
                ('part', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='order_lines', to='inventory.restorationpart')),
            ],
            options={'ordering': ['id']},
        ),
        migrations.AddIndex(
            model_name='restorationpartsorder',
            index=models.Index(fields=['status', 'updated_at'], name='inventory_r_status_8f4c1a_idx'),
        ),
        migrations.AddIndex(
            model_name='restorationpartsorder',
            index=models.Index(fields=['job', 'status'], name='inventory_r_job_id_2c8e4b_idx'),
        ),
        migrations.AddIndex(
            model_name='restorationpartsorder',
            index=models.Index(fields=['review_state', 'updated_at'], name='inventory_r_review__9a1d2e_idx'),
        ),
        migrations.AddConstraint(
            model_name='restorationpartsorderline',
            constraint=models.UniqueConstraint(fields=('order', 'part'), name='uniq_restoration_parts_order_part'),
        ),
    ]
