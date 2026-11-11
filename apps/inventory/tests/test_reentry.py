"""Items back in Processing (services/reentry.py; Dash Updates #83): the shared list, the four actions, and a
Thrift+ return putting its item on the Returns list."""
from __future__ import annotations

from decimal import Decimal
from unittest import mock

from apps.inventory.models import Item, ItemHistory, ProcessingReentry, PurchaseOrder, RestorationJob, Vendor
from apps.inventory.services import reentry
from apps.pos.models import CartLine
from apps.thriftplus.models import LedgerEntry, ReturnRecord
from apps.thriftplus.tests.test_returns_page import ReturnsPageBase

D = Decimal
RETURN, FLOOR = ProcessingReentry.SOURCE_RETURN, ProcessingReentry.SOURCE_FLOOR


class ReentryBase(ReturnsPageBase):
    def _return(self, *skus):
        """Sell to the member and take every item line back at the register. Answers the sale."""
        sale = self._sell(*skus)
        r = self._batch(sale, self._item_lines(sale))
        self.assertEqual(r.status_code, 201, r.content)
        return sale

    def _row(self, item=None, source=RETURN) -> ProcessingReentry:
        return ProcessingReentry.objects.get(item=item or self.lamp, source=source, decided_at__isnull=True)

    def _post(self, row, action, **data):
        return self.api.post(f'/api/inventory/reentries/{row.pk}/{action}/', data, format='json')

    def _list(self, source=RETURN, **params):
        r = self.api.get('/api/inventory/reentries/', {'source': source, **params})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class ReturnPutsItemOnTheListTests(ReentryBase):
    def test_a_return_puts_each_item_on_the_returns_list(self):
        sale = self._return('ITMTPLAMP', 'ITMTPVASE')
        rows = self._list()['results']
        self.assertEqual([r['item']['sku'] for r in rows], ['ITMTPLAMP', 'ITMTPVASE'])
        first = rows[0]
        self.assertEqual((first['source'], first['reported_by'], first['outcome']), (RETURN, self.clerk.full_name, ''))
        self.assertEqual((first['sale']['cart'], first['sale']['sold_price']), (sale['id'], '80.00'))
        # The item itself is untouched until someone decides: still sold, as the register left it.
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'sold')
        self.assertEqual(self._list()['waiting'], {RETURN: 2, FLOOR: 0})
        self.assertEqual(self._list(FLOOR)['results'], [])

    def test_the_refund_is_the_same_with_or_without_the_list(self):
        """The hook never changes the money: the same return with the hook failing gives the same ledger rows."""
        self._return('ITMTPLAMP')
        with_list = sorted(LedgerEntry.objects.filter(reason='return').values_list('kind', 'amount'))
        self.assertTrue(with_list)
        LedgerEntry.objects.filter(reason='return').delete()
        with mock.patch('apps.inventory.services.reentry.report_return', side_effect=RuntimeError('boom')):
            self._return('ITMTPVASE')
        self.assertEqual(ReturnRecord.objects.count(), 2)  # the return went through
        self.assertEqual(ProcessingReentry.objects.count(), 1)
        # The list picks the missed return up the next time it is read.
        self.assertEqual([r['item']['sku'] for r in self._list()['results']], ['ITMTPLAMP', 'ITMTPVASE'])

    def test_marked_handled_on_the_thrift_plus_page_leaves_the_list(self):
        self._return('ITMTPLAMP')
        record = ReturnRecord.objects.get()
        self.assertEqual(self.api.post(f'/api/thriftplus/returns/{record.pk}/done/').status_code, 204)
        self.assertEqual(self._list()['results'], [])
        row = ProcessingReentry.objects.get()
        self.assertEqual((row.outcome, row.decided_by), (ProcessingReentry.OUTCOME_HANDLED, self.clerk))

    def test_an_item_sold_again_before_anyone_decided_leaves_the_list(self):
        self._return('ITMTPLAMP')
        again = self._sell('ITMTPLAMP', member=False)  # the register moves the old sale to a new item number
        self.assertEqual(again['status'], 'completed')
        self.assertEqual(self._list()['results'], [])
        row = ProcessingReentry.objects.get()
        self.assertEqual((row.outcome, row.outcome_note), (ProcessingReentry.OUTCOME_HANDLED, 'Sold again at the register.'))
        self.assertEqual(ReturnRecord.objects.get().status, ReturnRecord.STATUS_DONE)

    def test_an_old_return_already_back_in_stock_is_never_shown_as_waiting(self):
        self._return('ITMTPLAMP')
        ProcessingReentry.objects.all().delete()  # a return from before this list
        Item.objects.filter(pk=self.lamp.pk).update(status='on_shelf')
        self.assertEqual(self._list()['results'], [])
        self.assertEqual(ProcessingReentry.objects.get().outcome, ProcessingReentry.OUTCOME_HANDLED)


class ListTests(ReentryBase):
    def test_the_list_is_by_source_and_an_item_waits_once(self):
        self.api.force_authenticate(self.manager)
        r = self.api.post('/api/inventory/reentries/', {'sku': 'ITMTPVASE', 'source': FLOOR, 'reason': 'Cracked rim'},
                          format='json')
        self.assertEqual(r.status_code, 201, r.content)
        again = self.api.post('/api/inventory/reentries/', {'sku': 'itmtpvase', 'source': FLOOR, 'reason': 'No price'},
                              format='json')
        self.assertEqual(again.json()['id'], r.json()['id'])
        self.assertEqual(self._list(RETURN)['results'], [])
        rows = self._list(FLOOR)['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['reason'], rows[0]['reported_by']), ('Cracked rim; No price', self.manager.full_name))
        self.assertEqual(self._list(FLOOR)['waiting'], {RETURN: 0, FLOOR: 1})

    def test_a_return_of_an_item_with_a_floor_issue_becomes_the_return(self):
        reentry.report(self.lamp, FLOOR, reason='Wobbly', user=self.manager)
        self._return('ITMTPLAMP')
        row = ProcessingReentry.objects.get()
        self.assertEqual((row.source, row.source_ref), (RETURN, ReturnRecord.objects.get().pk))

    def test_find_answers_the_item_and_its_row(self):
        self._return('ITMTPLAMP')
        hit = self.api.get('/api/inventory/reentries/find/', {'code': 'https://ecothrift.us/i/ITMTPLAMP', 'source': RETURN})
        self.assertEqual(hit.status_code, 200, hit.content)
        self.assertEqual((hit.json()['item']['sku'], hit.json()['row']['source']), ('ITMTPLAMP', RETURN))
        miss = self.api.get('/api/inventory/reentries/find/', {'code': 'ITMTPVASE', 'source': RETURN})
        self.assertIsNone(miss.json()['row'])
        self.assertEqual(self.api.get('/api/inventory/reentries/find/', {'code': 'NOPE', 'source': RETURN}).status_code, 404)

    def test_find_says_when_the_item_was_already_handled(self):
        """A tag scanned again after its item was decided: the page says what was done, not "add it"."""
        self._return('ITMTPLAMP')
        waiting = self.api.get('/api/inventory/reentries/find/', {'code': 'ITMTPLAMP', 'source': RETURN}).json()
        self.assertIsNone(waiting['last'])
        self.assertEqual(self._post(self._row(), 'back-to-shelf').status_code, 200)
        done = self.api.get('/api/inventory/reentries/find/', {'code': 'ITMTPLAMP', 'source': RETURN}).json()
        self.assertIsNone(done['row'])
        self.assertEqual((done['last']['outcome'], done['last']['source']), ('shelf', RETURN))
        self.assertTrue(done['last']['decided_at'])
        never = self.api.get('/api/inventory/reentries/find/', {'code': 'ITMTPVASE', 'source': RETURN}).json()
        self.assertIsNone(never['last'])

    def test_bad_source_and_unknown_item_are_refused(self):
        self.assertEqual(self.api.get('/api/inventory/reentries/', {'source': 'attic'}).status_code, 400)
        r = self.api.post('/api/inventory/reentries/', {'sku': 'NOPE', 'source': FLOOR}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (404, 'NO_ITEM'))

    def test_staff_only(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().get('/api/inventory/reentries/', {'source': RETURN}).status_code, 401)


class ActionTests(ReentryBase):
    def _assert_done(self, row, outcome):
        row.refresh_from_db()
        self.assertEqual((row.outcome, row.decided_by), (outcome, self.clerk))
        self.assertIsNotNone(row.decided_at)
        self.assertEqual(self._list()['results'], [])
        self.assertEqual(self._list(done='1')['results'][0]['outcome'], outcome)
        self.assertEqual(ReturnRecord.objects.get().status, ReturnRecord.STATUS_DONE)

    def _assert_sale_moved(self):
        """The tag is live again and its old sale sits on a new item number, money untouched."""
        self.lamp.refresh_from_db()
        self.assertIsNone(self.lamp.sold_at)
        twin = Item.objects.get(parent_item=self.lamp)
        self.assertEqual((twin.status, twin.sold_for), ('sold', D('80.00')))
        self.assertFalse(CartLine.objects.filter(item=self.lamp, cart__status='completed').exists())
        self.assertEqual(ReturnRecord.objects.get().cart_line.item, twin)

    def test_price_again(self):
        self._return('ITMTPLAMP')
        row = self._row()
        r = self._post(row, 'price-again', price='$59.99')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['item']['sku'], r.json()['item']['price']), ('ITMTPLAMP', '59.99'))
        self._assert_done(row, ProcessingReentry.OUTCOME_REPRICED)
        self.assertEqual((row.old_price, row.new_price), (D('80.00'), D('59.99')))
        self._assert_sale_moved()
        self.assertEqual((self.lamp.status, self.lamp.price), ('on_shelf', D('59.99')))
        change = ItemHistory.objects.get(item=self.lamp, event_type='price_change')
        self.assertEqual((change.old_value, change.new_value, change.created_by), ('80.00', '59.99', self.clerk))

    def test_price_again_needs_a_price(self):
        self._return('ITMTPLAMP')
        for bad in ('', '0', 'lots', '-5'):
            r = self._post(self._row(), 'price-again', price=bad)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'BAD_PRICE'), bad)
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'sold')

    def test_back_to_shelf_as_is(self):
        self._return('ITMTPLAMP')
        row = self._row()
        self.assertEqual(self._post(row, 'back-to-shelf').status_code, 200)
        self._assert_done(row, ProcessingReentry.OUTCOME_SHELF)
        self._assert_sale_moved()
        self.assertEqual((self.lamp.status, self.lamp.price), ('on_shelf', D('80.00')))
        # It sells again like any item on the shelf.
        self.assertEqual(self._sell('ITMTPLAMP', member=False)['status'], 'completed')

    def test_send_to_restoration(self):
        order = PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='Target', code='TGT'), order_number='PO-RE',
                                             ordered_date='2026-06-01', purchase_cost=D('100.00'), retail_value=D('500.00'),
                                             status='processing')
        Item.objects.filter(pk=self.lamp.pk).update(purchase_order=order)
        self._return('ITMTPLAMP')
        row = self._row()
        refused = self._post(row, 'send-to-restoration', restoration={'needs': []})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('pick what it needs', refused.json()['detail'])
        r = self._post(row, 'send-to-restoration', restoration={'needs': ['repair'], 'done_price': '60'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['item']['restoration_tag']['needs'], ['Repair'])
        self._assert_done(row, ProcessingReentry.OUTCOME_RESTORATION)
        self._assert_sale_moved()
        job = RestorationJob.objects.get()
        self.assertEqual((row.restoration_job, job.stage, job.requested_needs, job.done_price),
                         (job, RestorationJob.STAGE_QUEUED, ['repair'], D('60.00')))
        self.assertEqual((self.lamp.status, self.lamp.location), ('on_shelf', 'restoration'))

    def test_scrap_needs_a_reason(self):
        self._return('ITMTPLAMP')
        row = self._row()
        r = self._post(row, 'scrap', reason='  ')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NO_REASON'))
        self.assertEqual(self._post(row, 'scrap', reason='Shade is shattered').status_code, 200)
        self._assert_done(row, ProcessingReentry.OUTCOME_SCRAPPED)
        self._assert_sale_moved()
        self.assertEqual((self.lamp.status, row.outcome_note), ('scrapped', 'Shade is shattered'))
        note = ItemHistory.objects.get(item=self.lamp, new_value='scrapped').note
        self.assertEqual(note, 'Scrapped (customer return): Shade is shattered')

    def test_an_action_works_once(self):
        self._return('ITMTPLAMP')
        row = self._row()
        self.assertEqual(self._post(row, 'back-to-shelf').status_code, 200)
        r = self._post(row, 'scrap', reason='Broken')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ALREADY_DONE'))
        self.assertEqual(self.api.post('/api/inventory/reentries/999999/back-to-shelf/').status_code, 404)

    def test_a_floor_item_on_the_shelf_keeps_its_place(self):
        """The floor side (#84) uses the same actions: an item that never sold has no sale to move."""
        row = reentry.report(self.vase, FLOOR, reason='Tag fell off', user=self.manager)
        r = self._post(row, 'price-again', price='45')
        self.assertEqual(r.status_code, 200, r.content)
        self.vase.refresh_from_db()
        self.assertEqual((self.vase.status, self.vase.price), ('on_shelf', D('45.00')))
        self.assertFalse(Item.objects.filter(parent_item=self.vase).exists())
        self.assertEqual(self._list(FLOOR, done='1')['results'][0]['outcome'], ProcessingReentry.OUTCOME_REPRICED)

    def test_a_consignment_item_waits_for_a_manager(self):
        self._return('ITMTPLAMP')
        with mock.patch('apps.inventory.services.duplicate_tag.why_not', return_value='consignment'):
            r = self._post(self._row(), 'back-to-shelf')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NEEDS_MANAGER'))
        self.assertTrue(self._row().is_open)
