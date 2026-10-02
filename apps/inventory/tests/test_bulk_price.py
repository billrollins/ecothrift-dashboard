"""Bulk price change: the rule, the preview, the change with its history, undo, and who may do it."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import BulkPriceChange, Category, Item, ItemHistory, Product, ProductProfile, ProductVector
from apps.inventory.services import bulk_price as bp
from apps.inventory.services import inventory_search
from apps.inventory.services.product_vectors import MODEL_NAME


class BulkPriceTests(TestCase):
    def setUp(self):
        cat = Category.objects.get_or_create(name='Mixed lots & uncategorized', defaults={'slug': 'mixed-bp'})[0]
        self.a = Product.objects.create(title='Ninja Blender', brand='Ninja', category=cat)
        ProductProfile.objects.create(product=self.a, short_name='Ninja Blender 1400W')
        self.b = Product.objects.create(title='Lego Set', brand='Lego', category=cat)
        self.a1 = Item.objects.create(product=self.a, sku='ITMBP001', price=Decimal('40.00'), status='on_shelf')
        self.a2 = Item.objects.create(product=self.a, sku='ITMBP002', price=Decimal('24.40'), status='on_shelf')
        self.a_sold = Item.objects.create(product=self.a, sku='ITMBP003', price=Decimal('40.00'), status='sold')
        self.b1 = Item.objects.create(product=self.b, sku='ITMBP004', price=Decimal('1.00'), status='on_shelf')
        self.manager = self._user('boss-bp@example.com', 'Manager')
        self.clerk = self._user('clerk-bp@example.com', 'Employee')

    def _user(self, email, group):
        u = User.objects.create_user(email=email, first_name=group, last_name='X', password='x-pass-123')
        u.groups.add(Group.objects.get_or_create(name=group)[0])
        return u

    def test_the_rule_math(self):
        price = lambda old, **rule: bp.new_price(Decimal(old), bp.clean_rule(rule))  # noqa: E731
        self.assertEqual(price('40.00', mode='percent_off', value=25), Decimal('30.00'))
        self.assertEqual(price('24.40', mode='percent_off', value=25, round='99'), Decimal('17.99'))    # 18.30 -> 18 - .01
        self.assertEqual(price('24.40', mode='percent_off', value=25, round='dollar'), Decimal('18.00'))
        self.assertEqual(price('40.00', mode='amount_off', value=5), Decimal('35.00'))
        self.assertEqual(price('40.00', mode='set', value='12.5'), Decimal('12.50'))
        self.assertEqual(price('1.00', mode='percent_off', value=90), bp.MIN_PRICE)                     # the floor
        for bad in ({'mode': 'percent_off', 'value': 100}, {'mode': 'set', 'value': 0}, {'mode': 'x', 'value': 1},
                    {'mode': 'set', 'value': 'abc'}):
            with self.assertRaises(bp.RuleError):
                bp.clean_rule(bad)

    def test_preview_then_apply_changes_shelf_items_only_and_undo_puts_them_back(self):
        rule = {'mode': 'percent_off', 'value': 25}
        pre = bp.preview([self.b1.pk], [self.a.pk], rule)
        self.assertEqual((pre['selected'], pre['count'], pre['total_before'], pre['total_after']), (3, 3, '65.40', '49.05'))
        self.assertEqual(pre['sample'][0]['title'], 'Ninja Blender 1400W')    # the tag name, for the reprint
        change = bp.apply(self.manager, [self.b1.pk], [self.a.pk], rule)
        self.assertEqual((change.item_count, change.description), (3, '25% off'))
        for item, want in ((self.a1, '30.00'), (self.a2, '18.30'), (self.a_sold, '40.00'), (self.b1, '0.75')):
            item.refresh_from_db()
            self.assertEqual(str(item.price), want)
        self.assertEqual(ItemHistory.objects.filter(event_type='price_change', note__startswith=f'Bulk price change #{change.pk}').count(), 3)

        Item.objects.filter(pk=self.a2.pk).update(price=Decimal('19.00'))    # someone changed this one since
        Item.objects.filter(pk=self.b1.pk).update(status='sold')              # and this one sold
        result = bp.undo(change, self.manager)
        self.assertEqual(result, {'restored': 1, 'left_alone': 2})
        self.a1.refresh_from_db()
        self.a2.refresh_from_db()
        self.assertEqual((str(self.a1.price), str(self.a2.price)), ('40.00', '19.00'))
        with self.assertRaises(bp.RuleError):
            bp.undo(BulkPriceChange.objects.get(pk=change.pk), self.manager)

    def test_nothing_to_change_is_refused(self):
        with self.assertRaises(bp.RuleError):
            bp.apply(self.manager, [self.a1.pk], [], {'mode': 'set', 'value': 40})

    def test_only_managers_change_prices_staff_may_reprint(self):
        body = {'item_ids': [self.a1.pk], 'product_ids': [], 'rule': {'mode': 'amount_off', 'value': 5}}
        client = APIClient()
        client.force_authenticate(self.clerk)
        self.assertEqual(client.post('/api/inventory/bulk-price/preview/', body, format='json').status_code, 403)
        self.assertEqual(client.post('/api/inventory/bulk-price/apply/', body, format='json').status_code, 403)
        labels = client.post('/api/inventory/bulk-price/labels/', {'product_ids': [self.a.pk]}, format='json')
        self.assertEqual((labels.status_code, labels.json()['count']), (200, 2))
        client.force_authenticate(self.manager)
        self.assertEqual(client.post('/api/inventory/bulk-price/preview/', body, format='json').json()['count'], 1)
        made = client.post('/api/inventory/bulk-price/apply/', body, format='json')
        self.assertEqual((made.status_code, made.json()['items'][0]['new']), (201, '35.00'))
        self.assertEqual(client.get('/api/inventory/bulk-price/').json()['results'][0]['id'], made.json()['id'])
        self.assertEqual(client.post(f"/api/inventory/bulk-price/{made.json()['id']}/undo/").json()['undo_result']['restored'], 1)
        bad = client.post('/api/inventory/bulk-price/preview/', {**body, 'rule': {'mode': 'percent_off', 'value': 150}}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_similar_products_come_from_stored_vectors_with_their_numbers(self):
        vec = lambda second: [(1 - second ** 2) ** 0.5, second] + [0.0] * (ProductVector.DIMENSIONS - 2)  # noqa: E731
        ProductVector.objects.create(product=self.a, model_name=MODEL_NAME, embedding=vec(0.0), text_hash='a')
        ProductVector.objects.create(product=self.b, model_name=MODEL_NAME, embedding=vec(0.3), text_hash='b')   # about 0.95
        far = Product.objects.create(title='Garden Hose', brand='Flexzilla', category=self.a.category)
        Item.objects.create(product=far, sku='ITMBP009', price=Decimal('9.00'), status='on_shelf')
        ProductVector.objects.create(product=far, model_name=MODEL_NAME, embedding=vec(0.9), text_hash='c')      # about 0.44
        out = inventory_search.similar(self.a.pk)
        self.assertEqual([r['product_id'] for r in out['results']], [self.b.pk])
        self.assertEqual((out['results'][0]['on_shelf'], round(out['results'][0]['similarity'], 2)), (1, 0.95))
