"""Floor issues (Dash Update #84): one report from the retail floor, item problems and tag problems alike."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import FloorIssue, Item, ItemHistory, ProcessingReentry, Product
from apps.inventory.services import floor_issues, reentry
from apps.stocktake.models import BadTag, Issue
from apps.stocktake.services import bad_tags, fixit

PIXEL = (
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)


# In-memory storage, so a test photo never lands in the real bucket.
_TEST_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def make_item(sku, status='on_shelf', title='Lamp'):
    return Item.objects.create(sku=sku, product=Product.objects.create(title=title), price=Decimal('10.00'), status=status)


@override_settings(STORAGES=_TEST_STORAGES)
class Base(TestCase):
    def setUp(self):
        self.user = self._user('floor@example.com', 'Pat')
        self.proc = self._user('proc@example.com', 'Sam')
        self.lamp = make_item('ITM0000101')
        self.sold = make_item('ITM0000102', status='sold', title='Sold chair')

    @staticmethod
    def _user(email, first):
        u = User.objects.create_user(email=email, first_name=first, last_name='Employee', password='test-pass-123')
        u.groups.add(Group.objects.get_or_create(name='Employee')[0])
        return u

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c


class ReportTests(Base):
    def test_a_report_leaves_the_item_status_alone(self):
        # D20: 'processing' reads as never received on the item's pallet and truck.
        out = floor_issues.report(user=self.user, code='itm0000101', reason='broken', note='Cracked base')
        self.assertFalse(out['already'])
        self.assertIsNone(out['bad_tag'])
        row = out['floor_issue']
        self.assertEqual((row['reason_label'], row['about'], row['note']), ('Broken or damaged', 'item', 'Cracked base'))
        self.assertEqual((row['reported_by'], row['status_before'], row['where_label']), ('Pat', 'on_shelf', 'Floor'))
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')
        event = ItemHistory.objects.get(item=self.lamp)
        self.assertEqual((event.event_type, event.new_value), ('note', 'Broken or damaged'))
        self.assertIn('Broken or damaged. Cracked base', event.note)

    def test_second_report_of_a_waiting_item_returns_the_first(self):
        first = floor_issues.report(user=self.user, code=self.lamp.sku, reason='dirty')
        second = floor_issues.report(user=self.proc, code=self.lamp.sku, reason='missing_parts')
        self.assertTrue(second['already'])
        self.assertEqual(first['floor_issue']['id'], second['floor_issue']['id'])
        self.assertEqual(FloorIssue.objects.count(), 1)

    def test_what_a_report_needs(self):
        for kwargs, words in (
            ({'code': '', 'reason': 'broken'}, 'Scan the tag'),
            ({'code': 'ITM9999999', 'reason': 'broken'}, 'No item has this tag'),
            ({'code': self.lamp.sku, 'reason': 'nope'}, 'Pick what is wrong'),
            ({'code': self.lamp.sku, 'reason': 'other'}, 'Say what is wrong'),
            ({'code': self.sold.sku, 'reason': 'broken'}, 'was sold'),
            ({'code': self.lamp.sku, 'reason': 'broken', 'where': 'moon'}, 'Unknown place'),
        ):
            with self.assertRaises(floor_issues.BadRequest) as ctx:
                floor_issues.report(user=self.user, **kwargs)
            self.assertIn(words, str(ctx.exception))
        self.assertEqual(FloorIssue.objects.count(), 0)

    def test_item_not_on_the_shelf_keeps_its_status(self):
        lost = make_item('ITM0000103', status='lost')
        floor_issues.report(user=self.user, code=lost.sku, reason='not_working')
        lost.refresh_from_db()
        self.assertEqual(lost.status, 'lost')
        self.assertEqual(FloorIssue.objects.get(item=lost).status_before, 'lost')

    def test_photo_is_kept(self):
        out = floor_issues.report(user=self.user, code=self.lamp.sku, reason='broken', photo=PIXEL)
        issue = FloorIssue.objects.get()
        self.assertIsNotNone(issue.photo)
        self.assertEqual(out['floor_issue']['photo_url'], f'/api/inventory/floor-issues/{issue.pk}/photo/')


class TagProblemTests(Base):
    def test_tag_problem_is_a_bad_tag_and_a_floor_issue(self):
        out = floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_high', where='register',
                                  note='Way over', right_price='6')
        bad = BadTag.objects.get()
        issue = FloorIssue.objects.get()
        self.assertEqual((issue.bad_tag, issue.reason, issue.found_where), (bad, 'price_high', 'register'))
        self.assertEqual((out['bad_tag']['id'], out['floor_issue']['id']), (bad.pk, issue.pk))
        self.assertEqual((out['floor_issue']['about'], out['floor_issue']['reason_label']), ('tag', 'Price too high'))
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')

    def test_the_old_bad_tag_report_lands_on_floor_issues_too(self):
        bad = bad_tags.record(user=self.user, code=self.lamp.sku, reason='wrong_item', where='today')
        self.assertEqual(FloorIssue.objects.get().bad_tag, bad)

    def test_tag_with_no_item_or_a_sold_item_stays_on_pr_fixit(self):
        out = floor_issues.report(user=self.user, code='', reason='missing', note='Blue lamp, aisle 3')
        self.assertIsNone(out['floor_issue'])
        self.assertIsNone(out['bad_tag']['item'])
        bad_tags.record(user=self.user, code=self.sold.sku, reason='wrong_item', where='today')
        self.assertEqual(FloorIssue.objects.count(), 0)
        self.assertEqual(Issue.objects.filter(action=Issue.ACTION_PR_CART, fixed_at__isnull=True).count(), 2)

    def test_closing_the_floor_issue_fixes_the_bad_tag(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_low')
        issue = FloorIssue.objects.get()
        floor_issues.close(issue, user=self.proc, outcome='Price again')
        row = BadTag.objects.get().issue
        self.assertIsNotNone(row.fixed_at)
        self.assertEqual((row.fixed_by, row.fix, row.fix_note), (self.proc, 'floor', 'Floor issues: Price again'))
        self.assertEqual(bad_tags.bad_tag_payload(bad_tags.bad_tags_qs().get())['fixed_by'], 'Sam')

    def test_pr_fixit_fixing_the_tag_closes_the_floor_issue_and_reshelves(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_high', right_price='6')
        result = fixit.scan_fix(self.lamp.sku, user=self.proc)
        self.assertEqual((result['status'], result['fix']), ('fixed', 'edit'))
        issue = FloorIssue.objects.get()
        self.assertEqual((issue.closed_by, issue.outcome), (self.proc, 'Fixed on PR Fix-it'))
        self.lamp.refresh_from_db()
        self.assertEqual((self.lamp.status, self.lamp.price), ('on_shelf', Decimal('6.00')))


class SharedListTests(Base):
    """A report is a row on the list Returns and Floor issues share; the four actions there finish it."""

    def test_report_opens_a_floor_row_with_the_why(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='broken', note='Cracked base')
        issue = FloorIssue.objects.get()
        row = issue.reentry
        self.assertEqual((row.source, row.source_ref, row.reason, row.reported_by),
                         ('floor', issue.pk, 'Broken or damaged: Cracked base', self.user))
        listed = reentry.rows('floor')
        self.assertEqual([r['id'] for r in listed['results']], [row.pk])
        self.assertEqual(listed['waiting']['floor'], 1)
        self.assertEqual(listed['results'][0]['item']['status'], 'on_shelf')

    def test_a_tag_problem_says_the_right_price_on_the_row(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_high', right_price='6', note='Way over')
        self.assertEqual(ProcessingReentry.objects.get().reason, 'Price too high: should be $6.00; Way over')

    def test_back_to_shelf_closes_the_report_and_reshelves(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='dirty')
        row = ProcessingReentry.objects.get()
        reentry.back_to_shelf(row.pk, self.proc)
        issue = FloorIssue.objects.get()
        self.assertEqual((issue.closed_by, issue.outcome), (self.proc, 'Back to shelf as is'))
        self.assertIsNotNone(issue.closed_at)
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'on_shelf')
        self.assertIsNone(floor_issues.open_issue_for(self.lamp))
        # It can be reported again later: a new report, a new row.
        again = floor_issues.report(user=self.user, code=self.lamp.sku, reason='broken')
        self.assertFalse(again['already'])
        self.assertEqual(ProcessingReentry.objects.count(), 2)

    def test_price_again_on_a_tag_problem_fixes_the_bad_tag(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_high', right_price='6')
        reentry.price_again(ProcessingReentry.objects.get().pk, '6', self.proc)
        fixit_row = BadTag.objects.get().issue
        self.assertEqual((fixit_row.fixed_by, fixit_row.fix, fixit_row.fix_note),
                         (self.proc, 'floor', 'Floor issues: Priced again'))
        self.lamp.refresh_from_db()
        self.assertEqual((self.lamp.status, self.lamp.price), ('on_shelf', Decimal('6.00')))

    def test_scrap_closes_the_report(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='broken')
        reentry.scrap(ProcessingReentry.objects.get().pk, 'Broken', self.proc)
        self.assertEqual(FloorIssue.objects.get().outcome, 'Scrapped')
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.status, 'scrapped')

    def test_pr_fixit_fixing_the_tag_takes_the_row_off_the_list(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='price_high', right_price='6')
        fixit.scan_fix(self.lamp.sku, user=self.proc)
        row = ProcessingReentry.objects.get()
        self.assertEqual((row.outcome, row.outcome_note, row.decided_by), ('handled', 'Fixed on PR Fix-it.', self.proc))
        self.assertEqual(FloorIssue.objects.get().outcome, 'Fixed on PR Fix-it')

    def test_an_item_already_waiting_keeps_its_row(self):
        row = reentry.report(self.lamp, 'floor', reason='On the cart', user=self.proc)
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='missing_parts')
        row.refresh_from_db()
        self.assertEqual(FloorIssue.objects.get().reentry, row)
        self.assertEqual(row.reason, 'On the cart; Missing parts')
        self.assertEqual(ProcessingReentry.objects.count(), 1)


class ApiTests(Base):
    def test_the_waiting_reports_for_the_page(self):
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='broken', photo=PIXEL)
        r = self.api(self.proc).get('/api/inventory/floor-issues/')
        self.assertEqual(r.status_code, 200)
        issue = FloorIssue.objects.get()
        self.assertEqual([(x['reentry_id'], x['photo_url']) for x in r.data['results']],
                         [(issue.reentry_id, f'/api/inventory/floor-issues/{issue.pk}/photo/')])
        reentry.back_to_shelf(issue.reentry_id, self.proc)
        self.assertEqual(self.api(self.proc).get('/api/inventory/floor-issues/').data['results'], [])

    def test_lookup_says_what_it_is_and_whether_it_waits(self):
        r = self.api(self.user).get('/api/inventory/floor-issues/lookup/', {'code': self.lamp.sku})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['found'])
        self.assertIsNone(r.data['floor_issue'])
        self.assertEqual([x['key'] for x in r.data['reasons'] if x['about'] == 'item'],
                         ['broken', 'missing_parts', 'not_working', 'dirty', 'other'])
        self.assertEqual(len([x for x in r.data['reasons'] if x['about'] == 'tag']), 5)
        floor_issues.report(user=self.user, code=self.lamp.sku, reason='dirty')
        again = self.api(self.user).get('/api/inventory/floor-issues/lookup/', {'code': self.lamp.sku})
        self.assertEqual(again.data['floor_issue']['reason_label'], 'Dirty')

    def test_report_and_photo(self):
        api = self.api(self.user)
        r = api.post('/api/inventory/floor-issues/', {
            'code': self.lamp.sku, 'reason': 'missing_parts', 'note': 'No shade', 'photo': PIXEL,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['floor_issue']['item']['status'], 'on_shelf')
        again = api.post('/api/inventory/floor-issues/', {'code': self.lamp.sku, 'reason': 'dirty'}, format='json')
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.data['already'])
        photo = api.get(r.data['floor_issue']['photo_url'])
        self.assertEqual(photo.status_code, 200)
        bad = api.post('/api/inventory/floor-issues/', {'code': self.lamp.sku, 'reason': ''}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(APIClient().get('/api/inventory/floor-issues/lookup/').status_code, 401)

    def test_no_dashes_in_the_words_staff_read(self):
        words = [r['label'] for r in floor_issues.reasons()] + [r['label_es'] for r in floor_issues.reasons()]
        self.assertFalse([w for w in words if '\u2014' in w or '\u2013' in w])
