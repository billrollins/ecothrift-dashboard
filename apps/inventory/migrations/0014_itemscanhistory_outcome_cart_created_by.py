# Generated manually for ItemScanHistory audit fields.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_itemscanhistory_outcome(apps, schema_editor):
    ItemScanHistory = apps.get_model('inventory', 'ItemScanHistory')
    for row in ItemScanHistory.objects.all().only('id', 'source'):
        if row.source == 'public_lookup':
            ItemScanHistory.objects.filter(pk=row.pk).update(outcome='public_lookup')
        elif row.source == 'audit_scan':
            ItemScanHistory.objects.filter(pk=row.pk).update(outcome='audit_scan')
        elif row.source == 'pos_terminal':
            ItemScanHistory.objects.filter(pk=row.pk).update(outcome='added_to_cart')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0013_item_search_text'),
        ('pos', '0003_add_temp_legacy_item_and_historical_transaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='itemscanhistory',
            name='outcome',
            field=models.CharField(
                choices=[
                    ('added_to_cart', 'Added to cart'),
                    ('pos_blocked_sold', 'POS blocked (already sold)'),
                    ('public_lookup', 'Public lookup'),
                    ('audit_scan', 'Audit scan'),
                ],
                default='added_to_cart',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='itemscanhistory',
            name='cart',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='item_scan_events',
                to='pos.cart',
            ),
        ),
        migrations.AddField(
            model_name='itemscanhistory',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='item_scans',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_itemscanhistory_outcome, noop_reverse),
    ]
