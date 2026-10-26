from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.supplies.models import SupplyCount, SupplyItem, SupplyList, SupplyOrder
from apps.supplies.services import csv_import, orders, schedule
from apps.supplies.services.rules import order_packs


def _at(y, m, d, hh, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), timezone.get_default_timezone())


def _user(email, group=None, superuser=False):
    u = User.objects.create_user(email=email, first_name='A', last_name='B', password='pw-123456')
    if group:
        u.groups.add(Group.objects.get_or_create(name=group)[0])
    if superuser:
        u.is_superuser = True
        u.save()
    return u


class OrderRuleTests(SimpleTestCase):
    def test_at_or_under_min_orders_up_to_max_in_whole_packs(self):
        self.assertEqual(order_packs(3, 5, 20, 12)[0], 2)  # needs 17, packs of 12 → 2
        self.assertEqual(order_packs(5, 5, 20, 1)[0], 15)  # at min counts as under
        self.assertEqual(order_packs(0, 0, 10, 4)[0], 3)  # 10 / 4 → 3 packs

    def test_above_min_orders_nothing_and_says_why(self):
        packs, why = order_packs(6, 5, 20, 12)
        self.assertEqual(packs, 0)
        self.assertIn('above min 5', why)

    def test_reason_names_the_numbers(self):
        _, why = order_packs(3, 5, 20, 12, 'roll')
        self.assertIn('17 roll', why)
        self.assertIn('2 packs of 12', why)

    def test_max_already_met(self):
        self.assertEqual(order_packs(0, 0, 0, 1)[0], 0)


class AmazonCartTests(SimpleTestCase):
    def test_cart_url_has_every_asin_and_quantity(self):
        url = orders.amazon_cart_url([('B000AAAAAA', 2), ('b000bbbbbb', 1), ('bad', 3), ('B000CCCCCC', 0)])
        parsed = urlparse(url)
        self.assertEqual(f'{parsed.scheme}://{parsed.netloc}{parsed.path}', 'https://www.amazon.com/gp/aws/cart/add.html')
        q = parse_qs(parsed.query)
        self.assertEqual(q['ASIN.1'], ['B000AAAAAA'])
        self.assertEqual(q['Quantity.1'], ['2'])
        self.assertEqual(q['ASIN.2'], ['B000BBBBBB'])
        self.assertNotIn('ASIN.3', q)

    def test_no_asins_no_url(self):
        self.assertEqual(orders.amazon_cart_url([('', 1)]), '')

    def test_asin_from_links(self):
        self.assertEqual(orders.asin_from_url('https://www.amazon.com/Thermal-Paper/dp/B07XYZ1234/ref=sr_1_3?k=x'), 'B07XYZ1234')
        self.assertEqual(orders.asin_from_url('https://www.amazon.com/gp/product/B07XYZ1234'), 'B07XYZ1234')
        self.assertEqual(orders.asin_from_url('https://www.uline.com/Product/S-1234'), '')
        self.assertTrue(orders.is_amazon('', 'https://www.amazon.com/dp/B07XYZ1234'))
        self.assertFalse(orders.is_amazon('Uline', 'https://www.uline.com/x'))


class DeadlineTests(TestCase):
    # 2026-10-26 is a Monday.
    def test_default_is_monday_3pm_store_time(self):
        self.assertEqual(schedule.deadline(date(2026, 10, 26)), _at(2026, 10, 26, 15))

    def test_count_before_the_deadline_is_this_week_after_is_next(self):
        self.assertEqual(schedule.current_cycle(_at(2026, 10, 26, 14, 59)), date(2026, 10, 26))
        self.assertEqual(schedule.current_cycle(_at(2026, 10, 26, 15, 1)), date(2026, 11, 2))
        self.assertEqual(schedule.current_cycle(_at(2026, 10, 30, 9)), date(2026, 11, 2))
        self.assertEqual(schedule.last_closed_cycle(_at(2026, 10, 26, 14)), date(2026, 10, 19))
        self.assertEqual(schedule.last_closed_cycle(_at(2026, 10, 27, 9)), date(2026, 10, 26))

    def test_settings_move_the_deadline(self):
        AppSetting.objects.create(key='supplies.count_weekday', value=2)
        AppSetting.objects.create(key='supplies.count_due_time', value='09:30')
        self.assertEqual(schedule.deadline(date(2026, 10, 26)), _at(2026, 10, 28, 9, 30))
        AppSetting.objects.filter(key='supplies.count_due_time').update(value='nonsense')
        self.assertEqual(schedule.deadline(date(2026, 10, 26)), _at(2026, 10, 28, 15))


class CsvImportTests(TestCase):
    def setUp(self):
        self.sl = SupplyList.objects.create(name='Front')

    def test_template_round_trips(self):
        result = csv_import.import_csv(self.sl, csv_import.template_csv())
        self.assertEqual(result, {'added': 1, 'updated': 0, 'errors': []})
        item = self.sl.items.get()
        self.assertEqual((item.pack_size, item.min_qty, item.max_qty, item.price), (50, 10, 60, Decimal('39.99')))
        self.assertEqual(item.vendor_item_id, 'B000000000')

    def test_same_name_updates_and_asin_comes_from_the_link(self):
        csv_import.import_csv(self.sl, 'name,max\nBags,5\n')
        text = 'Name,Vendor,URL,Max,Price\nbags,Amazon,https://www.amazon.com/x/dp/B0ABCDEFGH,40,$12.50\n'
        result = csv_import.import_csv(self.sl, text)
        self.assertEqual((result['added'], result['updated']), (0, 1))
        item = self.sl.items.get()
        self.assertEqual((item.max_qty, item.vendor_item_id, item.price), (40, 'B0ABCDEFGH', Decimal('12.50')))

    def test_one_bad_row_saves_nothing(self):
        text = 'name,pack_size,min,max,url\nGood,1,1,2,\n,1,1,2,\nBad pack,0,1,2,\nLow max,1,5,2,\nLink,1,1,2,notaurl\n'
        result = csv_import.import_csv(self.sl, text)
        self.assertEqual([e['row'] for e in result['errors']], [3, 4, 5, 6])
        self.assertFalse(self.sl.items.exists())

    def test_no_name_column(self):
        self.assertEqual(csv_import.import_csv(self.sl, 'item,qty\nx,1\n')['errors'][0]['row'], 1)


class ApiTests(TestCase):
    def setUp(self):
        self.staff = _user('staff@example.com', 'Employee')
        self.manager = _user('mgr@example.com', 'Manager')
        self.owner = _user('owner@example.com', superuser=True)
        self.client = APIClient()
        self.sl = SupplyList.objects.create(name='Processing')
        self.a = SupplyItem.objects.create(supply_list=self.sl, name='Tape', vendor='Amazon', vendor_item_id='B0TAPE0001',
                                           url='https://www.amazon.com/dp/B0TAPE0001', pack_size=6, min_qty=4,
                                           max_qty=12, price=Decimal('18.00'), unit='roll')
        self.b = SupplyItem.objects.create(supply_list=self.sl, name='Labels', vendor='Uline', pack_size=1, min_qty=2,
                                           max_qty=5, price=Decimal('30.00'), url='https://www.uline.com/labels')

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def test_staff_see_lists_but_cannot_edit(self):
        r = self.as_(self.staff).get('/api/supplies/lists/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['can_edit'])
        self.assertEqual(self.client.post('/api/supplies/lists/', {'name': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/supplies/lists/{self.sl.pk}/items/', {'name': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/supplies/items/{self.a.pk}/', {'max_qty': 1}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/supplies/order/').status_code, 403)

    def test_manager_edits_lists_but_not_the_order(self):
        c = self.as_(self.manager)
        self.assertEqual(c.post('/api/supplies/lists/', {'name': 'Front'}, format='json').status_code, 201)
        r = c.post(f'/api/supplies/lists/{self.sl.pk}/items/', {'name': 'Gloves', 'min_qty': 2, 'max_qty': 10}, format='json')
        self.assertEqual(r.status_code, 201)
        r = c.patch(f'/api/supplies/items/{self.a.pk}/', {'min_qty': 20}, format='json')
        self.assertEqual(r.status_code, 400)  # max below min
        self.assertEqual(c.delete(f'/api/supplies/items/{self.b.pk}/').status_code, 204)
        self.assertFalse(SupplyItem.objects.get(pk=self.b.pk).is_active)
        self.assertEqual(c.get('/api/supplies/order/').status_code, 403)

    def test_count_needs_every_item_and_shows_the_last_count(self):
        c = self.as_(self.staff)
        url = f'/api/supplies/lists/{self.sl.pk}/count/'
        r = c.post(url, {'lines': [{'item': self.a.pk, 'on_hand': 3}, {'item': self.b.pk, 'on_hand': ''}]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['missing'], ['Labels'])
        r = c.post(url, {'lines': [{'item': self.a.pk, 'on_hand': 3}, {'item': self.b.pk, 'on_hand': 0}]}, format='json')
        self.assertEqual(r.status_code, 201)
        count = SupplyCount.objects.get()
        self.assertEqual(count.counted_by, self.staff)
        # Next week the old count is shown for reference only.
        count.week_start -= timedelta(days=7)
        count.save()
        r = c.get(url)
        tape = next(i for i in r.data['items'] if i['name'] == 'Tape')
        self.assertEqual((tape['last_count'], tape['this_count']), (3, None))

    def test_order_build_rule_vendors_and_ticks(self):
        ws = date(2026, 10, 26)
        count = SupplyCount.objects.create(supply_list=self.sl, week_start=ws, counted_by=self.staff,
                                           submitted_at=_at(2026, 10, 26, 10))
        count.lines.create(item=self.a, on_hand=3)  # ≤ 4: up to 12 → 9 rolls → 2 packs of 6
        count.lines.create(item=self.b, on_hand=3)  # > 2: nothing
        other = SupplyList.objects.create(name='Front')
        SupplyItem.objects.create(supply_list=other, name='Bags', max_qty=1)
        SupplyList.objects.filter(pk__in=[self.sl.pk, other.pk]).update(created_at=_at(2026, 10, 1, 9))
        msg = orders.run_due(_at(2026, 10, 26, 16))
        self.assertIn('1 lines, 1 lists missed', msg)
        self.assertIn('already built', orders.run_due(_at(2026, 10, 26, 17)))
        order = SupplyOrder.objects.get()
        self.assertEqual(order.missed_lists, ['Front'])
        line = order.lines.get()
        self.assertEqual((line.packs, line.line_total), (2, Decimal('36.00')))
        r = self.as_(self.owner).get('/api/supplies/order/')
        vendor = r.data['order']['vendors'][0]
        self.assertEqual((vendor['vendor'], vendor['total']), ('Amazon', '36.00'))
        self.assertIn('ASIN.1=B0TAPE0001&Quantity.1=2', vendor['cart_url'])
        r = self.client.post(f'/api/supplies/order/{order.pk}/ordered/', {'line_ids': [line.pk]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['vendors'][0]['ordered'])
        line.refresh_from_db()
        self.assertEqual(line.ordered_by, self.owner)
        self.assertIsNotNone(line.ordered_at)

    def test_no_build_before_the_deadline_or_without_lists(self):
        SupplyList.objects.all().delete()
        self.assertEqual(orders.run_due(_at(2026, 10, 26, 16)), 'Supplies: no lists yet.')
        self.assertFalse(SupplyOrder.objects.exists())

    def test_broken_links_are_flagged_amazon_is_never_opened(self):
        ws = date(2026, 10, 26)
        count = SupplyCount.objects.create(supply_list=self.sl, week_start=ws, submitted_at=_at(2026, 10, 26, 10))
        count.lines.create(item=self.a, on_hand=0)
        count.lines.create(item=self.b, on_hand=0)
        with mock.patch.object(orders, 'check_link', return_value='broken') as check:
            order = orders.build_order(ws, check_links=True)
        check.assert_called_once_with('https://www.uline.com/labels')
        self.assertEqual(order.lines.get(name='Labels').link_status, 'broken')
        self.assertEqual(order.lines.get(name='Tape').link_status, '')

    def test_owner_page_shows_missed_counts_and_the_order(self):
        from apps.core.services import owner_page

        SupplyList.objects.filter(pk=self.sl.pk).update(created_at=_at(2026, 10, 1, 9))
        items = {i['key']: i for i in owner_page.needs_you(_at(2026, 10, 27, 9))['items']}
        self.assertEqual(items['supply_count_missed']['count'], 1)
        self.assertEqual(items['supply_count_missed']['detail'], 'Processing')
        orders.build_order(date(2026, 10, 26), check_links=False)
        items = {i['key']: i for i in owner_page.needs_you(_at(2026, 10, 27, 9))['items']}
        self.assertEqual(items['supply_order']['count'], 0)  # nothing counted, so nothing to order

    def test_ai_fill_returns_a_draft_and_never_fetches(self):
        answer = ({'name': 'Packing tape', 'vendor': 'Amazon', 'price': 18.5, 'pack_size': 6, 'unit': 'roll'}, 'm')
        with mock.patch('apps.core.services.llm_router.llm_chat_tool_input', return_value=answer) as llm, \
                mock.patch('requests.get') as get:
            r = self.as_(self.manager).post('/api/supplies/ai-fill/', {
                'url': 'https://www.amazon.com/Tape/dp/B0TAPE0002/ref=x?th=1', 'page_text': '$18.50',
            }, format='json')
        self.assertEqual(r.status_code, 200)
        get.assert_not_called()
        self.assertEqual(llm.call_args.kwargs['purpose'], 'SUPPLY_FILL')
        self.assertEqual((r.data['url'], r.data['vendor_item_id'], r.data['price']),
                         ('https://www.amazon.com/dp/B0TAPE0002', 'B0TAPE0002', '18.50'))
        self.assertFalse(SupplyItem.objects.filter(name='Packing tape').exists())
        self.assertEqual(self.as_(self.staff).post('/api/supplies/ai-fill/', {'url': 'x'}, format='json').status_code, 403)

    def test_csv_import_endpoint_and_template(self):
        c = self.as_(self.manager)
        r = c.get('/api/supplies/import-template/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.decode().startswith('name,description,vendor'))
        r = c.post(f'/api/supplies/lists/{self.sl.pk}/import/', {'text': 'name,min,max\nBoxes,1,3\n'}, format='json')
        self.assertEqual((r.status_code, r.data['added']), (200, 1))
        r = c.post(f'/api/supplies/lists/{self.sl.pk}/import/', {'text': 'name,min,max\nBoxes,5,3\n'}, format='json')
        self.assertEqual(r.status_code, 400)


class HourlyHookTests(TestCase):
    def test_sweep_builds_the_order_first_and_a_failure_never_stops_it(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        discovery = 'apps.buying.services.pipeline.run_discovery'
        build = 'apps.supplies.services.orders.run_due'
        with mock.patch(build, return_value='Supplies: ok') as run, \
                mock.patch(discovery, side_effect=ValueError('no b-stock')):
            with self.assertRaises(CommandError):
                call_command('scheduled_sweep')
        run.assert_called_once()
        with mock.patch(build, side_effect=RuntimeError('boom')), \
                mock.patch(discovery, side_effect=ValueError('no b-stock')) as sweep:
            with self.assertRaises(CommandError):
                call_command('scheduled_sweep')
        sweep.assert_called_once()  # the sweep still ran after the supplies failure
        with mock.patch(build) as run, mock.patch(discovery, side_effect=ValueError('x')):
            with self.assertRaises(CommandError):
                call_command('scheduled_sweep', '--skip-supplies')
        run.assert_not_called()
