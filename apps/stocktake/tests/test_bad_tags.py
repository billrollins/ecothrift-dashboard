"""Bad tags (retail_tags_and_social Phase 1): scanned on the floor, traced back, fixed on PR Fix-it."""

from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import Item, ManifestRow, Product, PurchaseOrder, Vendor
from apps.inventory.services import tag_retail
from apps.routines.grading import this_monday
from apps.stocktake.models import BadTag, Issue
from apps.stocktake.services import bad_tags, fixit
from apps.stocktake.services.counting import BadRequest

from .test_counts import Base


class BadTagBase(Base):
    def setUp(self):
        super().setUp()
        tag_retail.clear_cache()
        vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.po = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-77', ordered_date='2026-10-01', status='processing',
        )
        self.row = ManifestRow.objects.create(purchase_order=self.po, row_number=12, quantity=1, title='Toy')
        self.toy = Item.objects.create(
            sku='ITM0000077', product=Product.objects.create(title='Toy truck'), price=Decimal('8.00'),
            retail=Decimal('99.00'), retail_check='passed', status='on_shelf', purchase_order=self.po,
            manifest_row=self.row, checked_in_by=self.other, checked_in_at=timezone.now(),
        )


class RecordTests(BadTagBase):
    def test_record_traces_the_tag_and_opens_a_fixit_row(self):
        bad = bad_tags.record(user=self.user, code='itm0000077', reason='retail_high', where='today',
                              right_retail='29.99')
        self.assertEqual(bad.checked_in_by, self.other)
        self.assertEqual((bad.purchase_order, bad.manifest_row), (self.po, self.row))
        self.assertEqual((bad.tag_price, bad.tag_retail, bad.retail_check), (Decimal('8.00'), Decimal('99.00'), 'passed'))
        issue = bad.issue
        self.assertIsNone(issue.count_id)
        self.assertEqual((issue.kind, issue.action, issue.item), (Issue.KIND_RETAIL_HIGH, Issue.ACTION_PR_CART, self.toy))
        payload = bad_tags.bad_tag_payload(bad)
        self.assertEqual(payload['trace']['order_number'], 'PO-77')
        self.assertEqual(payload['trace']['manifest_row_number'], 12)

    def test_same_open_problem_is_not_recorded_twice(self):
        first = bad_tags.record(user=self.user, code=self.toy.sku, reason='price_high', where='register')
        second = bad_tags.record(user=self.other, code=self.toy.sku, reason='price_high', where='today')
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(BadTag.objects.count(), 1)

    def test_unknown_tag_needs_the_missing_reason_and_a_description(self):
        with self.assertRaises(BadRequest):
            bad_tags.record(user=self.user, code='ITM9999999', reason='price_high', where='today')
        with self.assertRaises(BadRequest):
            bad_tags.record(user=self.user, code='', reason='missing', where='today')
        bad = bad_tags.record(user=self.user, code='', reason='missing', where='today', detail='Blue lamp, aisle 3')
        self.assertIsNone(bad.item)
        self.assertEqual(bad.issue.kind, Issue.KIND_NO_TAG)

    def test_api_post_list_and_summary(self):
        r = self.api(self.user).post('/api/stocktake/bad-tags/', {
            'code': self.toy.sku, 'reason': 'price_low', 'where': 'section_check', 'right_price': '12',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['issue_id'], BadTag.objects.get().issue_id)
        # Staff see tags they checked in or found; the processor sees it too.
        mine = self.api(self.other).get('/api/stocktake/bad-tags/')
        self.assertEqual(len(mine.data['rows']), 1)
        self.assertFalse(mine.data['manager'])
        stranger = self._user('emp3@example.com', 'Employee', 'Lee')
        self.assertEqual(len(self.api(stranger).get('/api/stocktake/bad-tags/').data['rows']), 0)
        self.assertEqual(self.api(self.user).get('/api/stocktake/bad-tags/summary/').status_code, 403)
        summary = self.api(self.mgr).get('/api/stocktake/bad-tags/summary/')
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data['total'], 1)
        self.assertEqual(summary.data['by_processor'][0]['name'], 'Sam')
        self.assertEqual(summary.data['by_truck'][0]['order_number'], 'PO-77')

    def test_lookup(self):
        r = self.api(self.user).get('/api/stocktake/bad-tags/lookup/', {'code': self.toy.sku})
        self.assertTrue(r.data['found'])
        self.assertEqual(r.data['tag_retail'], '99.00')
        self.assertEqual(r.data['checked_in_by'], 'Sam')


class FixitTests(BadTagBase):
    def test_bad_tags_show_on_pr_fixit_with_any_inventory(self):
        bad_tags.record(user=self.user, code=self.toy.sku, reason='wrong_item', where='today')
        rows = self.api(self.user).get('/api/stocktake/issues/').data
        rows = rows['rows'] if isinstance(rows, dict) else rows
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['bad_tag']['reason'], 'wrong_item')
        self.assertTrue(rows[0]['section'].startswith('Bad tag'))

    def test_scan_fixes_retail_when_the_right_retail_was_given(self):
        bad_tags.record(user=self.user, code=self.toy.sku, reason='retail_high', where='today', right_retail='29.99')
        out = fixit.scan_fix(self.toy.sku, user=self.mgr)
        self.assertEqual((out['status'], out['fix']), ('fixed', 'edit'))
        self.toy.refresh_from_db()
        self.assertEqual((self.toy.retail, self.toy.retail_check), (Decimal('29.99'), 'fixed'))
        self.assertEqual(out['label']['retail_text'], 'Retail $29.99')

    def test_edit_can_take_retail_off_the_tag(self):
        bad = bad_tags.record(user=self.user, code=self.toy.sku, reason='retail_high', where='today')
        label = fixit.fix_issue(bad.issue, user=self.mgr, fix='edit', data={'no_retail': True})
        self.toy.refresh_from_db()
        self.assertEqual(self.toy.retail_check, 'no_retail')
        self.assertNotIn('retail_text', label)
        # Fixed: a second report of the same thing is a new record.
        again = bad_tags.record(user=self.user, code=self.toy.sku, reason='retail_high', where='today')
        self.assertNotEqual(again.pk, bad.pk)

    def test_week_summary_counts_rate_context(self):
        bad_tags.record(user=self.user, code=self.toy.sku, reason='price_high', where='register')
        summary = bad_tags.week_summary(this_monday())
        row = summary['by_processor'][0]
        self.assertEqual((row['count'], row['checked_in_this_week']), (1, 1))
        self.assertEqual(summary['open'], 1)
