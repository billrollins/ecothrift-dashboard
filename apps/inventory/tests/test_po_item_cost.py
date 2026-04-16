"""PurchaseOrder.compute_item_cost and recompute_item_costs."""

from __future__ import annotations

from decimal import Decimal

from django.test import TestCase

from apps.core.models import AppSetting
from apps.inventory.models import Item, Product, PurchaseOrder, Vendor
from apps.inventory.services.po_defaults import (
    SETTING_KEY_PO_DEFAULT_EST_SHRINK,
    get_default_po_est_shrink,
)


class PoItemCostFormulaTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name="V", code="V1")

    def test_compute_item_cost_formula(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number="PO-T-COST-1",
            ordered_date="2024-01-01",
            purchase_cost=Decimal("100.00"),
            shipping_cost=Decimal("30.00"),
            fees=Decimal("20.00"),
            retail_value=Decimal("1000.00"),
            est_shrink=Decimal("0.20"),
        )
        po.refresh_from_db()
        # total_cost from save()
        self.assertEqual(po.total_cost, Decimal("150.00"))
        denom = po.retail_value * (Decimal("1") - po.est_shrink)
        self.assertEqual(denom, Decimal("800.00"))
        item_retail = Decimal("80.00")
        expected = (item_retail / denom) * po.total_cost
        self.assertEqual(po.compute_item_cost(item_retail), expected.quantize(Decimal("0.01")))

    def test_est_shrink_change_recomputes_items(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number="PO-T-COST-2",
            ordered_date="2024-01-02",
            purchase_cost=Decimal("85.00"),
            retail_value=Decimal("500.00"),
            est_shrink=Decimal("0.15"),
        )
        p = Product.objects.create(title="P", product_number="P-COST-1")
        it = Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=po,
            title="T",
            retail_value=Decimal("100.00"),
            cost=po.compute_item_cost(Decimal("100.00")),
        )
        c0 = it.cost
        self.assertIsNotNone(c0)
        po.est_shrink = Decimal("0.10")
        po.save()
        it.refresh_from_db()
        self.assertNotEqual(it.cost, c0)
        self.assertEqual(it.cost, po.compute_item_cost(Decimal("100.00")))

    def test_item_retail_change_recomputes_cost(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number="PO-T-COST-3",
            ordered_date="2024-01-03",
            purchase_cost=Decimal("100.00"),
            retail_value=Decimal("500.00"),
            est_shrink=Decimal("0.15"),
        )
        p = Product.objects.create(title="P2", product_number="P-COST-2")
        it = Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=po,
            title="Line",
            retail_value=Decimal("100.00"),
        )
        it.refresh_from_db()
        self.assertEqual(it.cost, po.compute_item_cost(Decimal("100.00")))
        it.retail_value = Decimal("200.00")
        it.save()
        it.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(it.cost, po.compute_item_cost(Decimal("200.00")))

    def test_item_po_change_recomputes_both_orders(self):
        po_a = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number="PO-T-COST-4A",
            ordered_date="2024-01-04",
            purchase_cost=Decimal("100.00"),
            retail_value=Decimal("500.00"),
            est_shrink=Decimal("0.15"),
        )
        po_b = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number="PO-T-COST-4B",
            ordered_date="2024-01-04",
            purchase_cost=Decimal("200.00"),
            retail_value=Decimal("400.00"),
            est_shrink=Decimal("0.15"),
        )
        p = Product.objects.create(title="P3", product_number="P-COST-3")
        it = Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=po_a,
            title="Moved",
            retail_value=Decimal("100.00"),
        )
        it.refresh_from_db()
        cost_on_a = it.cost
        self.assertIsNotNone(cost_on_a)
        it.purchase_order = po_b
        it.save()
        it.refresh_from_db()
        po_a.refresh_from_db()
        po_b.refresh_from_db()
        self.assertEqual(it.cost, po_b.compute_item_cost(Decimal("100.00")))
        # Remaining items on po_a (none) — recompute still ran; no other lines on A
        items_a = Item.objects.filter(purchase_order=po_a)
        self.assertEqual(items_a.count(), 0)

    def test_get_default_po_est_shrink_reads_appsetting(self):
        AppSetting.objects.update_or_create(
            key=SETTING_KEY_PO_DEFAULT_EST_SHRINK,
            defaults={'value': 0.22, 'description': 'test'},
        )
        self.assertEqual(get_default_po_est_shrink(), Decimal('0.22'))
