"""Manager PIN + reason at the register (2026-10-21, REG-05/06/08/11/12/27): price edits, discounts over the cap, voids."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase

from apps.accounts.models import User
from apps.accounts.services.register_pin import set_pin
from apps.core.models import AppSetting
from apps.inventory.models import Item
from apps.pos.models import Cart, CartLine, Drawer, RegisterApproval
from apps.pos.services.manager_ok import SETTING_KEY_DISCOUNT_CAP, discount_cap_percent

from .pin_helpers import PIN, manager_ok
from .test_cart_card_surcharge import _CartCardSurchargeFixtures

CASHIER_PIN = '5937'


class _OkFixtures(_CartCardSurchargeFixtures):
    def setUp(self):
        super().setUp()
        self.manager, self.ok = manager_ok()
        set_pin(self.user, CASHIER_PIN)  # the cashier has a PIN too: it is not a manager's
        self._n = 0

    def _cart(self, price='100.00'):
        self._n += 1
        item = Item.objects.create(sku=f'POSOK{self._n:03d}', product=self.item.product, price=Decimal(price),
                                   status='on_shelf')
        return self._open_cart_with_item(item.sku)


class PriceEditTests(_OkFixtures, TestCase):
    def _edit(self, cid, line_id, **body):
        return self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', body, format='json')

    def test_a_price_change_asks_for_a_manager_and_records_who_and_why(self):
        cid, cart = self._cart()
        line_id = cart['lines'][0]['id']
        asked = self._edit(cid, line_id, unit_price='60.00')
        self.assertEqual((asked.status_code, asked.json()['code'], asked.json()['approval']),
                         (403, 'MANAGER_OK_NEEDED', 'price_edit'))
        self.assertEqual(CartLine.objects.get(pk=line_id).unit_price, Decimal('100.00'))

        no_reason = self._edit(cid, line_id, unit_price='60.00', manager_pin=PIN, override_reason=' ')
        self.assertEqual((no_reason.status_code, no_reason.json()['code']), (400, 'REASON_REQUIRED'))

        cashier = self._edit(cid, line_id, unit_price='60.00', manager_pin=CASHIER_PIN, override_reason='Scuffed')
        self.assertEqual((cashier.status_code, cashier.json()['code']), (403, 'PIN_WRONG'))
        self.assertEqual(cashier.json()['tries_left'], 4)

        ok = self._edit(cid, line_id, unit_price='60.00', manager_pin=PIN, override_reason='Scuffed corner')
        self.assertEqual(ok.status_code, 200, ok.content)
        line = CartLine.objects.get(pk=line_id)
        self.assertEqual(line.unit_price, Decimal('60.00'))
        self.assertEqual(line.meta['price_edit']['approved_by_id'], self.manager.pk)
        self.assertEqual(line.meta['price_edit']['before'], '100.00')
        a = RegisterApproval.objects.get()
        self.assertEqual((a.kind, a.requested_by, a.approved_by, a.reason, a.register_code),
                         ('price_edit', self.user, self.manager, 'Scuffed corner', 'POS-C1'))
        self.assertEqual((a.detail['before'], a.detail['after']), ('100.00', '60.00'))

    def test_the_same_price_sent_back_needs_no_pin(self):
        """The register's edit box sends every field; only a real price change asks."""
        cid, cart = self._cart()
        line_id = cart['lines'][0]['id']
        r = self._edit(cid, line_id, unit_price=100.0, description='Lamp, blue', quantity=1)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(RegisterApproval.objects.exists())

    def test_a_hand_priced_line_changes_without_a_pin(self):
        cid, _ = self._cart()
        added = self.client.post(f'/api/pos/carts/{cid}/add-manual-line/',
                                 {'description': 'Pink tag', 'unit_price': '0.50'}, format='json')
        self.assertEqual(added.status_code, 200, added.content)
        line = next(ln for ln in added.json()['lines'] if ln['line_kind'] == 'manual')
        r = self._edit(cid, line['id'], unit_price='1.00')
        self.assertEqual(r.status_code, 200, r.content)

    def test_bad_prices_and_quantities_are_refused(self):
        cid, cart = self._cart()
        line_id = cart['lines'][0]['id']
        for bad in ('-1', 'abc', '', None, '1.001'):
            r = self._edit(cid, line_id, unit_price=bad, **self.ok)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_AMOUNT'), bad)
        for bad in (0, -2, 1000):
            r = self._edit(cid, line_id, quantity=bad)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_QUANTITY'), bad)
        self.assertFalse(RegisterApproval.objects.exists())


class DiscountCapTests(_OkFixtures, TestCase):
    def _discount(self, cid, **body):
        return self.client.post(f'/api/pos/carts/{cid}/add-discount/', body, format='json')

    def test_a_discount_needs_a_reason(self):
        cid, _ = self._cart()
        for body in ({'amount': '5.00'}, {'amount': '5.00', 'reason': '  '}, {'amount': '5.00', 'reason': ['x']}):
            r = self._discount(cid, **body)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'REASON_REQUIRED'), body)

    def test_up_to_the_cap_needs_no_pin_over_it_does(self):
        cid, _ = self._cart()
        self.assertEqual(self._discount(cid, amount='20.00', reason='Damaged').status_code, 200)
        cid, _ = self._cart()
        over = self._discount(cid, mode='percent', percent='25', reason='Damaged')
        self.assertEqual((over.status_code, over.json()['code'], over.json()['approval']),
                         (403, 'MANAGER_OK_NEEDED', 'discount'))
        self.assertIn('20%', over.json()['detail'])
        ok = self._discount(cid, mode='percent', percent='25', reason='Damaged', manager_pin=PIN)
        self.assertEqual(ok.status_code, 200, ok.content)
        disc = next(ln for ln in ok.json()['lines'] if ln['line_kind'] == 'discount')
        self.assertEqual(disc['meta']['manager_ok']['approved_by_id'], self.manager.pk)
        a = RegisterApproval.objects.get()
        self.assertEqual((a.kind, a.reason, a.detail['cap_percent']), ('discount', 'Damaged', '20'))

    def test_discounts_stack_toward_the_cap(self):
        cid, _ = self._cart()
        self.assertEqual(self._discount(cid, amount='15.00', reason='Damaged').status_code, 200)
        second = self._discount(cid, amount='10.00', reason='Missing part')
        self.assertEqual((second.status_code, second.json()['code']), (403, 'MANAGER_OK_NEEDED'))

    def test_a_line_discount_is_capped_on_its_line(self):
        cid, cart = self._cart()
        added = self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': self._new_sku('10.00')}, format='json')
        small = next(ln for ln in added.json()['lines'] if Decimal(ln['unit_price']) == Decimal('10.00'))
        r = self._discount(cid, amount='5.00', reason='Damaged', target_line_id=small['id'])
        self.assertEqual((r.status_code, r.json()['code']), (403, 'MANAGER_OK_NEEDED'))  # 50% of the line

    def _new_sku(self, price):
        self._n += 1
        return Item.objects.create(sku=f'POSOK{self._n:03d}', product=self.item.product, price=Decimal(price),
                                   status='on_shelf').sku

    def test_the_owner_sets_the_cap(self):
        AppSetting.objects.update_or_create(key=SETTING_KEY_DISCOUNT_CAP, defaults={'value': 50, 'description': 't'})
        self.assertEqual(discount_cap_percent(), Decimal('50'))
        cid, _ = self._cart()
        self.assertEqual(self._discount(cid, mode='percent', percent='40', reason='Damaged').status_code, 200)
        for bad in ('abc', -5, 500, {}, 'NaN'):
            AppSetting.objects.filter(key=SETTING_KEY_DISCOUNT_CAP).update(value=bad)
            self.assertEqual(discount_cap_percent(), Decimal('20'), bad)


class VoidTests(_OkFixtures, TestCase):
    def _paid(self):
        cid, cart = self._cart()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        return cid

    def test_a_cashier_voids_with_a_managers_pin_and_the_sale_says_who_and_why(self):
        cid = self._paid()
        asked = self.client.post(f'/api/pos/carts/{cid}/void/', {}, format='json')
        self.assertEqual((asked.status_code, asked.json()['code']), (403, 'MANAGER_OK_NEEDED'))
        self.assertEqual(Cart.objects.get(pk=cid).status, 'completed')
        r = self.client.post(f'/api/pos/carts/{cid}/void/', {**self.ok, 'override_reason': 'Rang twice'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        c = Cart.objects.get(pk=cid)
        self.assertEqual((c.status, c.voided_by, c.void_reason), ('voided', self.manager, 'Rang twice'))
        self.assertIsNotNone(c.voided_at)
        self.assertEqual(r.json()['voided_by_name'], self.manager.full_name)
        a = RegisterApproval.objects.get()
        self.assertEqual((a.kind, a.requested_by, a.approved_by, a.detail['status_before']),
                         ('void', self.user, self.manager, 'completed'))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, Decimal('0.00'))

    def test_a_signed_in_manager_still_types_a_pin(self):
        cid = self._paid()
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', self.ok, format='json').status_code, 200)

    def test_an_unpaid_sale_also_needs_the_ok(self):
        cid, _ = self._cart()
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', self.ok, format='json').status_code, 200)

    def test_five_wrong_pins_lock_this_register_only(self):
        cid = self._paid()
        for left in (4, 3, 2, 1):
            r = self.client.post(f'/api/pos/carts/{cid}/void/', {'manager_pin': '0000', 'override_reason': 'x y z'},
                                 format='json')
            self.assertEqual((r.status_code, r.json()['tries_left']), (403, left))
        r = self.client.post(f'/api/pos/carts/{cid}/void/', {'manager_pin': '0000', 'override_reason': 'x y z'},
                             format='json')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'PIN_LOCKED'))
        r = self.client.post(f'/api/pos/carts/{cid}/void/', self.ok, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'PIN_LOCKED'))  # even the right one, here
        self.assertEqual(Cart.objects.get(pk=cid).status, 'completed')

        other = self.register.__class__.objects.create(location=self.location, name='Register Z', code='POS-Z9')
        drawer = Drawer.objects.create(register=other, date=self.drawer.date, current_cashier=self.user,
                                       opened_by=self.user, opened_at=self.drawer.opened_at, status='open')
        c2 = self.client.post('/api/pos/carts/', {'drawer': drawer.id}, format='json').json()['id']
        self.assertEqual(self.client.post(f'/api/pos/carts/{c2}/void/', self.ok, format='json').status_code, 200)
        cache.clear()

    def test_a_manager_whose_job_ended_has_no_working_pin(self):
        cid = self._paid()
        self.manager.is_active = False
        self.manager.save(update_fields=['is_active'])
        r = self.client.post(f'/api/pos/carts/{cid}/void/', self.ok, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'PIN_WRONG'))


class EmployeesCanStartAVoidTests(_OkFixtures, TestCase):
    def test_an_employee_without_a_manager_role_reaches_the_pin_question(self):
        """Before 2026-10-21 the button showed and the server said 403 'Failed to void'; now it asks for a PIN."""
        clerk = User.objects.create_user(email='clerk@example.com', first_name='C', last_name='L', password='x-pass-123')
        clerk.groups.add(Group.objects.get(name='Employee'))
        cid, _ = self._cart()
        self.client.force_authenticate(clerk)
        r = self.client.post(f'/api/pos/carts/{cid}/void/', {}, format='json')
        self.assertEqual(r.json()['code'], 'MANAGER_OK_NEEDED')
