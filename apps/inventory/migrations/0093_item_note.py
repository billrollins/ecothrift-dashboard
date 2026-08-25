from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0092_restoration_output_and_parent_item'),
    ]

    operations = [
        migrations.CreateModel(
            name='ItemNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField()),
                ('surface', models.CharField(
                    choices=[
                        ('check_in', 'Check-in'),
                        ('handoff', 'Handoff'),
                        ('queue', 'Queue'),
                        ('action', 'Action'),
                        ('hold', 'Hold'),
                        ('send_back', 'Send back'),
                        ('reject', 'Reject'),
                        ('finish', 'Finish'),
                        ('output', 'Output'),
                        ('processing_return', 'Processing return'),
                        ('manual', 'Manual'),
                    ],
                    max_length=32,
                )),
                ('source_key', models.CharField(
                    blank=True,
                    default='',
                    help_text='Groups a supersede chain: queue, action:12, output:0.',
                    max_length=128,
                )),
                ('restoration_job_id', models.PositiveIntegerField(blank=True, null=True)),
                ('occurred_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('status', models.CharField(
                    choices=[
                        ('active', 'Active'),
                        ('revised', 'Revised'),
                        ('voided', 'Voided'),
                    ],
                    default='active',
                    max_length=16,
                )),
                ('voided_at', models.DateTimeField(blank=True, null=True)),
                ('void_reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('author', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='item_notes_authored',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('check_in', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='inventory.itemcheckin',
                )),
                ('item', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='note_trail',
                    to='inventory.item',
                )),
                ('supersedes', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='revisions',
                    to='inventory.itemnote',
                )),
                ('voided_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='item_notes_voided',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['occurred_at', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='itemnote',
            index=models.Index(fields=['item', 'occurred_at', 'id'], name='itemnote_item_time_idx'),
        ),
        migrations.AddIndex(
            model_name='itemnote',
            index=models.Index(fields=['item', 'surface', 'status'], name='itemnote_item_surf_idx'),
        ),
        migrations.AddIndex(
            model_name='itemnote',
            index=models.Index(
                fields=['item', 'surface', 'source_key', 'status'],
                name='itemnote_src_status_idx',
            ),
        ),
    ]
