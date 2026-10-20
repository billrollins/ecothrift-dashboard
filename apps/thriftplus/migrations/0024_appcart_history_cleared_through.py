"""'Clear my scans' hides by scan id, not by time: a scan in the same clock tick as the clear showed as hidden.

Carts already cleared get the last scan id at or before their clear time, so the same scans stay hidden.
"""
from django.db import migrations, models
from django.db.models import Max


def backfill(apps, schema_editor):
    AppCart = apps.get_model('thriftplus', 'AppCart')
    ScanSignal = apps.get_model('thriftplus', 'ScanSignal')
    for cart in AppCart.objects.filter(history_cleared_at__isnull=False):
        last = (ScanSignal.objects.filter(account_id=cart.account_id, created_at__lte=cart.history_cleared_at)
                .aggregate(m=Max('pk'))['m'])
        AppCart.objects.filter(pk=cart.pk).update(history_cleared_through=last or 0)


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0023_session_kind_phone'),
    ]

    operations = [
        migrations.AddField(
            model_name='appcart',
            name='history_cleared_through',
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
