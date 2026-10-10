"""The training register (owner, 2026-10-10): looks and acts as on launch day, but a sale changes nothing real."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, Drawer, Receipt, Register
from apps.pos.services.sale_mode import set_labor_day_override
from apps.thriftplus.models import ItemReward, LedgerEntry
from apps.thriftplus.services import cards, members

D = Decimal


class TrainingRegisterTests(TestCase):
    def setUp(self):
        set_labor_day_override(False)
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})  # Thrift+ still off
        self.clerk = User.objects.create_user('trainee@example.com', 'Tia', 'Trainee', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)
        location = WorkLocation.objects.create(name='Store')
        self.register = Register.objects.create(location=location, name='Training', code='TRAIN-T', is_training=True)
        self.drawer = Drawer.objects.create(register=self.register, date=timezone.localdate(), current_cashier=self.clerk,
                                            opened_by=self.clerk, opened_at=timezone.now(), status='open')
        category = Category.objects.create(name='Lamps', slug='lamps')
        self.lamp = Item.objects.create(sku='ITMTRAIN1', product=Product.objects.create(title='Brass lamp', category=category),
                                        price=D('90.00'), status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key=f'p{self.lamp.product_id}', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())
        self.code = cards.generate_batch(1).cards.values_list('code', flat=True).first()
        members.create_account(first_name='Ana', phone='4025550101', id_checked=True, verified_18=True, card_code=self.code)

    def _cart(self):
        cart = self.api.post('/api/pos/carts/', {'drawer': self.drawer.pk}, format='json').json()
        r = self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTRAIN1'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_the_drawer_says_it_is_the_training_register(self):
        res = self.api.get(f'/api/pos/drawers/{self.drawer.pk}/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['register_is_training'])

    def test_thrift_plus_acts_live_and_a_member_sale_writes_nothing_real(self):
        cart = self._cart()
        self.assertTrue(cart['thrift_plus']['live'])  # as on launch day, though the switch is off
        attached = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'code': f'TP{self.code}'}, format='json')
        self.assertEqual(attached.status_code, 200, attached.content)
        done = self.api.post(f"/api/pos/carts/{cart['id']}/complete/",
                             {'payment_method': 'cash', 'cash_tendered': '200.00'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['status'], 'training')
        self.assertTrue(done.json()['receipt']['receipt_number'].startswith('TRAIN-'))
        self.lamp.refresh_from_db()
        self.drawer.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')       # nothing sold
        self.assertEqual(self.drawer.cash_sales_total, D('0'))  # no drawer cash
        self.assertFalse(LedgerEntry.objects.exists())        # no rewards, no cover
        self.assertFalse(Cart.objects.filter(status='completed').exists())  # every report counts completed sales only

    def test_a_card_practice_sale_also_writes_nothing(self):
        cart = self._cart()
        total = cart['total']
        done = self.api.post(f"/api/pos/carts/{cart['id']}/complete/",
                             {'payment_method': 'card', 'card_amount': total, 'card_type': 'debit',
                              'card_charged_total': total}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['status'], 'training')
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')

    def test_training_receipts_count_up_on_their_own(self):
        Receipt.objects.create(cart=Cart.objects.create(drawer=self.drawer, cashier=self.clerk),
                               receipt_number=Receipt.generate_training_number())
        second = Receipt.generate_training_number()
        self.assertTrue(second.startswith('TRAIN-') and second.endswith('-002'), second)
        self.assertFalse(Receipt.generate_receipt_number().startswith('TRAIN-'))

    def test_a_real_register_is_unchanged(self):
        real = Register.objects.create(location=self.register.location, name='Front', code='FRONT-T')
        drawer = Drawer.objects.create(register=real, date=timezone.localdate(), current_cashier=self.clerk,
                                       opened_by=self.clerk, opened_at=timezone.now(), status='open')
        cart = self.api.post('/api/pos/carts/', {'drawer': drawer.pk}, format='json').json()
        self.api.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'ITMTRAIN1'}, format='json')
        done = self.api.post(f"/api/pos/carts/{cart['id']}/complete/",
                             {'payment_method': 'cash', 'cash_tendered': '200.00'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()['status'], 'completed')
        self.assertIsNone(done.json()['thrift_plus'])  # Thrift+ is off on real registers
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'sold')
