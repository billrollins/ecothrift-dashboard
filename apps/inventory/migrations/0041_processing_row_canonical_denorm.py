# Generated manually - ProcessingRow canonical links + queue denormalized fields.

import django.db.models.deletion
from django.db import migrations, models


def _location_to_dispatch(location: str | None) -> str:
    loc = (location or '').strip()
    allowed = frozenset({'on_shelf', 'restoration', 'back_storage', 'online_sales', 'salvage'})
    return loc if loc in allowed else 'on_shelf'


def _item_disp(status: str) -> str:
    if status in ('intake', 'processing'):
        return 'pending'
    if status == 'on_shelf':
        return 'checked_in'
    if status == 'scrapped':
        return 'broken'
    if status == 'lost':
        return 'undelivered'
    return 'pending'


def _derive_row_queue_status(items) -> str:
    if not items:
        return 'pending'
    dispositions = [_item_disp(i.status) for i in items]
    any_disputed = any(d in ('broken', 'undelivered') for d in dispositions)
    if any_disputed:
        return 'disputed'
    all_pending = all(d == 'pending' for d in dispositions)
    all_checked = all(d == 'checked_in' for d in dispositions)
    if all_pending:
        return 'pending'
    if all_checked:
        return 'checked_in'
    return 'partial'


def _dispositioned_item(item) -> bool:
    return item.status not in ('intake', 'processing')


def _row_qty_dispositioned(items) -> int:
    return sum(1 for i in items if _dispositioned_item(i))


def _row_primary_item(items):
    pending = [i for i in items if i.status in ('intake', 'processing')]
    if pending:
        return pending[0]
    return items[0] if items else None


def backfill_processing_row_denorm(apps, schema_editor):
    """Link bookmarks to manifest rows by (PO, row_number) and denormalize via items.

    Orphan manifest lines without a bookmark are skipped here (legacy); they can be lazily
    created on first ``build-processing-data`` / admin repair if needed (keeps migration fast).
    """
    ProcessingRow = apps.get_model('inventory', 'ProcessingRow')
    ManifestRow = apps.get_model('inventory', 'ManifestRow')
    Item = apps.get_model('inventory', 'Item')

    for pr in ProcessingRow.objects.iterator(chunk_size=500):
        mr = (
            ManifestRow.objects.filter(purchase_order_id=pr.purchase_order_id, row_number=pr.row_number)
            .only('id', 'matched_product_id')
            .first()
        )
        if mr is None:
            continue
        items = list(Item.objects.filter(manifest_row_id=mr.pk).order_by('id'))
        pr.manifest_row_id = mr.pk
        pr.matched_product_id = getattr(mr, 'matched_product_id', None)
        pr.item_ids = [i.pk for i in items]
        primary = _row_primary_item(items)
        pr.queue_status = _derive_row_queue_status(items)
        pr.qty_dispositioned = _row_qty_dispositioned(items)
        pr.pending_item_count = sum(1 for i in items if i.status in ('intake', 'processing'))
        pr.has_on_shelf_unit = any(i.status == 'on_shelf' for i in items)
        if primary:
            pr.list_dispatch = _location_to_dispatch(primary.location)
            pr.list_sku = primary.sku or ''
            pr.list_unit_price = primary.price
            pr.condition = str(primary.condition or '')[:20]
        else:
            pr.list_unit_price = getattr(pr, 'final_price', None) or getattr(pr, 'proposed_price', None)
            pr.list_dispatch = 'on_shelf'
            pr.list_sku = ''
        pr.save()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0040_processing_row_bookmarks'),
    ]

    operations = [
        migrations.AddField(
            model_name='processingrow',
            name='has_on_shelf_unit',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='item_ids',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='list_dispatch',
            field=models.CharField(blank=True, default='on_shelf', max_length=32),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='list_sku',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='list_unit_price',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='manifest_row',
            field=models.ForeignKey(
                blank=True,
                help_text='Canonical manifest line after build-processing-data (lazy detail source).',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='inventory.manifestrow',
            ),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='matched_product',
            field=models.ForeignKey(
                blank=True,
                help_text='Denormalized from manifest row after product matching / build.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='inventory.product',
            ),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='pending_item_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='qty_dispositioned',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='processingrow',
            name='queue_status',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='pending',
                help_text='pending | partial | checked_in | disputed - mirrors Item aggregate for this row.',
                max_length=16,
            ),
        ),
        migrations.AddIndex(
            model_name='processingrow',
            index=models.Index(
                fields=['purchase_order', 'queue_status'],
                name='inventory_p_purchas_qs_idx',
            ),
        ),
        migrations.RunPython(backfill_processing_row_denorm, noop_reverse),
    ]
