"""Item card API - the universal Item modal and the hover card (services/item_card.py)."""

from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, Product, RestorationJob
from apps.inventory.services.item_notes import append_item_note
from apps.inventory.tests.test_restoration_queue import RestorationQueueTestBase


class ItemCardApiTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, row, product = self._restoration_order(order_number='PO-CARD-1')
        resp = self._check_in_restoration(order, row, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.item = self.job.item_check_in.items.order_by('id').first()

    def test_full_card_has_every_section(self):
        self.item.cost = Decimal('4.00')
        self.item.notes = 'small scuff'
        self.item.label_printed_at = timezone.now()
        self.item.save()
        ItemHistory.objects.create(item=self.item, event_type='price_change', old_value='10.00', new_value='8.00')
        append_item_note(self.item, 'manual', 'checked the motor', author=self.user)

        resp = self.client.get(f'/api/inventory/items/{self.item.pk}/card/')
        self.assertEqual(resp.status_code, 200, resp.data)
        data = resp.data
        self.assertEqual(data['sku'], self.item.sku)
        self.assertEqual(data['order']['order_number'], 'PO-CARD-1')
        self.assertEqual(data['cost'], '4.00')
        self.assertEqual(data['notes'], 'small scuff')
        self.assertEqual(data['restoration']['job_id'], self.job.pk)
        self.assertIn('actions', data['restoration'])
        kinds = {e['kind'] for e in data['journey']}
        self.assertTrue({'order', 'restoration', 'tag', 'history', 'note'} <= kinds, kinds)
        ats = [e['at'] for e in data['journey']]
        self.assertEqual(ats, sorted(ats))

    def test_lite_card_is_small(self):
        resp = self.client.get(f'/api/inventory/items/{self.item.pk}/card/?lite=1')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['sku'], self.item.sku)
        self.assertIn('restoration', resp.data)
        self.assertNotIn('journey', resp.data)
        self.assertNotIn('cost', resp.data)
        self.assertNotIn('actions', resp.data['restoration'])

    def test_item_without_order_or_job(self):
        item = Item.objects.create(sku='ITMCARD01', product=Product.objects.create(title='Lamp'), price=Decimal('5'))
        resp = self.client.get(f'/api/inventory/items/{item.pk}/card/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['order'])
        self.assertIsNone(resp.data['restoration'])
        self.assertEqual(resp.data['title'], 'Lamp')

    def test_missing_item_is_404_and_staff_only(self):
        self.assertEqual(self.client.get('/api/inventory/items/999999/card/').status_code, 404)
        self.client.logout()
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(f'/api/inventory/items/{self.item.pk}/card/').status_code, (401, 403))
