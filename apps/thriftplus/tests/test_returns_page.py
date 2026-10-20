"""The Returns page and the owner PIN (owner 2026-10-20): Find by person, ticket or item, the open receipt, the summary,
several lines back in one go, a late return with the PIN (marked against Retail), and the PIN's lockout."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.models import Item, Product
from apps.pos.models import Cart, CartLine, Receipt
from apps.thriftplus.models import Event, LateReturnMark, LedgerEntry, OwnerPin, ReturnRecord
from apps.thriftplus.services import ledger, owner_pin
from apps.thriftplus.tests.test_register import RegisterBase

D = Decimal
PIN = '4821'


class ReturnsPageBase(RegisterBase):
    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_superuser(email='owner@example.com', first_name='Bill', last_name='Owner', password='x-pass-123')
        self.owner.groups.add(Group.objects.get_or_create(name='Admin')[0])

    def _sell(self, *skus, member=True, days_ago=0):
        cart = self._cart(*skus)
        if member:
            self._attach(cart['id'])
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        sale = done.json()
        if days_ago:
            Cart.objects.filter(pk=sale['id']).update(completed_at=timezone.now() - timedelta(days=days_ago))
        return sale

    def _find(self, q='', **extra):
        r = self.api.post('/api/thriftplus/returns/find/', {'q': q, **extra}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _receipt(self, cart_id, **params):
        return self.api.get('/api/thriftplus/returns/receipt/', {'cart': cart_id, **params})

    def _batch(self, sale, line_ids, **data):
        return self.api.post('/api/thriftplus/returns/batch/', {'cart': sale['id'], 'cart_lines': line_ids, 'register': 'TP-T1', **data},
                             format='json')

    def _item_lines(self, sale):
        return [l['id'] for l in sale['lines'] if l['line_kind'] == 'item']

    def _set_pin(self, pin=PIN):
        self.api.force_authenticate(self.owner)
        r = self.api.post('/api/thriftplus/owner-pin/', {'pin': pin}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.api.force_authenticate(self.clerk)


class OwnerPinTests(ReturnsPageBase):
    def test_only_the_owner_sets_or_resets_it_and_the_pin_is_stored_hashed(self):
        for who in (self.clerk, self.manager):
            self.api.force_authenticate(who)
            r = self.api.post('/api/thriftplus/owner-pin/', {'pin': PIN}, format='json')
            self.assertEqual((r.status_code, r.json()['code']), (403, 'OWNER_ONLY'))
        self.assertFalse(OwnerPin.objects.filter(pin_hash__gt='').exists())
        self.api.force_authenticate(self.owner)
        self.assertFalse(self.api.get('/api/thriftplus/owner-pin/').json()['set'])
        made = self.api.post('/api/thriftplus/owner-pin/', {'pin': PIN}, format='json').json()
        self.assertTrue(made['set'])
        self.assertEqual(made['set_by'], 'Bill Owner')
        stored = OwnerPin.objects.get().pin_hash
        self.assertNotIn(PIN, stored)
        self.assertTrue(stored.startswith('pbkdf2_') or '$' in stored)
        self.assertNotIn(PIN, str(self.api.get('/api/thriftplus/owner-pin/').json()))
        self.api.post('/api/thriftplus/owner-pin/', {'pin': '99887766'}, format='json')
        self.assertNotEqual(OwnerPin.objects.get().pin_hash, stored)
        self.assertEqual([e.action for e in Event.objects.filter(action__startswith='owner_pin').order_by('pk')],
                         ['owner_pin_set', 'owner_pin_reset'])

    def test_the_pin_is_four_to_eight_digits(self):
        self.api.force_authenticate(self.owner)
        for bad in ('', '123', '123456789', 'abcd', '12 34', '12.4'):
            r = self.api.post('/api/thriftplus/owner-pin/', {'pin': bad}, format='json')
            self.assertEqual((r.status_code, r.json()['code']), (400, 'PIN_FORMAT'), bad)
        self.assertEqual(self.api.post('/api/thriftplus/owner-pin/', {'pin': '1234'}, format='json').status_code, 200)
        self.assertEqual(self.api.post('/api/thriftplus/owner-pin/', {'pin': '12345678'}, format='json').status_code, 200)

    def test_staff_see_only_whether_it_is_set(self):
        self._set_pin()
        body = self.api.get('/api/thriftplus/owner-pin/').json()
        self.assertEqual(body, {'set': True, 'locked': False})

    def test_five_wrong_tries_lock_it_for_fifteen_minutes_and_the_right_pin_waits(self):
        self._set_pin()
        for n in range(4):
            with self.assertRaises(owner_pin.PinError) as ctx:
                owner_pin.verify(self.clerk, '0000', 'test')
            self.assertEqual((ctx.exception.code, ctx.exception.extra['tries_left']), ('PIN_WRONG', 4 - n))
        with self.assertRaises(owner_pin.PinError) as ctx:
            owner_pin.verify(self.clerk, '0000', 'test')
        self.assertEqual((ctx.exception.code, ctx.exception.http), ('PIN_LOCKED', 429))
        with self.assertRaises(owner_pin.PinError) as ctx:  # even the right one, while locked
            owner_pin.verify(self.clerk, PIN, 'test')
        self.assertEqual(ctx.exception.code, 'PIN_LOCKED')
        self.assertTrue(owner_pin.status()['locked'])
        self.assertEqual(Event.objects.filter(action='owner_pin_wrong').count(), 5)
        later = timezone.now() + timedelta(minutes=16)
        with mock.patch('django.utils.timezone.now', return_value=later):
            owner_pin.verify(self.clerk, PIN, 'test')
            self.assertFalse(owner_pin.status()['locked'])
        used = Event.objects.get(action='owner_pin_used')
        self.assertEqual((used.actor, used.detail['purpose']), (self.clerk, 'test'))

    def test_a_right_pin_clears_the_count_and_the_owner_signed_in_is_never_locked_out(self):
        self._set_pin()
        for _ in range(3):
            with self.assertRaises(owner_pin.PinError):
                owner_pin.verify(self.clerk, '0000', 'test')
        owner_pin.verify(self.clerk, PIN, 'test')
        self.assertEqual(OwnerPin.objects.get().failures, 0)
        OwnerPin.objects.update(locked_until=timezone.now() + timedelta(minutes=10))
        self.assertFalse(owner_pin.authorize(self.owner, '', 'late return'))  # signed in: no PIN, no lockout
        with self.assertRaises(owner_pin.PinError):
            owner_pin.authorize(self.clerk, PIN, 'late return')

    def test_no_pin_set_and_nothing_typed(self):
        with self.assertRaises(owner_pin.PinError) as ctx:
            owner_pin.authorize(self.clerk, PIN, 'late return')
        self.assertEqual(ctx.exception.code, 'PIN_NOT_SET')
        self._set_pin()
        with self.assertRaises(owner_pin.PinError) as ctx:
            owner_pin.authorize(self.clerk, '', 'late return')
        self.assertEqual(ctx.exception.code, 'PIN_NEEDED')

    def test_a_reset_clears_a_lockout(self):
        self._set_pin()
        OwnerPin.objects.update(failures=2, locked_until=timezone.now() + timedelta(minutes=10))
        self._set_pin('5555')
        self.assertEqual((OwnerPin.objects.get().failures, OwnerPin.objects.get().locked_until), (0, None))
        owner_pin.verify(self.clerk, '5555', 'test')


class FindTests(ReturnsPageBase):
    def test_a_member_qr_lists_their_tickets_newest_first(self):
        first = self._sell('ITMTPLAMP', days_ago=2)
        second = self._sell('ITMTPVASE')
        self._sell('ITMTPLAMP', member=False)
        body = self._find(f'TP{self.codes[0]}')
        self.assertEqual((body['kind'], body['person']['name']), ('person', 'Ana Member'))
        self.assertEqual([t['cart'] for t in body['tickets']], [second['id'], first['id']])
        self.assertIsNone(body['receipt'])
        row = body['tickets'][0]
        self.assertEqual((row['items'], row['total'], row['member']), (1, second['total'], 'Ana Member'))
        self.assertEqual(row['receipt_number'], Receipt.objects.get(cart_id=second['id']).receipt_number)
        self.assertEqual(self._find(self.codes[0])['kind'], 'person')  # the 12-digit member #

    def test_a_name_or_phone_finds_the_person_and_their_tickets_and_many_names_wait_to_be_picked(self):
        sale = self._sell('ITMTPLAMP')
        for q in ('Ana', '4025550101', '555-0101'):
            body = self._find(q)
            self.assertEqual((body['kind'], [t['cart'] for t in body['tickets']]), ('person', [sale['id']]), q)
        both = self._find('402555010')  # Ana and Bo
        self.assertEqual(sorted(p['first_name'] for p in both['people']), ['Ana', 'Bo'])
        self.assertEqual(both['tickets'], [])
        picked = self._find(person=both['people'][0]['person_id'])
        self.assertEqual(picked['kind'], 'person')

    def test_the_receipt_number_opens_the_ticket_and_a_short_number_means_today(self):
        sale = self._sell('ITMTPLAMP')
        number = Receipt.objects.get(cart_id=sale['id']).receipt_number
        for q in (number, number.lower(), str(int(number.rsplit('-', 1)[1]))):
            body = self._find(q)
            self.assertEqual([t['cart'] for t in body['tickets']], [sale['id']], q)
            self.assertEqual(body['receipt']['cart'], sale['id'], q)  # a single ticket opens at once
        self.assertIn('No ticket', self._find('R-20200101-001')['message'])
        day = self._find(number.rsplit('-', 1)[0])
        self.assertEqual([t['cart'] for t in day['tickets']], [sale['id']])

    def test_a_tag_sku_finds_the_tickets_the_item_is_on(self):
        a = self._sell('ITMTPLAMP', days_ago=1)
        body = self._find('itmtplamp')
        self.assertEqual((body['kind'], body['receipt']['cart']), ('item', a['id']))
        # the same item on a second ticket (it came back and was sold again)
        b = Cart.objects.create(drawer=self.drawer, cashier=self.clerk, status='completed', completed_at=timezone.now(), total=D('85.60'))
        CartLine.objects.create(cart=b, item=self.lamp, description='Brass lamp', unit_price=D('80.00'), line_total=D('80.00'))
        b = {'id': b.pk}
        body = self._find('ITMTPLAMP')
        self.assertEqual([t['cart'] for t in body['tickets']], [b['id'], a['id']])
        self.assertIsNone(body['receipt'])
        self.assertIn('not on a sale ticket', self._find('ITMTPVASE')['message'])

    def test_a_date_finds_that_days_sales(self):
        today = self._sell('ITMTPLAMP')
        old = self._sell('ITMTPVASE', days_ago=3)
        self.assertEqual([t['cart'] for t in self._find(timezone.localdate().isoformat())['tickets']], [today['id']])
        then = timezone.localdate(timezone.now() - timedelta(days=3))
        self.assertEqual([t['cart'] for t in self._find(f'{then.month}/{then.day}')['tickets']], [old['id']])
        self.assertEqual([t['cart'] for t in self._find(f'{then.month}/{then.day}/{then.year}')['tickets']], [old['id']])
        self.assertEqual(self._find('1/2/2020')['tickets'], [])

    def test_a_total_finds_the_sale(self):
        sale = self._sell('ITMTPLAMP')
        for q in (sale['total'], f"${sale['total']}"):
            self.assertEqual([t['cart'] for t in self._find(q)['tickets']], [sale['id']], q)
        self.assertEqual(self._find('$1.23')['tickets'], [])

    def test_words_from_an_items_description_find_its_tickets(self):
        sale = self._sell('ITMTPVASE', days_ago=1)
        body = self._find('glass vase')
        self.assertEqual((body['kind'], body['receipt']['cart']), ('words', sale['id']))
        self.assertEqual(self._find('glass zebra')['tickets'], [])
        self.assertEqual(self._find('')['kind'], 'none')

    def test_the_search_is_a_handful_of_queries(self):
        for _ in range(3):
            self._sell('ITMTPLAMP')
        for q in (f'TP{self.codes[0]}', timezone.localdate().isoformat()):  # lists of tickets, not an opened receipt
            with CaptureQueriesContext(connection) as ctx:
                self._find(q)
            self.assertLessEqual(len(ctx), 5, q)  # the permission check, then the lookups: never a query per ticket

    def test_practice_sales_show_only_on_the_training_register(self):
        sale = self._sell('ITMTPLAMP')
        Cart.objects.filter(pk=sale['id']).update(status='training')
        self.assertEqual(self._find(f'TP{self.codes[0]}')['tickets'], [])
        found = self._find(f'TP{self.codes[0]}', register='TRAIN')['tickets']
        self.assertEqual([t['cart'] for t in found], [sale['id']])
        self.assertTrue(found[0]['practice'])


class ReceiptTests(ReturnsPageBase):
    def test_the_receipt_splits_returnable_from_as_is_with_the_reason(self):
        self._item('ITMTPCHEAP', 'Coffee mug', '9.00', '0.00')
        sale = self._sell('ITMTPLAMP', 'ITMTPCHEAP')
        r = self._receipt(sale['id']).json()
        by_sku = {l['sku']: l for l in r['lines']}
        lamp, mug = by_sku['ITMTPLAMP'], by_sku['ITMTPCHEAP']
        self.assertEqual((lamp['state'], lamp['late'], lamp['mark'], lamp['refund'], lamp['bucks_take']),
                         ('returnable', False, '3-day return', '68.48', '28.00'))
        self.assertEqual((mug['state'], mug['mark']), ('as_is', 'AS IS'))
        self.assertIn('$10.00 or less after ThriftBucks', mug['why'])
        self.assertEqual((r['member']['name'], r['late'], r['cashier']), ('Ana Member', False, 'Pat Clerk'))
        self.assertEqual(r['deadline'], (timezone.localdate() + timedelta(days=3)).isoformat())

    def test_after_the_three_days_a_line_is_returnable_but_marked_late(self):
        sale = self._sell('ITMTPLAMP', days_ago=4)
        r = self._receipt(sale['id']).json()
        self.assertEqual((r['late'], r['lines'][0]['state'], r['lines'][0]['late']), (True, 'returnable', True))

    def test_a_returned_line_is_greyed_and_a_guest_sale_is_all_final(self):
        sale = self._sell('ITMTPLAMP')
        self.assertEqual(self._batch(sale, self._item_lines(sale)).status_code, 201)
        line = self._receipt(sale['id']).json()['lines'][0]
        self.assertEqual(line['state'], 'returned')
        self.assertIn('Already returned', line['why'])
        guest = self._sell('ITMTPVASE', member=False)
        r = self._receipt(guest['id']).json()
        self.assertIsNone(r['member'])
        self.assertEqual((r['lines'][0]['state'], r['lines'][0]['why']), ('as_is', 'Not sold to a Thrift+ member. All sales final.'))

    def test_no_such_ticket_and_open_sales_are_not_found(self):
        self.assertEqual(self._receipt(999999).status_code, 404)
        open_cart = self._cart()
        self.assertEqual(self._receipt(open_cart['id']).status_code, 404)
        self.assertEqual(self.api.get('/api/thriftplus/returns/receipt/').status_code, 404)


class BatchReturnTests(ReturnsPageBase):
    def test_the_summary_adds_up_each_line_and_the_whole(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        ids = self._item_lines(sale)
        r = self.api.post('/api/thriftplus/returns/preview/', {'cart': sale['id'], 'cart_lines': ids}, format='json').json()
        self.assertEqual([x['sku'] for x in r['lines']], ['ITMTPLAMP', 'ITMTPVASE'])
        self.assertEqual((r['lines'][0]['credit'], r['lines'][0]['bucks_taken']), ('68.48', '28.00'))
        self.assertEqual((r['late'], r['ok'], r['pin_set'], r['owner_signed_in']), (False, True, False, False))
        total = sum(D(x['credit']) for x in r['lines'])
        self.assertEqual(D(r['totals']['credit']), total)
        self.assertEqual({x['value'] for x in r['reasons']}, {'told_wrong', 'closed', 'owner'})
        self.assertFalse(ReturnRecord.objects.exists())  # a preview writes nothing

    def test_several_lines_come_back_in_one_call_and_the_member_card_data_is_answered(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        before = LedgerEntry.objects.count()
        r = self._batch(sale, self._item_lines(sale))
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(len(body['returns']), 2)
        self.assertEqual(body['person_id'], self.account.people.first().pk)
        self.assertEqual(ReturnRecord.objects.count(), 2)
        self.assertEqual(D(body['totals']['credit']), ledger.credit_balance(self.account))
        self.assertEqual(body['credit'], str(ledger.credit_balance(self.account)))
        self.assertGreater(LedgerEntry.objects.count(), before)
        self.assertFalse(LateReturnMark.objects.exists())  # on time: no mark against Retail
        again = self._batch(sale, self._item_lines(sale))
        self.assertEqual((again.status_code, again.json()['code']), (400, 'NOT_RETURNABLE'))

    def test_one_line_that_cannot_come_back_stops_them_all(self):
        self._item('ITMTPCHEAP', 'Coffee mug', '9.00', '0.00')
        sale = self._sell('ITMTPLAMP', 'ITMTPCHEAP')
        r = self._batch(sale, self._item_lines(sale))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_RETURNABLE'))
        self.assertFalse(ReturnRecord.objects.exists())
        self.assertEqual(ledger.credit_balance(self.account), D('0.00'))

    def test_thriftbucks_taken_back_run_in_order_and_the_shortfall_comes_off_the_credit(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D('-40.00'), reason='adjust')
        ids = self._item_lines(sale)
        preview = self.api.post('/api/thriftplus/returns/preview/', {'cart': sale['id'], 'cart_lines': ids}, format='json').json()
        body = self._batch(sale, ids).json()
        self.assertEqual(body['totals']['shortfall'], preview['totals']['shortfall'])
        self.assertEqual(body['totals']['credit'], preview['totals']['credit'])
        self.assertEqual(body['totals']['bucks_taken'], preview['totals']['bucks_taken'])

    def test_nothing_ticked_or_a_guest_sale_is_refused(self):
        sale = self._sell('ITMTPLAMP')
        self.assertEqual(self._batch(sale, []).json()['code'], 'NO_LINES')
        self.assertEqual(self._batch(sale, [999999]).json()['code'], 'NO_LINES')
        guest = self._sell('ITMTPVASE', member=False)
        self.assertEqual(self._batch(guest, self._item_lines(guest)).json()['code'], 'NOT_RETURNABLE')

    def test_the_training_register_works_it_out_and_writes_nothing(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        rows = LedgerEntry.objects.count()
        r = self._batch(sale, self._item_lines(sale), register='TRAIN')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertTrue(body['training'])
        self.assertEqual(len(body['returns']), 2)
        self.assertFalse(ReturnRecord.objects.exists())
        self.assertEqual(LedgerEntry.objects.count(), rows)


class LateReturnTests(ReturnsPageBase):
    def _late_sale(self, *skus):
        return self._sell(*(skus or ('ITMTPLAMP',)), days_ago=4)

    def test_past_the_three_days_it_needs_a_reason_and_the_pin(self):
        sale = self._late_sale()
        ids = self._item_lines(sale)
        self._set_pin()
        plain = self._batch(sale, ids)
        self.assertEqual((plain.status_code, plain.json()['code']), (400, 'SAY_WHY'))
        no_pin = self._batch(sale, ids, late={'reason': 'closed'})
        self.assertEqual((no_pin.status_code, no_pin.json()['code']), (403, 'PIN_NEEDED'))
        wrong = self._batch(sale, ids, late={'reason': 'closed'}, pin='0000')
        self.assertEqual((wrong.status_code, wrong.json()['code'], wrong.json()['tries_left']), (403, 'PIN_WRONG', 4))
        self.assertFalse(ReturnRecord.objects.exists())
        bad_reason = self._batch(sale, ids, late={'reason': 'because'}, pin=PIN)
        self.assertEqual(bad_reason.json()['code'], 'SAY_WHY')
        ok = self._batch(sale, ids, late={'reason': 'closed', 'note': 'Closed Sun and Mon'}, pin=PIN)
        self.assertEqual(ok.status_code, 201, ok.content)
        record = ReturnRecord.objects.get()
        self.assertEqual(record.late_ok_by, self.clerk)
        self.assertIn('Late return: Store was closed.', record.note)
        self.assertIn('Closed Sun and Mon', record.note)

    def test_the_mark_against_retail_sits_on_the_original_cashier(self):
        sale = self._late_sale()
        other = Cart.objects.get(pk=sale['id'])
        other.cashier = self.manager
        other.save(update_fields=['cashier'])
        self._set_pin()
        self.assertEqual(self._batch(sale, self._item_lines(sale), late={'reason': 'told_wrong'}, pin=PIN).status_code, 201)
        mark = LateReturnMark.objects.get()
        self.assertEqual((mark.department, mark.cashier, mark.cashier_name, mark.reason, mark.entered_by, mark.by_pin),
                         ('retail', self.manager, 'Pat Clerk', 'told_wrong', self.clerk, True))
        self.assertEqual(mark.return_record, ReturnRecord.objects.get())
        used = Event.objects.get(action='owner_pin_used')
        self.assertEqual((used.actor, used.detail['purpose'], used.detail['reason']), (self.clerk, 'late return', 'told_wrong'))

    def test_the_owner_signed_in_needs_no_pin_and_it_is_still_marked(self):
        sale = self._late_sale()
        self.api.force_authenticate(self.owner)
        r = self._batch(sale, self._item_lines(sale), late={'reason': 'owner'})
        self.assertEqual(r.status_code, 201, r.content)
        mark = LateReturnMark.objects.get()
        self.assertEqual((mark.by_pin, mark.entered_by, mark.reason), (False, self.owner, 'owner'))

    def test_only_the_late_lines_are_marked_when_a_receipt_mixes(self):
        sale = self._sell('ITMTPLAMP', 'ITMTPVASE')
        first, second = self._item_lines(sale)
        self._set_pin()
        self.assertEqual(self._batch(sale, [first]).status_code, 201)  # on time: no mark
        self.assertFalse(LateReturnMark.objects.exists())
        Cart.objects.filter(pk=sale['id']).update(completed_at=timezone.now() - timedelta(days=5))
        self.assertEqual(self._batch(sale, [second], late={'reason': 'closed'}, pin=PIN).status_code, 201)
        self.assertEqual(LateReturnMark.objects.get().return_record.cart_line_id, second)

    def test_the_old_single_line_return_takes_the_pin_too(self):
        sale = self._late_sale()
        line_id = self._item_lines(sale)[0]
        self._set_pin()
        url = '/api/thriftplus/returns/'
        body = {'cart_line': line_id, 'code': self.codes[0], 'register': 'TP-T1', 'late_ok': True, 'note': 'Closed'}
        self.assertEqual(self.api.post(url, body, format='json').json()['code'], 'PIN_NEEDED')
        self.assertEqual(self.api.post(url, {**body, 'pin': '1'}, format='json').json()['code'], 'PIN_WRONG')
        ok = self.api.post(url, {**body, 'pin': PIN}, format='json')
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(LateReturnMark.objects.get().reason, 'owner')

    def test_five_wrong_pins_on_the_page_lock_it(self):
        sale = self._late_sale()
        ids = self._item_lines(sale)
        self._set_pin()
        for _ in range(4):
            self.assertEqual(self._batch(sale, ids, late={'reason': 'closed'}, pin='0000').json()['code'], 'PIN_WRONG')
        locked = self._batch(sale, ids, late={'reason': 'closed'}, pin='0000')
        self.assertEqual((locked.status_code, locked.json()['code']), (429, 'PIN_LOCKED'))
        again = self._batch(sale, ids, late={'reason': 'closed'}, pin=PIN)
        self.assertEqual(again.status_code, 429)
        self.assertFalse(ReturnRecord.objects.exists())

    def test_no_pin_set_says_so(self):
        sale = self._late_sale()
        r = self._batch(sale, self._item_lines(sale), late={'reason': 'closed'}, pin=PIN)
        self.assertEqual((r.status_code, r.json()['code']), (403, 'PIN_NOT_SET'))

    def test_the_late_returns_list_is_for_managers_and_newest_first(self):
        old, new = self._late_sale(), self._late_sale('ITMTPVASE')
        self._set_pin()
        self._batch(old, self._item_lines(old), late={'reason': 'closed', 'note': 'storm'}, pin=PIN)
        self._batch(new, self._item_lines(new), late={'reason': 'told_wrong'}, pin=PIN)
        self.assertEqual(self.api.get('/api/thriftplus/returns/late/').status_code, 403)  # a clerk
        self.api.force_authenticate(self.manager)
        rows = self.api.get('/api/thriftplus/returns/late/').json()
        self.assertEqual([r['sku'] for r in rows], ['ITMTPVASE', 'ITMTPLAMP'])
        first = rows[1]
        self.assertEqual((first['reason_label'], first['cashier'], first['entered_by'], first['by_pin'], first['member']),
                         ('Store was closed', 'Pat Clerk', 'Pat Clerk', True, 'Ana Member'))
        self.assertIn('storm', first['note'])
        self.assertEqual(first['days_late'], 1)
        self.assertTrue(first['receipt_number'].startswith('R-'))
        self.assertEqual(first['department'], 'retail')

    def test_a_late_return_in_training_needs_a_reason_but_no_pin_and_writes_nothing(self):
        sale = self._late_sale()
        ids = self._item_lines(sale)
        r = self._batch(sale, ids, late={'reason': 'closed'}, register='TRAIN')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(LateReturnMark.objects.exists())
        self.assertFalse(Event.objects.filter(action__startswith='owner_pin').exists())
