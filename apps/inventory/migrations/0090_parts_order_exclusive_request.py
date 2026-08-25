import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0089_parts_order_combined'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='restorationpartsorder',
            name='combined',
        ),
        migrations.AddField(
            model_name='restorationpartsorder',
            name='cancel_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='restorationpartsorder',
            name='cancel_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='restorationpartsorder',
            name='cancel_requested_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='restoration_parts_orders_cancel_asked',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='restorationpartsorder',
            name='queued_behind',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='queued_replacements',
                to='inventory.restorationpartsorder',
            ),
        ),
        migrations.AddField(
            model_name='restorationpartsorder',
            name='refunded',
            field=models.BooleanField(default=False),
        ),
    ]
