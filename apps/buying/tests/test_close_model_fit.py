"""Fitting the likely-close model from ended auctions and price snapshots."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.buying.models import Auction, AuctionSnapshot, Marketplace
from apps.buying.services import close_model_fit
from apps.buying.services import price_target as pt
from apps.buying.services.close_model_fit import fit_close_model
from apps.core.models import AppSetting


class CloseModelFitTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.target = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.costco = Marketplace.objects.update_or_create(slug='costco', defaults={'name': 'Costco'})[0]
        self.now = timezone.now()

    def _ended(self, mp, n, *, ratio, snapshots=None):
        end = self.now - timedelta(days=2, minutes=n)
        auction = Auction.objects.create(
            marketplace=mp, external_id=f'{mp.slug}-{n}', end_time=end,
            total_retail_value=Decimal('10000'), current_price=Decimal('10000') * Decimal(ratio),
        )
        for minutes_before, price in snapshots or []:
            snap = AuctionSnapshot.objects.create(auction=auction, price=Decimal(price))
            AuctionSnapshot.objects.filter(pk=snap.pk).update(captured_at=end - timedelta(minutes=minutes_before))
        return auction

    def test_sellers_with_enough_auctions_get_their_own_ratio(self):
        for n in range(30):
            self._ended(self.target, n, ratio='0.08')
        for n in range(3):
            self._ended(self.costco, n, ratio='0.20')
        fit = fit_close_model()
        self.assertEqual(fit['model']['sellers']['target'], '0.080')
        # Too thin to fit (3 auctions): Costco keeps its current ratio, not its 0.20.
        self.assertEqual(fit['model']['sellers']['costco'], '0.081')
        # Sellers too thin to fit keep what they had.
        self.assertEqual(fit['model']['sellers']['walmart'], '0.075')
        self.assertEqual(fit['model']['cells'], {'target|unspecified': '0.080'})
        self.assertEqual(fit['n'], 33)
        self.assertFalse(fit['sellers']['costco']['own_ratio'])

    def test_the_late_bump_needs_a_final_snapshot_and_enough_auctions(self):
        for n in range(close_model_fit.MIN_BUMP_N):
            # 700 an hour out, 800 at the end: x1.143; final stored price = 800.
            self._ended(self.target, n, ratio='0.08', snapshots=[(60, '700'), (5, '800')])
        self._ended(self.target, 99, ratio='0.08', snapshots=[(60, '400')])  # no final snapshot: skipped
        fit = fit_close_model()
        self.assertEqual(fit['bumps']['hour']['n'], close_model_fit.MIN_BUMP_N)
        self.assertEqual(fit['model']['bump_last_hour'], '1.143')
        # No 3-hour snapshots: the current bump is kept.
        self.assertEqual(fit['model']['bump_last_3_hours'], '1.00')

    def test_the_command_reports_and_saves(self):
        for n in range(30):
            self._ended(self.target, n, ratio='0.05')
        out = StringIO()
        call_command('fit_close_model', stdout=out)
        self.assertIn('Report only', out.getvalue())
        self.assertFalse(AppSetting.objects.filter(key='buying_close_model').exists())
        call_command('fit_close_model', '--save', stdout=StringIO())
        saved = AppSetting.objects.get(key='buying_close_model').value
        self.assertEqual(saved['sellers']['target'], '0.050')
        pt.clear_cache()
        auction = Auction(marketplace=self.target, total_retail_value=Decimal('20000'))
        self.assertEqual(pt.expected_close(auction), Decimal('1000.00'))
