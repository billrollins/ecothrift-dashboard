"""Merge vendor TGT into TRGET (canonical Target); deactivate TGT."""

from django.db import migrations


def merge_tgt_into_trget(apps, schema_editor):
    Vendor = apps.get_model('inventory', 'Vendor')
    PurchaseOrder = apps.get_model('inventory', 'PurchaseOrder')
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    VendorProductRef = apps.get_model('inventory', 'VendorProductRef')

    try:
        tgt = Vendor.objects.get(code='TGT')
    except Vendor.DoesNotExist:
        return

    try:
        trget = Vendor.objects.get(code='TRGET')
    except Vendor.DoesNotExist:
        raise RuntimeError(
            'merge_tgt_into_trget: TRGET vendor missing; cannot merge TGT',
        )

    if tgt.pk == trget.pk:
        return

    PurchaseOrder.objects.filter(vendor_id=tgt.pk).update(vendor_id=trget.pk)

    for tpl in CSVTemplate.objects.filter(vendor_id=tgt.pk):
        if CSVTemplate.objects.filter(
            vendor_id=trget.pk,
            name=tpl.name,
        ).exists():
            tpl.delete()
        else:
            tpl.vendor_id = trget.pk
            tpl.save(update_fields=['vendor_id'])

    for ref in VendorProductRef.objects.filter(vendor_id=tgt.pk):
        conflict = VendorProductRef.objects.filter(
            vendor_id=trget.pk,
            vendor_item_number=ref.vendor_item_number,
        ).exclude(pk=ref.pk)
        if conflict.exists():
            ref.delete()
        else:
            ref.vendor_id = trget.pk
            ref.save(update_fields=['vendor_id'])

    tgt.is_active = False
    tgt.save(update_fields=['is_active'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0017_cost_pipeline_fields'),
    ]

    operations = [
        migrations.RunPython(merge_tgt_into_trget, noop_reverse),
    ]
