"""Item.label_printed_at persistence and mark-labels-printed API."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Item, Product
from apps.inventory.serializers import ItemSerializer


class ItemLabelPrintedTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        self.product = Product.objects.create(title='Widget', brand='Generic')

    def _item(self, **kwargs):
        return Item.objects.create(
            product=self.product,
            price=Decimal('3.50'),
            **kwargs,
        )

    def test_serializer_exposes_label_printed_bool(self):
        checked_in = timezone.now()
        item = self._item(checked_in_at=checked_in, label_printed_at=checked_in)
        data = ItemSerializer(item).data
        self.assertTrue(data['label_printed'])
        self.assertIsNotNone(data['label_printed_at'])

    def test_new_items_default_unprinted(self):
        item = self._item()
        data = ItemSerializer(item).data
        self.assertFalse(data['label_printed'])
        self.assertIsNone(data['label_printed_at'])

    def test_mark_labels_printed_updates_only_requested_ids(self):
        a = self._item()
        b = self._item()
        c = self._item()
        resp = self.client.post(
            '/api/inventory/items/mark-labels-printed/',
            {'item_ids': [a.id, c.id]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['updated'], 2)
        a.refresh_from_db()
        b.refresh_from_db()
        c.refresh_from_db()
        self.assertIsNotNone(a.label_printed_at)
        self.assertIsNone(b.label_printed_at)
        self.assertIsNotNone(c.label_printed_at)

    def test_mark_labels_printed_requires_auth(self):
        item = self._item()
        anon = APIClient()
        resp = anon.post(
            '/api/inventory/items/mark-labels-printed/',
            {'item_ids': [item.id]},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_mark_labels_printed_rejects_empty_payload(self):
        resp = self.client.post('/api/inventory/items/mark-labels-printed/', {'item_ids': []}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_list_filters_label_printed(self):
        printed_item = self._item()
        unprinted_item = self._item()
        Item.objects.filter(pk=printed_item.pk).update(label_printed_at=timezone.now())
        printed_resp = self.client.get('/api/inventory/items/', {'label_printed': 'true'})
        unprinted_resp = self.client.get('/api/inventory/items/', {'label_printed': 'false'})
        self.assertEqual(printed_resp.status_code, 200)
        self.assertEqual(unprinted_resp.status_code, 200)
        printed_ids = {row['id'] for row in printed_resp.data['results']}
        unprinted_ids = {row['id'] for row in unprinted_resp.data['results']}
        self.assertIn(printed_item.id, printed_ids)
        self.assertNotIn(unprinted_item.id, printed_ids)
        self.assertIn(unprinted_item.id, unprinted_ids)
        self.assertNotIn(printed_item.id, unprinted_ids)
