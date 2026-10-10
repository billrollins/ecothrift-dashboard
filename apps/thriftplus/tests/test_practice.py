"""Practice members (owner, 2026-10-10): for training; the training register and test mode only, never in a report."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Item, Product
from apps.pos.models import Drawer, Register
from apps.thriftplus.models import Account, ItemReward
from apps.thriftplus.services import cards, members, overview, scanner

D = Decimal


class PracticeMemberTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.clerk = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)
        self.lamp = Item.objects.create(sku='ITMTPPRAC1', product=Product.objects.create(title='Lamp'), price=D('90.00'),
                                        status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key='p1', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())

    def _drawer(self, *, training: bool) -> Drawer:
        location = WorkLocation.objects.get_or_create(name='Store')[0]
        register = Register.objects.create(location=location, name='R', code='TRN' if training else 'FRT', is_training=training)
        return Drawer.objects.create(register=register, date=timezone.localdate(), current_cashier=self.clerk,
                                     opened_by=self.clerk, opened_at=timezone.now(), status='open')

    def _cart_on(self, drawer: Drawer) -> int:
        cart = self.api.post('/api/pos/carts/', {'drawer': drawer.pk}, format='json').json()
        self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTPPRAC1'}, format='json')
        return cart['id']

    def test_dash_makes_a_practice_member_with_a_555_phone_and_a_made_up_card(self):
        res = self.api.post('/api/thriftplus/accounts/practice/', {}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertTrue(data['is_practice'])
        person = data['people'][0]
        self.assertTrue(person['phone'].startswith(members.PRACTICE_AREA))
        self.assertEqual(person['cards'][0]['status'], 'active')
        second = self.api.post('/api/thriftplus/accounts/practice/', {}, format='json').json()
        self.assertNotEqual(second['people'][0]['phone'], person['phone'])

    def test_a_training_register_sign_up_is_practice_and_never_keeps_a_real_phone(self):
        res = self.api.post('/api/thriftplus/accounts/', {'first_name': 'Tia', 'phone': '4025550111', 'practice': 'true'})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(res.json()['is_practice'])
        self.assertEqual(res.json()['people'][0]['first_name'], 'Tia')
        real = members.create_account(first_name='Tia', phone='4025550111')  # she can still sign up for real
        self.assertFalse(real.is_practice)

    def test_a_practice_card_works_only_on_the_training_register(self):
        account = members.make_practice_member()
        code = account.people.get().cards.get().code
        real = self._cart_on(self._drawer(training=False))
        refused = self.api.post('/api/thriftplus/register/attach/', {'cart': real, 'code': code}, format='json')
        self.assertEqual((refused.status_code, refused.json()['code']), (400, 'PRACTICE_CARD'))
        practice = self._cart_on(self._drawer(training=True))
        ok = self.api.post('/api/thriftplus/register/attach/', {'cart': practice, 'code': code}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)

    def test_practice_members_are_left_out_of_the_counts_and_the_item_numbers(self):
        real = members.create_account(first_name='Ana', phone='4025550101', card_code=cards.generate_batch(1).cards.get().code)
        practice = members.make_practice_member()
        counts = overview.overview()['members']
        self.assertEqual((counts['active'], counts['people'], counts['cards_active'], counts['cards_blank']), (1, 1, 1, 0))
        scanner.signal('scan', self.lamp, practice)
        scanner.signal('scan', self.lamp, real)
        self.assertEqual(ItemReward.objects.get(item=self.lamp).scans, 1)  # only the real member's tap counts
        self.assertEqual(len(scanner.history(practice)), 1)                # but the practice member keeps a history
        self.assertTrue(Account.objects.get(pk=practice.pk).is_practice)


class TestToolsTests(TestCase):
    """Staff testing (owner 2026-10-10): test tags, the price-first look, and test ThriftBucks."""

    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.lamp = Item.objects.create(sku='ITMTPTEST1', product=Product.objects.create(title='Lamp'), price=D('90.00'),
                                        status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key='p1', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())

    def test_test_tags_are_for_staff_and_practice_only(self):
        self.assertEqual(APIClient().get('/api/thriftplus/public/test-tags/').status_code, 403)
        code = cards.generate_batch(1).cards.get().code
        members.create_account(first_name='Ana', phone='4025550101', card_code=code)
        customer = APIClient()
        customer.post('/api/thriftplus/public/session/card/', {'card_code': f'TP{code}', 'phone_last4': '0101'}, format='json')
        self.assertEqual(customer.get('/api/thriftplus/public/test-tags/').status_code, 403)
        practice = members.make_practice_member()
        tester = APIClient()
        person = practice.people.get()
        tester.post('/api/thriftplus/public/session/card/', {'card_code': f'TP{person.cards.get().code}',
                                                              'phone_last4': person.phone[-4:]}, format='json')
        res = tester.get('/api/thriftplus/public/test-tags/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tags'][0]['sku'], 'ITMTPTEST1')

    def test_the_session_says_price_first_unless_the_owner_turns_it_off(self):
        self.assertTrue(APIClient().get('/api/thriftplus/public/session/').json()['price_first'])
        AppSetting.objects.update_or_create(key=members.PRICE_FIRST_KEY, defaults={'value': False})
        self.assertFalse(APIClient().get('/api/thriftplus/public/session/').json()['price_first'])

    def test_test_thriftbucks_go_on_a_practice_membership_only(self):
        from django.core.management import CommandError, call_command

        from apps.thriftplus.services import ledger

        real = members.create_account(first_name='Ana', phone='4025550101')
        with self.assertRaises(CommandError):
            call_command('seed_test_thriftbucks', account=real.pk)
        practice = members.make_practice_member()
        call_command('seed_test_thriftbucks', account=practice.pk)
        call_command('seed_test_thriftbucks', account=practice.pk)  # again: put back, not doubled
        lots = ledger.reward_lots(practice)
        today = timezone.localdate()
        self.assertEqual([(x['amount'], x['use_by']) for x in lots],
                         [('4.25', (today + timedelta(days=1)).isoformat()), ('12.80', (today + timedelta(days=14)).isoformat())])
        self.assertEqual(ledger.cover(practice)['covered'], '6.50')
