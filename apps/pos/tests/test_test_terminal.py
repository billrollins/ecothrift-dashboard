"""The test terminal (/pos/test, owner 2026-10-16): always usable, always on TRAIN, shared by any computer."""
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, Drawer, Receipt, Register
from apps.pos.services.sale_mode import set_labor_day_override
from apps.thriftplus.services import members

D = Decimal
OPEN_TRAINING = '/api/pos/drawers/open-training/'


def _employee(email, first):
    user = User.objects.create_user(email, first, 'Staff', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name='Employee')[0])
    return user


class TestTerminalDrawerTests(TestCase):
    def setUp(self):
        set_labor_day_override(False)
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})
        self.ana = _employee('ana@example.com', 'Ana')
        self.ben = _employee('ben@example.com', 'Ben')
        self.api_ana = APIClient()
        self.api_ana.force_authenticate(self.ana)
        self.api_ben = APIClient()
        self.api_ben.force_authenticate(self.ben)
        location = WorkLocation.objects.create(name='Store')
        self.train = Register.objects.create(location=location, name='Training', code='TRAIN-T', is_training=True)
        self.real = Register.objects.create(location=location, name='Register 1', code='REG-T1')
        category = Category.objects.create(name='Lamps', slug='lamps')
        for sku in ('ITMTT1', 'ITMTT2'):
            Item.objects.create(sku=sku, product=Product.objects.create(title=f'Lamp {sku}', category=category),
                                price=D('10.00'), status='on_shelf')

    # The automatic drawer: TRAIN only

    def test_opens_todays_training_drawer_for_the_signed_in_user_with_zero_cash(self):
        res = self.api_ana.post(OPEN_TRAINING, {'register': self.train.pk}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        drawer = Drawer.objects.get(register=self.train)
        self.assertEqual(drawer.date, timezone.localdate())
        self.assertEqual(drawer.status, 'open')
        self.assertEqual(drawer.opened_by, self.ana)
        self.assertEqual(drawer.current_cashier, self.ana)
        self.assertEqual(drawer.opening_total, D('0'))
        self.assertEqual(drawer.opening_count, {})
        self.assertTrue(res.json()['register_is_training'])

    def test_a_second_computer_shares_the_open_training_drawer(self):
        first = self.api_ana.post(OPEN_TRAINING, {'register': self.train.pk}, format='json').json()
        res = self.api_ben.post(OPEN_TRAINING, {'register': self.train.pk}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['id'], first['id'])
        self.assertEqual(Drawer.objects.filter(register=self.train).count(), 1)
        self.assertEqual(Drawer.objects.get(register=self.train).current_cashier, self.ana)  # nobody is bumped

    def test_a_closed_training_drawer_is_opened_again(self):
        drawer = Drawer.objects.create(register=self.train, date=timezone.localdate(), status='closed',
                                       current_cashier=self.ana, opened_by=self.ana, opened_at=timezone.now())
        res = self.api_ben.post(OPEN_TRAINING, {'register': self.train.pk}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        drawer.refresh_from_db()
        self.assertEqual(drawer.status, 'open')

    def test_two_at_the_same_moment_share_one_drawer(self):
        """The other computer's create lands between our look and our create: we take its drawer."""
        other = Drawer.objects.create(register=self.train, date=timezone.localdate(), status='open',
                                      current_cashier=self.ben, opened_by=self.ben, opened_at=timezone.now())
        real_filter = Drawer.objects.filter
        looks = []

        def stale_first_look(*args, **kwargs):
            looks.append(1)
            if len(looks) == 1:  # our look ran before the other computer's drawer was there
                return Drawer.objects.none()
            return real_filter(*args, **kwargs)

        with mock.patch.object(Drawer.objects, 'filter', side_effect=stale_first_look):
            res = self.api_ana.post(OPEN_TRAINING, {'register': self.train.pk}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['id'], other.pk)
        self.assertEqual(Drawer.objects.filter(register=self.train).count(), 1)

    def test_a_real_register_is_never_opened_automatically(self):
        res = self.api_ana.post(OPEN_TRAINING, {'register': self.real.pk}, format='json')
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()['code'], 'NOT_TRAINING_REGISTER')
        self.assertFalse(Drawer.objects.filter(register=self.real).exists())

    def test_a_real_register_with_a_closed_drawer_stays_closed(self):
        drawer = Drawer.objects.create(register=self.real, date=timezone.localdate(), status='closed',
                                       current_cashier=self.ana, opened_by=self.ana, opened_at=timezone.now())
        res = self.api_ana.post(OPEN_TRAINING, {'register': self.real.pk}, format='json')
        self.assertEqual(res.status_code, 400, res.content)
        drawer.refresh_from_db()
        self.assertEqual(drawer.status, 'closed')

    def test_unknown_register_and_sign_in_needed(self):
        self.assertEqual(self.api_ana.post(OPEN_TRAINING, {'register': 99999}, format='json').status_code, 404)
        self.assertEqual(self.api_ana.post(OPEN_TRAINING, {}, format='json').status_code, 404)
        self.assertIn(APIClient().post(OPEN_TRAINING, {'register': self.train.pk}, format='json').status_code,
                      (401, 403))

    def test_real_registers_drawer_rules_are_unchanged(self):
        """A real register still opens only by a cashier's count, once a day."""
        body = {'register': self.real.pk, 'opening_count': {}, 'opening_total': '200.00'}
        self.assertEqual(self.api_ana.post('/api/pos/drawers/', body, format='json').status_code, 201)
        again = self.api_ben.post('/api/pos/drawers/', body, format='json')
        self.assertEqual(again.status_code, 400)
        self.assertIn('already open', again.json()['detail'])

    # Two computers ringing practice sales on the one training drawer

    def test_two_carts_on_the_training_drawer(self):
        drawer_id = self.api_ana.post(OPEN_TRAINING, {'register': self.train.pk}, format='json').json()['id']
        self.api_ben.post(OPEN_TRAINING, {'register': self.train.pk}, format='json')
        cart_a = self.api_ana.post('/api/pos/carts/', {'drawer': drawer_id}, format='json')
        cart_b = self.api_ben.post('/api/pos/carts/', {'drawer': drawer_id}, format='json')
        self.assertEqual(cart_a.status_code, 201, cart_a.content)
        self.assertEqual(cart_b.status_code, 201, cart_b.content)
        a, b = cart_a.json()['id'], cart_b.json()['id']
        self.assertNotEqual(a, b)
        self.assertEqual(self.api_ana.post(f'/api/pos/carts/{a}/add-item/', {'sku': 'ITMTT1'}, format='json').status_code, 200)
        self.assertEqual(self.api_ben.post(f'/api/pos/carts/{b}/add-item/', {'sku': 'ITMTT2'}, format='json').status_code, 200)

        # Each computer finds only its own open cart (the terminal asks with cashier=).
        mine = self.api_ben.get('/api/pos/carts/', {'drawer': drawer_id, 'status': 'open', 'cashier': self.ben.pk})
        self.assertEqual([row['id'] for row in mine.json()['results']], [b])

        done_a = self.api_ana.post(f'/api/pos/carts/{a}/complete/', {'payment_method': 'cash', 'cash_tendered': '20.00'},
                                   format='json')
        done_b = self.api_ben.post(f'/api/pos/carts/{b}/complete/', {'payment_method': 'cash', 'cash_tendered': '20.00'},
                                   format='json')
        self.assertEqual(done_a.status_code, 200, done_a.content)
        self.assertEqual(done_b.status_code, 200, done_b.content)
        numbers = {done_a.json()['receipt']['receipt_number'], done_b.json()['receipt']['receipt_number']}
        self.assertEqual(len(numbers), 2)
        self.assertTrue(all(n.startswith('TRAIN-') for n in numbers))
        self.assertEqual(Cart.objects.filter(status='training').count(), 2)
        self.assertEqual(Item.objects.filter(status='sold').count(), 0)  # nothing real

    def test_two_practice_sales_finishing_together_get_their_own_receipt_numbers(self):
        drawer = Drawer.objects.create(register=self.train, date=timezone.localdate(), status='open',
                                       current_cashier=self.ana, opened_by=self.ana, opened_at=timezone.now())
        taken = Cart.objects.create(drawer=drawer, cashier=self.ben)
        cart = self.api_ana.post('/api/pos/carts/', {'drawer': drawer.pk}, format='json').json()
        self.api_ana.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTT1'}, format='json')
        # The other computer took -001 after we looked but before we wrote.
        prefix = f'TRAIN-{timezone.now().strftime("%Y%m%d")}-'
        real_generate = Receipt.generate_training_number
        calls = []

        Receipt.objects.create(cart=taken, receipt_number=f'{prefix}001')

        def stale_then_fresh():
            calls.append(1)
            if len(calls) == 1:
                return f'{prefix}001'  # looked before the other computer's receipt was written
            return real_generate()

        with mock.patch.object(Receipt, 'generate_training_number', side_effect=stale_then_fresh):
            done = self.api_ana.post(f"/api/pos/carts/{cart['id']}/complete/",
                                     {'payment_method': 'cash', 'cash_tendered': '20.00'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['receipt']['receipt_number'], f'{prefix}002')

    def test_a_real_register_receipt_is_unchanged(self):
        with mock.patch('apps.pos.views._create_training_receipt', side_effect=IntegrityError):
            drawer = Drawer.objects.create(register=self.real, date=timezone.localdate(), status='open',
                                           current_cashier=self.ana, opened_by=self.ana, opened_at=timezone.now())
            cart = self.api_ana.post('/api/pos/carts/', {'drawer': drawer.pk}, format='json').json()
            self.api_ana.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTT1'}, format='json')
            done = self.api_ana.post(f"/api/pos/carts/{cart['id']}/complete/",
                                     {'payment_method': 'cash', 'cash_tendered': '20.00'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['status'], 'completed')
        self.assertTrue(done.json()['receipt']['receipt_number'].startswith('R-'))
