# Manual PO data corrections (deploy-time). Reverse is intentionally a no-op.

from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def apply_corrections(apps, schema_editor):
    PurchaseOrder = apps.get_model('inventory', 'PurchaseOrder')
    Item = apps.get_model('inventory', 'Item')

    PurchaseOrder.objects.filter(order_number='WAL135287').update(
        retail_value=Decimal('301515.00'),
    )

    PurchaseOrder.objects.filter(order_number='TGT126675').update(
        purchase_cost=Decimal('9150.00'),
        fees=Decimal('366.00'),
        shipping_cost=Decimal('1976.00'),
        total_cost=Decimal('11492.00'),
    )

    po_wfr = PurchaseOrder.objects.filter(order_number='WFR10979').first()
    if po_wfr:
        total = Item.objects.filter(purchase_order=po_wfr).aggregate(s=Sum('retail_value'))['s']
        if total is not None and total > 0:
            po_wfr.retail_value = total
            po_wfr.save(update_fields=['retail_value'])

    misfit = PurchaseOrder.objects.filter(order_number__startswith='MISFIT').order_by('id').first()
    if misfit:
        Item.objects.filter(purchase_order__order_number='CST423585').update(purchase_order_id=misfit.pk)

    PurchaseOrder.objects.filter(order_number='CST423585').update(status='cancelled')

    PurchaseOrder.objects.filter(order_number='AMZ24714').update(status='cancelled')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0019_vendor_misfit_rate'),
    ]

    operations = [
        migrations.RunPython(apply_corrections, noop_reverse),
    ]
