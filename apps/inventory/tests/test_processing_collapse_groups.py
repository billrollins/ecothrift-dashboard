"""P7 collapse groups: master/member grouping + fill-in-order check-in distribution."""

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


class CollapseGroupTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-COLLAPSE',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        self.product = Product.objects.create(title='Shared Widget', brand='Acme')
        # Three rows: qty 5, 3, 7 (the owner's worked example).
        self.rows = []
        for n, qty in ((1, 5), (2, 3), (3, 7)):
            mr = ManifestRow.objects.create(
                purchase_order=self.order, row_number=n, quantity=qty,
                title=f'Line {n}', unit_retail=Decimal('10.00'),
            )
            pr = ProcessingRow.objects.create(
                purchase_order=self.order, manifest_row=mr, row_number=n, quantity=qty,
                title=f'Line {n}', shelf_price=Decimal('4.99'), matched_product=self.product,
            )
            self.rows.append(pr)

    def _collapse(self, ids=None, **extra):
        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-collapse-rows/',
            {'processing_row_ids': ids or [r.id for r in self.rows], **extra},
            format='json',
        )

    def _check_in(self, row_id, qty, **extra):
        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {'processing_row_id': row_id, 'quantity': qty, 'condition': 'good', **extra},
            format='json',
        )


class CollapseGroupTests(CollapseGroupTestBase):
    def test_collapse_sets_master_and_members(self):
        resp = self._collapse()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['master_processing_row_id'], self.rows[0].id)
        for r in self.rows[1:]:
            r.refresh_from_db()
            self.assertEqual(r.collapse_master_id, self.rows[0].id)
        self.rows[0].refresh_from_db()
        self.assertIsNone(self.rows[0].collapse_master_id)

    def test_collapse_keep_requires_shared_hint(self):
        other = Product.objects.create(title='Other')
        ProcessingRow.objects.filter(pk=self.rows[1].pk).update(matched_product=other)
        resp = self._collapse()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('different product decisions', resp.data['detail'])

    def test_collapse_with_new_product_assigns_all(self):
        ProcessingRow.objects.filter(purchase_order=self.order).update(matched_product=None)
        before = Product.objects.count()
        resp = self._collapse(product_mode='new', title='Fresh Group Product')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Product.objects.count(), before + 1)
        for r in self.rows:
            r.refresh_from_db()
            self.assertEqual(r.matched_product_id, resp.data['product_id'])

    def test_fill_in_order_distribution_5_3_7_check_in_10(self):
        """Owner's example: rows 5/3/7, check in 10 → 5 + 3 + 2; remaining 5 on last row."""
        self.assertEqual(self._collapse().status_code, 200)
        resp = self._check_in(self.rows[0].id, 10)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created_count'], 10)
        self.assertEqual(len(resp.data['check_in_batch_ids']), 3)

        per_row = {
            r.manifest_row_id: Item.objects.filter(manifest_row_id=r.manifest_row_id).count()
            for r in self.rows
        }
        self.assertEqual(per_row[self.rows[0].manifest_row_id], 5)
        self.assertEqual(per_row[self.rows[1].manifest_row_id], 3)
        self.assertEqual(per_row[self.rows[2].manifest_row_id], 2)
        # All items share the group's product.
        self.assertEqual(
            Item.objects.filter(purchase_order=self.order).exclude(product=self.product).count(), 0,
        )
        # Second check-in of 5 fills the last row exactly.
        resp = self._check_in(self.rows[0].id, 5)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Item.objects.filter(manifest_row_id=self.rows[2].manifest_row_id).count(), 7)

    def test_overage_lands_on_last_row(self):
        self.assertEqual(self._collapse().status_code, 200)
        resp = self._check_in(self.rows[0].id, 20)  # group total is 15
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created_count'], 20)
        self.assertEqual(Item.objects.filter(manifest_row_id=self.rows[2].manifest_row_id).count(), 12)

    def test_follower_rejects_direct_check_in(self):
        self.assertEqual(self._collapse().status_code, 200)
        resp = self._check_in(self.rows[1].id, 1)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('collapsed into row', resp.data['detail'])

    def test_uncollapse_restores_individual_rows(self):
        self.assertEqual(self._collapse().status_code, 200)
        resp = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-uncollapse-rows/',
            {'master_processing_row_id': self.rows[0].id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        for r in self.rows[1:]:
            r.refresh_from_db()
            self.assertIsNone(r.collapse_master_id)

    def test_workspace_list_exposes_collapse_rollup(self):
        self.assertEqual(self._collapse().status_code, 200)
        resp = self.client.get(f'/api/inventory/orders/{self.order.id}/processing-workspace/')
        self.assertEqual(resp.status_code, 200)
        by_id = {r['processing_row_id']: r for r in resp.data['rows']}
        master = by_id[self.rows[0].id]
        self.assertIsNone(master['collapseMasterId'])
        self.assertEqual(master['collapsedGroup']['memberRowNumbers'], [2, 3])
        self.assertEqual(master['collapsedGroup']['totalQty'], 15)
        self.assertEqual(by_id[self.rows[1].id]['collapseMasterId'], self.rows[0].id)

    def test_manifest_rows_untouched_by_collapse(self):
        self.assertEqual(self._collapse().status_code, 200)
        self._check_in(self.rows[0].id, 10)
        for r in self.rows:
            mr = ManifestRow.objects.get(pk=r.manifest_row_id)
            self.assertEqual(mr.quantity, r.quantity)

    def test_master_status_reflects_group_after_partial_fill(self):
        """Fill-in-order fills the master first — its status must stay GROUP-partial,
        not own-row checked_in, or hide_checked_in would drop the whole group."""
        self.assertEqual(self._collapse().status_code, 200)
        resp = self._check_in(self.rows[0].id, 5)  # master's own 5 fully filled; group 5/15
        self.assertEqual(resp.status_code, 200, resp.data)
        self.rows[0].refresh_from_db()
        self.assertEqual(self.rows[0].queue_status, 'partial')

        # And the default filtered queue (hide_checked_in) still returns the master.
        ws = self.client.get(
            f'/api/inventory/orders/{self.order.id}/processing-workspace/',
            {'hide_checked_in': 'true'},
        )
        self.assertEqual(ws.status_code, 200)
        ids = {r['processing_row_id'] for r in ws.data['rows']}
        self.assertIn(self.rows[0].id, ids)

    def test_master_status_checked_in_when_group_full_via_member_only_touch(self):
        """Second check-in allocates to members only (master already full) — the scoped
        denorm must still pull the master in and flip it to checked_in."""
        self.assertEqual(self._collapse().status_code, 200)
        self.assertEqual(self._check_in(self.rows[0].id, 5).status_code, 200)
        self.assertEqual(self._check_in(self.rows[0].id, 10).status_code, 200)
        self.rows[0].refresh_from_db()
        self.assertEqual(self.rows[0].queue_status, 'checked_in')

    def test_master_detail_covers_whole_group(self):
        """Master row detail: combined rollup, every member's items + batches, group status."""
        self.assertEqual(self._collapse().status_code, 200)
        self.assertEqual(self._check_in(self.rows[0].id, 10).status_code, 200)

        resp = self.client.get(
            f'/api/inventory/orders/{self.order.id}/processing-row-detail/',
            {'processing_row_id': self.rows[0].id},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        row = resp.data['row']
        self.assertEqual(row['collapsedGroup']['totalQty'], 15)
        self.assertEqual(row['collapsedGroup']['totalDispositioned'], 10)
        self.assertEqual(row['collapsedGroup']['memberRowNumbers'], [2, 3])
        self.assertEqual(len(row['items']), 10)  # 5 + 3 + 2 across the group
        self.assertEqual(len(row['checkInBatches']), 3)  # one batch per member touched
        self.assertEqual(row['status'], 'partial')

    def test_check_in_quantity_above_500_allowed(self):
        """Owner ruling: no 500 cap — the UI confirms big runs instead of blocking them."""
        resp = self._check_in(self.rows[2].id, 501)  # uncollapsed row of 7 → 494 overage
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['created_count'], 501)

    def test_check_in_quantity_above_backstop_rejected(self):
        resp = self._check_in(self.rows[2].id, 10_001)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('safety limit', resp.data['detail'])

    def test_member_detail_stays_own_row(self):
        self.assertEqual(self._collapse().status_code, 200)
        self.assertEqual(self._check_in(self.rows[0].id, 10).status_code, 200)
        resp = self.client.get(
            f'/api/inventory/orders/{self.order.id}/processing-row-detail/',
            {'processing_row_id': self.rows[1].id},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        row = resp.data['row']
        self.assertNotIn('collapsedGroup', row)
        self.assertEqual(len(row['items']), 3)
