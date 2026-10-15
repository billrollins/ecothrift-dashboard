"""The training register (owner, 2026-10-10): looks and acts as on launch day, but a sale changes nothing real."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, ItemScanHistory, Product
from apps.pos.models import Cart, CartLine, CashDrop, DeliveryJob, Drawer, Receipt, Register
from apps.pos.services.sale_mode import set_labor_day_override
from apps.thriftplus.models import Event, ItemReward, LedgerEntry
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
        # A real member scanned on TRAIN: the attach Event says it was practice (C7, 2026-10-14).
        self.assertEqual(Event.objects.get(action='register_attach').detail, {'cart': cart['id'], 'training': True})
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


class TrainingRegisterSafetyTests(TestCase):
    """2026-10-14: ring up and print like normal, but nothing real is logged and TRAIN stays out of real lists."""

    def setUp(self):
        set_labor_day_override(False)
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})
        self.clerk = User.objects.create_user('trainee2@example.com', 'Tia', 'Trainee', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.manager = User.objects.create_user('boss@example.com', 'Max', 'Manager', password='x-pass-123')
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)
        self.location = WorkLocation.objects.create(name='Store')
        self.train = Register.objects.create(location=self.location, name='Training register', code='TRAIN-S',
                                             is_training=True)
        self.front = Register.objects.create(location=self.location, name='Front', code='FRONT-S')
        today = timezone.localdate()
        self.train_drawer = Drawer.objects.create(register=self.train, date=today, current_cashier=self.clerk,
                                                  opened_by=self.clerk, opened_at=timezone.now(), status='open')
        self.front_drawer = Drawer.objects.create(register=self.front, date=today, current_cashier=self.clerk,
                                                  opened_by=self.clerk, opened_at=timezone.now(), status='open')
        category = Category.objects.create(name='Lamps', slug='lamps-s')
        self.product = Product.objects.create(title='Brass lamp', category=category)
        self.lamp = Item.objects.create(sku='ITMTRAINS1', product=self.product, price=D('40.00'), status='on_shelf')

    def _cart(self, drawer):
        res = self.api.post('/api/pos/carts/', {'drawer': drawer.pk}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()['id']

    def _sell_for_real(self, sku):
        """A real sale on the front register: the item is sold and its line is on a completed cart."""
        cid = self._cart(self.front_drawer)
        self.assertEqual(self.api.post(f'/api/pos/carts/{cid}/add-item/', {'sku': sku}, format='json').status_code, 200)
        done = self.api.post(f'/api/pos/carts/{cid}/complete/', {'payment_method': 'cash', 'cash_tendered': '100.00'},
                             format='json')
        self.assertEqual(done.json()['status'], 'completed', done.content)
        return cid

    # ── C2: a sold tag on TRAIN never moves the real sale ──────────────────────────────────────────

    def test_a_sold_tag_rings_up_for_practice_and_its_real_sale_stays_put(self):
        real_cart = self._sell_for_real('ITMTRAINS1')
        self.lamp.refresh_from_db()
        sold_at = self.lamp.sold_at
        items_before = Item.objects.count()
        cid = self._cart(self.train_drawer)
        res = self.api.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'ITMTRAINS1'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)  # rings up as on a real register
        self.assertTrue(CartLine.objects.filter(cart_id=cid, item=self.lamp).exists())
        self.assertEqual(Item.objects.count(), items_before)  # no twin item made
        self.lamp.refresh_from_db()
        self.assertEqual((self.lamp.status, self.lamp.sold_at), ('sold', sold_at))
        self.assertTrue(CartLine.objects.filter(cart_id=real_cart, item=self.lamp).exists())  # the real sale did not move
        self.assertFalse(ItemScanHistory.objects.filter(outcome='pos_sold_tag_moved').exists())
        done = self.api.post(f'/api/pos/carts/{cid}/complete/', {'payment_method': 'cash', 'cash_tendered': '100.00'},
                             format='json')
        self.assertEqual(done.json()['status'], 'training', done.content)
        self.lamp.refresh_from_db()
        self.assertEqual((self.lamp.status, self.lamp.sold_at), ('sold', sold_at))
        self.assertEqual(Item.objects.count(), items_before)

    def test_a_sold_tag_on_a_real_register_still_moves_the_old_sale(self):
        self._sell_for_real('ITMTRAINS1')
        cid = self._cart(self.front_drawer)
        res = self.api.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'ITMTRAINS1'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')
        self.assertTrue(Item.objects.filter(notes='SALE_MOVED_FROM:ITMTRAINS1', status='sold').exists())

    def test_no_resale_copy_is_made_on_the_training_register(self):
        self._sell_for_real('ITMTRAINS1')
        items_before = Item.objects.count()
        cid = self._cart(self.train_drawer)
        res = self.api.post(f'/api/pos/carts/{cid}/add-resale-copy/', {'source_item_id': self.lamp.pk}, format='json')
        self.assertEqual((res.status_code, res.json()['code']), (400, 'TRAINING_REGISTER'))
        self.assertEqual(Item.objects.count(), items_before)

    def test_a_hold_override_on_the_training_register_never_cancels_the_real_hold(self):
        from apps.webstore.tests.helpers import make_verified_hold
        from apps.webstore.tests.test_holds_hard_controls import _published_listing

        held = Item.objects.create(sku='OS-HOLD-T', product=Product.objects.create(title='Held'), price=D('12.00'),
                                   status='on_shelf')
        listing = _published_listing(slug='held-train', item=held, sku='OS-HOLD-T', on_hand=1)
        hold = make_verified_hold(listing=listing, quantity=1, customer_name='Hold Buyer', email='hb@example.com')
        hold.status = 'requested'
        hold.save(update_fields=['status'])
        self.api.force_authenticate(self.manager)
        cid = self._cart(self.train_drawer)
        res = self.api.post(f'/api/pos/carts/{cid}/add-item/',
                            {'sku': 'OS-HOLD-T', 'override_hold': True, 'override_reason': 'practice'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        hold.refresh_from_db()
        self.assertEqual(hold.status, 'requested')

    # ── C4: no delivery from the training register ─────────────────────────────────────────────────

    def _delivery(self, cid):
        return self.api.post(f'/api/pos/carts/{cid}/add-delivery/', {
            'tier': '5mi', 'customer_name': 'Jane Doe', 'phone': '402-555-0100', 'address': '123 Main St',
            'items_delivered': 'Lamp', 'schedule_later': True,
        }, format='json')

    def test_delivery_is_refused_and_no_job_reaches_the_board(self):
        cid = self._cart(self.train_drawer)
        res = self._delivery(cid)
        self.assertEqual((res.status_code, res.json()['code']), (400, 'TRAINING_REGISTER'))
        self.assertIn('training register', res.json()['detail'])
        self.assertFalse(DeliveryJob.objects.exists())
        self.assertFalse(CartLine.objects.filter(cart_id=cid, line_kind=CartLine.LINE_KIND_DELIVERY).exists())

    def test_a_delivery_left_on_a_practice_sale_is_cancelled_when_it_finishes(self):
        cid = self._cart(self.train_drawer)
        self.api.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'ITMTRAINS1'}, format='json')
        job = DeliveryJob.objects.create(cart_id=cid, customer_name='Old', phone='1', address='A', items_delivered='Lamp',
                                         status=DeliveryJob.STATUS_NEEDS_SCHEDULING)
        done = self.api.post(f'/api/pos/carts/{cid}/complete/', {'payment_method': 'cash', 'cash_tendered': '100.00'},
                             format='json')
        self.assertEqual(done.json()['status'], 'training', done.content)
        job.refresh_from_db()
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)

    def test_a_real_register_still_books_a_delivery(self):
        cid = self._cart(self.front_drawer)
        res = self._delivery(cid)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(DeliveryJob.objects.get().status, DeliveryJob.STATUS_NEEDS_SCHEDULING)

    # ── C5: the training drawer is not real cash ───────────────────────────────────────────────────

    def test_drawer_lists_leave_the_training_drawer_out_unless_asked(self):
        def ids(params):
            res = self.api.get('/api/pos/drawers/', params)
            self.assertEqual(res.status_code, 200, res.content)
            return {d['id'] for d in res.json()['results']}

        self.assertEqual(ids({}), {self.front_drawer.pk})
        self.assertEqual(ids({'status': 'open'}), {self.front_drawer.pk})  # the manager terminal's pick
        self.assertEqual(ids({'register': self.train.pk, 'date': timezone.localdate().isoformat()}),
                         {self.train_drawer.pk})  # the TRAIN terminal still finds its own drawer
        self.assertEqual(ids({'include_training': '1'}), {self.front_drawer.pk, self.train_drawer.pk})
        self.assertEqual(self.api.get(f'/api/pos/drawers/{self.train_drawer.pk}/').status_code, 200)

    def test_the_open_drawer_alert_counts_real_drawers_only(self):
        res = self.api.get('/api/pos/dashboard/alerts/')
        self.assertEqual(res.status_code, 200, res.content)
        alert = next(a for a in res.json() if a['type'] == 'drawers')
        self.assertEqual((alert['count'], alert['message']), (1, '1 drawer(s) still open'))
        self.front_drawer.status = 'closed'
        self.front_drawer.save(update_fields=['status'])
        res = self.api.get('/api/pos/dashboard/alerts/')
        self.assertFalse([a for a in res.json() if a['type'] == 'drawers'])

    def test_cash_drops_are_refused_on_the_training_drawer_only(self):
        res = self.api.post(f'/api/pos/drawers/{self.train_drawer.pk}/drop/', {'amount': {}, 'total': '20.00'},
                            format='json')
        self.assertEqual((res.status_code, res.json()['code']), (400, 'TRAINING_REGISTER'))
        self.assertFalse(CashDrop.objects.exists())
        res = self.api.post(f'/api/pos/drawers/{self.front_drawer.pk}/drop/', {'amount': {}, 'total': '20.00'},
                            format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(CashDrop.objects.get().drawer_id, self.front_drawer.pk)

    def test_practice_sales_stay_out_of_the_transactions_list(self):
        practice = self._cart(self.train_drawer)
        self.api.post(f'/api/pos/carts/{practice}/add-item/', {'sku': 'ITMTRAINS1'}, format='json')
        self.api.post(f'/api/pos/carts/{practice}/complete/', {'payment_method': 'cash', 'cash_tendered': '100.00'},
                      format='json')
        real = self._sell_for_real('ITMTRAINS1')

        def ids(params):
            res = self.api.get('/api/pos/carts/', params)
            self.assertEqual(res.status_code, 200, res.content)
            return {c['id'] for c in res.json()['results']}

        self.assertEqual(ids({}), {real})  # "All" on the Transactions page sends no status
        self.assertEqual(ids({'status': 'all'}), {real})
        self.assertEqual(ids({'drawer': self.train_drawer.pk}), {practice})  # the TRAIN terminal finds its own carts
        self.assertEqual(ids({'include_training': 'true'}), {real, practice})

    # ── C7: the attach Event on a real register is unchanged ───────────────────────────────────────

    def test_an_attach_on_a_real_register_logs_no_training_flag(self):
        from apps.thriftplus.services.register import TEST_REGISTERS_KEY

        AppSetting.objects.update_or_create(key=TEST_REGISTERS_KEY, defaults={'value': 'FRONT-S'})  # live here only
        code = cards.generate_batch(1).cards.values_list('code', flat=True).first()
        members.create_account(first_name='Ana', phone='4025550102', id_checked=True, verified_18=True, card_code=code)
        cid = self._cart(self.front_drawer)
        res = self.api.post('/api/thriftplus/register/attach/', {'cart': cid, 'code': f'TP{code}'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Event.objects.get(action='register_attach').detail, {'cart': cid})

    # ── C9: the API cannot make or unmake a training register ──────────────────────────────────────

    def test_is_training_is_read_only_through_the_register_api(self):
        self.api.force_authenticate(self.manager)
        res = self.api.patch(f'/api/pos/registers/{self.front.pk}/', {'is_training': True}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.front.refresh_from_db()
        self.assertFalse(self.front.is_training)
        res = self.api.patch(f'/api/pos/registers/{self.train.pk}/', {'is_training': False, 'name': 'Training'},
                             format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.train.refresh_from_db()
        self.assertTrue(self.train.is_training)
        self.assertEqual(self.train.name, 'Training')  # the rest still saves
        res = self.api.post('/api/pos/registers/', {'location': self.location.pk, 'name': 'Back', 'code': 'BACK-S',
                                                    'is_training': True}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertFalse(Register.objects.get(code='BACK-S').is_training)
        self.assertTrue(self.api.get(f'/api/pos/registers/{self.train.pk}/').json()['is_training'])  # still shown
