"""Sale facts at the register (inventory review, 2026-10-22): sold_net is sold_for less the kept ThriftBucks per unit;
ThriftBucks spent are a tender and never come off; a void clears both."""
from __future__ import annotations

from decimal import Decimal

from apps.inventory.models import Item
from apps.pos.tests.pin_helpers import manager_ok
from apps.thriftplus.tests.test_register import RegisterBase

D = Decimal


class RegisterSaleFactsTests(RegisterBase):
    def _facts(self, item):
        item.refresh_from_db()
        return item.sold_for, item.sold_net, item.thriftbucks_at_sale

    def test_kept_thriftbucks_come_off_the_net_and_a_void_clears_it(self):
        cart = self._cart()
        self._attach(cart['id'])
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.assertEqual(self._facts(self.lamp), (D('80.00'), D('45.00'), D('35.00')))
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.post(f"/api/pos/carts/{cart['id']}/void/", manager_ok()[1], format='json').status_code, 200)
        self.assertEqual(self._facts(self.lamp), (None, None, None))

    def test_redeemed_instantly_is_already_off_sold_for(self):
        cart = self._cart()
        self._attach(cart['id'])
        self._choice(cart['id'], 'instant')
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.assertEqual(self._facts(self.lamp), (D('62.50'), D('62.50'), D('35.00')))

    def test_thriftbucks_spent_never_come_off_the_item(self):
        self._lot('35.00')
        cart = self._cart('ITMTPVASE')
        self._attach(cart['id'])
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.assertEqual(self._facts(self.vase), (D('50.00'), D('40.00'), D('10.00')))

    def test_a_guest_keeps_sold_for(self):
        cart = self._cart()
        self.assertEqual(self._complete(cart['id']).status_code, 200)
        self.assertEqual(self._facts(self.lamp), (D('80.00'), D('80.00'), D('0.00')))
        self.assertEqual(Item.objects.filter(sold_net__isnull=False).count(), 1)
