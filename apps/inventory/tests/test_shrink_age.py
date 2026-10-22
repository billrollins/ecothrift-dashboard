"""E4 shrink by age: last seen, likelihood lost 90-180 days, lost past 180, count marks, estimated on hand."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.inventory.models import Item, ItemHistory, ItemScanHistory, Product
from apps.inventory.services.shrink_age import estimated_on_hand, likelihood_lost, shrink_settings
from apps.stocktake.models import CountScan, InventoryCount, ShrinkMark


class LikelihoodTests(TestCase):
    def test_curve_defaults(self):
        s = shrink_settings()
        self.assertEqual((s['start_days'], s['lost_days'], s['start_pct']), (90, 180, Decimal('0.10')))
        self.assertEqual(likelihood_lost(89.9, s), 0)
        self.assertEqual(likelihood_lost(90, s), Decimal('0.1'))
        self.assertEqual(likelihood_lost(135, s), Decimal('0.55'))
        self.assertEqual(likelihood_lost(180, s), 1)
        self.assertEqual(likelihood_lost(400, s), 1)

    def test_owner_settings(self):
        AppSetting.objects.update_or_create(key='shrink_age_start_days', defaults={'value': 60})
        AppSetting.objects.update_or_create(key='shrink_age_lost_days', defaults={'value': 120})
        AppSetting.objects.update_or_create(key='shrink_age_start_pct', defaults={'value': 0})
        s = shrink_settings()
        self.assertEqual(likelihood_lost(90, s), Decimal('0.5'))

    def test_bad_settings_fall_back(self):
        AppSetting.objects.update_or_create(key='shrink_age_lost_days', defaults={'value': 30})
        AppSetting.objects.update_or_create(key='shrink_age_start_pct', defaults={'value': 7})
        s = shrink_settings()
        self.assertEqual(s['lost_days'], 91)
        self.assertEqual(s['start_pct'], Decimal('0.10'))


class EstimateTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.product = Product.objects.create(title='Thing')

    def _item(self, days_ago, price='10.00', **fields):
        listed = self.now - timedelta(days=days_ago)
        return Item.objects.create(
            product=self.product, price=Decimal(price), status=fields.pop('status', 'on_shelf'),
            location=fields.pop('location', 'on_shelf'), listed_at=listed, checked_in_at=listed, **fields,
        )

    def _band(self, payload, key):
        return next(b for b in payload['bands'] if b['key'] == key)

    def test_bands_and_estimate(self):
        self._item(10)                    # seen: 100% here
        self._item(135, price='20.00')    # aging: 55% gone
        self._item(200)                   # lost
        self._item(400, status='sold')    # not on the shelf
        self._item(10, location='restoration')  # restoration tracks it
        p = estimated_on_hand(self.now)
        self.assertEqual(p['system'], {'units': 3, 'tag': '40.00'})
        self.assertEqual(p['estimated']['units'], 1.4)
        self.assertEqual(p['estimated']['tag'], '19.00')
        self.assertEqual(p['expected_lost']['tag'], '21.00')
        self.assertEqual(self._band(p, 'aging')['units'], 1)
        self.assertEqual(self._band(p, 'lost')['units'], 1)

    def test_a_scan_or_change_or_count_resets_the_clock(self):
        a = self._item(200)
        b = self._item(200)
        c = self._item(200)
        ItemScanHistory.objects.create(item=a, source='pos_terminal')
        h = ItemHistory.objects.create(item=b, event_type='price_change', old_value='10', new_value='8')
        ItemHistory.objects.filter(pk=h.pk).update(created_at=self.now - timedelta(days=100))
        count = InventoryCount.objects.create(name='Fall count')
        CountScan.objects.create(count=count, client_id='x1', code=c.sku, scanned_at=self.now - timedelta(days=16),
                                 result='ok', item=c)
        p = estimated_on_hand(self.now, with_items='seen')
        self.assertEqual(self._band(p, 'seen')['units'], 2)
        self.assertEqual(self._band(p, 'aging')['units'], 1)
        by = {r['sku']: r['seen_by'] for r in p['items']}
        self.assertEqual(by, {a.sku: 'scan', c.sku: 'count'})

    def test_an_online_listing_counts_as_seen(self):
        from apps.webstore.models import WebListing

        item = self._item(200, location='online_sales')
        WebListing.objects.create(title='Lamp', slug='lamp-seen', price=Decimal('10'), on_hand=1, status='published',
                                  item=item, return_policy='final_sale')
        p = estimated_on_hand(self.now, with_items='seen')
        self.assertEqual(p['items'][0]['seen_by'], 'online_listing')

    def test_count_marks(self):
        gone = self._item(5)
        back = self._item(300)
        count = InventoryCount.objects.create(name='Fall count')
        ShrinkMark.objects.create(count=count, item=gone, outcome='stolen')
        ShrinkMark.objects.create(count=count, item=back, outcome='back_stock')
        p = estimated_on_hand(self.now, with_items='marked_gone')
        self.assertEqual(self._band(p, 'marked_gone')['units'], 1)
        self.assertEqual(p['items'][0]['marked_gone'], 'stolen')
        self.assertEqual(self._band(p, 'seen')['units'], 1)  # back stock mark = seen at the mark

    def test_not_found_in_last_closed_count(self):
        missing = self._item(20)
        found = self._item(20)
        marked_back = self._item(20)
        count = InventoryCount.objects.create(
            name='Count', day=(self.now - timedelta(days=10)).date(), status='closed',
            expected_item_ids=[missing.pk, found.pk, marked_back.pk],
            closed_expected_ids=[missing.pk, found.pk, marked_back.pk],
        )
        CountScan.objects.create(count=count, client_id='f', code=found.sku, scanned_at=self.now - timedelta(days=10),
                                 result='ok', item=found)
        ShrinkMark.objects.create(count=count, item=marked_back, outcome='back_stock')
        p = estimated_on_hand(self.now)
        self.assertEqual(self._band(p, 'count_missing')['units'], 1)
        self.assertEqual(p['last_count_not_found']['units'], 1)
        self.assertEqual(p['estimated']['units'], 2)

        # Seen after the count: back on the books.
        ItemScanHistory.objects.create(item=missing, source='pos_terminal')
        self.assertEqual(self._band(estimated_on_hand(self.now), 'count_missing')['units'], 0)

    def test_count_rule_switch_off_falls_back_to_age(self):
        missing = self._item(20)
        InventoryCount.objects.create(
            name='Count', day=(self.now - timedelta(days=10)).date(), status='closed',
            expected_item_ids=[missing.pk], closed_expected_ids=[missing.pk],
        )
        AppSetting.objects.update_or_create(key='shrink_count_not_found_lost', defaults={'value': False})
        p = estimated_on_hand(self.now)
        self.assertEqual(self._band(p, 'seen')['units'], 1)
        self.assertEqual(p['last_count_not_found']['units'], 1)
        self.assertFalse(p['settings']['count_missing_lost'])

    def test_endpoint(self):
        user = get_user_model().objects.create_user(email='o@example.com', first_name='O', last_name='W', password='pw')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        client = APIClient()
        client.force_authenticate(user=user)
        self._item(150)
        r = client.get('/api/inventory/shrink-estimate/', {'items': 'aging'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['items']), 1)
        self.assertGreater(r.data['items'][0]['likelihood_lost'], 0.6)
        self.assertEqual(client.get('/api/inventory/shrink-estimate/', {'items': 'nope'}).status_code, 400)
