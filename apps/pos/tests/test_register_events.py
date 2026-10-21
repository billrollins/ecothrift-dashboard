"""Open drawer, reprints and failed prints are logged (2026-10-21, REG-03/17): who, when, which copy."""
from django.utils import timezone

from apps.pos.models import Cart, Drawer, Register, RegisterEvent

from .test_cart_card_surcharge import _CartCardSurchargeFixtures
from django.test import TestCase


class OpenDrawerTests(_CartCardSurchargeFixtures, TestCase):
    def _open(self, drawer=None, **body):
        return self.client.post(f'/api/pos/drawers/{(drawer or self.drawer).id}/open-drawer/', body, format='json')

    def test_the_button_is_logged_with_who_and_when(self):
        r = self._open(reason='Open drawer button')
        self.assertEqual(r.status_code, 201, r.content)
        e = RegisterEvent.objects.get()
        self.assertEqual((e.kind, e.user, e.drawer, e.register_code, e.note, e.cart),
                         ('open_drawer', self.user, self.drawer, 'POS-C1', 'Open drawer button', None))

    def test_for_a_sale_whose_receipt_did_not_print(self):
        cid, _ = self._open_cart_with_item()
        r = self._open(cart=cid, reason='Receipt did not print')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(RegisterEvent.objects.get().cart_id, cid)

    def test_a_sale_from_another_drawer_or_junk_is_refused(self):
        other_reg = Register.objects.create(location=self.location, name='Other', code='POS-O1')
        other = Drawer.objects.create(register=other_reg, date=timezone.localdate(), current_cashier=self.user,
                                      opened_by=self.user, opened_at=timezone.now(), status='open')
        cid, _ = self._open_cart_with_item()
        for bad in (cid, 'abc', 10 ** 30):
            r = self._open(other, cart=bad)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_CART'), bad)
        self.assertFalse(RegisterEvent.objects.exists())

    def test_a_closed_drawer_or_the_training_register_opens_nothing(self):
        Drawer.objects.filter(pk=self.drawer.pk).update(status='closed')
        self.assertEqual(self._open().json()['code'], 'DRAWER_CLOSED')
        Drawer.objects.filter(pk=self.drawer.pk).update(status='open')
        Register.objects.filter(pk=self.register.pk).update(is_training=True)
        self.assertEqual(self._open().json()['code'], 'TRAINING_REGISTER')
        self.assertFalse(RegisterEvent.objects.exists())


class ReprintTests(_CartCardSurchargeFixtures, TestCase):
    def test_each_reprint_is_numbered_and_logged(self):
        cid, _ = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        first = self.client.post(f'/api/pos/carts/{cid}/reprint/', {}, format='json')
        second = self.client.post(f'/api/pos/carts/{cid}/reprint/', {}, format='json')
        self.assertEqual((first.json()['copy_number'], second.json()['copy_number']), (1, 2))
        notes = list(RegisterEvent.objects.filter(kind='reprint').order_by('pk').values_list('note', 'user_id'))
        self.assertEqual(notes, [('Copy 1', self.user.id), ('Copy 2', self.user.id)])

    def test_an_open_sale_has_no_receipt_to_reprint(self):
        cid, _ = self._open_cart_with_item()
        r = self.client.post(f'/api/pos/carts/{cid}/reprint/', {}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_FINISHED'))

    def test_a_failed_print_is_kept_with_the_reason(self):
        cid, _ = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        r = self.client.post(f'/api/pos/carts/{cid}/print-failed/', {'error': 'Receipt print failed: paper out'},
                             format='json')
        self.assertEqual(r.status_code, 204)
        e = RegisterEvent.objects.get()
        self.assertEqual((e.kind, e.cart_id, e.note), ('print_failed', cid, 'Receipt print failed: paper out'))
        self.assertEqual(Cart.objects.get(pk=cid).status, 'completed')
