"""P5 collapse: same-product peers, check-in together."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ManifestRow,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.processing_workspace import build_processing_workspace


class ProcessingCollapseTestBase(TestCase):
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

    def _controllers_order(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CTRL',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Xbox Controller', brand='Microsoft')
        rows = []
        for n in (12, 40, 41):
            mr = ManifestRow.objects.create(
                purchase_order=order,
                row_number=n,
                quantity=1,
                title=f'Controller line {n}',
                brand='Microsoft',
                unit_retail=Decimal('49.99'),
            )
            pr = ProcessingRow.objects.create(
                purchase_order=order,
                manifest_row=mr,
                row_number=n,
                quantity=1,
                title=f'Controller line {n}',
                brand='Microsoft',
                unit_retail=Decimal('49.99'),
                shelf_price=Decimal('19.99'),
                matched_product=product,
            )
            rows.append(pr)
        return order, product, rows


class SameProductPeerTests(ProcessingCollapseTestBase):
    def test_list_includes_peer_row_numbers_excluding_self(self):
        order, _product, rows = self._controllers_order()
        workspace = build_processing_workspace(order, limit=50, hide_checked_in=False)
        by_num = {r['rowNum']: r for r in workspace['rows']}
        self.assertEqual(by_num[12]['sameProductRowNumbers'], [40, 41])
        self.assertEqual(by_num[40]['sameProductRowNumbers'], [12, 41])
        self.assertNotIn(40, by_num[40]['sameProductRowNumbers'])


class CheckInTogetherTests(ProcessingCollapseTestBase):
    def test_together_check_in_creates_items_with_distinct_manifest_rows(self):
        order, product, rows = self._controllers_order()
        payload = {
            'processing_row_ids': [r.id for r in rows],
            'rows': [{'processing_row_id': r.id, 'quantity': 1} for r in rows],
            'product_mode': 'existing',
            'product_id': product.id,
            'condition': 'good',
            'dispatch': 'on_shelf',
            'price': '19.99',
        }
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            payload,
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created_count'], 3)
        items = Item.objects.filter(purchase_order=order).order_by('manifest_row__row_number')
        self.assertEqual(items.count(), 3)
        self.assertEqual(len({i.manifest_row_id for i in items}), 3)
        self.assertTrue(all(i.product_id == product.id for i in items))

    def test_together_rejects_single_row(self):
        order, product, rows = self._controllers_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            {
                'processing_row_ids': [rows[0].id],
                'rows': [{'processing_row_id': rows[0].id, 'quantity': 1}],
                'product_mode': 'existing',
                'product_id': product.id,
                'condition': 'good',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_together_rejects_mismatched_product_id(self):
        order, product, rows = self._controllers_order()
        other = Product.objects.create(title='Other', brand='Other')
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            {
                'processing_row_ids': [r.id for r in rows],
                'rows': [{'processing_row_id': r.id, 'quantity': 1} for r in rows],
                'product_mode': 'existing',
                'product_id': other.id,
                'condition': 'good',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_together_rejects_mixed_row(self):
        order, product, rows = self._controllers_order()
        mixed = rows[0]
        mixed.distinct_product_count = 2
        mixed.save(update_fields=['distinct_product_count'])
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            {
                'processing_row_ids': [r.id for r in rows],
                'rows': [{'processing_row_id': r.id, 'quantity': 1} for r in rows],
                'product_mode': 'existing',
                'product_id': product.id,
                'condition': 'good',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

