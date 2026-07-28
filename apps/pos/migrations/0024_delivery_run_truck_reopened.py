# Generated manually for reopen-truck seal window.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0023_delivery_phase2_contact_items_truck'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='deliveryrun',
            name='truck_reopened_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='deliveryrun',
            name='truck_reopened_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='delivery_runs_truck_reopened',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
