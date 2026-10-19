"""The overstock list (rulebook P6, owner 2026-10-19): products with 10+ floor units and more than a year of supply, for
the owner's weekly look; one stamped action per lot."""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Item, Product
from apps.thriftplus.models import OverstockMark
from apps.thriftplus.tests.test_rewards import _floor_item

D = Decimal
URL = '/api/thriftplus/overstock/'


class OverstockTests(APITestCase):
    def setUp(self):
        today = timezone.localdate()
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.manager = User.objects.create_user('mgr@example.com', 'M', 'G', password='x-pass-123')
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.shacket = Product.objects.create(title='Flannel shacket')
        for i in range(12):  # no sales in 90 days: 12 ÷ (1 ÷ 90) = 1,080 days of supply
            _floor_item(self.shacket, f'ITMOS{i:02d}', days_on_floor=200, price='5.00', cost='2.50', on=today)
        self.mixed = Product.objects.create(title='Amazing Clothing Item')
        for i in range(10):
            _floor_item(self.mixed, f'ITMOM{i:02d}', days_on_floor=120, price='2.00' if i < 5 else '12.00', cost='0.50', on=today)
        cups = Product.objects.create(title='Paper cups')
        for i in range(12):
            _floor_item(cups, f'ITMOC{i:02d}', days_on_floor=40, price='4.00', on=today)
        for i in range(9):  # (9 + 1) ÷ 39 days: about 47 days of supply, selling fine
            Item.objects.create(product=cups, sku=f'ITMOCS{i:02d}', price=D('4.00'), status='sold',
                                sold_at=timezone.make_aware(datetime.combine(today - timedelta(days=5), time(12))))
        few = Product.objects.create(title='Brass lamp')
        for i in range(9):  # under 10 units: never on the list
            _floor_item(few, f'ITMOL{i:02d}', days_on_floor=300, price='40.00', on=today)

    def test_the_list_holds_ten_plus_units_over_a_year_of_supply_biggest_tags_first(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get(URL).data
        self.assertEqual((data['total'], data['undecided'], data['units'], data['tag_total']), (2, 2, 22, '130.00'))
        self.assertEqual([r['title'] for r in data['rows']], ['Amazing Clothing Item', 'Flannel shacket'])  # $70 before $60
        mixed, shacket = data['rows']
        self.assertEqual({f['key'] for f in mixed['flags']}, {'mixed'})
        self.assertEqual({f['key'] for f in shacket['flags']}, {'cost'})
        self.assertEqual((shacket['units'], shacket['days_of_supply'], shacket['sold_90'], shacket['mark']), (12, 1080, 0, None))
        self.assertEqual(data['settings'], {'group_min_units': 10, 'overstock_days': 365})

    def test_only_the_owner_marks(self):
        self.client.force_authenticate(self.manager)
        r = self.client.post(f'{URL}{self.shacket.pk}/mark/', {'action': 'bundle'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_a_mark_is_stamped_and_moves_the_lot_off_the_undecided_list(self):
        self.client.force_authenticate(self.boss)
        r = self.client.post(f'{URL}{self.shacket.pk}/mark/', {'action': 'back_stock', 'note': 'Keep 20 out'}, format='json')
        self.assertEqual((r.status_code, r.data['action']), (200, 'back_stock'))
        mark = OverstockMark.objects.get(product=self.shacket)
        self.assertEqual((mark.marked_by, mark.note), (self.boss, 'Keep 20 out'))
        data = self.client.get(URL).data
        self.assertEqual(([r['title'] for r in data['rows']], data['counts']['back_stock']), (['Amazing Clothing Item'], 1))
        marked = self.client.get(URL, {'show': 'back_stock'}).data['rows'][0]
        self.assertEqual((marked['title'], marked['mark']['label'], marked['mark']['note']), ('Flannel shacket', 'Back stock', 'Keep 20 out'))
        self.assertEqual(self.client.get(URL, {'show': 'all'}).data['matching'], 2)
        self.client.post(f'{URL}{self.shacket.pk}/mark/', {'action': 'clear'}, format='json')
        self.assertEqual(self.client.get(URL).data['undecided'], 2)
        bad = self.client.post(f'{URL}{self.shacket.pk}/mark/', {'action': 'sell it all'}, format='json')
        self.assertEqual(bad.status_code, 400)
