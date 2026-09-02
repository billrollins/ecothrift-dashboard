"""P9 row transforms: Break apart / Make set / Restart row."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ManifestRow,
    ItemCheckIn,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.processing_workspace import build_processing_workspace


class ProcessingTransformTestBase(TestCase):
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

    def _order_with_row(self, *, qty, unit_retail='50.00', shelf_price='20.00', row_number=7, title='Case of plates'):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number=f'PO-TX-{row_number}-{qty}',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=row_number,
            quantity=qty,
            title=title,
            unit_retail=Decimal(unit_retail),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=row_number,
            quantity=qty,
            title=title,
            unit_retail=Decimal(unit_retail),
            # Finalize writes shelf_price and final_price together; denorm's itemless
            # fallback (shelf_price = final_price) relies on that.
            shelf_price=Decimal(shelf_price),
            final_price=Decimal(shelf_price),
        )
        return order, mr, pr

    def _break_apart(self, order, payload):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-break-apart-row/',
            payload,
            format='json',
        )

    def _make_set(self, order, payload):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-make-set-row/',
            payload,
            format='json',
        )

    def _restart(self, order, payload):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-restart-row/',
            payload,
            format='json',
        )

    def _check_in(self, order, row_id, quantity, **extra):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {'processing_row_id': row_id, 'quantity': quantity, 'condition': 'good', **extra},
            format='json',
        )


class BreakApartTests(ProcessingTransformTestBase):
    def test_whole_row_breaks_in_place(self):
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 10, 'factor': 500})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data['sub_processing_row_id'])
        pr.refresh_from_db()
        self.assertEqual(pr.quantity, 5000)
        self.assertEqual(pr.unit_retail, Decimal('0.10'))
        self.assertEqual(pr.shelf_price, Decimal('0.04'))
        self.assertEqual(len(pr.transforms), 1)
        self.assertEqual(pr.transforms[0]['op'], 'break_apart')
        self.assertTrue(pr.transforms[0]['in_place'])
        self.assertEqual(pr.original_snapshot['quantity'], 10)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=order).count(), 1)

    def test_partial_creates_sub_row(self):
        order, mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 4, 'factor': 500})
        self.assertEqual(resp.status_code, 200, resp.data)
        sub_id = resp.data['sub_processing_row_id']
        self.assertIsNotNone(sub_id)
        pr.refresh_from_db()
        sub = ProcessingRow.objects.get(pk=sub_id)
        self.assertEqual(pr.quantity, 6)
        self.assertEqual(sub.quantity, 2000)
        self.assertEqual(sub.split_parent_id, pr.id)
        self.assertEqual(sub.split_seq, 1)
        self.assertEqual(sub.manifest_row_id, mr.id)
        self.assertEqual(pr.transforms[0]['sub_row_id'], sub.id)
        # Searching the parent number finds the family.
        self.assertIn('7.1', sub.search_string)

    def test_over_expected_allowed_expected_rederives(self):
        # Expected is an estimate - breaking apart MORE than expected is allowed
        # (extra received); with nothing checked in it rewrites the row in place.
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 11, 'factor': 500})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data['sub_processing_row_id'])
        pr.refresh_from_db()
        self.assertEqual(pr.quantity, 5500)
        self.assertEqual(pr.transforms[0]['over_expected'], 1)

    def test_workspace_list_carries_split_fields(self):
        order, _mr, pr = self._order_with_row(qty=10)
        self._break_apart(order, {'processing_row_id': pr.id, 'units': 4, 'factor': 500})
        workspace = build_processing_workspace(order, limit=50, hide_checked_in=False)
        sub_row = next(r for r in workspace['rows'] if r['splitParentId'] == pr.id)
        self.assertEqual(sub_row['splitParentRowNumber'], 7)
        self.assertEqual(sub_row['splitSeq'], 1)


class MakeSetTests(ProcessingTransformTestBase):
    def test_whole_pool_becomes_sets_in_place(self):
        order, _mr, pr = self._order_with_row(qty=5000, unit_retail='0.10', shelf_price='0.05')
        resp = self._make_set(order, {'processing_row_id': pr.id, 'set_size': 500, 'num_sets': 10})
        self.assertEqual(resp.status_code, 200, resp.data)
        pr.refresh_from_db()
        self.assertEqual(pr.quantity, 10)
        self.assertEqual(pr.unit_retail, Decimal('50.00'))
        self.assertEqual(pr.shelf_price, Decimal('25.00'))
        self.assertEqual(pr.transforms[0]['op'], 'make_set')

    def test_partial_candles_sets_create_single_unit_items(self):
        order, _mr, pr = self._order_with_row(
            qty=12000, unit_retail='1.00', shelf_price='0.50', title='Prayer candle',
        )
        resp = self._make_set(order, {
            'processing_row_id': pr.id,
            'set_size': 500,
            'num_sets': 4,
            'shelf_price': '150.00',
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        sub = ProcessingRow.objects.get(pk=resp.data['sub_processing_row_id'])
        pr.refresh_from_db()
        self.assertEqual(pr.quantity, 10000)
        self.assertEqual(sub.quantity, 4)
        self.assertEqual(sub.shelf_price, Decimal('150.00'))

        check = self._check_in(order, sub.id, 4)
        self.assertEqual(check.status_code, 200, check.data)
        sub_items = Item.objects.filter(pk__in=[i['id'] for i in check.data['items']])
        self.assertEqual(sub_items.count(), 4)

        check_root = self._check_in(order, pr.id, 2)
        self.assertEqual(check_root.status_code, 200, check_root.data)
        root_items = Item.objects.filter(pk__in=[i['id'] for i in check_root.data['items']])
        self.assertEqual(root_items.count(), 2)

        # Expected sums follow the rewritten row quantities: 10,000 singles + 4 sets.
        workspace = build_processing_workspace(order, limit=50, hide_checked_in=False)
        self.assertEqual(workspace['rollups']['expected_qty'], 10004)
        self.assertEqual(workspace['rollups']['dispositioned_qty'], 6)

    def test_product_mode_new_creates_set_product(self):
        order, _mr, pr = self._order_with_row(qty=5000, title='Prayer candle')
        resp = self._make_set(order, {
            'processing_row_id': pr.id,
            'set_size': 500,
            'num_sets': 4,
            'product_mode': 'new',
            'title': 'Prayer Candles - Box of 500',
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        sub = ProcessingRow.objects.get(pk=resp.data['sub_processing_row_id'])
        self.assertIsNotNone(sub.matched_product_id)
        self.assertEqual(sub.matched_product.title, 'Prayer Candles - Box of 500')
        pr.refresh_from_db()
        self.assertEqual(pr.transforms[0]['created_product_id'], sub.matched_product_id)
        self.assertIsNone(pr.matched_product_id)  # root keeps its own (none) product


class TransformGuardTests(ProcessingTransformTestBase):
    def test_sub_row_transform_blocked(self):
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 4, 'factor': 500})
        sub_id = resp.data['sub_processing_row_id']
        again = self._break_apart(order, {'processing_row_id': sub_id, 'units': 100, 'factor': 2})
        self.assertEqual(again.status_code, 400)
        self.assertIn('sub row', again.data['detail'])

    def test_collapsed_row_transform_blocked(self):
        order, _mr, pr = self._order_with_row(qty=10)
        other_mr = ManifestRow.objects.create(
            purchase_order=order, row_number=8, quantity=1, title='Other',
        )
        other = ProcessingRow.objects.create(
            purchase_order=order, manifest_row=other_mr, row_number=8, quantity=1,
            title='Other', collapse_master=pr,
        )
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 10, 'factor': 5})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('collapse', resp.data['detail'])
        resp2 = self._break_apart(order, {'processing_row_id': other.id, 'units': 1, 'factor': 5})
        self.assertEqual(resp2.status_code, 400)

    def test_split_family_rows_cannot_collapse(self):
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {'processing_row_id': pr.id, 'units': 4, 'factor': 500})
        sub_id = resp.data['sub_processing_row_id']
        collapse = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-collapse-rows/',
            {'processing_row_ids': [pr.id, sub_id], 'product_mode': 'keep'},
            format='json',
        )
        self.assertEqual(collapse.status_code, 400)
        self.assertIn('family', collapse.data['detail'])


class SplitAttributionTests(ProcessingTransformTestBase):
    def test_sibling_items_do_not_cross_count(self):
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._break_apart(order, {
            'processing_row_id': pr.id, 'units': 4, 'factor': 500,
            'product_mode': 'new', 'title': 'Single plate',
        })
        sub = ProcessingRow.objects.get(pk=resp.data['sub_processing_row_id'])

        case_product = Product.objects.create(title='Case of plates')
        check_root = self._check_in(
            order, pr.id, 2, product_mode='existing', product_id=case_product.id,
        )
        self.assertEqual(check_root.status_code, 200, check_root.data)
        check_sub = self._check_in(order, sub.id, 3)
        self.assertEqual(check_sub.status_code, 200, check_sub.data)

        pr.refresh_from_db()
        sub.refresh_from_db()
        self.assertEqual(pr.qty_dispositioned, 2)
        self.assertEqual(sub.qty_dispositioned, 3)
        # Different products on siblings never flag either row as mixed.
        self.assertEqual(pr.distinct_product_count, 1)
        self.assertEqual(sub.distinct_product_count, 1)
        # Quick check-in (implicit product reuse) stays available on the root.
        again = self._check_in(order, pr.id, 1)
        self.assertEqual(again.status_code, 200, again.data)

    def test_check_in_price_push_stays_on_own_row(self):
        order, _mr, pr = self._order_with_row(qty=12000, shelf_price='0.50')
        resp = self._make_set(order, {
            'processing_row_id': pr.id, 'set_size': 500, 'num_sets': 4, 'shelf_price': '150.00',
        })
        sub = ProcessingRow.objects.get(pk=resp.data['sub_processing_row_id'])
        check = self._check_in(order, sub.id, 1, price='160.00')
        self.assertEqual(check.status_code, 200, check.data)
        pr.refresh_from_db()
        sub.refresh_from_db()
        self.assertEqual(sub.shelf_price, Decimal('160.00'))
        self.assertEqual(pr.shelf_price, Decimal('0.50'))


class RestartRowTests(ProcessingTransformTestBase):
    def _transformed_family_with_items(self):
        order, _mr, pr = self._order_with_row(qty=12000, title='Prayer candle')
        resp = self._make_set(order, {
            'processing_row_id': pr.id,
            'set_size': 500,
            'num_sets': 4,
            'product_mode': 'new',
            'title': 'Prayer Candles - Box of 500',
            'shelf_price': '150.00',
        })
        sub = ProcessingRow.objects.get(pk=resp.data['sub_processing_row_id'])
        self._check_in(order, sub.id, 2)
        self._check_in(order, pr.id, 3)
        return order, pr, sub

    def test_requires_confirm_then_restores_everything(self):
        order, pr, sub = self._transformed_family_with_items()
        set_product_id = sub.matched_product_id

        preview = self._restart(order, {'processing_row_id': pr.id})
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertTrue(preview.data['requires_confirm'])
        self.assertEqual(preview.data['summary']['item_count'], 5)
        self.assertEqual(preview.data['summary']['sub_row_numbers'], [sub.row_number])
        self.assertEqual(Item.objects.filter(purchase_order=order).count(), 5)

        done = self._restart(order, {'processing_row_id': pr.id, 'confirm': True})
        self.assertEqual(done.status_code, 200, done.data)
        self.assertTrue(done.data['restarted'])
        self.assertEqual(done.data['deleted_processing_row_ids'], [sub.id])
        self.assertIn(set_product_id, done.data['deleted_product_ids'])

        self.assertFalse(ProcessingRow.objects.filter(pk=sub.id).exists())
        self.assertFalse(Item.objects.filter(purchase_order=order).exists())
        self.assertFalse(ItemCheckIn.objects.filter(purchase_order=order).exists())
        self.assertFalse(Product.objects.filter(pk=set_product_id).exists())
        pr.refresh_from_db()
        self.assertEqual(pr.quantity, 12000)
        self.assertEqual(pr.transforms, [])
        self.assertEqual(pr.original_snapshot, {})
        self.assertEqual(pr.queue_status, 'pending')
        self.assertEqual(pr.qty_dispositioned, 0)

    def test_restart_from_sub_row_targets_family_root(self):
        order, pr, sub = self._transformed_family_with_items()
        done = self._restart(order, {'processing_row_id': sub.id, 'confirm': True})
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['summary']['root_processing_row_id'], pr.id)
        self.assertFalse(ProcessingRow.objects.filter(pk=sub.id).exists())

    def test_blocked_when_any_item_sold(self):
        order, pr, _sub = self._transformed_family_with_items()
        item = Item.objects.filter(purchase_order=order).first()
        item.status = 'sold'
        item.sold_at = timezone.now()
        item.save(update_fields=['status', 'sold_at'])
        resp = self._restart(order, {'processing_row_id': pr.id, 'confirm': True})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('sold', resp.data['detail'])

    def test_blocked_when_item_in_pos_cart(self):
        from apps.core.models import WorkLocation
        from apps.pos.models import Cart, CartLine, Drawer, Register

        order, pr, _sub = self._transformed_family_with_items()
        location = WorkLocation.objects.create(name='Store')
        register = Register.objects.create(location=location, name='R1', code='R1')
        drawer = Drawer.objects.create(
            register=register,
            date='2026-06-12',
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
        )
        cart = Cart.objects.create(drawer=drawer, cashier=self.user)
        item = Item.objects.select_related('product').filter(purchase_order=order).first()
        CartLine.objects.create(
            cart=cart, item=item, description=item.product.title, quantity=1, unit_price=item.price,
        )
        resp = self._restart(order, {'processing_row_id': pr.id, 'confirm': True})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('POS', resp.data['detail'])

    def test_keeps_product_referenced_elsewhere(self):
        order, pr, sub = self._transformed_family_with_items()
        set_product_id = sub.matched_product_id
        other_order, _other_mr, other_row = self._order_with_row(qty=5, row_number=9)
        other_row.matched_product_id = set_product_id
        other_row.save(update_fields=['matched_product_id'])

        done = self._restart(order, {'processing_row_id': pr.id, 'confirm': True})
        self.assertEqual(done.status_code, 200, done.data)
        self.assertIn(set_product_id, done.data['kept_product_ids'])
        self.assertTrue(Product.objects.filter(pk=set_product_id).exists())

    def test_restart_without_transforms_rejected(self):
        order, _mr, pr = self._order_with_row(qty=10)
        resp = self._restart(order, {'processing_row_id': pr.id, 'confirm': True})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('no transforms', resp.data['detail'])
