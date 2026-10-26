"""The weekly inventory rollup (InventoryWeek) against a seeded week, and the sale-facts helpers and backfill."""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.inventory.models import (
    Category, InventoryWeek, Item, ItemHistory, Product, ProductProfile, PurchaseOrder, Vendor,
)
from apps.inventory.services import inventory_week, sale_facts

D = Decimal
WEEK = date(2026, 9, 7)  # a Monday
WEEK_END = timezone.make_aware(datetime(2026, 9, 14))


def at(y, m, d, h=12):
    return timezone.make_aware(datetime.combine(date(y, m, d), time(h)))


class RollupTests(TestCase):
    def setUp(self):
        kitchen = Category.objects.get_or_create(name='Kitchen & dining', defaults={'slug': 'kitchen-wk'})[0]
        toys = Category.objects.get_or_create(name='Toys & games', defaults={'slug': 'toys-wk'})[0]
        self.pan = Product.objects.create(title='Pan', category=kitchen)
        ProductProfile.objects.create(product=self.pan, category='Kitchen & dining', subcategory='Cookware')
        mug = Product.objects.create(title='Mug', category=kitchen)
        ball = Product.objects.create(title='Ball', category=toys)
        vendor = Vendor.objects.create(name='Week test', code='WKTST')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='T-1', ordered_date=date(2026, 4, 1))
        self.n = 0

        def item(product, status, *, checked_in=None, created=None, out=None, price='3.00', retail=None, cost=None,
                 sold_for=None, sold_net=None, order=po, notes=''):
            self.n += 1
            it = Item.objects.create(sku=f'ITMWK{self.n:03}', product=product, status=status, price=D(price),
                                     purchase_order=order, notes=notes)
            Item.objects.filter(pk=it.pk).update(
                checked_in_at=checked_in, created_at=created or at(2026, 4, 1), retail=retail and D(retail),
                cost=cost and D(cost), sold_at=out if status == 'sold' else None, sold_for=sold_for and D(sold_for),
                sold_net=sold_net and D(sold_net), updated_at=out or at(2026, 10, 1))
            return it

        item(self.pan, 'on_shelf', checked_in=at(2026, 5, 1), retail='10.00')          # stale
        item(self.pan, 'on_shelf', checked_in=at(2026, 9, 8), price='12.00')           # in this week, no retail
        costed = item(mug, 'sold', checked_in=at(2026, 9, 1), out=at(2026, 9, 9), retail='20.00',
                      sold_for='8.00', sold_net='6.00', price='8.00')                    # 8 days to sell
        item(mug, 'sold', created=at(2026, 8, 30), out=at(2026, 9, 9), sold_for='4.00')  # no check-in date: 10 days
        scrapped = item(mug, 'scrapped', checked_in=at(2026, 8, 1), retail='5.00')
        ItemHistory.objects.create(item=scrapped, event_type='status_change', old_value='on_shelf', new_value='scrapped')
        ItemHistory.objects.filter(item=scrapped).update(created_at=at(2026, 9, 10))
        item(mug, 'lost', checked_in=at(2026, 8, 1), out=at(2026, 9, 20), retail='5.00')  # still here at week end
        item(ball, 'on_shelf', created=at(2026, 8, 1), order=None, price='60.00')      # no check-in, no vendor
        item(ball, 'intake', checked_in=None)                                          # not on the floor
        item(ball, 'scrapped', checked_in=None)                                        # never reached the floor
        # Old-system imports: a sale counts (no in date, never on hand); a "scrapped" one is an unsold import.
        item(mug, 'sold', checked_in=at(2026, 4, 12), out=at(2026, 9, 10), sold_for='5.00', notes='BACKFILL:v2 x')
        item(mug, 'scrapped', checked_in=at(2026, 4, 12), notes='BACKFILL:v1 x')
        item(mug, 'sold', checked_in=at(2026, 9, 2), out=None)  # SAL-04: "sold" with no sale date, left on 10-01
        # Each new item re-costs its order, so costs go on last.
        Item.objects.filter(purchase_order=po).update(cost=None)
        Item.objects.filter(pk=costed.pk).update(cost=D('2.00'))

    def _rows(self, weeks=(WEEK,), now=None):
        with mock.patch.object(inventory_week, 'bulk_min_units', return_value=2):
            return {(r['dimension'], r['parent'], r['key']): r
                    for r in inventory_week.compute(list(weeks), now=now or timezone.now())}

    def test_a_seeded_week_by_category(self):
        k = self._rows()[('category', '', 'Kitchen & dining')]
        self.assertEqual((k['units_in'], k['legacy_sold'], k['units_sold'], k['units_scrapped'], k['units_lost']),
                         (1, 1, 3, 1, 0))
        # On hand: the two pans, the lost mug (gone 9-20) and the mug "sold" with no sale date (gone 10-01).
        self.assertEqual((k['on_hand'], k['stale_on_hand'], k['bulk_on_hand'], k['on_hand_no_retail']), (4, 1, 4, 2))
        self.assertEqual((k['sales'], k['net']), (D('17.00'), D('15.00')))  # net falls back to sold_for
        self.assertEqual((k['sold_retail'], k['sold_with_retail'], k['sold_net_with_retail']), (D('20.00'), 1, D('6.00')))
        self.assertEqual((k['sold_cost'], k['sold_with_cost'], k['sold_net_with_cost']), (D('2.00'), 1, D('6.00')))
        self.assertEqual(k['sold_no_checkin'], 2)
        self.assertAlmostEqual(k['median_days_to_sell'], 9.0)  # the import has no days to sell
        late = self._rows([date(2026, 9, 28)])[('category', '', 'Kitchen & dining')]
        self.assertEqual((late['units_out_other'], late['units_sold']), (1, 0))
        toys = self._rows()[('category', '', 'Toys & games')]
        self.assertEqual((toys['on_hand'], toys['on_hand_no_checkin'], toys['units_in']), (1, 1, 0))

    def test_subcategory_vendor_and_price_point_rows(self):
        rows = self._rows()
        self.assertEqual(rows[('subcategory', 'Kitchen & dining', 'Cookware')]['on_hand'], 2)
        self.assertEqual(rows[('subcategory', 'Kitchen & dining', '')]['label'], 'No subcategory')
        self.assertEqual(rows[('vendor', '', 'WKTST')]['on_hand'], 4)
        self.assertEqual((rows[('vendor', '', '')]['label'], rows[('vendor', '', '')]['on_hand']), ('No vendor', 1))
        self.assertEqual(rows[('price_point', '', 'u5')]['on_hand'], 3)  # the stale pan and two mugs at $3
        self.assertEqual(rows[('price_point', '', '10-25')]['units_in'], 1)
        self.assertEqual(rows[('price_point', '', '50-100')]['on_hand'], 1)

    def test_the_open_week_matches_the_live_floor_and_weeks_chain(self):
        this = inventory_week.week_of(timezone.localdate())
        rows = self._rows([this])
        live = Item.objects.filter(status='on_shelf').count()
        for dim in ('category', 'subcategory', 'vendor', 'price_point'):
            self.assertEqual(sum(r['on_hand'] for (d, _p, _k), r in rows.items() if d == dim), live, dim)
        # on hand at a week's end = the week before + in - out, for every week.
        weeks = inventory_week.recent_weeks(12, date(2026, 9, 28))
        by_week = {}
        with mock.patch.object(inventory_week, 'bulk_min_units', return_value=2):
            for r in inventory_week.compute(weeks):
                if r['dimension'] == 'category':
                    w = by_week.setdefault(r['week_start'], [0, 0, 0])
                    w[0] += r.get('on_hand', 0)
                    w[1] += r.get('units_in', 0) + r.get('legacy_sold', 0)
                    w[2] += sum(r.get(f, 0) for f in ('units_sold', 'units_scrapped', 'units_lost', 'units_out_other'))
        for ws in sorted(by_week)[1:]:
            before = by_week.get(ws - (weeks[0] - weeks[1]), [0, 0, 0])
            self.assertEqual(before[0] + by_week[ws][1] - by_week[ws][2], by_week[ws][0], ws)

    def test_rebuild_replaces_the_weeks_and_the_first_run_backfills(self):
        with mock.patch.object(inventory_week, 'bulk_min_units', return_value=2):
            n = inventory_week.rebuild([WEEK])
            self.assertEqual(InventoryWeek.objects.filter(week_start=WEEK).count(), n)
            self.assertEqual(inventory_week.rebuild([WEEK]), n)
            self.assertEqual(InventoryWeek.objects.count(), n)
            InventoryWeek.objects.all().delete()
            call_command('rebuild_inventory_weeks', stdout=mock.MagicMock())
        self.assertGreater(InventoryWeek.objects.values('week_start').distinct().count(), 8)  # all 2 years
        row = InventoryWeek.objects.get(week_start=WEEK, dimension='category', key='Kitchen & dining')
        self.assertEqual((row.on_hand, row.units_sold, row.net), (4, 3, D('15.00')))


class SaleFactsTests(TestCase):
    def test_kept_thriftbucks_come_off_per_unit_and_spent_never_do(self):
        snap = {'collected': '12.00', 'kept': '10.00', 'bucks_used': '30.00'}
        self.assertEqual(sale_facts.facts(D('25.00'), snap, 2), {'sold_net': D('20.00'), 'thriftbucks_at_sale': D('6.00')})
        self.assertEqual(sale_facts.facts(D('25.00')), {'sold_net': D('25.00'), 'thriftbucks_at_sale': D('0.00')})
        self.assertEqual(sale_facts.facts(None), sale_facts.CLEARED)

    def test_online_sale_and_its_undo(self):
        from apps.webstore.services.sold_online import record_online_sale, undo_online_sale

        p = Product.objects.create(title='Chair')
        item = Item.objects.create(sku='ITMWKONL', product=p, status='on_shelf', price=D('40.00'))
        record_online_sale(None, sku=item.sku, sold_for='35.00', channel='facebook')
        item.refresh_from_db()
        self.assertEqual((item.sold_for, item.sold_net, item.thriftbucks_at_sale), (D('35.00'), D('35.00'), D('0.00')))
        undo_online_sale(None, item.pk)
        item.refresh_from_db()
        self.assertEqual((item.sold_for, item.sold_net, item.thriftbucks_at_sale), (None, None, None))

    def test_the_backfill_request_fills_only_empty_fields(self):
        from apps.core.models import ApprovalRequest
        from apps.core.services.approval_requests import Progress, get_kind

        p = Product.objects.create(title='Lamp')
        old = Item.objects.create(sku='ITMWKOLD', product=p, status='sold', price=D('9.00'))
        Item.objects.filter(pk=old.pk).update(sold_for=D('7.50'))
        done = Item.objects.create(sku='ITMWKNEW', product=p, status='sold', price=D('9.00'))
        Item.objects.filter(pk=done.pk).update(sold_for=D('9.00'), sold_net=D('4.00'), thriftbucks_at_sale=D('5.00'))
        kind = get_kind('inventory.backfill_sale_facts')
        self.assertEqual(kind.preview({})['counts']['Sold items with no net yet'], 1)
        request = ApprovalRequest.objects.create(kind=kind.kind, title='t', params={})
        self.assertEqual(kind.apply(request, Progress(request)), {'member_items': 0, 'other_items': 1})
        old.refresh_from_db()
        done.refresh_from_db()
        self.assertEqual((old.sold_for, old.sold_net, old.thriftbucks_at_sale), (D('7.50'), D('7.50'), D('0.00')))
        self.assertEqual((done.sold_net, done.thriftbucks_at_sale), (D('4.00'), D('5.00')))
