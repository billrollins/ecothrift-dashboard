"""A drawer's life (2026-10-21, digest point 3, REG-18/19): blind counts with the difference by bill and coin after,
handoffs count bills only, paid in / paid out and drops with a reason, and the office close into the office ledger."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.pos.models import CashMovement, Drawer, Register, SupplementalDrawer, SupplementalTransaction
from apps.pos.services.drawer_life import expected_cash

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal
TILL = {'tens': 5, 'fives': 10, 'ones': 50, 'quarters': 40, 'dimes': 50, 'nickels': 40, 'pennies': 50}  # $167.50


class _LifeFixtures(_CartCardSurchargeFixtures):
    def setUp(self):
        super().setUp()
        self.office = SupplementalDrawer.objects.create(
            location=self.location, current_balance={'tens': 20, 'quarters': 100}, current_total=D('225.00'),
        )
        Drawer.objects.filter(pk=self.drawer.pk).update(
            contents={'twenties': 3, 'tens': 2, 'ones': 10, 'quarters': 8}, opening_total=D('92.00'))
        self.drawer.refresh_from_db()
        self.manager = User.objects.create_user(email='life-manager@example.com', first_name='M', last_name='G',
                                                password='x-pass-123')
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.other = User.objects.create_user(email='life-other@example.com', first_name='O', last_name='T',
                                              password='x-pass-123')
        self.other.groups.add(Group.objects.get(name='Employee'))

    def _url(self, action, drawer=None):
        return f'/api/pos/drawers/{(drawer or self.drawer).id}/{action}/'


class OpeningTests(_LifeFixtures, TestCase):
    def test_a_blind_opening_shows_the_till_difference_after_and_the_till_leaves_the_office(self):
        reg = Register.objects.create(location=self.location, name='Register L', code='POS-L1', starting_breakdown=TILL)
        counted = {**TILL, 'ones': 48}
        r = self.client.post('/api/pos/drawers/', {'register': reg.id, 'opening_count': counted}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        check = r.json()['count_check']
        ones = next(row for row in check['rows'] if row['key'] == 'ones')
        self.assertEqual((ones['counted'], ones['expected'], ones['difference']), (48, 50, -2))
        self.assertEqual(check['difference_total'], '-2.00')
        self.office.refresh_from_db()
        self.assertEqual(self.office.current_total, D('225.00') - D('165.50'))
        line = SupplementalTransaction.objects.get(transaction_type='drawer_open')
        self.assertEqual((line.total, line.related_drawer.register_id), (D('165.50'), reg.id))

    def test_no_till_set_means_no_check(self):
        reg = Register.objects.create(location=self.location, name='Register M', code='POS-M1')
        r = self.client.post('/api/pos/drawers/', {'register': reg.id, 'opening_count': {'ones': 5}}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('count_check', r.json())


class HandoffTests(_LifeFixtures, TestCase):
    def test_a_handoff_counts_bills_only_and_shows_the_difference_after(self):
        r = self.client.post(self._url('handoff'), {'incoming_cashier': self.manager.id,
                                                    'count': {'twenties': 3, 'tens': 2, 'ones': 9}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['bills_only'], body['expected_total'], body['variance']), (True, '90.00', '-1.00'))
        self.assertEqual([row['key'] for row in body['count_check']['rows']], ['twenties', 'tens', 'ones'])

    def test_coins_are_not_counted_at_a_handoff(self):
        r = self.client.post(self._url('handoff'), {'incoming_cashier': self.manager.id,
                                                    'count': {'twenties': 3, 'quarters': 8}}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('bills only', r.json()['detail'])


class CloseTests(_LifeFixtures, TestCase):
    BILLS = {'twenties': 3, 'tens': 2, 'ones': 10}  # $90 by hand

    def test_the_office_close_with_coin_counts_shows_the_difference_and_fills_the_office(self):
        r = self.client.post(self._url('close'), {'closing_count': {**self.BILLS, 'quarters': 7}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        quarters = next(row for row in body['count_check']['rows'] if row['key'] == 'quarters')
        self.assertEqual((quarters['counted'], quarters['expected'], quarters['difference']), (7, 8, -1))
        self.assertEqual((body['closing_total'], body['variance']), ('91.75', '-0.25'))
        self.assertEqual(body['closing_expected'], {'twenties': 3, 'tens': 2, 'ones': 10, 'quarters': 8})
        self.office.refresh_from_db()
        self.assertEqual(self.office.current_total, D('316.75'))
        self.assertEqual(self.office.current_balance['tens'], 22)
        self.assertTrue(SupplementalTransaction.objects.filter(transaction_type='drawer_close', total=D('91.75')).exists())

    def test_the_coin_counter_total_is_one_row(self):
        r = self.client.post(self._url('close'), {'closing_count': self.BILLS, 'coins_total': '2.00'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        coins = r.json()['count_check']['rows'][-1]
        self.assertEqual((coins['key'], coins['counted'], coins['expected']), ('coins', '2.00', '2.00'))
        self.drawer.refresh_from_db()
        self.assertEqual((self.drawer.closing_total, self.drawer.coin_counter_total), (D('92.00'), D('2.00')))

    def test_coins_by_coin_or_by_total_not_both(self):
        r = self.client.post(self._url('close'), {'closing_count': {'quarters': 8}, 'coins_total': '2.00'},
                             format='json')
        self.assertEqual(r.status_code, 400)

    def test_far_off_needs_a_note(self):
        AppSetting.objects.update_or_create(key='pos.close_note_over', defaults={'value': 5, 'description': 't'})
        r = self.client.post(self._url('close'), {'closing_count': {'twenties': 3}}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOTE_REQUIRED'))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.status, 'open')
        ok = self.client.post(self._url('close'), {'closing_count': {'twenties': 3}, 'note': 'Paid the plumber'},
                              format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.drawer.refresh_from_db()
        self.assertEqual((self.drawer.close_note, self.drawer.variance), ('Paid the plumber', D('-32.00')))

    def test_the_owners_setting_moves_the_line(self):
        # Saved from Settings as dollars ("20.00"): $12 short closes without a note.
        AppSetting.objects.update_or_create(key='pos.close_note_over', defaults={'value': '20.00', 'description': 't'})
        r = self.client.post(self._url('close'), {'closing_count': {'twenties': 4}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['variance'], '-12.00')

    def test_only_the_drawers_cashier_or_a_manager_closes_it(self):
        self.client.force_authenticate(self.other)
        r = self.client.post(self._url('close'), {'closing_count': self.BILLS, 'coins_total': '2.00'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'NOT_YOUR_DRAWER'))
        self.client.force_authenticate(self.manager)
        r = self.client.post(self._url('close'), {'closing_count': self.BILLS, 'coins_total': '2.00'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)


class MovementTests(_LifeFixtures, TestCase):
    def test_paid_in_and_out_need_a_reason_and_move_the_expected_cash(self):
        r = self.client.post(self._url('paid-out'), {'amount': {'tens': 1}}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'REASON_REQUIRED'))
        out = self.client.post(self._url('paid-out'), {'amount': {'tens': 1}, 'reason': 'Bought tape'}, format='json')
        self.assertEqual(out.status_code, 201, out.content)
        inn = self.client.post(self._url('paid-in'), {'amount': {'quarters': 40}, 'reason': 'Change from office'},
                               format='json')
        self.assertEqual(inn.status_code, 201, inn.content)
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.contents, {'twenties': 3, 'tens': 1, 'ones': 10, 'quarters': 48})
        self.assertEqual(expected_cash(self.drawer), D('92.00') - D('10.00') + D('10.00'))
        self.assertEqual(CashMovement.objects.count(), 2)
        detail = self.client.get(f'/api/pos/drawers/{self.drawer.id}/').json()
        self.assertEqual(sorted(m['reason'] for m in detail['movements']), ['Bought tape', 'Change from office'])

    def test_a_closed_drawer_or_the_training_register_moves_nothing(self):
        Drawer.objects.filter(pk=self.drawer.pk).update(status='closed')
        self.assertEqual(self.client.post(self._url('paid-in'), {'total': '5.00', 'reason': 'x'},
                                          format='json').json()['code'], 'DRAWER_CLOSED')
        Drawer.objects.filter(pk=self.drawer.pk).update(status='open')
        Register.objects.filter(pk=self.register.pk).update(is_training=True)
        self.assertEqual(self.client.post(self._url('paid-in'), {'total': '5.00', 'reason': 'x'},
                                          format='json').json()['code'], 'TRAINING_REGISTER')

    def test_a_drop_needs_a_reason_and_goes_into_the_office(self):
        r = self.client.post(self._url('drop'), {'amount': {'twenties': 2}}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'REASON_REQUIRED'))
        r = self.client.post(self._url('drop'), {'amount': {'twenties': 2}, 'reason': 'Too much cash'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['reason'], 'Too much cash')
        self.office.refresh_from_db()
        self.assertEqual((self.office.current_total, self.office.current_balance.get('twenties')), (D('265.00'), 2))
        self.drawer.refresh_from_db()
        self.assertEqual(expected_cash(self.drawer), D('52.00'))

    def test_no_office_set_up_still_works(self):
        self.office.delete()
        r = self.client.post(self._url('drop'), {'amount': {'twenties': 1}, 'reason': 'x'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(SupplementalTransaction.objects.exists())
        self.assertIsNotNone(timezone.now())
