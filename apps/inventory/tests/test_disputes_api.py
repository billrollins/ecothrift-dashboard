"""Dispute model APIs and rollup behavior."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Dispute, Item, ManifestRow, Product, PurchaseOrder, Vendor


class DisputeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='disp@example.com',
            first_name='D',
            last_name='Test',
            password='testpw',
        )
        self.user.groups.add(self.group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='DispVendor', code='DSP-V')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-DSP-1',
            ordered_date='2026-05-02',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
            status='paid',
        )

    def test_create_intake_dispute_sets_rollup_active(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/disputes/',
            {'kind': 'intake', 'title': 'Missing carton', 'description': 'Dock'},
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.po.refresh_from_db()
        self.assertEqual(self.po.intake_dispute_status, 'active')
        self.assertEqual(Dispute.objects.filter(purchase_order=self.po).count(), 1)

    def test_resolve_dispute_updates_rollup(self):
        d = Dispute.objects.create(
            purchase_order=self.po,
            kind=Dispute.KIND_INTAKE,
            status=Dispute.STATUS_OPEN,
            title='T',
        )
        self.po.intake_dispute_status = 'active'
        self.po.save(update_fields=['intake_dispute_status'])
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.id}/disputes/{d.id}/',
            {'status': 'resolved'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.po.refresh_from_db()
        self.assertEqual(self.po.intake_dispute_status, 'resolved')

    def test_processing_dispute_endpoint_creates_dispute_row(self):
        p = Product.objects.create(title='P', product_number='PRD-D-1')
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=1,
            quantity=1,
            title='Line',
            matched_product=p,
            unit_retail=Decimal('5'),
        )
        it = Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=self.po,
            manifest_row=mr,
            retail=Decimal('5'),
            status='intake',
        )
        self.po.status = 'processing'
        self.po.save(update_fields=['status'])
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-dispute/',
            {'scope': 'items', 'ids': [it.id], 'type': 'undelivered'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('dispute_id', r.data)
        self.assertTrue(
            Dispute.objects.filter(pk=r.data['dispute_id'], kind=Dispute.KIND_PROCESSING).exists(),
        )
        self.po.refresh_from_db()
        self.assertEqual(self.po.processing_dispute_status, 'active')

    @patch('apps.inventory.processing_ops.refresh_processing_rows_denorm', side_effect=RuntimeError('denorm_failed'))
    def test_processing_dispute_rolls_back_items_when_denorm_fails(self, _mock_denorm):
        p = Product.objects.create(title='P2', product_number='PRD-D-2')
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=2,
            quantity=1,
            title='Line2',
            matched_product=p,
            unit_retail=Decimal('5'),
        )
        it = Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=self.po,
            manifest_row=mr,
            retail=Decimal('5'),
            status='intake',
        )
        self.po.status = 'processing'
        self.po.save(update_fields=['status'])

        dispute_count_before = Dispute.objects.filter(purchase_order=self.po).count()

        with self.assertRaises(RuntimeError):
            self.client.post(
                f'/api/inventory/orders/{self.po.id}/processing-dispute/',
                {'scope': 'items', 'ids': [it.id], 'type': 'undelivered'},
                format='json',
            )

        it.refresh_from_db()
        self.assertEqual(it.status, 'intake')
        self.assertEqual(
            Dispute.objects.filter(purchase_order=self.po).count(),
            dispute_count_before,
        )
