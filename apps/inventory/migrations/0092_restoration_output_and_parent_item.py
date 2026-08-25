from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0091_reopen_cancelled_draft_orders'),
    ]

    operations = [
        migrations.AddField(
            model_name='item',
            name='parent_item',
            field=models.ForeignKey(
                blank=True,
                help_text='The item this SKU was salvaged from. Truck lineage stays on purchase_order / manifest_row.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='child_items',
                to='inventory.item',
            ),
        ),
        migrations.CreateModel(
            name='RestorationOutput',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('seq', models.PositiveIntegerField()),
                ('label', models.CharField(max_length=200)),
                ('notes', models.TextField(blank=True, default='')),
                ('destination', models.CharField(blank=True, default='', max_length=32)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='restoration_outputs_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('item', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='restoration_outputs',
                    to='inventory.item',
                )),
                ('job', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='outputs',
                    to='inventory.restorationjob',
                )),
                ('suggested_product', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='inventory.product',
                )),
            ],
            options={
                'ordering': ['seq', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='restorationoutput',
            constraint=models.UniqueConstraint(fields=('job', 'seq'), name='restout_job_seq_uniq'),
        ),
    ]
