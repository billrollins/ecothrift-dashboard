"""Dash Update #88, Close the truck: the claim (the header's rule), the list to copy, filed and paid, finalize."""

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import BStockDispute, Item, PurchaseOrder
from apps.inventory.services.truck_close import business_days_left, close_payload, unfiled_claims
from apps.inventory.services.truck_plan import truck_summary
from apps.inventory.tests.test_truck_plan import TruckSummaryBase


class BusinessDaysTests(TruckSummaryBase):
    def test_weekdays_only_and_negative_when_past(self):
        # Friday 2026-11-06 to Wednesday 2026-11-11: Mon, Tue, Wed.
        self.assertEqual(business_days_left(date(2026, 11, 11), date(2026, 11, 6)), 3)
        self.assertEqual(business_days_left(date(2026, 11, 6), date(2026, 11, 11)), -3)
        self.assertEqual(business_days_left(date(2026, 11, 6), date(2026, 11, 6)), 0)


class CloseTruckBase(TruckSummaryBase):
    """Manifest $1,000 (10 x $50, 5 x $100); price $200 + fees $20; shipping $300 is never in a claim."""

    def _close(self):
        self.order.refresh_from_db()
        return close_payload(self.order)

    def _post(self, step, body=None):
        return self.client.post(self._url(f'truck-close/{step}/'), body or {}, format='json')

    def _item_snapshot(self):
        return list(
            Item.objects.filter(purchase_order=self.order).order_by('pk').values(
                'pk', 'status', 'price', 'retail', 'dispute_type', 'dispute_pct_loss', 'location', 'updated_at',
            ),
        )


class ClaimTests(CloseTruckBase):
    def test_missing_broken_and_damaged_make_the_claim(self):
        self._check_in(0, 8)    # line 1: 2 never came ($100)
        self._check_in(1, 5)
        line2 = list(Item.objects.filter(manifest_row=self.rows[1][0]).order_by('pk'))
        Item.objects.filter(pk=line2[0].pk).update(status='scrapped', dispute_type='broken')               # $100
        Item.objects.filter(pk=line2[1].pk).update(dispute_type='cosmetic_damage', dispute_pct_loss=50)    # $50
        p = self._close()
        n = p['numbers']
        self.assertEqual(n['parts']['not_received'], {'units': 2, 'retail': '100.00'})
        self.assertEqual(n['parts']['broken'], {'units': 1, 'retail': '100.00'})
        self.assertEqual(n['parts']['damaged'], {'units': 1, 'retail': '50.00'})
        # By hand: ($250 - 5% of $1,000) / $1,000 x ($200 + $20) = 0.20 x $220.
        self.assertEqual((n['retail'], n['worth']), ('250.00', '44.00'))
        self.assertEqual(p['state'], 'to_file')
        # The list to copy carries every line, its reason, and the same total.
        self.assertEqual(
            [(line['row_number'], line['reason'], line['units'], line['total_retail']) for line in p['lines']],
            [(1, 'Not received', 2, '100.00'), (2, 'Broken', 1, '100.00'), (2, 'Damaged', 0.5, '50.00')],
        )
        self.assertEqual(sum(Decimal(line['total_retail']) for line in p['lines']), Decimal(n['retail']))
        self.assertIn('Total: 3.5 units, $250.00 manifest retail', p['copy_text'])
        self.assertIn('Not received', p['copy_text'])

    def test_the_claim_is_the_header_number_once_the_truck_is_done(self):
        self._check_in(0, 8)
        self._check_in(1, 3)    # 2 x $50 + 2 x $100 = $300 never came
        close = self._close()['numbers']
        # While processing, the header only counts what was marked, so it shows less than the truck would claim.
        self.assertEqual(truck_summary(self.order)['disputes']['worth'], '0.00')
        self.assertEqual(close['worth'], '55.00')    # ($300 - $50) / $1,000 x $220
        # Once the truck is done (here: finalized), the header shows the same number, from the same function.
        self.assertEqual(self._post('finalize').status_code, 200)
        self.order.refresh_from_db()
        header = truck_summary(self.order)['disputes']
        self.assertEqual(header, self._close()['numbers'])
        self.assertEqual(header['worth'], '55.00')

    def test_added_items_are_listed_apart(self):
        self._check_in(0, 10)
        Item.objects.filter(purchase_order=self.order).order_by('pk').first()
        it = Item.objects.filter(purchase_order=self.order).order_by('pk').first()
        Item.objects.filter(pk=it.pk).update(manifest_row=None, retail=Decimal('30.00'))
        self.assertEqual(self._close()['added'], {'units': 1, 'retail': '30.00'})


class CombinedLinesTests(CloseTruckBase):
    def test_lines_combined_in_processing_share_their_check_ins(self):
        # Line 3 is the same product as line 2 and was combined with it: all 8 units are checked in on line 2.
        from apps.inventory.models import ManifestRow, ProcessingRow
        mr3 = ManifestRow.objects.create(
            purchase_order=self.order, row_number=3, quantity=3, title='Line 3', unit_retail=Decimal('100.00'),
        )
        ProcessingRow.objects.create(
            purchase_order=self.order, manifest_row=mr3, row_number=3, quantity=3, title='Line 3',
            unit_retail=Decimal('100.00'), shelf_price=Decimal('5.00'), collapse_master=self.rows[1][1],
        )
        self._check_in(0, 10)
        self._check_in(1, 5)
        # Three more of the group arrive and land on the first line, as Processing does it.
        first = Item.objects.filter(manifest_row=self.rows[1][0]).order_by('pk').first()
        for _ in range(2):
            first.pk = None
            first.sku = ''
            first.save()
        n = self._close()['numbers']
        # 7 of the group's 8 came: one $100 unit is missing, not the three on line 3.
        self.assertEqual(n['parts']['not_received'], {'units': 1, 'retail': '100.00'})
        self.assertEqual(n['truck_retail'], '1300.00')


class FiledAndPaidTests(CloseTruckBase):
    def setUp(self):
        super().setUp()
        self._check_in(0, 8)
        self._check_in(1, 3)    # the claim is $55.00

    def test_filed_keeps_the_day_the_amount_and_freezes_the_lines(self):
        day = (timezone.localdate() - timedelta(days=1)).isoformat()
        r = self._post('filed', {'filed_on': day, 'bstock_dispute_id': 'DSP-9'})
        self.assertEqual(r.status_code, 200, r.data)
        c = r.data['claim']
        # No amount typed: the claim by the header's rule is what we asked for.
        self.assertEqual((c['filed'], c['filed_on'], c['amount_asked'], c['bstock_dispute_id']), (True, day, '55.00', 'DSP-9'))
        self.assertEqual(r.data['state'], 'filed')
        self.assertTrue(r.data['public_url'].endswith('/'))
        self.assertEqual(BStockDispute.objects.filter(purchase_order=self.order).count(), 1)
        # A late check-in does not move a filed claim's lines.
        before = r.data['lines']
        self._check_in(0, 2)
        self.assertEqual(self._close()['lines'], before)
        # The header knows it is filed, so nothing is nagged.
        claim = truck_summary(self.order)['claim']
        self.assertEqual((claim['filed'], claim['not_filed']), (True, None))

    def test_a_typed_amount_wins_and_filing_twice_keeps_one_record(self):
        self._post('filed', {})
        r = self._post('filed', {'amount_asked': '60'})
        self.assertEqual(r.data['claim']['amount_asked'], '60.00')
        self.assertEqual(BStockDispute.objects.filter(purchase_order=self.order).count(), 1)

    def test_money_back_in_full_in_part_and_denied(self):
        self._post('filed', {})
        day = timezone.localdate().isoformat()
        r = self._post('money-back', {'amount_back': '55.00', 'back_on': day})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['state'], r.data['claim']['amount_back'], r.data['claim']['back_on'], r.data['claim']['status']),
                         ('answered', '55.00', day, 'refunded'))
        self.assertEqual(self._post('money-back', {'amount_back': '20'}).data['claim']['status'], 'partial')
        self.assertEqual(self._post('money-back', {'amount_back': '0'}).data['claim']['status'], 'denied')
        # Cleared: waiting for an answer again.
        r = self._post('money-back', {'amount_back': ''})
        self.assertEqual((r.data['state'], r.data['claim']['amount_back']), ('filed', None))

    def test_money_back_needs_a_filed_claim_and_good_values(self):
        self.assertEqual(self._post('money-back', {'amount_back': '10'}).status_code, 400)
        self.assertEqual(self._post('filed', {'amount_asked': 'lots'}).status_code, 400)
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.assertEqual(self._post('filed', {'filed_on': tomorrow}).status_code, 400)
        self._post('filed', {})
        self.assertEqual(self._post('money-back', {'amount_back': '-1'}).status_code, 400)

    def test_not_filed_after_all(self):
        self._post('filed', {})
        r = self._post('not-filed')
        self.assertEqual((r.data['state'], r.data['claim']['filed'], r.data['claim']['amount_asked']), ('to_file', False, None))


class FinalizeTests(CloseTruckBase):
    def test_finalize_sets_the_fields_and_changes_no_item(self):
        self._check_in(0, 8)
        self._check_in(1, 3)
        items_before = self._item_snapshot()
        r = self._post('finalize')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNotNone(r.data['finalized']['at'])
        self.assertEqual(r.data['finalized']['by'], 'Pat Proc')
        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.truck_finalized_at)
        self.assertEqual(self.order.truck_finalized_by, self.staff)
        self.assertEqual(self.order.closeout_status, 'finalized')
        self.assertIn('totals', self.order.truck_finalize_snapshot)
        self.assertEqual(self._item_snapshot(), items_before)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), len(items_before))
        self.assertEqual(self._post('finalize').status_code, 400)    # already finalized

    def test_a_truck_with_nothing_to_claim_closes_clean(self):
        self._check_in(0, 10)
        self._check_in(1, 5)
        p = self._close()
        self.assertEqual((p['state'], p['numbers']['worth'], p['lines'], p['copy_text']), ('nothing', '0.00', [], ''))
        r = self._post('finalize')    # one tap
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['warnings'], [])
        self.assertFalse(BStockDispute.objects.filter(purchase_order=self.order).exists())

    def test_a_small_shortfall_under_the_line_is_nothing_to_claim(self):
        self._check_in(0, 9)    # 1 x $50 = exactly the 5% line
        self._check_in(1, 5)
        self.assertEqual(self._close()['state'], 'nothing')


class CountDownTests(CloseTruckBase):
    def setUp(self):
        super().setUp()
        PurchaseOrder.objects.filter(pk=self.order.pk).update(delivered_date=timezone.localdate())
        self._check_in(0, 8)
        self._check_in(1, 3)
        # Two units of line 2 were marked not received: $200, worth ($200 - $50) / $1,000 x $220 = $33 so far.
        left = Item.objects.filter(manifest_row=self.rows[1][0]).order_by('pk')[:2]
        Item.objects.filter(pk__in=[i.pk for i in left]).update(status='lost', dispute_type='undelivered')

    def test_an_unfiled_claim_counts_down(self):
        self.order.refresh_from_db()
        claim = truck_summary(self.order)['claim']
        self.assertEqual((claim['filed'], claim['not_filed']), (False, '33.00'))
        rows = [r for r in unfiled_claims() if r['order_id'] == self.order.pk]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['worth'], rows[0]['order_number']), ('33.00', 'PO-PLAN'))
        self.assertIsNotNone(rows[0]['days_left'])
        r = self.client.get('/api/inventory/orders/unfiled-claims/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn(self.order.pk, [c['order_id'] for c in r.data['claims']])

        from apps.core.services import owner_page
        item = next(i for i in owner_page.needs_you()['items'] if i['key'] == 'truck_claims')
        self.assertEqual(item['count'], 1)
        self.assertIn('PO-PLAN $33.00', item['detail'])

    def test_filed_or_finalized_trucks_leave_the_count_down(self):
        self._post('filed', {})
        self.assertNotIn(self.order.pk, [r['order_id'] for r in unfiled_claims()])
        self._post('not-filed')
        self.assertIn(self.order.pk, [r['order_id'] for r in unfiled_claims()])
        self._post('finalize')
        self.assertNotIn(self.order.pk, [r['order_id'] for r in unfiled_claims()])
        self.order.refresh_from_db()
        self.assertIsNone(truck_summary(self.order)['claim']['not_filed'])
