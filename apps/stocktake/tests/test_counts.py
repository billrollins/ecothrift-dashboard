from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Item, ItemHistory, Product
from apps.stocktake.models import Cart, CountScan, InventoryCount, Issue, Run, Section
from apps.stocktake.services import counting, fixit


def make_item(sku, status='on_shelf', price='10.00', title='Widget'):
    product = Product.objects.create(title=title)
    return Item.objects.create(sku=sku, product=product, price=price, status=status)


class Base(TestCase):
    def setUp(self):
        self.user = self._user('emp@example.com', 'Employee', 'Pat')
        self.other = self._user('emp2@example.com', 'Employee', 'Sam')
        self.mgr = self._user('mgr@example.com', 'Manager', 'Mo')
        self.a = make_item('ITM0000001', title='Lamp')
        self.b = make_item('ITM0000002', title='Chair')
        self.c = make_item('ITM0000003', title='Rug')
        self.sold = make_item('ITM0000009', status='sold', title='Old sold')
        self.front = Section.objects.create(name='Front wall', order=1)
        self.back = Section.objects.create(name='Back wall', order=2)

    @staticmethod
    def _user(email, role, first='T'):
        u = User.objects.create_user(email=email, first_name=first, last_name=role, password='test-pass-123')
        u.groups.add(Group.objects.get_or_create(name=role)[0])
        return u

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    @staticmethod
    def scan(run, *codes, start=1):
        return counting.record_scans(
            run, [{'client_id': f'{run.pk}-{start + i}', 'code': c, 'seq': start + i} for i, c in enumerate(codes)],
        )


class DayAndRunTests(Base):
    def test_first_run_of_the_day_freezes_the_shelf_and_later_runs_share_the_count(self):
        r1 = counting.start_run(user=self.user, section=self.front)
        r2 = counting.start_run(user=self.other, section=self.back)
        self.assertEqual(r1.count_id, r2.count_id)
        self.assertEqual(set(r1.count.expected_item_ids), {self.a.pk, self.b.pk, self.c.pk})
        self.assertEqual(InventoryCount.objects.count(), 1)

    def test_one_open_run_per_person(self):
        r1 = counting.start_run(user=self.user, section=self.front)
        r2 = counting.start_run(user=self.user, section=self.back)
        r1.refresh_from_db()
        self.assertEqual((r1.status, r2.status), ('stopped', 'open'))
        self.assertIsNotNone(r1.stopped_at)

    def test_scan_results_and_the_problems_they_open(self):
        run = counting.start_run(user=self.user, section=self.front)
        res = self.scan(run, 'itm0000001', 'ITM0000001', 'NOPE', 'ITM0000777', 'ITM0000009')
        self.assertEqual([r['result'] for r in res], ['ok', 'already', 'bad_format', 'unknown', 'odd'])
        self.assertEqual(
            [r['issue_kind'] for r in res], ['', 'already_scanned', 'not_sku', 'not_recognized', 'already_sold'],
        )
        self.assertEqual(res[1]['first_seen']['section'], 'Front wall')
        self.assertEqual(run.issues.filter(action='pending').count(), 4)

    def test_retry_is_idempotent(self):
        run = counting.start_run(user=self.user, section=self.front)
        batch = [{'client_id': 'x1', 'code': 'ITM0000001', 'seq': 1}]
        first = counting.record_scans(run, batch)
        again = counting.record_scans(run, batch)
        self.assertEqual(first[0]['id'], again[0]['id'])
        self.assertEqual(run.scans.count(), 1)

    def test_already_scanned_reaches_across_runs_but_not_into_bad_ones(self):
        r1 = counting.start_run(user=self.user, section=self.front)
        self.scan(r1, 'ITM0000001')
        counting.stop_run(r1, outcome='partial')
        r2 = counting.start_run(user=self.other, section=self.back)
        self.assertEqual(self.scan(r2, 'ITM0000001')[0]['result'], 'already')
        counting.update_run(r1, bad=True)
        r3 = counting.start_run(user=self.user, section=self.front)
        # r2's "already" scan still holds the item, so it stays counted once
        self.assertEqual(counting.day_summary(r3.count)['counted'], 1)
        counting.stop_run(r2, outcome='bad')
        self.assertEqual(counting.day_summary(r3.count)['counted'], 0)
        self.assertEqual(self.scan(r3, 'ITM0000001')[0]['result'], 'ok')

    def test_complete_needs_every_problem_answered(self):
        run = counting.start_run(user=self.user, section=self.front)
        res = self.scan(run, 'ITM0000001', 'NOPE')
        with self.assertRaises(counting.PendingIssues):
            counting.stop_run(run, outcome='complete')
        counting.answer_issue(Issue.objects.get(pk=res[1]['issue_id']), user=self.user, action='cleared')
        counting.stop_run(run, outcome='complete', note='left side first')
        run.refresh_from_db()
        self.assertEqual((run.status, run.section_complete, run.note), ('stopped', True, 'left side first'))
        day = counting.day_summary(run.count)
        self.assertEqual((day['sections_done'], day['sections_total']), (1, 2))

    def test_bad_run_is_kept_but_left_out(self):
        run = counting.start_run(user=self.user, section=self.front)
        self.scan(run, 'ITM0000001', 'NOPE')
        counting.stop_run(run, outcome='bad')
        self.assertEqual(run.scans.count(), 2)
        day = counting.day_summary(run.count)
        self.assertEqual((day['counted'], day['scans'], day['issues_pending']), (0, 0, 0))

    def test_remove_and_restore_a_scan(self):
        run = counting.start_run(user=self.user, section=self.front)
        res = self.scan(run, 'ITM0000001', 'NOPE')
        bad = CountScan.objects.get(pk=res[1]['id'])
        counting.remove_scan(bad, user=self.user)
        self.assertEqual(run.issues.filter(action='pending').count(), 0)
        ok = CountScan.objects.get(pk=res[0]['id'])
        counting.remove_scan(ok, user=self.user)
        self.assertEqual(counting.day_summary(run.count)['counted'], 0)
        counting.restore_scan(ok)
        self.assertEqual(counting.day_summary(run.count)['counted'], 1)
        self.assertEqual(run.scans.count(), 2)  # nothing is deleted

    def test_carts_are_named_for_the_person_and_numbered(self):
        run = counting.start_run(user=self.user, section=self.front)
        res = self.scan(run, 'ITM0000001', 'ITM0000002')
        s1, s2 = (CountScan.objects.get(pk=r['id']) for r in res)
        i1 = counting.report_issue(run, user=self.user, kind='wrong_title', action='pr_cart', scan=s1, detail='Desk lamp')
        self.assertEqual(i1.cart.label, 'Pat PR Cart 1')
        counting.new_cart(self.user, 'pr')
        i2 = counting.report_issue(run, user=self.user, kind='price_high', action='pr_cart', scan=s2)
        self.assertEqual(i2.cart.label, 'Pat PR Cart 2')
        i3 = counting.report_issue(
            run, user=self.user, kind='wrong_section', action='relocate', scan=s2, target_section_id=self.back.pk,
        )
        self.assertEqual((i3.cart.label, i3.target_section.name), ('Pat Relocate Cart 1', 'Back wall'))
        i4 = counting.report_issue(run, user=self.user, kind='no_tag', action='pr_cart')
        self.assertIsNone(i4.item)
        with self.assertRaises(counting.BadRequest):
            counting.report_issue(run, user=self.user, kind='wrong_tag', action='pr_cart')  # needs the scan

    def test_report_missing_sold_meanwhile_and_totals(self):
        run = counting.start_run(user=self.user, section=self.front)
        self.scan(run, 'ITM0000001')
        Item.objects.filter(pk=self.c.pk).update(status='sold')  # sold while counting
        rep = counting.report(run.count)
        self.assertEqual((rep['expected'], rep['counted']), (3, 1))
        self.assertEqual([r['sku'] for r in rep['missing']], ['ITM0000002'])
        self.assertEqual([r['sku'] for r in rep['sold_meanwhile']], ['ITM0000003'])
        self.assertEqual(rep['missing_price_total'], '10.00')
        self.assertEqual(rep['shrink_pct'], 33.33)

    def test_search_finds_by_words_and_puts_on_shelf_first(self):
        make_item('ITM0000020', status='sold', title='Brass lamp old')
        make_item('ITM0000021', title='Brass lamp tall')
        rows = counting.search_items('lamp brass')
        self.assertEqual([r['sku'] for r in rows], ['ITM0000021', 'ITM0000020'])
        self.assertEqual(counting.search_items('itm0000003')[0]['title'], 'Rug')
        self.assertEqual(counting.search_items('x'), [])


class FixitTests(Base):
    def setUp(self):
        super().setUp()
        self.run_ = counting.start_run(user=self.user, section=self.front)

    def issue_for(self, code, kind=None, **kw):
        res = self.scan(self.run_, code, start=self.run_.scans.count() + 1)[0]
        if res['issue_id']:
            issue = Issue.objects.get(pk=res['issue_id'])
            return counting.answer_issue(issue, user=self.user, action='pr_cart')
        return counting.report_issue(
            self.run_, user=self.user, kind=kind, action='pr_cart', scan=CountScan.objects.get(pk=res['id']), **kw,
        )

    def test_already_sold_prints_as_a_new_item(self):
        issue = self.issue_for('ITM0000009')
        label = fixit.fix_issue(issue, user=self.mgr, fix='print_as_new', data={})
        issue.refresh_from_db()
        self.assertEqual(issue.new_item.status, 'on_shelf')
        self.assertNotEqual(issue.new_item.sku, 'ITM0000009')
        self.assertEqual(label['qr_data'], issue.new_item.sku)
        self.assertEqual(label['text'], '$10.00')
        self.assertIsNotNone(issue.fixed_at)
        with self.assertRaises(counting.BadRequest):
            fixit.fix_issue(issue, user=self.mgr, fix='reprint', data={})  # already fixed

    def test_edit_title_and_price_then_reprint(self):
        issue = self.issue_for('ITM0000001', kind='wrong_title', detail='Desk lamp')
        label = fixit.fix_issue(issue, user=self.mgr, fix='edit', data={'title': 'Desk lamp', 'price': '7.5'})
        self.a.refresh_from_db()
        self.assertEqual((self.a.product.title, str(self.a.price)), ('Desk lamp', '7.50'))
        self.assertEqual((label['product_title'], label['text']), ('Desk lamp', '$7.50'))
        self.assertTrue(ItemHistory.objects.filter(item=self.a, event_type='price_change', new_value='7.50').exists())

    def test_title_edit_does_not_rename_a_shared_product(self):
        twin = Item.objects.create(sku='ITM0000050', product=self.a.product, price='10.00', status='on_shelf')
        issue = self.issue_for('ITM0000001', kind='wrong_title')
        fixit.fix_issue(issue, user=self.mgr, fix='edit', data={'title': 'Desk lamp'})
        self.a.refresh_from_db()
        twin.refresh_from_db()
        self.assertEqual((self.a.product.title, twin.product.title), ('Desk lamp', 'Lamp'))

    def test_no_tag_use_an_item_counts_it(self):
        issue = counting.report_issue(self.run_, user=self.user, kind='no_tag', action='pr_cart')
        label = fixit.fix_issue(issue, user=self.mgr, fix='use_item', data={'item_id': self.b.pk})
        self.assertEqual(label['qr_data'], 'ITM0000002')
        self.assertIn(self.b.pk, counting.counted_ids(self.run_.count))

    def test_no_tag_quick_add_makes_an_item(self):
        issue = counting.report_issue(self.run_, user=self.user, kind='no_tag', action='pr_cart')
        label = fixit.fix_issue(issue, user=self.mgr, fix='quick_add', data={'title': 'Blue vase', 'price': '4'})
        issue.refresh_from_db()
        self.assertEqual((issue.new_item.product.title, issue.new_item.status, issue.new_item.source), ('Blue vase', 'on_shelf', 'misc'))
        self.assertEqual(label['text'], '$4.00')
        with self.assertRaises(counting.BadRequest):
            fixit.fix_issue(
                counting.report_issue(self.run_, user=self.user, kind='no_tag', action='pr_cart'),
                user=self.mgr, fix='quick_add', data={'title': '', 'price': '4'},
            )

    def test_put_on_shelf_for_an_item_the_system_lost(self):
        lost = make_item('ITM0000060', status='lost', title='Mirror')
        issue = self.issue_for('ITM0000060')
        self.assertEqual(issue.kind, 'not_on_shelf')
        fixit.fix_issue(issue, user=self.mgr, fix='put_on_shelf', data={})
        lost.refresh_from_db()
        self.assertEqual(lost.status, 'on_shelf')
        self.assertTrue(ItemHistory.objects.filter(item=lost, event_type='found').exists())


class ApiTests(Base):
    def test_flow_from_the_phone(self):
        emp = self.api(self.user)
        boot = emp.get('/api/stocktake/today/').data
        self.assertIsNone(boot['day'])
        self.assertEqual([s['name'] for s in boot['sections']], ['Front wall', 'Back wall'])
        r = emp.post('/api/stocktake/runs/', {'section_id': self.front.pk}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        rid = r.data['run']['id']
        r = emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [
            {'client_id': 'a', 'code': 'ITM0000002', 'seq': 1}, {'client_id': 'b', 'code': '0123456789', 'seq': 2},
        ]}, format='json')
        self.assertEqual([x['result'] for x in r.data['results']], ['ok', 'bad_format'])
        self.assertEqual((r.data['run']['scans'], r.data['run']['issues_pending'], r.data['day']['counted']), (2, 1, 1))
        scan_id, issue_id = r.data['results'][0]['id'], r.data['results'][1]['issue_id']
        # the unanswered problem blocks "complete", and comes back after a reload
        self.assertEqual(emp.post(f'/api/stocktake/runs/{rid}/stop/', {'outcome': 'complete'}, format='json').status_code, 409)
        self.assertEqual([p['id'] for p in emp.get('/api/stocktake/today/').data['pending']], [issue_id])
        r = emp.patch(f'/api/stocktake/issues/{issue_id}/', {'action': 'pr_cart'}, format='json')
        self.assertEqual((r.status_code, r.data['cart']), (200, 'Pat PR Cart 1'))
        # report a problem on the good scan
        r = emp.post('/api/stocktake/issues/', {
            'run_id': rid, 'scan_id': scan_id, 'kind': 'price_high', 'action': 'left', 'detail': 'should be $5',
        }, format='json')
        self.assertEqual((r.status_code, r.data['cart']), (201, ''))
        # someone else cannot scan into, or undo in, this run
        other = self.api(self.other)
        self.assertEqual(other.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'z', 'code': 'X'}]}, format='json').status_code, 403)
        self.assertEqual(other.post(f'/api/stocktake/scans/{scan_id}/remove/').status_code, 403)
        self.assertTrue(emp.post(f'/api/stocktake/scans/{scan_id}/remove/').data['removed'])
        self.assertFalse(emp.post(f'/api/stocktake/scans/{scan_id}/restore/').data['removed'])
        r = emp.post(f'/api/stocktake/runs/{rid}/stop/', {'outcome': 'complete', 'note': 'done'}, format='json')
        self.assertEqual((r.status_code, r.data['run']['section_complete']), (200, True))
        self.assertEqual(emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'q', 'code': 'X'}]}, format='json').status_code, 409)
        self.assertTrue(emp.get('/api/stocktake/today/').data['sections'][0]['complete'])

    def test_overview_report_and_fixit_permissions(self):
        emp, mgr = self.api(self.user), self.api(self.mgr)
        rid = emp.post('/api/stocktake/runs/', {'section_id': self.front.pk}, format='json').data['run']['id']
        res = emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'a', 'code': 'ITM0000009', 'seq': 1}]}, format='json').data
        emp.patch(f"/api/stocktake/issues/{res['results'][0]['issue_id']}/", {'action': 'pr_cart'}, format='json')
        cid = res['day']['id']
        for url in ('/api/stocktake/counts/', f'/api/stocktake/counts/{cid}/', f'/api/stocktake/counts/{cid}/report/'):
            self.assertEqual(emp.get(url).status_code, 403, url)
            self.assertEqual(mgr.get(url).status_code, 200, url)
        detail = mgr.get(f'/api/stocktake/counts/{cid}/').data
        self.assertEqual(detail['sections'][0]['runs'][0]['user'], 'Pat')
        self.assertEqual(detail['tally'][0]['kind'], 'already_sold')
        self.assertIn('ITM0000001', mgr.get(f'/api/stocktake/counts/{cid}/report.csv').content.decode())
        # the fix-it list and a fix
        rows = emp.get('/api/stocktake/issues/').data
        self.assertEqual((len(rows), rows[0]['cart'], rows[0]['label']['qr_data']), (1, 'Pat PR Cart 1', 'ITM0000009'))
        r = emp.post(f"/api/stocktake/issues/{rows[0]['id']}/fix/", {'fix': 'print_as_new'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['label']['qr_data'], r.data['issue']['new_item']['sku'])
        self.assertEqual(emp.get('/api/stocktake/issues/').data, [])
        self.assertEqual(len(emp.get('/api/stocktake/issues/?show=fixed').data), 1)
        # a manager marks the run bad afterwards
        emp.post(f'/api/stocktake/runs/{rid}/stop/', {'outcome': 'partial'}, format='json')
        self.assertEqual(mgr.patch(f'/api/stocktake/runs/{rid}/', {'bad': True}, format='json').data['status'], 'bad')
        self.assertEqual(Run.objects.get(pk=rid).scans.count(), 1)

    def test_sections_are_the_super_users(self):
        mgr = self.api(self.mgr)
        self.assertEqual(mgr.post('/api/stocktake/sections/', {'name': 'Toys'}, format='json').status_code, 403)
        boss = self._user('boss@example.com', 'Admin', 'Bill')
        boss.is_superuser = True
        boss.save()
        su = self.api(boss)
        r = su.post('/api/stocktake/sections/', {'name': 'Toys'}, format='json')
        self.assertEqual((r.status_code, r.data['order']), (201, 3))
        self.assertEqual(su.post('/api/stocktake/sections/', {'name': 'toys'}, format='json').status_code, 409)
        self.assertFalse(su.patch(f"/api/stocktake/sections/{r.data['id']}/", {'is_active': False}, format='json').data['is_active'])
        self.assertEqual(len(mgr.get('/api/stocktake/today/').data['sections']), 2)

    def test_section_states_and_the_count_from_last_time(self):
        import datetime

        from django.utils import timezone

        # an earlier day: Front wall was completed with two items in it
        old = counting.start_run(user=self.user, section=self.front)
        self.scan(old, 'ITM0000001', 'ITM0000002', 'ITM0000009')
        for issue in old.issues.all():
            counting.answer_issue(issue, user=self.user, action='left')
        counting.stop_run(old, outcome='complete')
        InventoryCount.objects.filter(pk=old.count_id).update(day=timezone.localdate() - datetime.timedelta(days=7))
        # today: nothing started yet, but Front wall knows what it held last time
        emp = self.api(self.user)
        front, back = emp.get('/api/stocktake/today/').data['sections']
        self.assertEqual(
            (front['state'], front['expected'], back['state'], back['expected']), ('not_started', 2, 'not_started', None),
        )
        rid = emp.post('/api/stocktake/runs/', {'section_id': self.front.pk}, format='json').data['run']['id']
        emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'a', 'code': 'ITM0000003', 'seq': 1}]}, format='json')
        boot = emp.get('/api/stocktake/today/').data
        self.assertEqual((boot['sections'][0]['state'], boot['sections'][0]['counted']), ('in_progress', 1))
        day = boot['day']
        self.assertEqual((day['sections_done'], day['sections_in_progress'], day['sections_total']), (0, 1, 2))
        emp.post(f'/api/stocktake/runs/{rid}/stop/', {'outcome': 'complete'}, format='json')
        detail = self.api(self.mgr).get(f"/api/stocktake/counts/{day['id']}/").data
        self.assertEqual(
            [(s['state'], s['counted'], s['expected']) for s in detail['sections']],
            [('done', 1, 2), ('not_started', 0, None)],
        )

    def test_only_the_super_user_deletes_a_session_or_a_day(self):
        emp, mgr = self.api(self.user), self.api(self.mgr)
        r = emp.post('/api/stocktake/runs/', {'section_id': self.front.pk}, format='json').data
        rid, cid = r['run']['id'], r['day']['id']
        emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'a', 'code': 'NOPE', 'seq': 1}]}, format='json')
        self.assertEqual(mgr.delete(f'/api/stocktake/runs/{rid}/').status_code, 403)
        self.assertEqual(mgr.delete(f'/api/stocktake/counts/{cid}/').status_code, 403)
        boss = self._user('boss@example.com', 'Admin', 'Bill')
        boss.is_superuser = True
        boss.save()
        su = self.api(boss)
        self.assertEqual(su.delete(f'/api/stocktake/runs/{rid}/').status_code, 204)
        self.assertEqual((Run.objects.count(), CountScan.objects.count(), Issue.objects.count()), (0, 0, 0))
        # the phone's next batch is told the run is gone
        gone = emp.post(f'/api/stocktake/runs/{rid}/scans/', {'scans': [{'client_id': 'b', 'code': 'X'}]}, format='json')
        self.assertEqual(gone.status_code, 404)
        self.assertEqual(su.delete(f'/api/stocktake/counts/{cid}/').status_code, 204)
        self.assertEqual(InventoryCount.objects.count(), 0)

    def test_search_and_anonymous(self):
        self.assertEqual(self.api(self.user).get('/api/stocktake/search/?q=chair').data[0]['sku'], 'ITM0000002')
        self.assertIn(APIClient().get('/api/stocktake/today/').status_code, (401, 403))
        self.assertEqual(Cart.objects.count(), 0)
