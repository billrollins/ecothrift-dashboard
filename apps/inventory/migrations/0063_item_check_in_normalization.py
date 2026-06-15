"""Normalize check-ins: ItemCheckIn model, Item.check_in FK, backfill from legacy item_ids JSON."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_item_check_in_from_batches(apps, schema_editor):
    ItemCheckIn = apps.get_model('inventory', 'ItemCheckIn')
    Item = apps.get_model('inventory', 'Item')
    ProcessingRow = apps.get_model('inventory', 'ProcessingRow')

    for batch in ItemCheckIn.objects.all().iterator():
        raw_ids = batch.item_ids or []
        valid_ids = []
        for x in raw_ids:
            try:
                valid_ids.append(int(x))
            except (TypeError, ValueError):
                continue
        if valid_ids:
            Item.objects.filter(pk__in=valid_ids).update(check_in_id=batch.pk)

        manifest_row_id = None
        if batch.processing_row_id:
            row = ProcessingRow.objects.filter(pk=batch.processing_row_id).only('manifest_row_id').first()
            if row and row.manifest_row_id:
                manifest_row_id = row.manifest_row_id
        if not manifest_row_id and valid_ids:
            manifest_row_id = (
                Item.objects.filter(pk__in=valid_ids, manifest_row_id__isnull=False)
                .values_list('manifest_row_id', flat=True)
                .first()
            )
        updates = {}
        if manifest_row_id:
            updates['manifest_row_id'] = manifest_row_id
        if not batch.origin:
            updates['origin'] = 'processing'
        if updates:
            ItemCheckIn.objects.filter(pk=batch.pk).update(**updates)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0062_canonical_product_categories_drop_descriptions'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='ProcessingCheckInBatch',
            new_name='ItemCheckIn',
        ),
        migrations.AlterModelOptions(
            name='itemcheckin',
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.AddField(
            model_name='itemcheckin',
            name='manifest_row',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='item_checkins',
                to='inventory.manifestrow',
            ),
        ),
        migrations.AddField(
            model_name='itemcheckin',
            name='origin',
            field=models.CharField(
                choices=[
                    ('processing', 'Processing row'),
                    ('product_ad_hoc', 'Product ad hoc'),
                    ('manual', 'Manual'),
                ],
                db_index=True,
                default='processing',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='itemcheckin',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='itemcheckin',
            name='item_ids',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Legacy membership list; prefer Item.check_in FK. Removed in a later migration.',
            ),
        ),
        migrations.AlterField(
            model_name='itemcheckin',
            name='processing_row',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='item_checkins',
                to='inventory.processingrow',
            ),
        ),
        migrations.AlterField(
            model_name='itemcheckin',
            name='purchase_order',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='item_checkins',
                to='inventory.purchaseorder',
            ),
        ),
        migrations.AddField(
            model_name='item',
            name='check_in',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='items',
                to='inventory.itemcheckin',
            ),
        ),
        migrations.AddIndex(
            model_name='itemcheckin',
            index=models.Index(fields=['purchase_order', 'manifest_row'], name='inventory_purchas_mrow_idx'),
        ),
        migrations.AddIndex(
            model_name='item',
            index=models.Index(fields=['check_in'], name='inventory_item_check_in_idx'),
        ),
        migrations.RunPython(backfill_item_check_in_from_batches, migrations.RunPython.noop),
    ]
