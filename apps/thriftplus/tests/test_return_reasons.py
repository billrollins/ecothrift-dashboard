"""A clearer return (Bill 2026-11-10, Dash Update #90): why each item came back, kept per returned line and shown
on Processing > Returns, and the return receipt (one per original sale). The money rules do not change: the same
return gives the same Thrift+ credit and takes back the same ThriftBucks, with or without reasons."""
from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import ProcessingReentry
from apps.pos.models import Receipt
from apps.thriftplus.models import LedgerEntry, ReturnRecord
from apps.thriftplus.services import ledger, returns
from apps.thriftplus.tests.test_returns_page import PIN, ReturnsPageBase

D = Decimal


class ReasonsBase(ReturnsPageBase):
    def _reasons(self, sale, *pairs):
        """``{"<cart line>": {reason, note}}`` for the sale's item lines, in order."""
        return {str(line): {'reason': reason, 'note': note} for line, (reason, note) in zip(self._item_lines(sale), pairs)}

    def _preview(self, sale, ids):
        r = self.api.post('/api/thriftplus/returns/preview/', {'cart': sale['id'], 'cart_lines': ids}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class ReasonPerLineTests(ReasonsBase):
    def test_the_ticket_offers_the_short_list_of_reasons(self):
        sale = self._sell('ITMTPLAMP')
        body = self._receipt(sale['id']).json()
        self.assertEqual([r['label'] for r in body['return_reasons']],
                         ['Does not work', 'Broken or damaged', 'Missing parts', 'Not as described', 'Changed mind', 'Other'])
        self.assertEqual(body['payment_method'], 'cash')  # the sale as the customer knows it

    def test_each_returned_line_keeps_its_own_reason_and_note(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        ids = self._item_lines(sale)
        r = self._batch(sale, ids, reasons=self._reasons(sale, ('not_working', 'Buzzes when on'), ('changed_mind', '')))
        self.assertEqual(r.status_code, 201, r.content)
        lamp, vase = (ReturnRecord.objects.get(cart_line_id=i) for i in ids)
        self.assertEqual((lamp.reason, lamp.reason_note, lamp.why), ('not_working', 'Buzzes when on', 'Does not work: Buzzes when on'))
        self.assertEqual((vase.reason, vase.reason_note, vase.why), ('changed_mind', '', 'Changed mind'))

    def test_the_reason_is_the_why_on_processing_returns(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        r = self._batch(sale, self._item_lines(sale),
                        reasons=self._reasons(sale, ('missing_parts', 'No shade'), ('other', 'Gift, already has one')))
        self.assertEqual(r.status_code, 201, r.content)
        rows = self.api.get('/api/inventory/reentries/', {'source': ProcessingReentry.SOURCE_RETURN}).json()['results']
        self.assertEqual({row['item']['sku']: row['reason'] for row in rows},
                         {'ITMTPLAMP': 'Missing parts: No shade', 'ITMTPVASE': 'Other: Gift, already has one'})

    def test_a_late_return_tells_processing_the_items_reason_not_the_late_note(self):
        sale = self._sell('ITMTPLAMP', days_ago=4)
        self._set_pin()
        r = self._batch(sale, self._item_lines(sale), late={'reason': 'closed', 'note': 'Closed Sun'}, pin=PIN,
                        reasons=self._reasons(sale, ('damaged', 'Cracked base')))
        self.assertEqual(r.status_code, 201, r.content)
        record = ReturnRecord.objects.get()
        self.assertIn('Late return: Store was closed.', record.note)  # the late mark's words stay where they were
        self.assertEqual(ProcessingReentry.objects.get().reason, 'Broken or damaged: Cracked base')

    def test_a_return_with_no_reason_still_goes_through_and_keeps_its_note_as_the_why(self):
        """Any reason is fine (W1), so a screen that sends none (an old tab during a deploy) still gets its return."""
        sale = self._sell('ITMTPLAMP')
        r = self._batch(sale, self._item_lines(sale), note='Box was open')
        self.assertEqual(r.status_code, 201, r.content)
        record = ReturnRecord.objects.get()
        self.assertEqual((record.reason, record.reason_note, record.why), ('', '', 'Box was open'))
        self.assertEqual(ProcessingReentry.objects.get().reason, 'Box was open')

    def test_a_reason_that_is_not_on_the_list_is_refused_and_nothing_is_written(self):
        sale = self._sell('ITMTPLAMP')
        r = self._batch(sale, self._item_lines(sale), reasons=self._reasons(sale, ('because', '')))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'BAD_REASON'))
        self.assertFalse(ReturnRecord.objects.exists())
        self.assertEqual(ledger.credit_balance(self.account), D('0.00'))

    def test_a_reason_for_a_line_that_is_not_coming_back_is_ignored(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        first, second = self._item_lines(sale)
        r = self._batch(sale, [first], reasons={str(first): {'reason': 'damaged'}, str(second): {'reason': 'because'}})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ReturnRecord.objects.get().reason, 'damaged')

    def test_transactions_returns_shows_the_reason(self):
        sale = self._sell('ITMTPLAMP')
        self._batch(sale, self._item_lines(sale), reasons=self._reasons(sale, ('not_as_described', 'Smaller than the tag said')))
        row = self.api.get('/api/thriftplus/returns/history/').json()['results'][0]
        self.assertEqual((row['reason'], row['reason_note']), ('Not as described', 'Smaller than the tag said'))


class MoneyUnchangedTests(ReasonsBase):
    def test_the_same_return_gives_the_same_money_with_reasons(self):
        """The W5 lamp ($80 tag, 35 ThriftBucks kept, 7% tax): $68.48 Thrift+ credit and 28.00 ThriftBucks taken back,
        the numbers the returns tests have always checked."""
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        ids = self._item_lines(sale)
        before = self._preview(sale, ids)
        self.assertEqual((before['lines'][0]['credit'], before['lines'][0]['bucks_taken']), ('68.48', '28.00'))
        body = self._batch(sale, ids, reasons=self._reasons(sale, ('not_working', 'Buzzes'), ('other', 'No reason given'))).json()
        self.assertEqual(body['totals'], {k: before['totals'][k] for k in ('credit', 'bucks_back', 'bucks_taken', 'shortfall')})
        lamp = ReturnRecord.objects.get(cart_line_id=ids[0])
        self.assertEqual((lamp.paid, lamp.credit, lamp.taxable_back, lamp.tax_back, lamp.bucks_back, lamp.bucks_taken, lamp.shortfall),
                         (D('68.48'), D('68.48'), D('64.00'), D('4.48'), D('0.00'), D('28.00'), D('0.00')))
        self.assertEqual(ledger.credit_balance(self.account), D(before['totals']['credit']))

    def test_the_ledger_rows_are_the_same_with_and_without_reasons(self):
        def rows():
            return sorted(LedgerEntry.objects.filter(reason='return').values_list('kind', 'amount'))

        plain = self._sell('ITMTPLAMP')
        self.assertEqual(self._batch(plain, self._item_lines(plain)).status_code, 201)
        without = rows()
        self.assertTrue(without)
        # The same lamp again, new: this time the cashier says why.
        LedgerEntry.objects.all().delete()
        ReturnRecord.objects.all().delete()
        again = self._item('ITMTPLAMP2', 'Brass lamp', '80.00', '35.00')
        sale = self._sell(again.sku)
        r = self._batch(sale, self._item_lines(sale), reasons=self._reasons(sale, ('damaged', 'Dented')))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(rows(), without)


class ReturnReceiptTests(ReasonsBase):
    def test_one_receipt_for_the_sale_with_each_item_its_reason_and_what_went_back(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        ids = self._item_lines(sale)
        body = self._batch(sale, ids, reasons=self._reasons(sale, ('not_working', 'Buzzes'), ('changed_mind', ''))).json()
        slip = body['receipt']
        number = Receipt.objects.get(cart_id=sale['id']).receipt_number
        self.assertEqual(slip['receipt_number'], f'RETURN {number}')
        self.assertEqual(slip['date'], timezone.localdate().isoformat())  # the day it came back
        self.assertEqual(slip['cashier'], '')  # the top line has the number and time only (they overlap otherwise)
        self.assertTrue(slip['tax_exempt'].startswith(f'Taken by {self.clerk.first_name} {self.clerk.last_name[0]}.'))  # who took it
        self.assertEqual([i['name'] for i in slip['items']],
                         ['Brass lamp. Reason: Does not work (Buzzes)', 'Glass vase. Reason: Changed mind'])
        records = [ReturnRecord.objects.get(cart_line_id=i) for i in ids]
        self.assertEqual([D(str(i['line_total'])) for i in slip['items']], [r.paid for r in records])
        self.assertTrue(all(i['mark'] == '3-day return' and i['quantity'] == 1 for i in slip['items']))
        credit = sum((r.credit for r in records), D('0'))
        self.assertEqual(D(str(slip['total'])), credit)
        self.assertEqual(D(str(slip['total'])), D(body['totals']['credit']))
        self.assertEqual(D(str(slip['subtotal'])), sum((r.taxable_back for r in records), D('0')))
        self.assertEqual(D(str(slip['tax'])), sum((r.tax_back for r in records), D('0')))
        self.assertEqual((slip['payment_method'], D(str(slip['amount_tendered']))), ('Thrift+ credit added', credit))
        self.assertEqual((slip['thrift_plus']['member'], slip['thrift_plus']['guest_all_as_is']), ('Ana', False))
        sold_on = timezone.localdate()
        self.assertEqual(slip['returns_until'], returns.deadline(sold_on).isoformat())
        self.assertIn(f'From the sale of {sold_on:%a} {sold_on:%b} {sold_on.day}', slip['tax_exempt'])
        taken = sum((r.bucks_taken for r in records), D('0'))
        self.assertEqual(taken, D('36.00'))  # 80% of the 35 and the 10 they collected
        self.assertIn('36.00 ThriftBucks taken back', slip['tax_exempt'])
        self.assertNotIn('training', slip)
        # Said plainly for a later print server release.
        self.assertEqual((slip['kind'], slip['return']['sale_receipt']), ('return', number))
        self.assertEqual([(l['title'], l['reason'], l['credit']) for l in slip['return']['lines']],
                         [('Brass lamp', 'Does not work', str(records[0].credit)), ('Glass vase', 'Changed mind', str(records[1].credit))])

    def test_two_sales_get_two_receipts_each_with_only_its_own_lines(self):
        first = self._sell('ITMTPLAMP')
        second = self._sell('ITMTPVASE')
        a = self._batch(first, self._item_lines(first), reasons=self._reasons(first, ('damaged', ''))).json()['receipt']
        b = self._batch(second, self._item_lines(second), reasons=self._reasons(second, ('missing_parts', ''))).json()['receipt']
        self.assertEqual(a['receipt_number'], f"RETURN {Receipt.objects.get(cart_id=first['id']).receipt_number}")
        self.assertEqual(b['receipt_number'], f"RETURN {Receipt.objects.get(cart_id=second['id']).receipt_number}")
        self.assertEqual([i['name'] for i in a['items']], ['Brass lamp. Reason: Broken or damaged'])
        self.assertEqual([i['name'] for i in b['items']], ['Glass vase. Reason: Missing parts'])

    def test_a_second_return_from_the_same_sale_prints_only_what_came_back_this_time(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        first, second = self._item_lines(sale)
        self._batch(sale, [first], reasons={str(first): {'reason': 'damaged'}})
        slip = self._batch(sale, [second], reasons={str(second): {'reason': 'other', 'note': 'Too big'}}).json()['receipt']
        self.assertEqual([i['name'] for i in slip['items']], ['Glass vase. Reason: Other (Too big)'])
        self.assertEqual(D(str(slip['total'])), ReturnRecord.objects.get(cart_line_id=second).credit)

    def test_thriftbucks_already_spent_come_off_the_total_and_the_receipt_says_so(self):
        sale = self._sell('ITMTPLAMP')
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('-30.00'), reason='adjust')
        body = self._batch(sale, self._item_lines(sale), reasons=self._reasons(sale, ('changed_mind', ''))).json()
        slip, record = body['receipt'], ReturnRecord.objects.get()
        self.assertGreater(record.shortfall, D('0'))
        self.assertEqual(D(str(slip['items'][0]['line_total'])), record.paid)  # the refund before the shortfall
        self.assertEqual(D(str(slip['total'])), record.credit)  # what they got
        self.assertEqual(D(str(slip['subtotal'])) + D(str(slip['tax'])), record.paid)
        self.assertIn(f'{record.shortfall:.2f} ThriftBucks already spent', slip['tax_exempt'])

    def test_no_reason_prints_the_item_alone(self):
        sale = self._sell('ITMTPLAMP')
        slip = self._batch(sale, self._item_lines(sale)).json()['receipt']
        self.assertEqual(slip['items'][0]['name'], 'Brass lamp')

    def test_a_practice_return_gets_a_receipt_marked_training_and_writes_nothing(self):
        sale = self._sell('ITMTPLAMP')
        r = self._batch(sale, self._item_lines(sale), register='TRAIN', reasons=self._reasons(sale, ('not_working', '')))
        self.assertEqual(r.status_code, 200, r.content)
        slip = r.json()['receipt']
        self.assertTrue(slip['training'])
        self.assertEqual(slip['items'][0]['name'], 'Brass lamp. Reason: Does not work')
        self.assertEqual((D(str(slip['total'])), slip['payment_method']), (D('68.48'), 'Practice only: no Thrift+ credit given'))
        self.assertNotIn('amount_tendered', slip)
        self.assertIn('Taken by Pat C.', slip['tax_exempt'])  # the TRAINING bands say it is practice
        self.assertFalse(ReturnRecord.objects.exists())

    def test_a_receipt_that_cannot_be_made_never_fails_the_return(self):
        from unittest import mock

        sale = self._sell('ITMTPLAMP')
        with mock.patch('apps.thriftplus.services.return_receipt.build', side_effect=RuntimeError('boom')):
            r = self._batch(sale, self._item_lines(sale))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()['receipt'])
        self.assertTrue(ReturnRecord.objects.exists())
