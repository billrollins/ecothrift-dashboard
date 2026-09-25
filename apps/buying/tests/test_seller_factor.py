"""Seller revenue factors: what a seller's finished trucks really made against the prediction."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, Marketplace
from apps.buying.services import price_target as pt
from apps.buying.services.seller_factor import SELLER_FACTORS_KEY, fit_seller_factors, seller_factor
from apps.core.models import AppSetting
from apps.inventory.models import Category, Item, Product, PurchaseOrder, Vendor

KITCHEN = 'Kitchen & dining'


class SellerFactorTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        AppSetting.objects.update_or_create(key='pricing_shrinkage_factor', defaults={'value': 0})
        CategoryStats.objects.update_or_create(category=KITCHEN, defaults={'recovery_rate': Decimal('0.5')})
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.vendor = Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})[0]
        category, _ = Category.objects.get_or_create(name=KITCHEN, defaults={'slug': 'kitchen-dining'})
        self.product = Product.objects.create(title='Mixing bowl', category=category)

    def _truck(self, n, *, days_ago=200, sold=1, of=2, sold_for='30'):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number=f'SF-{n}', ordered_date=timezone.localdate() - timedelta(days=days_ago),
        )
        for i in range(of):
            done = i < sold
            Item.objects.create(
                sku=f'SF{n}-{i}', product=self.product, purchase_order=po, retail=Decimal('100'),
                status='sold' if done else 'on_shelf',
                sold_at=timezone.now() if done else None, sold_for=Decimal(sold_for) if done else None,
            )
        return po

    def test_a_seller_with_enough_finished_trucks_gets_its_factor(self):
        for n in range(5):
            self._truck(n)  # 30 made of 200 retail x 0.5 = 100 predicted: 0.30
        self._truck(98, days_ago=30)  # too new
        self._truck(99, sold=0)  # nothing sold yet
        fit = fit_seller_factors()
        self.assertEqual(fit['by_seller']['target']['n'], 5)
        self.assertEqual(fit['sellers']['target'], {'factor': '0.300', 'n': 5})

    def test_too_few_trucks_or_a_wild_ratio(self):
        for n in range(4):
            self._truck(n)
        self.assertEqual(fit_seller_factors()['sellers'], {})
        self._truck(4, sold_for='1')  # 0.01: clamped to 0.2
        for n in range(5, 9):
            self._truck(n, sold_for='1')
        self.assertEqual(fit_seller_factors()['sellers']['target']['factor'], '0.2')

    def test_saved_factors_scale_the_valuation(self):
        for n in range(5):
            self._truck(n)
        auction = Auction.objects.create(marketplace=self.mp, external_id='sf')
        self.assertEqual(seller_factor(auction), (Decimal('1'), None))
        out = StringIO()
        call_command('fit_seller_factors', stdout=out)
        self.assertIn('Report only', out.getvalue())
        self.assertFalse(AppSetting.objects.filter(key=SELLER_FACTORS_KEY).exists())
        call_command('fit_seller_factors', '--save', stdout=StringIO())
        pt.clear_cache()
        factor, entry = seller_factor(auction)
        self.assertEqual((factor, entry['n']), (Decimal('0.300'), 5))
