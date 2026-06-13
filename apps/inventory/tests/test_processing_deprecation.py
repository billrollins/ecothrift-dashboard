"""P6 deprecation: assign shared product, merge retired, manifest match writes stopped."""

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
from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm


class ProcessingDeprecationTestBase(TestCase):
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

    def _two_hint_order(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-ASSIGN',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product_a = Product.objects.create(title='Product A', brand='BrandA')
        product_b = Product.objects.create(title='Product B', brand='BrandB')
        shared = Product.objects.create(title='Shared Controller', brand='Microsoft')
        rows = []
        for n, product in ((10, product_a), (11, product_b)):
            mr = ManifestRow.objects.create(
                purchase_order=order,
                row_number=n,
                quantity=1,
                title=f'Line {n}',
                brand='Microsoft',
                unit_retail=Decimal('49.99'),
            )
            pr = ProcessingRow.objects.create(
                purchase_order=order,
                manifest_row=mr,
                row_number=n,
                quantity=1,
                title=f'Line {n}',
                brand='Microsoft',
                unit_retail=Decimal('49.99'),
                shelf_price=Decimal('19.99'),
                matched_product=product,
            )
            rows.append((pr, mr))
        return order, shared, rows


class AssignSharedProductTests(ProcessingDeprecationTestBase):
    def test_assign_aligns_processing_rows_without_manifest_write(self):
        order, shared, row_pairs = self._two_hint_order()
        pr1, mr1 = row_pairs[0]
        pr2, mr2 = row_pairs[1]
        mr1_matched_before = mr1.matched_product_id
        mr2_matched_before = mr2.matched_product_id

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-assign-shared-product/',
            {
                'processing_row_ids': [pr1.id, pr2.id],
                'product_mode': 'existing',
                'product_id': shared.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        pr1.refresh_from_db()
        pr2.refresh_from_db()
        mr1.refresh_from_db()
        mr2.refresh_from_db()
        self.assertEqual(pr1.matched_product_id, shared.id)
        self.assertEqual(pr2.matched_product_id, shared.id)
        self.assertEqual(mr1.matched_product_id, mr1_matched_before)
        self.assertEqual(mr2.matched_product_id, mr2_matched_before)

    def test_assign_with_new_product_creates_and_assigns(self):
        """product_mode=new: creates a catalog Product from the first row, assigns to all."""
        order, _shared, row_pairs = self._two_hint_order()
        pr1, mr1 = row_pairs[0]
        pr2, mr2 = row_pairs[1]
        before = Product.objects.count()

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-assign-shared-product/',
            {
                'processing_row_ids': [pr1.id, pr2.id],
                'product_mode': 'new',
                'title': 'Brand New Shared Widget',
                'brand': 'Acme',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Product.objects.count(), before + 1)

        pr1.refresh_from_db()
        pr2.refresh_from_db()
        self.assertEqual(pr1.matched_product_id, pr2.matched_product_id)
        self.assertEqual(pr1.matched_product.title, 'Brand New Shared Widget')
        # Manifest stays frozen.
        mr1.refresh_from_db()
        mr2.refresh_from_db()
        self.assertNotEqual(mr1.matched_product_id, pr1.matched_product_id)

    def test_after_assign_check_in_together_succeeds(self):
        order, shared, row_pairs = self._two_hint_order()
        pr1, _mr1 = row_pairs[0]
        pr2, _mr2 = row_pairs[1]

        assign = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-assign-shared-product/',
            {
                'processing_row_ids': [pr1.id, pr2.id],
                'product_mode': 'existing',
                'product_id': shared.id,
            },
            format='json',
        )
        self.assertEqual(assign.status_code, 200, assign.data)

        together = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            {
                'processing_row_ids': [pr1.id, pr2.id],
                'rows': [
                    {'processing_row_id': pr1.id, 'quantity': 1},
                    {'processing_row_id': pr2.id, 'quantity': 1},
                ],
                'product_mode': 'existing',
                'product_id': shared.id,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '19.99',
            },
            format='json',
        )
        self.assertEqual(together.status_code, 200, together.data)
        self.assertEqual(together.data['created_count'], 2)
        self.assertEqual(Item.objects.filter(purchase_order=order).count(), 2)


class AssignSharedProductGuardTests(ProcessingDeprecationTestBase):
    def test_assign_rejects_row_with_checked_in_units_of_other_product(self):
        """Denorm recomputes the hint from dispositioned items; assigning over them must 400, not silently revert."""
        order, shared, row_pairs = self._two_hint_order()
        pr1, mr1 = row_pairs[0]
        pr2, _mr2 = row_pairs[1]
        other = Product.objects.create(title='Already Checked In', brand='X')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=other,
            purchase_order=order,
            manifest_row=mr1,
            price=Decimal('19.99'),
            source='purchased',
            status='on_shelf',
            condition='good',
        )

        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-assign-shared-product/',
            {
                'processing_row_ids': [pr1.id, pr2.id],
                'product_mode': 'existing',
                'product_id': shared.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('checked-in units of a different product', resp.data['detail'])
        pr1.refresh_from_db()
        pr2.refresh_from_db()
        self.assertNotEqual(pr1.matched_product_id, shared.id)
        self.assertNotEqual(pr2.matched_product_id, shared.id)


class RowDefaultsPatchManifestFrozenTests(ProcessingDeprecationTestBase):
    def test_row_patch_does_not_overwrite_manifest_row(self):
        """Rule 1: row-default edits stay on ProcessingRow; the vendor claim is frozen."""
        order, _shared, row_pairs = self._two_hint_order()
        pr, mr = row_pairs[0]
        mr_before = {
            'title': mr.title,
            'brand': mr.brand,
            'unit_retail': mr.unit_retail,
            'condition': mr.condition,
            'notes': mr.notes,
            'identifiers': mr.identifiers,
        }

        resp = self.client.patch(
            f'/api/inventory/orders/{order.id}/processing-row-patch/',
            {
                'processing_row_id': pr.id,
                'title': 'Staff Edited Title',
                'brand': 'Staff Brand',
                'unit_retail': '99.99',
                'condition': 'good',
                'notes': 'staff note',
                'identifiers': {'upc': '012345678905'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        pr.refresh_from_db()
        mr.refresh_from_db()
        self.assertEqual(pr.title, 'Staff Edited Title')
        self.assertEqual(pr.brand, 'Staff Brand')
        for field, before in mr_before.items():
            self.assertEqual(getattr(mr, field), before, f'ManifestRow.{field} was overwritten')


class ManualReviewSyncSplitRowTests(ProcessingDeprecationTestBase):
    def test_sync_does_not_repoint_split_row_items(self):
        """P4 split rows: manual-review sync must not collapse items onto one product."""
        from apps.inventory.views import sync_manifest_row_outputs_to_items

        order, _shared, row_pairs = self._two_hint_order()
        _pr, mr = row_pairs[0]
        prod_a = Product.objects.create(title='Split A', brand='A')
        prod_b = Product.objects.create(title='Split B', brand='B')
        item_a = Item.objects.create(
            sku=Item.generate_sku(),
            product=prod_a,
            purchase_order=order,
            manifest_row=mr,
            price=Decimal('10.00'),
            source='purchased',
            status='on_shelf',
            condition='good',
        )
        item_b = Item.objects.create(
            sku=Item.generate_sku(),
            product=prod_b,
            purchase_order=order,
            manifest_row=mr,
            price=Decimal('10.00'),
            source='purchased',
            status='on_shelf',
            condition='good',
        )
        title_a_before = prod_a.title

        sync_manifest_row_outputs_to_items(order, [mr])

        item_a.refresh_from_db()
        item_b.refresh_from_db()
        prod_a.refresh_from_db()
        self.assertEqual(item_a.product_id, prod_a.id)
        self.assertEqual(item_b.product_id, prod_b.id)
        self.assertEqual(prod_a.title, title_a_before)


class RetiredEndpointTests(ProcessingDeprecationTestBase):
    def test_merge_endpoint_removed(self):
        order, _, row_pairs = self._two_hint_order()
        pr1, _ = row_pairs[0]
        pr2, _ = row_pairs[1]
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-merge-rows/',
            {'processing_row_ids': [pr1.id, pr2.id], 'field_values': {'title': 'x'}},
            format='json',
        )
        self.assertEqual(resp.status_code, 404)

    def test_match_products_returns_410(self):
        order, _, _ = self._two_hint_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/match-products/',
            {},
            format='json',
        )
        self.assertEqual(resp.status_code, 410)


class DenormReaderTests(ProcessingDeprecationTestBase):
    def test_denorm_does_not_adopt_manifest_match_when_pr_hint_set(self):
        order, shared, row_pairs = self._two_hint_order()
        pr, mr = row_pairs[0]
        other = Product.objects.create(title='Manifest-only product', brand='X')
        mr.matched_product = other
        mr.save(update_fields=['matched_product'])
        pr.matched_product = shared
        pr.save(update_fields=['matched_product'])

        refresh_processing_rows_denorm(order, processing_row_ids=[pr.id])
        pr.refresh_from_db()
        self.assertEqual(pr.matched_product_id, shared.id)
