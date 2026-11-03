"""Bank deposits (Retail 5 step 2, 2026-11-02): built from drop bags and close-out bags, out of the office or the safe."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone

from apps.pos.models import (
    BankTransaction, CashDrop, DepositBag, Drawer, Safe, SafeLine, SupplementalDrawer, SupplementalTransaction,
)

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal
URL = '/api/pos/bank/deposit/'


class BankDepositTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.office = SupplementalDrawer.objects.create(
            location=self.location, current_balance={'hundreds': 2, 'twenties': 10, 'ones': 50}, current_total=D('450'))
        Safe.objects.create(location=self.location, balance={'hundreds': 3}, total=D('300'))
        self.drop = CashDrop.objects.create(drawer=self.drawer, amount={'hundreds': 2}, total=D('200'),
                                            dropped_by=self.user, reason='Big bills')
        closed = Drawer.objects.create(register=self.register, date=timezone.localdate() - timezone.timedelta(days=1),
                                       status='closed', current_cashier=self.user, opened_by=self.user,
                                       opened_at=timezone.now(),
                                       closed_at=timezone.now(), closed_by=self.user,
                                       close_out={'drop_total': '100.00', 'drop': {'twenties': 5}})
        self.closed = closed

    def test_the_open_bags_are_the_drops_and_the_close_outs(self):
        bags = self.client.get(URL).json()['bags']
        self.assertEqual({(b['kind'], b['total']) for b in bags}, {('drop', '200.00'), ('close_out', '100.00')})

    def test_a_deposit_takes_the_cash_out_of_the_office_once_and_keeps_the_difference(self):
        r = self.client.post(URL, {'bags': [{'kind': 'drop', 'ref': self.drop.pk},
                                            {'kind': 'close_out', 'ref': self.closed.pk}],
                                   'count': {'hundreds': 2, 'twenties': 5}, 'source': 'office'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        dep = r.json()['deposit']
        self.assertEqual((dep['total'], dep['bags_total'], dep['difference'], dep['status']),
                         ('300.00', '300.00', '0.00', 'pending'))
        self.office.refresh_from_db()
        self.assertEqual((self.office.current_balance, self.office.current_total),
                         ({'twenties': 5, 'ones': 50}, D('150')))
        self.assertEqual(SupplementalTransaction.objects.get().transaction_type, 'to_bank')
        self.assertEqual(r.json()['bags'], [])
        again = self.client.post(URL, {'bags': [{'kind': 'drop', 'ref': self.drop.pk}], 'count': {'ones': 5},
                                       'source': 'office'}, format='json')
        self.assertEqual((again.status_code, again.json()['code']), (400, 'BAG_TAKEN'))

    def test_from_the_safe_and_never_below_zero(self):
        r = self.client.post(URL, {'count': {'hundreds': 4}, 'source': 'safe'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(BankTransaction.objects.exists())
        r = self.client.post(URL, {'count': {'hundreds': 3}, 'source': 'safe'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Safe.objects.get().total, D('0'))
        self.assertEqual(SafeLine.objects.get().kind, 'deposit')

    def test_far_off_the_bags_needs_a_note(self):
        body = {'bags': [{'kind': 'drop', 'ref': self.drop.pk}], 'count': {'hundreds': 1}, 'source': 'office'}
        r = self.client.post(URL, body, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOTE_REQUIRED'))
        self.assertFalse(DepositBag.objects.exists())
        r = self.client.post(URL, {**body, 'note': 'One $100 went to the safe'}, format='json')
        self.assertEqual((r.status_code, r.json()['deposit']['difference']), (201, '-100.00'))

    def test_cashiers_get_nothing(self):
        self.user.groups.clear()
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_change_from_the_bank_goes_into_the_office_or_the_safe(self):
        r = self.client.post('/api/pos/bank/change/', {'count': {'ones': 100, 'quarters': 80}, 'into': 'safe'},
                             format='json')
        self.assertEqual(r.status_code, 201, r.content)
        safe = Safe.objects.get()
        self.assertEqual((safe.balance['ones'], safe.total), (100, D('420')))
        r = self.client.post('/api/pos/bank/change/', {'count': {'ones': 20}, 'into': 'office'}, format='json')
        self.office.refresh_from_db()
        self.assertEqual((self.office.current_balance['ones'], self.office.current_total), (70, D('470')))
        self.assertEqual(BankTransaction.objects.filter(transaction_type='change_pickup', status='completed').count(), 2)

    def test_a_deposit_that_moved_cash_is_locked_and_complete_is_once(self):
        r = self.client.post(URL, {'count': {'twenties': 5}, 'source': 'office'}, format='json')
        dep = r.json()['deposit']['id']
        self.assertEqual(self.client.delete(f'/api/pos/bank-transactions/{dep}/').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/pos/bank-transactions/{dep}/', {'total': '1'}, format='json')
                         .status_code, 400)
        first = self.client.patch(f'/api/pos/bank-transactions/{dep}/complete/').json()['completed_at']
        self.assertEqual(self.client.patch(f'/api/pos/bank-transactions/{dep}/complete/').json()['completed_at'], first)
        self.assertEqual(self.client.post('/api/pos/bank-transactions/', {'transaction_type': 'deposit'},
                                          format='json').json()['code'], 'USE_SAFE_CARD')
