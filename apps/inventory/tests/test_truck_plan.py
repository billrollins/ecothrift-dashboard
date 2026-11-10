"""Dash Update #81: the money at the top of Processing (Paid, Target, On track, dispute worth) and the Truck Plan."""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, ManifestRow, ProcessingRow, PurchaseOrder, TruckPlan, Vendor
from apps.inventory.services.truck_plan import (
    MIN_RATE_ITEMS,
    add_business_days,
    default_target,
    dispute_worth,
    estimate_left,
    on_track_total,
    pick_rate,
    target_total,
    truck_summary,
    units_left_by_line,
    vs_target,
)


class TargetMathTests(SimpleTestCase):
    def test_target_is_twice_what_we_paid(self):
        self.assertEqual(default_target(Decimal('520.00')), Decimal('1040.00'))
        self.assertEqual(target_total(Decimal('520.00'), None), Decimal('1040.00'))

    def test_a_set_total_wins(self):
        self.assertEqual(target_total(Decimal('520.00'), Decimal('1500')), Decimal('1500.00'))

    def test_unknown_cost_has_no_target(self):
        self.assertIsNone(default_target(None))
        self.assertIsNone(target_total(None, None))
        # A set total still stands on an order with no cost yet.
        self.assertEqual(target_total(None, Decimal('900')), Decimal('900.00'))


class OnTrackMathTests(SimpleTestCase):
    def test_own_price_first_then_retail_times_rate(self):
        rows = [
            {'units_left': 3, 'own_price': Decimal('10.00'), 'unit_retail': Decimal('40.00')},   # 3 x $10
            {'units_left': 2, 'own_price': None, 'unit_retail': Decimal('100.00')},              # 2 x $100 x 50%
            {'units_left': 4, 'own_price': None, 'unit_retail': None},                           # no estimate
            {'units_left': 0, 'own_price': Decimal('99.00'), 'unit_retail': Decimal('99.00')},   # done
        ]
        out = estimate_left(rows, Decimal('0.5'))
        self.assertEqual(out['total'], Decimal('130.00'))
        self.assertEqual((out['units_own_price'], out['units_by_rate'], out['units_no_estimate']), (3, 2, 4))

    def test_units_left_follow_the_queue(self):
        def row(pk, qty, done, status, master=None, price='5.00'):
            return {
                'id': pk, 'row_number': pk, 'collapse_master_id': master, 'queue_status': status, 'quantity': qty,
                'qty_dispositioned': done, 'own_price': Decimal(price), 'unit_retail': Decimal('20.00'),
            }

        rows = [
            row(1, 4, 0, 'pending'),                       # not started: 4 left
            row(2, 3, 2, 'checked_in'),                    # the queue shows it done: nothing left
            row(3, 2, 5, 'partial', price='7.00'),         # first line of a combined group, holds the check-ins
            row(4, 3, 0, 'pending', master=3, price='8.00'),
            row(5, 4, 0, 'pending', master=3, price='9.00'),   # group: 9 units, 5 done, 4 left (the last line's)
            row(6, 1, 1, 'disputed'),
        ]
        left = units_left_by_line(rows)
        self.assertEqual(sum(r['units_left'] for r in left), 8)
        self.assertEqual([(r['units_left'], r['own_price']) for r in left], [(4, Decimal('5.00')), (4, Decimal('9.00'))])
        self.assertEqual(estimate_left(left, None)['total'], Decimal('56.00'))

    def test_no_rate_means_no_guess(self):
        out = estimate_left([{'units_left': 5, 'own_price': None, 'unit_retail': Decimal('20.00')}], None)
        self.assertEqual(out['total'], Decimal('0.00'))
        self.assertEqual(out['units_no_estimate'], 5)

    def test_over_and_under_the_target(self):
        total = on_track_total(Decimal('700.00'), Decimal('450.00'))
        self.assertEqual(total, Decimal('1150.00'))
        self.assertEqual(vs_target(total, Decimal('1040.00')), Decimal('110.00'))    # $110 over
        self.assertEqual(vs_target(total, Decimal('1500.00')), Decimal('-350.00'))   # $350 under
        self.assertIsNone(vs_target(total, None))

    def test_rate_comes_from_the_truck_once_enough_items_are_priced(self):
        rate, basis = pick_rate(
            priced_items=MIN_RATE_ITEMS, priced_sum=Decimal('300'), retail_sum=Decimal('1000'),
            plan_start_pct=Decimal('55'),
        )
        self.assertEqual((rate, basis), (Decimal('0.3'), 'truck'))

    def test_rate_comes_from_the_plan_before_that(self):
        rate, basis = pick_rate(
            priced_items=MIN_RATE_ITEMS - 1, priced_sum=Decimal('300'), retail_sum=Decimal('1000'),
            plan_start_pct=Decimal('55'),
        )
        self.assertEqual((rate, basis), (Decimal('0.55'), 'plan'))

    def test_rate_with_no_plan_uses_what_the_truck_has(self):
        rate, basis = pick_rate(priced_items=2, priced_sum=Decimal('30'), retail_sum=Decimal('100'), plan_start_pct=None)
        self.assertEqual((rate, basis), (Decimal('0.3'), 'truck'))
        self.assertEqual(pick_rate(priced_items=0, priced_sum=Decimal('0'), retail_sum=Decimal('0'), plan_start_pct=None),
                         (None, ''))


class DisputeWorthTests(SimpleTestCase):
    def test_fifty_missing_on_a_hundred_truck(self):
        # Bill's example: 50 missing on a 100 truck = (50 - 5) / 100 x (price + fees).
        worth = dispute_worth(
            disputed_retail=Decimal('50'), truck_retail=Decimal('100'), price=Decimal('300'), fees=Decimal('20'),
        )
        self.assertEqual(worth, Decimal('144.00'))   # 45% of $320

    def test_shipping_is_not_in_it(self):
        # The function has no shipping to add: a truck with $0 fees is worth its share of the price alone.
        worth = dispute_worth(
            disputed_retail=Decimal('50'), truck_retail=Decimal('100'), price=Decimal('300'), fees=None,
        )
        self.assertEqual(worth, Decimal('135.00'))

    def test_never_below_zero(self):
        for disputed in ('0', '3', '5'):   # nothing, under the 5% line, exactly on it
            worth = dispute_worth(
                disputed_retail=Decimal(disputed), truck_retail=Decimal('100'), price=Decimal('300'), fees=Decimal('20'),
            )
            self.assertEqual(worth, Decimal('0.00'))

    def test_unknown_retail_or_price(self):
        self.assertIsNone(dispute_worth(disputed_retail=Decimal('50'), truck_retail=None, price=Decimal('1'), fees=None))
        self.assertIsNone(dispute_worth(disputed_retail=Decimal('50'), truck_retail=Decimal('0'), price=Decimal('1'), fees=None))
        self.assertIsNone(dispute_worth(disputed_retail=Decimal('50'), truck_retail=Decimal('100'), price=None, fees=Decimal('9')))


class DisputeDueTests(SimpleTestCase):
    def test_four_business_days_skip_the_weekend(self):
        # Thursday 2026-11-05 + 4 business days = Wednesday 2026-11-11.
        self.assertEqual(add_business_days(date(2026, 11, 5), 4), date(2026, 11, 11))


class TruckSummaryBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        User = get_user_model()
        self.staff = User.objects.create_user(email='pat@example.com', first_name='Pat', last_name='Proc', password='pw')
        self.staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.owner = User.objects.create_user(email='own@example.com', first_name='Olive', last_name='Owner', password='pw')
        self.owner.is_superuser = True
        self.owner.save()
        self.owner.groups.add(Group.objects.get_or_create(name='Admin')[0])
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)
        # Manifest $1,000: line 1 = 10 x $50, line 2 = 5 x $100. Price $200 + fees $20 + shipping $300 = $520 paid.
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number='PO-PLAN', ordered_date='2026-11-02', delivered_date='2026-11-05',
            purchase_cost=Decimal('200.00'), shipping_cost=Decimal('300.00'), fees=Decimal('20.00'),
            retail_value=Decimal('1000.00'), status='processing',
        )
        self.rows = []
        for n, (qty, retail) in enumerate(((10, '50.00'), (5, '100.00')), start=1):
            mr = ManifestRow.objects.create(
                purchase_order=self.order, row_number=n, quantity=qty, title=f'Line {n}', unit_retail=Decimal(retail),
            )
            pr = ProcessingRow.objects.create(
                purchase_order=self.order, manifest_row=mr, row_number=n, quantity=qty, title=f'Line {n}',
                unit_retail=Decimal(retail), shelf_price=Decimal('5.00'),
            )
            self.rows.append((mr, pr))

    def _check_in(self, idx, qty, price='5.00'):
        _, pr = self.rows[idx]
        r = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id, 'quantity': qty, 'condition': 'good', 'dispatch': 'on_shelf',
                'price': price, 'product_mode': 'new', 'title': pr.title, 'retail_check': 'confirm',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)

    def _summary(self):
        self.order.refresh_from_db()
        return truck_summary(self.order, user=self.staff)

    def _url(self, tail):
        return f'/api/inventory/orders/{self.order.id}/{tail}'


class PaidTargetOnTrackTests(TruckSummaryBase):
    def test_paid_and_the_default_target(self):
        s = self._summary()
        self.assertEqual(s['paid'], {'total': '520.00', 'price': '200.00', 'fees': '20.00', 'shipping': '300.00'})
        self.assertEqual(s['target']['total'], '1040.00')
        self.assertTrue(s['target']['is_default'])

    def test_on_track_before_anything_is_checked_in(self):
        # Every line has its own $5 price: 15 units x $5.
        t = self._summary()['on_track']
        self.assertEqual((t['priced_so_far'], t['estimated_left'], t['total']), ('0.00', '75.00', '75.00'))
        self.assertEqual(t['vs_target'], '-965.00')   # $965 under the $1,040 target
        self.assertEqual(t['units_left'], 15)

    def test_on_track_is_tags_so_far_plus_the_rest(self):
        self._check_in(0, 10, price='12.00')   # line 1 done: 10 tags at $12 = $120
        t = self._summary()['on_track']
        self.assertEqual((t['priced_so_far'], t['priced_items']), ('120.00', 10))
        # Line 2 is not started: 5 x its own $5.
        self.assertEqual((t['estimated_left'], t['units_left']), ('25.00', 5))
        self.assertEqual((t['total'], t['vs_target']), ('145.00', '-895.00'))

    def test_a_line_with_no_price_uses_the_plan_start_point(self):
        ProcessingRow.objects.filter(pk=self.rows[1][1].pk).update(shelf_price=None)
        t = self._summary()['on_track']
        self.assertEqual((t['estimated_left'], t['units_no_estimate'], t['rate_basis']), ('50.00', 5, ''))
        TruckPlan.objects.create(purchase_order=self.order, pricing_start_pct=Decimal('55'))
        t = self._summary()['on_track']
        # 10 x $5 own price + 5 x $100 retail x 55%.
        self.assertEqual((t['estimated_left'], t['units_by_rate'], t['units_no_estimate']), ('325.00', 5, 0))
        self.assertEqual((t['rate_pct'], t['rate_basis']), (55.0, 'plan'))

    def test_scrapped_and_lost_items_are_not_priced(self):
        self._check_in(1, 5, price='40.00')
        ids = list(Item.objects.filter(purchase_order=self.order).order_by('pk').values_list('pk', flat=True))
        Item.objects.filter(pk=ids[0]).update(status='scrapped')
        Item.objects.filter(pk=ids[1]).update(status='lost')
        self.assertEqual(self._summary()['on_track']['priced_so_far'], '120.00')


class DisputesSoFarTests(TruckSummaryBase):
    def test_nothing_disputed_yet(self):
        self._check_in(0, 8)   # 2 of line 1 are not processed yet: not a dispute
        d = self._summary()['disputes']
        self.assertEqual((d['items'], d['retail'], d['worth']), (0, '0.00', '0.00'))
        self.assertEqual((d['truck_retail'], d['threshold_retail']), ('1000.00', '50.00'))
        self.assertFalse(d['over_threshold'])

    def test_marked_items_and_what_they_are_worth(self):
        self._check_in(0, 10)
        self._check_in(1, 5)
        line2 = list(Item.objects.filter(manifest_row=self.rows[1][0]).order_by('pk'))
        Item.objects.filter(pk=line2[0].pk).update(status='lost', dispute_type='undelivered')        # $100
        Item.objects.filter(pk=line2[1].pk).update(status='scrapped', dispute_type='broken')         # $100
        Item.objects.filter(pk=line2[2].pk).update(dispute_type='cosmetic_damage', dispute_pct_loss=50)   # $50
        d = self._summary()['disputes']
        self.assertEqual(d['parts']['not_received'], {'units': 1, 'retail': '100.00'})
        self.assertEqual(d['parts']['broken'], {'units': 1, 'retail': '100.00'})
        self.assertEqual(d['parts']['damaged'], {'units': 1, 'retail': '50.00'})
        self.assertEqual((d['items'], d['retail'], d['retail_pct']), (3, '250.00', 25.0))
        self.assertTrue(d['over_threshold'])
        # ($250 - $50) / $1,000 x ($200 price + $20 fees). The $300 shipping is not in it.
        self.assertEqual((d['price_plus_fees'], d['worth']), ('220.00', '44.00'))

    def test_under_the_five_percent_line_is_worth_nothing(self):
        self._check_in(0, 10)
        it = Item.objects.filter(manifest_row=self.rows[0][0]).first()
        Item.objects.filter(pk=it.pk).update(status='lost', dispute_type='undelivered')   # $50 = exactly 5%
        d = self._summary()['disputes']
        self.assertEqual((d['retail'], d['worth']), ('50.00', '0.00'))
        self.assertFalse(d['over_threshold'])

    def test_a_finished_truck_counts_everything_not_received(self):
        self._check_in(0, 8)
        PurchaseOrder.objects.filter(pk=self.order.pk).update(processing_status='done')
        d = self._summary()['disputes']
        # 2 x $50 and 5 x $100 never arrived.
        self.assertEqual(d['parts']['not_received'], {'units': 7, 'retail': '600.00'})
        self.assertEqual(d['worth'], '121.00')   # ($600 - $50) / $1,000 x $220


class TruckPlanApiTests(TruckSummaryBase):
    def test_no_plan_yet_and_the_default_due_date(self):
        r = self.client.get(self._url('truck-summary/'))
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data['plan'])
        # Delivered Thursday 11-05, due 4 business days later.
        self.assertEqual(r.data['dates']['dispute_due'], '2026-11-11')
        self.assertFalse(r.data['dates']['dispute_due_from_plan'])
        self.assertFalse(r.data['can_set_target'])

    def test_staff_save_the_plan(self):
        r = self.client.put(
            self._url('truck-plan/'),
            {
                'pricing_start_pct': '55', 'watch_for': '  Check every box for the remote. ',
                'known_issues': 'Two pallets came in wet.', 'crew_ids': [self.staff.pk],
                'dispute_due_date': '2026-11-13',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        plan = r.data['plan']
        self.assertEqual(plan['pricing_start_pct'], '55')
        self.assertEqual(plan['watch_for'], 'Check every box for the remote.')
        self.assertEqual(plan['known_issues'], 'Two pallets came in wet.')
        self.assertEqual(plan['crew'], [{'id': self.staff.pk, 'name': 'Pat Proc'}])
        self.assertEqual(plan['updated_by'], 'Pat Proc')
        self.assertEqual(r.data['dates']['dispute_due'], '2026-11-13')
        self.assertTrue(r.data['dates']['dispute_due_from_plan'])
        self.assertIn({'id': self.staff.pk, 'name': 'Pat Proc'}, r.data['staff'])

        # A second save changes only what is sent.
        r = self.client.put(self._url('truck-plan/'), {'dispute_due_date': ''}, format='json')
        self.assertEqual(r.data['plan']['pricing_start_pct'], '55')
        self.assertEqual(r.data['dates']['dispute_due'], '2026-11-11')
        self.assertEqual(TruckPlan.objects.filter(purchase_order=self.order).count(), 1)

    def test_bad_plan_values_are_refused(self):
        for body in ({'pricing_start_pct': 'lots'}, {'pricing_start_pct': '250'}, {'dispute_due_date': 'soon'},
                     {'crew_ids': [999999]}):
            r = self.client.put(self._url('truck-plan/'), body, format='json')
            self.assertEqual(r.status_code, 400, body)
        self.assertFalse(TruckPlan.objects.filter(purchase_order=self.order).exists())

    def test_only_a_superuser_sets_the_target(self):
        r = self.client.post(self._url('truck-plan/target/'), {'total': '1500'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self._summary()['target']['total'], '1040.00')

        self.client.force_authenticate(user=self.owner)
        r = self.client.post(self._url('truck-plan/target/'), {'total': '1,500'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        t = r.data['target']
        self.assertEqual((t['total'], t['default'], t['is_default'], t['set_by']), ('1500.00', '1040.00', False, 'Olive Owner'))
        self.assertIsNotNone(t['set_at'])
        self.assertTrue(r.data['can_set_target'])
        self.assertEqual(r.data['on_track']['vs_target'], '-1425.00')
        # The target never touches what we paid, and it does not make a plan.
        self.order.refresh_from_db()
        self.assertEqual(self.order.total_cost, Decimal('520.00'))
        self.assertIsNone(r.data['plan'])

        r = self.client.post(self._url('truck-plan/target/'), {'total': ''}, format='json')
        self.assertEqual((r.data['target']['total'], r.data['target']['is_default'], r.data['target']['set_by']),
                         ('1040.00', True, ''))

        r = self.client.post(self._url('truck-plan/target/'), {'total': '-5'}, format='json')
        self.assertEqual(r.status_code, 400)
