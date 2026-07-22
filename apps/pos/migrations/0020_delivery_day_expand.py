"""Expand DeliveryAvailability into DeliveryDay and add Phase 1 domain models.

State rename only for DeliveryAvailability -> DeliveryDay (same physical table).
No uniqueness constraints yet (those land in 0022 after preflight/backfill).
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('inventory', '0082_receiving_photo_thumbnails_and_overrides'),
        ('pos', '0019_dashboarddepartmentgoal_schedule'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # --- In-place model rename (preserve table + IDs) ---
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameModel(
                    old_name='DeliveryAvailability',
                    new_name='DeliveryDay',
                ),
                migrations.AlterModelOptions(
                    name='deliveryday',
                    options={
                        'ordering': ['date', 'time_start'],
                        'verbose_name': 'delivery day',
                        'verbose_name_plural': 'delivery days',
                    },
                ),
                migrations.AlterModelTable(
                    name='deliveryday',
                    table='pos_deliveryavailability',
                ),
            ],
            database_operations=[],
        ),
        # --- Additive fields on existing tables ---
        migrations.AddField(
            model_name='deliveryday',
            name='planning_disposition',
            field=models.CharField(
                choices=[('planned', 'Planned'), ('cancelled', 'Cancelled'), ('not_run', 'Not run')],
                db_index=True,
                default='planned',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='archive_reason',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='archived_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='delivery_days_archived',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='location',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='delivery_days',
                to='core.worklocation',
            ),
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='primary_driver',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='delivery_days_as_primary_driver',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='deliverycallattempt',
            name='action',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='deliverycallattempt',
            name='channel',
            field=models.CharField(
                blank=True,
                choices=[('call', 'Call'), ('text', 'Text')],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='deliveryjob',
            name='archive_reason',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='deliveryjob',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='deliveryjob',
            name='archived_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='delivery_jobs_archived',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='deliveryjob',
            name='updated_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='delivery_jobs_updated',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='deliveryrun',
            name='is_canonical',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='deliveryrun',
            name='superseded_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='supersedes',
                to='pos.deliveryrun',
            ),
        ),
        # Point FKs at renamed model (same physical column).
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='deliveryjob',
                    name='availability',
                    field=models.ForeignKey(
                        blank=True,
                        db_column='availability_id',
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='jobs',
                        to='pos.deliveryday',
                    ),
                ),
                migrations.AlterField(
                    model_name='deliveryrun',
                    name='availability',
                    field=models.ForeignKey(
                        blank=True,
                        db_column='availability_id',
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='runs',
                        to='pos.deliveryday',
                    ),
                ),
            ],
            database_operations=[],
        ),
        migrations.CreateModel(
            name='DeliveryDayAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('lead', 'Lead'), ('helper', 'Helper')], default='helper', max_length=20)),
                ('display_order', models.PositiveSmallIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('day', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='pos.deliveryday')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='delivery_day_assignments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['display_order', 'id'],
                'unique_together': {('day', 'user')},
            },
        ),
        migrations.CreateModel(
            name='DeliveryJobItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sku', models.CharField(blank=True, default='', max_length=64)),
                ('description', models.CharField(max_length=300)),
                ('quantity', models.PositiveSmallIntegerField(default=1)),
                ('position', models.PositiveSmallIntegerField(default=0)),
                ('is_scannable', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('removed_at', models.DateTimeField(blank=True, null=True)),
                ('remove_reason', models.CharField(blank=True, default='', max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_job_items_created', to=settings.AUTH_USER_MODEL)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='pos.deliveryjob')),
                ('removed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_job_items_removed', to=settings.AUTH_USER_MODEL)),
                ('source_cart_line', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_job_items', to='pos.cartline')),
                ('source_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_job_items', to='inventory.item')),
            ],
            options={
                'ordering': ['position', 'id'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryRunStopItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sku', models.CharField(blank=True, default='', max_length=64)),
                ('description', models.CharField(max_length=300)),
                ('quantity', models.PositiveSmallIntegerField(default=1)),
                ('position', models.PositiveSmallIntegerField(default=0)),
                ('is_scannable', models.BooleanField(default=False)),
                ('source_cart_line_id_snapshot', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('job_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stop_snapshots', to='pos.deliveryjobitem')),
                ('stop', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stop_items', to='pos.deliveryrunstop')),
            ],
            options={
                'ordering': ['position', 'id'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryItemScan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scanned_code', models.CharField(max_length=64)),
                ('client_scan_id', models.UUIDField(blank=True, db_index=True, null=True)),
                ('scanned_at', models.DateTimeField(auto_now_add=True)),
                ('scanned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_item_scans', to=settings.AUTH_USER_MODEL)),
                ('stop_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='scans', to='pos.deliveryrunstopitem')),
            ],
            options={
                'ordering': ['scanned_at', 'id'],
            },
        ),
        migrations.AddField(
            model_name='deliveryattachment',
            name='stop_item',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='attachments',
                to='pos.deliveryrunstopitem',
            ),
        ),
        migrations.CreateModel(
            name='DeliveryTestDataset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(db_index=True, max_length=80)),
                ('generation', models.PositiveIntegerField(default=1)),
                ('scenario_version', models.CharField(default='1', max_length=40)),
                ('target_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(
                    choices=[
                        ('active', 'Active'),
                        ('resetting', 'Resetting'),
                        ('reset', 'Reset'),
                        ('reset_failed', 'Reset failed'),
                    ],
                    default='active',
                    max_length=20,
                )),
                ('summary', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reset_at', models.DateTimeField(blank=True, null=True)),
                ('reset_error', models.TextField(blank=True, default='')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_test_datasets_created', to=settings.AUTH_USER_MODEL)),
                ('reset_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_test_datasets_reset', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='DeliveryTestArtifact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('artifact_type', models.CharField(
                    choices=[
                        ('day', 'Day'),
                        ('job', 'Job'),
                        ('run', 'Run'),
                        ('cart', 'Cart'),
                        ('cart_line', 'Cart line'),
                        ('receipt', 'Receipt'),
                        ('s3_key', 'S3 key'),
                        ('attachment', 'Attachment'),
                    ],
                    max_length=20,
                )),
                ('object_id', models.PositiveIntegerField(blank=True, null=True)),
                ('storage_key', models.CharField(blank=True, default='', max_length=500)),
                ('meta', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('dataset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='artifacts', to='pos.deliverytestdataset')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddField(
            model_name='deliveryday',
            name='test_dataset',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='days',
                to='pos.deliverytestdataset',
            ),
        ),
        migrations.AddField(
            model_name='deliveryjob',
            name='test_dataset',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='jobs',
                to='pos.deliverytestdataset',
            ),
        ),
        migrations.CreateModel(
            name='DeliveryChangeEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entity_type', models.CharField(choices=[('day', 'Day'), ('job', 'Job'), ('item', 'Item')], db_index=True, max_length=20)),
                ('entity_id', models.PositiveIntegerField(db_index=True)),
                ('action', models.CharField(db_index=True, max_length=40)),
                ('reason', models.CharField(blank=True, default='', max_length=300)),
                ('before', models.JSONField(blank=True, default=dict)),
                ('after', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delivery_change_events', to=settings.AUTH_USER_MODEL)),
                ('job', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='change_events', to='pos.deliveryjob')),
                ('day', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='change_events', to='pos.deliveryday')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='deliveryjobitem',
            index=models.Index(fields=['job', 'is_active', 'position'], name='pos_deliver_job_id_18f947_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryrunstopitem',
            index=models.Index(fields=['stop', 'position'], name='pos_deliver_stop_id_93e165_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryitemscan',
            index=models.Index(fields=['stop_item', 'scanned_at'], name='pos_deliver_stop_it_bfd15c_idx'),
        ),
        migrations.AddIndex(
            model_name='deliverytestdataset',
            index=models.Index(fields=['key', 'status'], name='pos_deliver_key_9d2ef1_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='deliverytestdataset',
            unique_together={('key', 'generation')},
        ),
        migrations.AddIndex(
            model_name='deliverytestartifact',
            index=models.Index(fields=['dataset', 'artifact_type'], name='pos_deliver_dataset_048894_idx'),
        ),
        migrations.AddIndex(
            model_name='deliverychangeevent',
            index=models.Index(fields=['entity_type', 'entity_id'], name='pos_deliver_entity__85d295_idx'),
        ),
        migrations.AddIndex(
            model_name='deliverychangeevent',
            index=models.Index(fields=['action', 'created_at'], name='pos_deliver_action_5d74d4_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryday',
            index=models.Index(fields=['planning_disposition', 'date'], name='pos_deliver_plannin_b82494_idx'),
        ),
        # Help text update only (assigned_to).
        migrations.AlterField(
            model_name='deliveryday',
            name='assigned_to',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Legacy free-text crew assignment (names).',
                max_length=200,
            ),
        ),
    ]
