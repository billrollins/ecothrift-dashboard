from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.supplies.models import SupplyItem, SupplyList, SupplyOrder, SupplyReceipt, SupplyRequest
from apps.supplies.services import spend

IN_MEMORY = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _at(y, m, d, hh=10):
    return timezone.make_aware(datetime(y, m, d, hh), timezone.get_default_timezone())


def _user(email, group=None, superuser=False):
    u = User.objects.create_user(email=email, first_name='A', last_name='B', password='pw-123456')
    if group:
        u.groups.add(Group.objects.get_or_create(name=group)[0])
    if superuser:
        u.is_superuser = True
        u.save()
    return u


def _jpeg():
    buf = BytesIO()
    Image.new('RGB', (40, 30), (20, 120, 40)).save(buf, format='JPEG')
    return SimpleUploadedFile('p.jpg', buf.getvalue(), content_type='image/jpeg')


class Base(TestCase):
    def setUp(self):
        self.staff = _user('staff@example.com', 'Employee')
        self.manager = _user('mgr@example.com', 'Manager')
        self.owner = _user('owner@example.com', superuser=True)
        self.client = APIClient()
        self.sl = SupplyList.objects.create(name='Processing')
        self.order = SupplyOrder.objects.create(week_start=date(2026, 10, 26), built_at=_at(2026, 10, 26, 16))

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def line(self, **kw):
        fields = dict(list_name='Processing', name='Tape', vendor='Amazon', packs=3, price=Decimal('10.00'))
        fields.update(kw)
        return self.order.lines.create(**fields)


class ReceivedTests(Base):
    def test_staff_receive_partial_then_the_rest_with_who_and_when(self):
        ln = self.line(ordered_at=_at(2026, 10, 27), ordered_by=self.owner)
        c = self.as_(self.staff)
        r = c.get('/api/supplies/receive/')
        self.assertEqual([x['id'] for x in r.data['lines']], [ln.pk])
        self.assertNotIn('price', r.data['lines'][0])  # staff see no prices
        r = c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 2}, format='json')
        self.assertEqual((r.status_code, r.data['status'], r.data['received_by']), (200, 'partial', 'A B'))
        r = c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 3}, format='json')
        self.assertEqual(r.data['status'], 'in')
        self.assertEqual(c.get('/api/supplies/receive/').data['lines'], [])  # all in: off the list
        self.assertEqual(list(SupplyReceipt.objects.order_by('at').values_list('change', flat=True)), [2, 1])

    def test_a_correction_is_kept_and_limits_hold(self):
        ln = self.line(ordered_at=_at(2026, 10, 27))
        c = self.as_(self.staff)
        c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 3}, format='json')
        c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 1}, format='json')
        self.assertEqual(SupplyReceipt.objects.first().change, -2)
        self.assertEqual(c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 4}, format='json').status_code, 400)
        self.assertEqual(c.post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': -1}, format='json').status_code, 400)

    def test_only_ordered_lines_can_be_received(self):
        ln = self.line()
        r = self.as_(self.staff).post(f'/api/supplies/lines/{ln.pk}/received/', {'received_qty': 1}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_order_page_shows_what_is_in(self):
        ln = self.line(ordered_at=_at(2026, 10, 27), received_qty=1)
        r = self.as_(self.owner).get('/api/supplies/order/')
        line = r.data['order']['vendors'][0]['lines'][0]
        self.assertEqual((line['id'], line['received_qty']), (ln.pk, 1))
        self.assertEqual(r.data['order']['waiting_count'], 1)


class SpendTests(Base):
    def test_spend_by_vendor_and_list_by_week_and_month(self):
        self.line(ordered_at=_at(2026, 10, 27), packs=3, price=Decimal('10.00'))  # 30 this week
        self.line(ordered_at=_at(2026, 10, 20), packs=1, price=Decimal('5.50'), vendor='Uline', list_name='Front')
        self.line(ordered_at=_at(2026, 10, 27), packs=2, price=None)  # unpriced
        self.line(packs=9, price=Decimal('1.00'))  # never ordered: not spend
        now = _at(2026, 10, 28)
        week = spend.spend('week', now)
        self.assertEqual(week['periods'][-1], '2026-10-26')
        self.assertEqual(week['totals'][-2:], ['5.50', '30.00'])
        self.assertEqual([v['name'] for v in week['vendors']], ['Amazon', 'Uline'])
        self.assertEqual({r['name']: r['total'] for r in week['lists']}, {'Processing': '30.00', 'Front': '5.50'})
        self.assertEqual(week['unpriced'], 1)
        month = spend.spend('month', now)
        self.assertEqual((month['periods'][-1], month['totals'][-1]), ('2026-10-01', '35.50'))
        self.assertEqual(spend.summary(now), {'this_week': '30.00', 'this_month': '35.50'})

    def test_spend_is_the_owners(self):
        self.assertEqual(self.as_(self.manager).get('/api/supplies/spend/').status_code, 403)
        self.assertEqual(self.as_(self.owner).get('/api/supplies/spend/?summary=1').status_code, 200)


@override_settings(STORAGES=IN_MEMORY)
class RequestTests(Base):
    def test_anyone_asks_with_a_photo_and_sees_only_their_own(self):
        c = self.as_(self.staff)
        r = c.post('/api/supplies/requests/', {'name': 'Zip ties', 'list': self.sl.pk, 'photo': _jpeg()}, format='multipart')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data['photo_url'])
        SupplyRequest.objects.create(name='Not mine', requested_by=self.manager)
        r = c.get('/api/supplies/requests/')
        self.assertEqual([x['name'] for x in r.data['requests']], ['Zip ties'])
        self.assertFalse(r.data['can_decide'])
        self.assertEqual(c.post('/api/supplies/requests/', {'name': ' '}, format='json').status_code, 400)
        self.assertEqual(c.post('/api/supplies/requests/', {'name': 'X', 'url': 'nope'}, format='json').status_code, 400)

    def test_approve_puts_it_on_the_list_and_the_requester_sees_it(self):
        req = SupplyRequest.objects.create(name='Zip ties', url='https://www.amazon.com/dp/B0ZIPTIE01', requested_by=self.staff)
        c = self.as_(self.staff)
        self.assertEqual(c.post(f'/api/supplies/requests/{req.pk}/approve/', {'list': self.sl.pk}, format='json').status_code, 403)
        c = self.as_(self.manager)
        r = c.post(f'/api/supplies/requests/{req.pk}/approve/', {'list': self.sl.pk}, format='json')
        self.assertEqual(r.status_code, 400)  # min and max are needed
        r = c.post(f'/api/supplies/requests/{req.pk}/approve/', {
            'list': self.sl.pk, 'min_qty': 2, 'max_qty': 10, 'vendor': 'Amazon', 'pack_size': 100,
        }, format='json')
        self.assertEqual((r.status_code, r.data['status'], r.data['decided_by']), (200, 'approved', 'A B'))
        item = SupplyItem.objects.get(pk=r.data['item'])
        self.assertEqual((item.supply_list, item.min_qty, item.max_qty, item.vendor_item_id), (self.sl, 2, 10, 'B0ZIPTIE01'))
        mine = self.as_(self.staff).get('/api/supplies/lists/').data['my_requests']
        self.assertEqual(mine[0]['status'], 'approved')
        c = self.as_(self.manager)
        self.assertEqual(c.post(f'/api/supplies/requests/{req.pk}/decline/', {'reason': 'x'}, format='json').status_code, 400)

    def test_decline_needs_a_reason(self):
        req = SupplyRequest.objects.create(name='Gold pens', requested_by=self.staff)
        c = self.as_(self.owner)
        self.assertEqual(c.post(f'/api/supplies/requests/{req.pk}/decline/', {'reason': ''}, format='json').status_code, 400)
        r = c.post(f'/api/supplies/requests/{req.pk}/decline/', {'reason': 'We have plenty in the office.'}, format='json')
        self.assertEqual((r.data['status'], r.data['decline_reason']), ('declined', 'We have plenty in the office.'))

    def test_managers_see_the_waiting_count_and_the_owner_page_lists_them(self):
        from apps.core.services import owner_page

        SupplyRequest.objects.create(name='Zip ties', requested_by=self.staff)
        self.assertEqual(self.as_(self.manager).get('/api/supplies/lists/').data['pending_requests'], 1)
        self.assertIsNone(self.as_(self.staff).get('/api/supplies/lists/').data['pending_requests'])
        items = {i['key']: i for i in owner_page.needs_you()['items']}
        self.assertEqual((items['supply_requests']['count'], items['supply_requests']['detail']), (1, 'Zip ties'))
