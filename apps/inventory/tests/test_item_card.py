"""Item card API - the universal Item modal and the hover card (services/item_card.py)."""

from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, Product, PurchaseOrder, RestorationJob
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


class ProductCardApiTests(RestorationQueueTestBase):
    """The Product window (Dash Updates #11): counts and averages in a fixed number of queries."""

    def setUp(self):
        super().setUp()
        order, row, product = self._restoration_order(order_number='PO-PCARD-1')
        resp = self._check_in_restoration(order, row, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.product = product
        self.order = order

    def _make(self, n, **fields):
        base = Item.objects.count()
        for i in range(n):
            Item.objects.create(sku=f'PCARD{base + i:05d}', product=self.product, purchase_order=self.order,
                                price=Decimal('10.00'), **fields)

    def test_counts_averages_items_and_orders(self):
        now = timezone.now()
        self._make(3, status='on_shelf')
        self._make(2, status='sold', sold_for=Decimal('8.00'), listed_at=now - timezone.timedelta(days=4), sold_at=now)
        self._make(1, status='scrapped')
        resp = self.client.get(f'/api/inventory/products/{self.product.pk}/card/')
        self.assertEqual(resp.status_code, 200, resp.data)
        c = resp.data
        self.assertEqual((c['counts']['sold'], c['counts']['gone']), (2, 1))
        self.assertGreaterEqual(c['counts']['on_shelf'], 3)
        self.assertEqual(c['avg_sold'], '8.00')
        self.assertEqual(c['avg_days_to_sell'], 4.0)
        self.assertLessEqual(len(c['items']), 10)
        self.assertEqual(c['orders'][0]['order_number'], 'PO-PCARD-1')
        self.assertTrue({'created', 'check_in', 'sale'} <= {e['kind'] for e in c['journey']})

    def test_many_items_cost_the_same_queries(self):
        self._make(5, status='on_shelf')
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as few:
            self.client.get(f'/api/inventory/products/{self.product.pk}/card/')
        self._make(200, status='on_shelf')
        with CaptureQueriesContext(connection) as many:
            self.client.get(f'/api/inventory/products/{self.product.pk}/card/')
        self.assertEqual(len(many), len(few))

    def test_an_empty_product_and_a_missing_one(self):
        empty = Product.objects.create(title='Nothing yet', brand='QA', category=self.product.category)
        c = self.client.get(f'/api/inventory/products/{empty.pk}/card/').data
        self.assertEqual((c['counts']['total'], c['avg_sold'], c['avg_days_to_sell']), (0, None, None))
        self.assertEqual(self.client.get('/api/inventory/products/999999/card/').status_code, 404)

    def test_signed_out_is_refused(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(f'/api/inventory/products/{self.product.pk}/card/').status_code, (401, 403))


class OrderCardApiTests(RestorationQueueTestBase):
    """The Order window (Dash Updates #12)."""

    def setUp(self):
        super().setUp()
        order, row, product = self._restoration_order(order_number='PO-OCARD-1')
        resp = self._check_in_restoration(order, row, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.order, self.product = order, product

    def _make(self, n, **fields):
        base = Item.objects.count()
        for i in range(n):
            Item.objects.create(sku=f'OCARD{base + i:05d}', product=self.product, purchase_order=self.order,
                                price=Decimal('10.00'), **fields)

    def test_money_units_and_journey(self):
        PurchaseOrder.objects.filter(pk=self.order.pk).update(total_cost=Decimal('200.00'), retail_value=Decimal('1000.00'))
        self._make(2, status='sold', sold_for=Decimal('25.00'), sold_at=timezone.now())
        self._make(3, status='on_shelf')
        c = self.client.get(f'/api/inventory/orders/{self.order.pk}/card/').data
        self.assertEqual((c['money']['cost_pct_of_retail'], c['money']['sold_for'], c['money']['recovered_pct']),
                         (20.0, '50.00', 25.0))
        self.assertEqual(c['units']['sold'], 2)
        self.assertGreaterEqual(c['units']['on_shelf'], 3)
        self.assertEqual(c['journey'][0]['kind'], 'ordered')

    def test_no_retail_or_cost_reads_as_nothing_and_queries_stay_flat(self):
        PurchaseOrder.objects.filter(pk=self.order.pk).update(total_cost=0, retail_value=None)
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as few:
            c = self.client.get(f'/api/inventory/orders/{self.order.pk}/card/').data
        self.assertEqual((c['money']['cost_pct_of_retail'], c['money']['recovered_pct']), (None, None))
        self._make(150, status='on_shelf')
        with CaptureQueriesContext(connection) as many:
            self.client.get(f'/api/inventory/orders/{self.order.pk}/card/')
        self.assertEqual(len(many), len(few))
        self.assertEqual(self.client.get('/api/inventory/orders/999999/card/').status_code, 404)


class RestorationCardApiTests(RestorationQueueTestBase):
    """The Restoration job window (Dash Updates #14)."""

    def test_the_job_its_item_request_and_history(self):
        from apps.inventory.models import RestorationTimelineEvent
        order, row, product = self._restoration_order(order_number='PO-RCARD-1')
        resp = self._check_in_restoration(order, row, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        RestorationTimelineEvent.objects.create(job=job, event_type='grade.claimed', actor=self.user)
        RestorationTimelineEvent.objects.create(job=job, event_type='valuation.values_changed', actor=self.user)
        c = self.client.get(f'/api/inventory/restoration-jobs/{job.pk}/card/').data
        self.assertEqual((c['id'], c['job_id']), (job.pk, job.pk))
        self.assertEqual(c['order']['order_number'], 'PO-RCARD-1')
        self.assertIsNotNone(c['item'])
        self.assertIn('request', c)
        types = [h['type'] for h in c['history']]
        self.assertIn('grade.claimed', types)
        self.assertNotIn('valuation.values_changed', types)
        self.assertEqual(self.client.get('/api/inventory/restoration-jobs/999999/card/').status_code, 404)
