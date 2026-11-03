"""The safe (Retail 5 step 1, 2026-11-02): the office's target, the alert when it needs a swap, the swap and the count."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase

from apps.pos.models import Safe, SafeLine, SupplementalDrawer, SupplementalTransaction

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal


class SafeTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.office = SupplementalDrawer.objects.create(
            location=self.location, current_balance={'twenties': 30, 'ones': 10, 'quarters': 20},
            current_total=D('615.00'),
        )
        Safe.objects.create(location=self.location, balance={'ones': 200, 'quarters': 400, 'hundreds': 5},
                            total=D('800.00'))

    def _owner(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])

    def _target(self, count, cap='500.00'):
        self._owner()
        return self.client.put('/api/pos/safe/target/', {'count': count, 'cap': cap}, format='json')

    def test_no_target_no_alert(self):
        body = self.client.get('/api/pos/safe/').json()
        self.assertEqual((body['needs_swap'], body['target'], body['safe']['total']), (False, None, '800.00'))
        self.assertIsNone(body['safe']['balance'])  # a manager: the total only, so the count stays blind
        self._owner()
        self.assertEqual(self.client.get('/api/pos/safe/').json()['safe']['balance']['ones'], 200)

    def test_short_of_ones_and_over_the_cap_suggests_a_swap(self):
        self.assertEqual(self._target({'twenties': 10, 'ones': 500, 'quarters': 40}).status_code, 200)
        self.user.is_superuser = False
        self.user.save(update_fields=['is_superuser'])
        manager = self.client.get('/api/pos/safe/').json()
        self.assertEqual(manager['suggested']['take_from_safe']['ones'], 490)  # not trimmed to the safe's 200
        self._owner()
        body = self.client.get('/api/pos/safe/').json()
        self.assertTrue(body['needs_swap'])
        self.assertEqual((body['short'], body['over_cap']), ({'ones': 490, 'quarters': 20}, True))
        self.assertEqual(body['suggested'], {'take_from_safe': {'ones': 200, 'quarters': 20},
                                             'put_in_safe': {'twenties': 20}})

    def test_the_swap_moves_both_and_writes_one_safe_line_and_the_office_lines(self):
        r = self.client.post('/api/pos/safe/swap/', {'put_in_safe': {'twenties': 20},
                                                    'take_from_safe': {'ones': 40, 'quarters': 20}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.office.refresh_from_db()
        safe = Safe.objects.get()
        self.assertEqual(self.office.current_balance, {'twenties': 10, 'ones': 50, 'quarters': 40})
        self.assertEqual(self.office.current_total, D('260.00'))
        self.assertEqual((safe.balance['twenties'], safe.balance['ones'], safe.total), (20, 160, D('1155.00')))
        self.assertEqual(SafeLine.objects.get().into_total, D('400.00'))
        self.assertEqual(set(SupplementalTransaction.objects.values_list('transaction_type', flat=True)),
                         {'from_safe', 'to_safe'})

    def test_neither_side_goes_below_zero_and_nothing_is_written(self):
        r = self.client.post('/api/pos/safe/swap/', {'take_from_safe': {'fifties': 1}}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'SAFE_REFUSED'))
        r = self.client.post('/api/pos/safe/swap/', {'put_in_safe': {'twenties': 31}}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(SafeLine.objects.exists())
        self.assertFalse(SupplementalTransaction.objects.exists())

    def test_the_count_is_blind_and_only_the_owner_sees_the_difference(self):
        r = self.client.post('/api/pos/safe/count/', {'count': {'ones': 190, 'quarters': 400, 'hundreds': 5}},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()['counted']['difference'])
        self.assertEqual(Safe.objects.get().total, D('790.00'))
        self._owner()
        self.assertEqual(self.client.get('/api/pos/safe/').json()['lines'][0]['difference'], '-10.00')

    def test_cashiers_get_nothing_and_only_the_owner_sets_the_target(self):
        r = self.client.put('/api/pos/safe/target/', {'count': {'ones': 5}}, format='json')
        self.assertEqual(r.status_code, 403)  # a manager, not the owner
        self.user.groups.clear()
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.assertEqual(self.client.get('/api/pos/safe/').status_code, 403)
        self.assertEqual(self.client.post('/api/pos/safe/swap/', {}, format='json').status_code, 403)
