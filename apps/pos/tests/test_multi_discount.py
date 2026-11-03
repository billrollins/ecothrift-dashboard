"""A percent off several items at once (Carrie, Dash Updates #30): one discount line per item, as if done by hand."""
from decimal import Decimal

from django.test import TestCase

from apps.inventory.models import Item
from apps.pos.models import CartLine, RegisterApproval

from .pin_helpers import PIN, manager_ok
from .test_cart_discount_delivery import CartDiscountDeliveryAPITests


class MultiItemDiscountTests(TestCase):
    setUp_base = CartDiscountDeliveryAPITests.setUp
    _open_cart = CartDiscountDeliveryAPITests._open_cart

    def setUp(self):
        self.setUp_base()
        self.item2 = Item.objects.create(sku='POSTESTDISC2', product=self.item.product, price=Decimal('30.00'),
                                         status='on_shelf')
        self.item3 = Item.objects.create(sku='POSTESTDISC3', product=self.item.product, price=Decimal('50.00'),
                                         status='on_shelf')
        self.cid = self._open_cart()
        for item in (self.item, self.item2, self.item3):
            r = self.client.post(f'/api/pos/carts/{self.cid}/add-item/', {'sku': item.sku}, format='json')
            self.assertEqual(r.status_code, 200, r.content)
        self.lines = {ln['item']: ln['id'] for ln in r.data['lines'] if ln['line_kind'] == 'item'}

    def _discount(self, **body):
        return self.client.post(f'/api/pos/carts/{self.cid}/add-discount/', body, format='json')

    def _ids(self, *items):
        return [self.lines[i.pk] for i in items]

    def test_ten_percent_off_two_items_is_one_line_each(self):
        r = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=self._ids(self.item, self.item2))
        self.assertEqual(r.status_code, 200, r.content)
        discs = [ln for ln in r.data['lines'] if ln['line_kind'] == 'discount']
        self.assertEqual(sorted(Decimal(str(d['unit_price'])) for d in discs), [Decimal('-3.00'), Decimal('-2.00')])
        self.assertEqual({d['meta']['target_line_id'] for d in discs}, set(self._ids(self.item, self.item2)))
        self.assertTrue(all(d['meta']['scope'] == 'line' and 'Damaged' in d['description'] for d in discs))
        self.assertEqual(Decimal(str(r.data['subtotal'])), Decimal('95.00'))

    def test_over_the_cap_one_manager_pin_covers_every_line(self):
        manager, _ = manager_ok()
        ids = self._ids(self.item2, self.item3)
        over = self._discount(mode='percent', percent='50', reason='Damaged', target_line_ids=ids)
        self.assertEqual((over.status_code, over.json()['code']), (403, 'MANAGER_OK_NEEDED'))
        self.assertFalse(CartLine.objects.filter(cart_id=self.cid, line_kind='discount').exists())
        ok = self._discount(mode='percent', percent='50', reason='Damaged', target_line_ids=ids, manager_pin=PIN)
        self.assertEqual(ok.status_code, 200, ok.content)
        discs = [ln for ln in ok.data['lines'] if ln['line_kind'] == 'discount']
        self.assertEqual(len(discs), 2)
        self.assertTrue(all(d['meta']['manager_ok']['approved_by_id'] == manager.pk for d in discs))
        self.assertEqual(RegisterApproval.objects.get().detail['target_line_ids'], ids)

    def test_nothing_is_written_when_one_target_is_wrong(self):
        first = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=self._ids(self.item))
        disc_id = next(ln['id'] for ln in first.data['lines'] if ln['line_kind'] == 'discount')
        r = self._discount(mode='percent', percent='10', reason='Damaged',
                           target_line_ids=[self.lines[self.item2.pk], disc_id])
        self.assertEqual((r.status_code, r.data['code']), (400, 'INVALID_TARGET'))
        self.assertEqual(CartLine.objects.filter(cart_id=self.cid, line_kind='discount').count(), 1)

    def test_several_items_take_a_percent_only_and_no_google_review(self):
        ids = self._ids(self.item, self.item2)
        r = self._discount(mode='amount', amount='2', reason='Damaged', target_line_ids=ids)
        self.assertEqual((r.status_code, r.data['code']), (400, 'INVALID_MODE'))
        r = self._discount(mode='percent', percent='10', reason='Google Review', target_line_ids=ids)
        self.assertEqual((r.status_code, r.data['code']), (400, 'INVALID_TARGET'))
        self.assertFalse(CartLine.objects.filter(cart_id=self.cid, line_kind='discount').exists())

    def test_a_list_of_one_is_a_one_line_discount(self):
        r = self._discount(mode='amount', amount='2', reason='Damaged', target_line_ids=self._ids(self.item3))
        self.assertEqual(r.status_code, 200, r.content)
        disc = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'discount')
        self.assertEqual((disc['meta']['target_line_id'], Decimal(str(disc['unit_price']))),
                         (self.lines[self.item3.pk], Decimal('-2.00')))

    def test_a_repeated_id_counts_once_and_another_carts_line_is_not_found(self):
        a, b = self._ids(self.item, self.item2)
        r = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=[a, b, a])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(CartLine.objects.filter(cart_id=self.cid, line_kind='discount').count(), 2)
        other = self._open_cart()
        stranger = CartLine.objects.exclude(cart_id=self.cid).exclude(line_kind='discount').first()
        foreign = stranger.pk if stranger else 999999
        r = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=[a, foreign])
        self.assertEqual((r.status_code, r.data['code']), (404, 'LINE_NOT_FOUND'))

    def test_a_free_item_gets_no_zero_line(self):
        CartLine.objects.filter(pk=self.lines[self.item.pk]).update(unit_price=Decimal('0'), line_total=Decimal('0'))
        r = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=self._ids(self.item, self.item2))
        self.assertEqual(r.status_code, 200, r.content)
        discs = [ln for ln in r.data['lines'] if ln['line_kind'] == 'discount']
        self.assertEqual([d['meta']['target_line_id'] for d in discs], [self.lines[self.item2.pk]])

    def test_a_no_tax_item_keeps_its_discount_untaxed(self):
        CartLine.objects.filter(pk=self.lines[self.item.pk]).update(tax_exempt=True)
        r = self._discount(mode='percent', percent='10', reason='Damaged', target_line_ids=self._ids(self.item, self.item2))
        self.assertEqual(r.status_code, 200, r.content)
        on_exempt = next(ln for ln in r.data['lines']
                         if ln['line_kind'] == 'discount' and ln['meta']['target_line_id'] == self.lines[self.item.pk])
        self.assertTrue(on_exempt['tax_exempt'])
