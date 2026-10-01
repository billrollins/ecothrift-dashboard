from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Item, Product
from apps.stocktake.models import CountScan, InventoryCount
from apps.stocktake.services import counting


def make_item(sku, status='on_shelf', price='10.00', title='Widget'):
    product = Product.objects.create(title=title)
    return Item.objects.create(sku=sku, product=product, price=price, status=status)


class CountTests(TestCase):
    def setUp(self):
        self.user = self._user('emp@example.com', 'Employee')
        self.mgr = self._user('mgr@example.com', 'Manager')
        self.a = make_item('ITM0000001', title='Lamp')
        self.b = make_item('ITM0000002', title='Chair')
        self.c = make_item('ITM0000003', title='Rug')
        self.sold = make_item('ITM0000009', status='sold', title='Old sold')

    @staticmethod
    def _user(email, role):
        u = User.objects.create_user(email=email, first_name='T', last_name=role, password='test-pass-123')
        u.groups.add(Group.objects.get_or_create(name=role)[0])
        return u

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_start_freezes_only_on_shelf_items(self):
        count = counting.start_count(user=self.user)
        self.assertEqual(set(count.expected_item_ids), {self.a.pk, self.b.pk, self.c.pk})

    def test_scan_results_ok_already_unknown_odd(self):
        count = counting.start_count(user=self.user)
        res = counting.record_scans(count, [
            {'client_id': '1', 'code': 'itm0000001', 'seq': 1},
            {'client_id': '2', 'code': 'ITM0000001', 'seq': 2},
            {'client_id': '3', 'code': 'NOPE', 'seq': 3},
            {'client_id': '4', 'code': 'ITM0000009', 'seq': 4},
        ])
        self.assertEqual([r['result'] for r in res], ['ok', 'already', 'unknown', 'odd'])
        self.assertEqual(res[0]['title'], 'Lamp')

    def test_retry_is_idempotent(self):
        count = counting.start_count(user=self.user)
        batch = [{'client_id': 'x1', 'code': 'ITM0000001', 'seq': 1}]
        first = counting.record_scans(count, batch)
        again = counting.record_scans(count, batch)
        self.assertEqual(first, again)
        self.assertEqual(count.scans.count(), 1)

    def test_report_missing_sold_meanwhile_and_totals(self):
        count = counting.start_count(user=self.user)
        counting.record_scans(count, [{'client_id': '1', 'code': 'ITM0000001'}])
        Item.objects.filter(pk=self.c.pk).update(status='sold')  # sold while counting
        rep = counting.report(count)
        self.assertEqual(rep['expected'], 3)
        self.assertEqual(rep['counted'], 1)
        self.assertEqual([r['sku'] for r in rep['missing']], ['ITM0000002'])
        self.assertEqual([r['sku'] for r in rep['sold_meanwhile']], ['ITM0000003'])
        self.assertEqual(rep['missing_price_total'], '10.00')
        self.assertEqual(rep['shrink_pct'], 33.33)

    def test_closed_count_rejects_scans(self):
        count = counting.start_count(user=self.user)
        counting.close_count(count)
        with self.assertRaises(counting.CountClosed):
            counting.record_scans(count, [{'client_id': '1', 'code': 'ITM0000001'}])

    def test_api_flow_and_permissions(self):
        emp = self.api(self.user)
        r = emp.post('/api/stocktake/counts/', {'name': 'Mon'}, format='json')
        self.assertEqual(r.status_code, 201)
        cid = r.data['id']
        r = emp.post(f'/api/stocktake/counts/{cid}/scans/', {'scans': [{'client_id': 'a', 'code': 'ITM0000002'}]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['results'][0]['result'], 'ok')
        self.assertEqual(r.data['summary']['counted'], 1)
        # employees cannot read the shrink report; managers can
        self.assertEqual(emp.get(f'/api/stocktake/counts/{cid}/report/').status_code, 403)
        mgr = self.api(self.mgr)
        rep = mgr.get(f'/api/stocktake/counts/{cid}/report/')
        self.assertEqual(rep.status_code, 200)
        self.assertEqual(rep.data['missing_count'], 2)
        csv_resp = mgr.get(f'/api/stocktake/counts/{cid}/report.csv')
        self.assertEqual(csv_resp.status_code, 200)
        self.assertIn('ITM0000001', csv_resp.content.decode())
        emp.post(f'/api/stocktake/counts/{cid}/close/')
        r = emp.post(f'/api/stocktake/counts/{cid}/scans/', {'scans': [{'client_id': 'b', 'code': 'ITM0000001'}]}, format='json')
        self.assertEqual(r.status_code, 409)

    def test_anonymous_blocked(self):
        self.assertIn(APIClient().get('/api/stocktake/counts/').status_code, (401, 403))
