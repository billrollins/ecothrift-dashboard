"""The retail windows (Retail 2, 2026-11-02): the Register window's one call and the Transactions window's filters."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.pos.models import Cart, CashDrop, Drawer, Register, RegisterEvent

from .test_cart_card_surcharge import _CartCardSurchargeFixtures


class RegisterCardTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        # The shared fixture dates the drawer in UTC; the store's day is local (they differ in the evening).
        self.drawer.date = timezone.localdate()
        self.drawer.save()

    def _card(self, register=None):
        r = self.client.get(f'/api/pos/registers/{(register or self.register).id}/card/')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _sale(self, total, method='cash', status='completed', drawer=None):
        return Cart.objects.create(drawer=drawer or self.drawer, cashier=self.user, status=status, total=Decimal(total),
                                   payment_method=method, completed_at=timezone.now())

    def test_open_register_today(self):
        self._sale('10.00')
        self._sale('30.00', method='card')
        self._sale('5.00', status='voided')
        CashDrop.objects.create(drawer=self.drawer, total=Decimal('100'), dropped_by=self.user)
        RegisterEvent.objects.create(kind='open_drawer', drawer=self.drawer, user=self.user, register_code='POS-C1')
        c = self._card()
        self.assertEqual((c['status'], c['drawer']['cashier'], c['drawer']['status']), ('open', 'Pos Card', 'open'))
        s = c['sales']
        self.assertEqual((s['count'], s['total'], s['average'], s['voided']), (2, '40.00', '20.00', 1))
        # Counts are blind: an employee does not see the open drawer's running cash.
        self.assertEqual(s['by_method'], {'card': '30.00'})
        self.assertEqual(len(c['last_sales']), 3)
        self.assertEqual({e['kind'] for e in c['journey']}, {'opened', 'drop', 'open_drawer'})
        self.assertIsNone(c['last_drawer'])

    def test_blind_hides_the_handoff_difference_while_open(self):
        from apps.pos.models import DrawerHandoff
        DrawerHandoff.objects.create(drawer=self.drawer, outgoing_cashier=self.user, incoming_cashier=self.user,
                                     counted_at=timezone.now(), variance=Decimal('-3.00'))
        handoff = next(e for e in self._card()['journey'] if e['kind'] == 'handoff')
        self.assertIsNone(handoff['variance'])

    def test_a_customer_is_refused(self):
        from django.contrib.auth.models import Group
        self.user.groups.clear()
        self.user.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.assertEqual(self.client.get(f'/api/pos/registers/{self.register.id}/card/').status_code, 403)

    def test_a_manager_sees_the_cash(self):
        from django.contrib.auth.models import Group
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self._sale('10.00')
        self._sale('30.00', method='card')
        s = self._card()['sales']
        self.assertEqual(s['by_method'], {'cash': '10.00', 'card': '30.00'})
        self.assertEqual(sum(Decimal(v) for v in s['by_method'].values()), Decimal(s['total']))

    def test_not_opened_today_names_the_last_drawer(self):
        self.drawer.date = timezone.localdate() - timedelta(days=2)
        self.drawer.status = 'closed'
        self.drawer.save()
        c = self._card()
        self.assertEqual(c['status'], 'not_opened')
        self.assertIsNone(c['drawer'])
        self.assertEqual(c['last_drawer']['id'], self.drawer.id)
        self.assertEqual(c['sales']['count'], 0)

    def test_training_register_has_no_money(self):
        reg = Register.objects.create(location=self.location, name='Practice', code='TRN-1', is_training=True)
        d = Drawer.objects.create(register=reg, date=timezone.localdate(), current_cashier=self.user,
                                  opened_by=self.user, opened_at=timezone.now(), status='open')
        self._sale('25.00', status='training', drawer=d)
        c = self._card(reg)
        self.assertTrue(c['is_training'])
        self.assertEqual((c['sales']['total'], c['sales']['practice']), ('0.00', 1))

    def test_off_register(self):
        self.register.is_active = False
        self.register.save()
        self.assertEqual(self._card()['status'], 'off')

    def test_signed_out_is_refused(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(f'/api/pos/registers/{self.register.id}/card/').status_code, (401, 403))


class CartWindowFilterTests(_CartCardSurchargeFixtures, TestCase):
    def test_register_filter(self):
        other_reg = Register.objects.create(location=self.location, name='Other', code='POS-O1')
        other = Drawer.objects.create(register=other_reg, date=timezone.localdate(), current_cashier=self.user,
                                      opened_by=self.user, opened_at=timezone.now(), status='open')
        mine = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='completed', total=Decimal('4'),
                                   completed_at=timezone.now())
        Cart.objects.create(drawer=other, cashier=self.user, status='completed', total=Decimal('9'),
                            completed_at=timezone.now())
        r = self.client.get('/api/pos/carts/', {'register': self.register.id, 'status': 'all'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([row['id'] for row in r.json()['results']], [mine.id])
        s = self.client.get('/api/pos/carts/summary/', {'register': self.register.id, 'status': 'all'}).json()
        self.assertEqual((s['count'], s['total']), (1, '4.00'))

    def test_member_filter_takes_the_whole_membership(self):
        from apps.thriftplus.models import Account, Card, CartMember, Person
        mine = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='completed', total=Decimal('4'),
                                   completed_at=timezone.now())
        Cart.objects.create(drawer=self.drawer, cashier=self.user, status='completed', total=Decimal('9'),
                            completed_at=timezone.now())
        account = Account.objects.create()
        first = Person.objects.create(account=account, first_name='Ana', last_name='Ruiz')
        second = Person.objects.create(account=account, first_name='Luis', last_name='Ruiz', role='secondary')
        card = Card.objects.create(code='123456789012', person=first)
        CartMember.objects.create(cart=mine, account=account, person=first, card=card)
        r = self.client.get('/api/pos/carts/', {'member': second.id, 'status': 'all'})
        self.assertEqual([row['id'] for row in r.json()['results']], [mine.id])


class DrawerCardTests(_CartCardSurchargeFixtures, TestCase):
    """The Drawer window (Retail 2 step 1, 2026-11-02): cash now by bill, every count, blind while open."""

    def setUp(self):
        super().setUp()
        Drawer.objects.filter(pk=self.drawer.pk).update(
            date=timezone.localdate(), contents={'twenties': 3, 'ones': 10, 'quarters': 8},
            opening_count={'tens': 5}, opening_total=Decimal('50.00'), opening_expected={'tens': 5, 'ones': 2},
        )
        self.drawer.refresh_from_db()
        from apps.pos.models import DrawerHandoff
        DrawerHandoff.objects.create(drawer=self.drawer, outgoing_cashier=self.user, incoming_cashier=self.user,
                                     counted_at=timezone.now(), count={'twenties': 3}, counted_total=Decimal('60'),
                                     expected_count={'twenties': 3, 'ones': 1}, expected_total=Decimal('61'),
                                     variance=Decimal('-1'), bills_only=True)
        Cart.objects.create(drawer=self.drawer, cashier=self.user, status='completed', total=Decimal('10'),
                            payment_method='cash', completed_at=timezone.now())
        CashDrop.objects.create(drawer=self.drawer, total=Decimal('100'), dropped_by=self.user, reason='Big bills')

    def _card(self):
        r = self.client.get(f'/api/pos/drawers/{self.drawer.id}/card/')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _manager(self):
        from django.contrib.auth.models import Group
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])

    def test_a_cashier_sees_the_cash_now_and_what_was_counted_but_no_expected_while_open(self):
        c = self._card()
        self.assertEqual((c['status'], c['blind'], c['register']['code']), ('open', True, self.register.code))
        self.assertEqual(c['cash_now'], {'count': {'twenties': 3, 'ones': 10, 'quarters': 8}, 'coins_total': None,
                                         'total': '72.00'})
        opening, handoff = c['counts']
        self.assertEqual((opening['kind'], opening['counted_total'], opening['expected_total']), ('opening', '50.00', None))
        self.assertEqual((handoff['kind'], handoff['bills_only'], handoff['difference']), ('handoff', True, None))
        self.assertTrue(all('expected' not in row for row in handoff['rows']))
        self.assertNotIn('cash', c['sales']['by_method'])
        self.assertIsNone(c['variance'])
        drop = next(e for e in c['journey'] if e['kind'] == 'drop')
        self.assertEqual((drop['amount'], drop['note']), ('100.00', 'Big bills'))

    def test_a_manager_sees_expected_and_the_difference_by_bill(self):
        self._manager()
        opening, handoff = self._card()['counts']
        self.assertEqual((opening['expected_total'], opening['difference']), ('52.00', '-2.00'))
        self.assertEqual((handoff['expected_total'], handoff['difference']), ('61.00', '-1.00'))
        self.assertEqual({r['key']: r['difference'] for r in handoff['rows']}, {'twenties': 0, 'ones': -1})

    def test_a_handover_counted_as_one_total_still_shows_a_manager_the_difference(self):
        from apps.pos.models import DrawerHandoff
        self._manager()
        DrawerHandoff.objects.create(drawer=self.drawer, outgoing_cashier=self.user, incoming_cashier=self.user,
                                     counted_at=timezone.now(), counted_total=Decimal('70'),
                                     expected_total=Decimal('72'), variance=Decimal('-2'), bills_only=True)
        last = self._card()['counts'][-1]
        self.assertEqual((last['expected_total'], last['difference'], last['rows']), ('72.00', '-2.00', []))

    def test_a_closed_drawer_shows_the_close_to_everyone(self):
        Drawer.objects.filter(pk=self.drawer.pk).update(
            status='closed', closed_at=timezone.now(), closed_by=self.user, closing_count={'twenties': 2},
            closing_total=Decimal('40'), closing_expected={'twenties': 2, 'fives': 1}, expected_cash=Decimal('45'),
            variance=Decimal('-5'), coin_counter_total=Decimal('3.10'))
        c = self._card()
        self.assertEqual(c['cash_now']['coins_total'], '3.10')
        self.assertEqual((c['blind'], c['variance'], c['cash_now']['total']), (False, '-5.00', '40.00'))
        close = c['counts'][-1]
        self.assertEqual((close['kind'], close['counted_total'], close['expected_total'], close['difference']),
                         ('close', '40.00', '45.00', '-5.00'))

    def test_a_past_drawer_is_for_managers(self):
        Drawer.objects.filter(pk=self.drawer.pk).update(date=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.client.get(f'/api/pos/drawers/{self.drawer.id}/card/').status_code, 403)
        self._manager()
        self.assertEqual(self.client.get(f'/api/pos/drawers/{self.drawer.id}/card/').status_code, 200)
