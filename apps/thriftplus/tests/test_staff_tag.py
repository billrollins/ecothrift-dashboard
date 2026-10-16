"""The Thrift+ Staff app's test scanner (owner 2026-10-16): staff see a tag's item card; it never counts as a scan."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product
from apps.thriftplus.models import ItemReward, ScanSignal
from apps.thriftplus.services import members, scanner

D = Decimal
URL = '/api/thriftplus/staff-tag/'


class StaffTagTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})  # Thrift+ still off
        no_sale = patch.object(scanner, '_sale_factor', return_value=D('1'))
        no_sale.start()
        self.addCleanup(no_sale.stop)
        self.lamp = Item.objects.create(sku='ITMTPSTAFF1', product=Product.objects.create(title='Brass floor lamp'),
                                        price=D('90.00'), status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key='p1', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())
        self.api = APIClient()
        self.clerk = User.objects.create_user('clerk-tag@example.com', 'Pat', 'Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])

    def test_staff_see_the_item_card_and_no_scan_is_logged(self):
        self.api.force_authenticate(self.clerk)
        got = self.api.get(URL + 'itmtpstaff1/')
        self.assertEqual(got.status_code, 200, got.content)
        body = got.json()
        self.assertEqual(body['status'], 'found')
        self.assertEqual((body['item']['sku'], body['item']['price'], body['item']['reward']), ('ITMTPSTAFF1', '90.00', '13.00'))
        self.assertEqual(ScanSignal.objects.count(), 0)
        self.assertEqual(ItemReward.objects.get(item=self.lamp).scans, 0)

    def test_an_unknown_tag_is_not_found(self):
        self.api.force_authenticate(self.clerk)
        self.assertEqual(self.api.get(URL + 'NOPE123/').json(), {'status': 'not_found', 'sku': 'NOPE123'})

    def test_only_staff(self):
        self.assertEqual(self.api.get(URL + 'ITMTPSTAFF1/').status_code, 401)
        shopper = User.objects.create_user('shopper-tag@example.com', 'Sam', 'Shopper', password='x-pass-123')
        self.api.force_authenticate(shopper)
        self.assertEqual(self.api.get(URL + 'ITMTPSTAFF1/').status_code, 403)
