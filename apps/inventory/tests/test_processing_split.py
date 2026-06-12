"""P4 split: distinct product count, mixed check-in guard, batch remap."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ManifestRow,
    ProcessingCheckInBatch,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.processing_workspace import (
    build_processing_workspace,
    refresh_processing_rows_denorm,
)


class ProcessingSplitTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='Staff',
            last_name='User',
            password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

    def _crayons_order(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CRAYONS',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product_a = Product.objects.create(title='Crayons Set A', brand='Crayola')
        product_b = Product.objects.create(title='Crayons Set B', brand='Crayola')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=24,
            title='Crayons bulk',
            brand='Crayola',
            unit_retail=Decimal('12.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=24,
            title='Crayons bulk',
            brand='Crayola',
            unit_retail=Decimal('12.00'),
            shelf_price=Decimal('4.99'),
        )
        return order, pr, mr, product_a, product_b


class DistinctProductCountTests(ProcessingSplitTestBase):
    def test_two_check_ins_two_products_updates_denorm(self):
        order, pr, mr, product_a, product_b = self._crayons_order()

        r1 = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '4.99',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.assertEqual(r1.status_code, 200, r1.data)

        r2 = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 14,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '5.99',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )
        self.assertEqual(r2.status_code, 200, r2.data)

        pr.refresh_from_db()
        self.assertEqual(pr.distinct_product_count, 2)
        self.assertEqual(pr.qty_dispositioned, 24)
        self.assertEqual(Item.objects.filter(manifest_row=mr).count(), 24)

        workspace = build_processing_workspace(order, limit=10, hide_checked_in=False)
        row = workspace['rows'][0]
        self.assertEqual(row['distinctProductCount'], 2)

    def test_primary_matched_product_is_most_units_product(self):
        order, pr, mr, product_a, product_b = self._crayons_order()

        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 14,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )

        pr.refresh_from_db()
        self.assertEqual(pr.matched_product_id, product_b.id)


class MixedCheckInGuardTests(ProcessingSplitTestBase):
    def test_implicit_check_in_on_mixed_row_returns_400(self):
        order, pr, _mr, product_a, product_b = self._crayons_order()

        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 4,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Multiple products', resp.data['detail'])

    def test_explicit_product_on_mixed_row_succeeds(self):
        order, pr, mr, product_a, product_b = self._crayons_order()

        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 4,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 2,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Item.objects.filter(manifest_row=mr, product=product_a).count(), 12)


class BatchRemapTests(ProcessingSplitTestBase):
    def test_remap_batch_updates_items_and_denorm(self):
        order, pr, mr, product_a, product_b = self._crayons_order()
        product_b_prime = Product.objects.create(title='Crayons Set B Prime', brand='Crayola')

        r1 = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        r2 = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 14,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )
        batch_id = r2.data['check_in_batch_id']
        self.assertIsNotNone(batch_id)

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-batch/{batch_id}/remap-product/',
            {'product_mode': 'existing', 'product_id': product_b_prime.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['product_id'], product_b_prime.id)
        self.assertEqual(resp.data['items_updated'], 14)

        batch = ProcessingCheckInBatch.objects.get(pk=batch_id)
        self.assertEqual(batch.product_id, product_b_prime.id)
        self.assertEqual(
            Item.objects.filter(manifest_row=mr, product=product_b_prime).count(),
            14,
        )
        self.assertEqual(Item.objects.filter(manifest_row=mr, product=product_b).count(), 0)

        pr.refresh_from_db()
        self.assertEqual(pr.distinct_product_count, 2)
        self.assertEqual(pr.matched_product_id, product_b_prime.id)

    def test_crayons_scenario_totals(self):
        order, pr, mr, product_a, product_b = self._crayons_order()

        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 10,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_a.id,
            },
            format='json',
        )
        self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 14,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'product_mode': 'existing',
                'product_id': product_b.id,
            },
            format='json',
        )

        refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        self.assertEqual(pr.qty_dispositioned, 24)
        self.assertEqual(pr.distinct_product_count, 2)
        self.assertEqual(pr.matched_product_id, product_b.id)

        workspace = build_processing_workspace(order, limit=10, hide_checked_in=False)
        self.assertEqual(workspace['rows'][0]['distinctProductCount'], 2)
