"""Dash Update #100: dispute a manifest row from the Processing queue with no product, item or check-in."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import BStockDispute, Item, ManifestRowDispute, Product
from apps.inventory.services.bstock_disputes import affected_lines
from apps.inventory.services.truck_finalize import truck_lines
from apps.inventory.services.truck_plan import truck_summary
from apps.inventory.tests.test_truck_finalize import TruckFinalizeBase


class RowDisputeTests(TruckFinalizeBase):
    """Line 1 = 10 x $50 (row 1), line 2 = 5 x $100 (row 2)."""

    def _url(self, tail=''):
        return f'/api/inventory/orders/{self.order.id}/row-disputes/{tail}'

    def _dispute(self, idx=0, **body):
        _, pr = self.rows[idx]
        return self.client.post(self._url(), {'processing_row_id': pr.id, **body}, format='json')

    def _line(self, idx=0):
        mr, _ = self.rows[idx]
        return next(line for line in truck_lines(self.order) if line['manifest_row_id'] == mr.id)

    def test_did_not_come_needs_no_product_item_or_check_in(self):
        products, items = Product.objects.count(), Item.objects.count()
        r = self._dispute(reason='did_not_come', units=3, note='never on the pallet')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((Product.objects.count(), Item.objects.count()), (products, items))
        self.assertEqual((r.data['row']['remaining'], r.data['row']['disputed']), (7, 3))
        _, pr = self.rows[0]
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.queue_status), (3, 'disputed'))
        d = ManifestRowDispute.objects.get()
        self.assertEqual((d.units, d.reason, d.note, d.created_by_id), (3, 'did_not_come', 'never on the pallet', self.user.pk))

    def test_did_not_come_feeds_the_header_and_the_b_stock_list(self):
        self._dispute(reason='did_not_come', units=3)
        self.assertEqual(self._line()['marked_missing'], Decimal('3'))
        parts = truck_summary(self.order)['disputes']['parts']
        self.assertEqual(parts['not_received']['units'], 3)                # the header's Disputed figure
        lines = affected_lines(self.order)
        mine = [ln for ln in lines if ln['row_number'] == 1 and ln['issue'] == 'Not received']
        self.assertEqual(len(mine), 1)
        self.assertGreaterEqual(mine[0]['units'], 3)          # unprocessed units count as missing too, as before

    def test_broken_and_partial_count_once_never_also_as_missing(self):
        self._dispute(reason='broken', units=2)
        self._dispute(reason='missing_parts', units=2, pct_lost=25)
        self._check_in(0, 6)                                  # the other 6 units are checked in
        u = self._line()['units']
        self.assertEqual((u['missing'], u['broken'], u['disputed']), (Decimal('0'), Decimal('2'), Decimal('0.5')))
        issues = {ln['issue'] for ln in affected_lines(self.order) if ln['row_number'] == 1}
        self.assertEqual(issues, {'Damaged', 'Damaged (partial)'})

    def test_left_to_process_drops_by_exactly_the_disputed_units(self):
        before = truck_summary(self.order)['on_track']['units_left']
        self._dispute(reason='did_not_come', units=3)
        self.assertEqual(truck_summary(self.order)['on_track']['units_left'], before - 3)   # the row's other 7 still count

    def test_wrong_item_counts_as_damaged(self):
        self._dispute(idx=1, reason='wrong_item', units=5)
        u = self._line(1)['units']
        self.assertEqual((u['broken'], u['missing']), (Decimal('5'), Decimal('0')))

    def test_the_disputed_units_leave_the_row_and_a_check_in_finishes_it(self):
        self._dispute(reason='did_not_come', units=8)
        _, pr = self.rows[0]
        # The check-in window starts at what is left (qtyRemaining); extras stay allowed, as before.
        self._check_in(0, 2)
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.quantity), (10, 10))
        u = self._line()['units']
        self.assertEqual((u['received'], u['missing'], u['over']), (Decimal('2'), Decimal('8'), Decimal('0')))
        # One more found after all: the header's "not received so far" never counts more than is really missing.
        self._check_in(0, 1)
        self.assertEqual(self._line()['marked_missing'], Decimal('7'))

    def test_undo_restores_the_units_to_process(self):
        r = self._dispute(reason='did_not_come', units=4)
        undo = self.client.post(self._url(f'{r.data["dispute"]["id"]}/undo/'), {}, format='json')
        self.assertEqual(undo.status_code, 200, undo.data)
        self.assertEqual((undo.data['row']['remaining'], undo.data['row']['disputed']), (10, 0))
        self.assertIsNotNone(undo.data['disputes'][0]['undone_at'])     # kept, marked undone
        _, pr = self.rows[0]
        pr.refresh_from_db()
        self.assertEqual((pr.qty_dispositioned, pr.queue_status), (0, 'pending'))
        self.assertEqual(self._line()['marked_missing'], Decimal('0'))
        again = self.client.post(self._url(f'{r.data["dispute"]["id"]}/undo/'), {}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_plain_refusals(self):
        self.assertIn('Pick what is wrong', self._dispute(reason='lost', units=1).data['detail'])
        self.assertIn('how many', self._dispute(reason='broken', units=0).data['detail'])
        self.assertIn('10 units left', self._dispute(reason='broken', units=11).data['detail'])
        self.assertIn('between 1% and 100%', self._dispute(reason='other', units=1, pct_lost=0).data['detail'])
        self._dispute(reason='did_not_come', units=10)
        self.assertIn('nothing left', self._dispute(reason='broken', units=1).data['detail'])
        self.assertFalse(BStockDispute.objects.exists())                 # nothing is filed with B-Stock by itself

    def test_the_window_shows_the_row_and_its_disputes(self):
        self._dispute(reason='other', units=1, pct_lost=40, note='scuffed')
        _, pr = self.rows[0]
        r = self.client.get(self._url(), {'processing_row': pr.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['row']['remaining'], 9)
        self.assertEqual(r.data['disputes'][0]['reason_label'], 'Other problem')
        self.assertEqual(r.data['disputes'][0]['pct_lost'], 40)
        self.assertIn('did_not_come', [x['value'] for x in r.data['reasons']])

    def test_row_detail_counts_row_disputes(self):
        self._dispute(reason='did_not_come', units=3)
        _, pr = self.rows[0]
        r = self.client.get(f'/api/inventory/orders/{self.order.id}/processing-row-detail/', {'processing_row_id': pr.id})
        self.assertEqual(r.status_code, 200, r.data)
        row = r.data['row']
        self.assertEqual((row['qtyRemaining'], row['rowDisputedUnits'], row['status']), (7, 3, 'disputed'))

    def test_only_staff(self):
        outsider = APIClient()
        outsider.force_authenticate(user=get_user_model().objects.create_user(email='x@example.com', first_name='X', last_name='Y', password='pw'))
        _, pr = self.rows[0]
        self.assertEqual(outsider.post(self._url(), {'processing_row_id': pr.id, 'reason': 'broken', 'units': 1},
                                       format='json').status_code, 403)
