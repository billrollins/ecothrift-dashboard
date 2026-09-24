"""Buying Phase 6: a won auction becomes a PO with its manifest; the report card."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, ManifestRow, Marketplace, Outcome, WatchlistEntry
from apps.buying.services import price_target as pt
from apps.buying.services.won_to_po import (
    CALIBRATION_KEY,
    WonToPoError,
    calibration,
    mark_lost,
    mark_won,
    refresh_calibration,
    report_card,
    report_cards,
)
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product, PurchaseOrder, Vendor

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _user(email, group):
    user = User.objects.create_user(email, 'Test', 'User', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


@override_settings(STORAGES=IN_MEMORY)
class WonToPoTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'default_fee_rate': Decimal('0.05')})[0]
        # inventory.0033 seeds Target / TRGET.
        Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='x1', lot_id='LOT-77', title='Target housewares',
            url='https://bstock.com/x1', condition_summary='Customer returns', pallet_count=3,
            estimated_revenue=Decimal('3000'), est_profit=Decimal('1200'), estimated_shipping=Decimal('250'),
        )
        for n in (1, 2):
            ManifestRow.objects.create(
                auction=self.auction, row_number=n, title=f'Item {n}', quantity=2, retail_value=Decimal('40'),
                raw_data={'Item Description': f'Item {n}', 'Qty': '2', 'Unit Retail': '40.00', 'UPC': f'00012345{n}'},
            )
        WatchlistEntry.objects.create(auction=self.auction)
        self.boss = _user('boss@example.com', 'Manager')

    def test_a_win_makes_the_po_with_the_manifest_on_it(self):
        po = mark_won(self.auction, hammer_price=Decimal('1000'), user=self.boss)
        self.assertEqual(po.won_manifest_note, '')
        po.refresh_from_db()
        self.assertEqual(po.vendor.code, 'TRGET')
        self.assertEqual(po.order_number, 'BST-LOT-77')
        self.assertEqual(po.status, 'ordered')
        self.assertEqual((po.purchase_cost, po.fees, po.shipping_cost), (Decimal('1000.00'), Decimal('50.00'), Decimal('250.00')))
        self.assertEqual(po.total_cost, Decimal('1300.00'))
        self.assertEqual(po.item_count, 4)
        self.assertEqual(po.retail_value, Decimal('160.00'))
        self.assertEqual(po.created_by, self.boss)
        # The manifest went through the Orders page's own upload path: raw B-Stock columns.
        self.assertEqual(po.manifest_row_count, 2)
        self.assertEqual(sorted(po.manifest_headers), ['Item Description', 'Qty', 'UPC', 'Unit Retail'])
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.purchase_order_id, po.pk)
        outcome = Outcome.objects.get(auction=self.auction)
        self.assertTrue(outcome.win)
        self.assertEqual(outcome.prediction['estimated_revenue'], '3000.00')
        self.assertEqual(WatchlistEntry.objects.get(auction=self.auction).status, 'won')

    def test_columns_follow_an_earlier_po_from_the_vendor_so_its_template_still_matches(self):
        earlier = ['UPC', 'Item Description', 'Unit Retail', 'Qty']
        PurchaseOrder.objects.create(
            vendor=Vendor.objects.get(code='TRGET'), order_number='TRGET-OLD-1', ordered_date=timezone.localdate(),
            manifest_headers=earlier,
        )
        po = mark_won(self.auction, hammer_price=Decimal('1000'), user=self.boss)
        po.refresh_from_db()
        self.assertEqual(po.manifest_headers, earlier)

    def test_a_second_win_is_refused(self):
        mark_won(self.auction, hammer_price=Decimal('1000'), user=self.boss)
        self.auction.refresh_from_db()
        with self.assertRaises(WonToPoError):
            mark_won(self.auction, hammer_price=Decimal('1000'), user=self.boss)
        self.assertEqual(PurchaseOrder.objects.count(), 1)

    def test_a_new_seller_gets_a_vendor(self):
        mp = Marketplace.objects.update_or_create(slug='big-lots', defaults={'name': 'Big Lots'})[0]
        auction = Auction.objects.create(marketplace=mp, external_id='x2')
        po = mark_won(auction, hammer_price=Decimal('500'), user=self.boss)
        self.assertEqual(po.vendor.name, 'Big Lots')
        self.assertIn('No manifest lines', po.won_manifest_note)

    def test_report_card_compares_prediction_with_what_sold(self):
        po = mark_won(self.auction, hammer_price=Decimal('1000'), user=self.boss)
        now = timezone.now()
        product = Product.objects.create(title='Housewares item')
        for i in range(4):
            Item.objects.create(
                sku=f'RC{i}', product=product, purchase_order=po, price=Decimal('30'), retail=Decimal('40'),
                status='sold' if i < 3 else 'on_shelf',
                checked_in_at=now - timedelta(days=20),
                sold_at=now - timedelta(days=10) if i < 3 else None,
                sold_for=Decimal('500') if i < 3 else None,
            )
        self.auction.refresh_from_db()
        card = report_card(self.auction)
        self.assertEqual(card['actual']['sold'], 3)
        self.assertEqual(card['actual']['revenue'], '1500.00')
        self.assertEqual(card['actual']['avg_days_to_sell'], 10)
        self.assertEqual(card['actual']['sell_through_pct'], 75.0)
        self.assertEqual(card['revenue_vs_predicted_pct'], 50.0)
        self.assertEqual(card['predicted']['revenue'], '3000.00')

    def test_a_loss_is_recorded(self):
        mark_lost(self.auction, hammer_price=Decimal('1400'))
        outcome = Outcome.objects.get(auction=self.auction)
        self.assertFalse(outcome.win)
        self.assertEqual(outcome.hammer_price, Decimal('1400.00'))
        self.assertEqual(WatchlistEntry.objects.get(auction=self.auction).status, 'lost')


@override_settings(STORAGES=IN_MEMORY)
class CalibrationTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='walmart', defaults={'name': 'Walmart'})[0]
        self.boss = _user('boss@example.com', 'Manager')

    def _finished_truck(self, n, *, predicted, sold_revenue):
        auction = Auction.objects.create(marketplace=self.mp, external_id=f'c{n}', estimated_revenue=Decimal(predicted))
        po = mark_won(auction, hammer_price=Decimal('100'), user=self.boss)
        PurchaseOrder.objects.filter(pk=po.pk).update(ordered_date=timezone.localdate() - timedelta(days=120))
        product = Product.objects.create(title=f'Truck {n} item')
        Item.objects.create(
            sku=f'C{n}', product=product, purchase_order=po, status='sold',
            sold_at=timezone.now(), sold_for=Decimal(sold_revenue),
        )

    def test_nothing_is_applied_until_five_trucks_back_it(self):
        for n in range(4):
            self._finished_truck(n, predicted='1000', sold_revenue='800')
        self.assertEqual(calibration()['trucks'], 4)
        self.assertIsNone(refresh_calibration()['applied'])
        self.assertFalse(AppSetting.objects.filter(key=CALIBRATION_KEY).exists())

    def test_five_trucks_set_the_factor_within_bounds(self):
        for n in range(5):
            self._finished_truck(n, predicted='1000', sold_revenue='500')  # 50%: clamped to 0.7
        self.assertEqual(refresh_calibration()['applied'], '0.7')
        pt.clear_cache()
        self.assertEqual(pt.get_revenue_calibration(), Decimal('0.7'))

    def test_report_cards_list_every_won_truck_and_say_which_can_be_judged(self):
        self._finished_truck(1, predicted='1000', sold_revenue='900')
        fresh = Auction.objects.create(marketplace=self.mp, external_id='fresh', estimated_revenue=Decimal('1000'))
        mark_won(fresh, hammer_price=Decimal('100'), user=self.boss)
        data = report_cards()
        stages = {row['auction_id']: row['stage'] for row in data['results']}
        self.assertEqual(stages[fresh.pk], 'not_selling_yet')
        self.assertEqual(sorted(stages.values()), ['judged', 'not_selling_yet'])
        judged = next(row for row in data['results'] if row['stage'] == 'judged')
        self.assertEqual(judged['card']['revenue_vs_predicted_pct'], 90.0)
        self.assertEqual((data['calibration']['trucks'], data['calibration']['applied'], data['calibration']['min_trucks']), (1, None, 5))
        self.assertEqual(data['last_90_days']['won'], 2)


@override_settings(STORAGES=IN_MEMORY)
class WonApiTests(APITestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='amazon', defaults={'name': 'Amazon'})[0]
        self.auction = Auction.objects.create(marketplace=mp, external_id='w1', estimated_shipping=Decimal('100'))

    def test_a_manager_records_the_win_and_gets_the_po(self):
        self.client.force_authenticate(_user('mgr@example.com', 'Manager'))
        data = self.client.post(f'/api/buying/auctions/{self.auction.pk}/won/', {'hammer_price': '750'}, format='json').data
        self.assertTrue(data['purchase_order_number'].startswith('BST-'))
        self.assertTrue(data['outcome']['win'])
        self.assertEqual(data['report_card']['actual']['items'], 0)

    def test_an_employee_cannot(self):
        self.client.force_authenticate(_user('emp@example.com', 'Employee'))
        response = self.client.post(f'/api/buying/auctions/{self.auction.pk}/won/', {'hammer_price': '750'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(PurchaseOrder.objects.exists())

    def test_a_bad_price_is_a_400(self):
        self.client.force_authenticate(_user('mgr@example.com', 'Manager'))
        response = self.client.post(f'/api/buying/auctions/{self.auction.pk}/won/', {'hammer_price': 'lots'}, format='json')
        self.assertEqual(response.status_code, 400)
