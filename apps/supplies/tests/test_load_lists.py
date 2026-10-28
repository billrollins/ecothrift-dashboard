from datetime import datetime
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.services import approval_requests as ar
from apps.hr.models import Department
from apps.supplies.models import SupplyCount, SupplyItem, SupplyList, SupplyOrder
from apps.supplies.services import orders

FILE = {'file': 'pr_supply_list_2026-10-28.json'}
NOW = timezone.make_aware(datetime(2026, 10, 28, 15), timezone.get_default_timezone())


class LoadListsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='o@example.com', first_name='O', last_name='W', password='pw-123456')
        self.owner.is_superuser = True
        self.owner.save()
        for name in ('Retail', 'Processing'):
            Department.objects.get_or_create(name=name)
        Department.objects.filter(name='Restoration').delete()  # one list with no department of its name

    def stage_and_run(self):
        req = ar.stage('supplies.load_lists', title='Load the PR supply lists', params=FILE)
        ar.approve(req, self.owner, start=False)
        return ar.run(req.pk)

    def test_preview_counts_what_the_sheet_makes(self):
        req = ar.stage('supplies.load_lists', title='Load', params=FILE)
        counts = req.preview['counts']
        self.assertEqual((counts['Lists to make'], counts['Items to add'], counts['Items to update']), (3, 41, 0))
        self.assertEqual(counts['Items with no product link'], 3)  # gloves XL, Fabuloso, receipt paper
        self.assertIn('department none found', ' '.join(req.preview['changes']))  # no Restoration department here
        self.assertFalse(SupplyList.objects.exists())  # staging changes nothing

    def test_apply_makes_the_lists_items_and_last_counts_and_orders_nothing(self):
        with mock.patch('django.utils.timezone.now', return_value=NOW):
            req = self.stage_and_run()
        self.assertEqual(req.status, 'applied', req.error)
        retail = SupplyList.objects.get(name='Retail')
        self.assertEqual(retail.department.name, 'Retail')
        self.assertIsNone(SupplyList.objects.get(name='Restoration').department)
        self.assertEqual(SupplyItem.objects.count(), 41)
        hand = retail.items.get(name='Hand Soap')
        self.assertEqual((hand.min_qty, hand.max_qty, hand.pack_size, hand.unit, hand.vendor_item_id),
                         (1, 3, 1, 'pack', 'B09HHDGQKD'))
        self.assertEqual(hand.url, 'https://www.amazon.com/dp/B09HHDGQKD')
        xl = retail.items.get(name='Rubber Gloves (XL)')
        self.assertEqual((xl.url, xl.vendor_item_id), ('', ''))
        count = SupplyCount.objects.get(supply_list=retail)
        self.assertEqual(count.week_start.isoformat(), '2026-10-26')
        self.assertEqual(count.lines.get(item=hand).on_hand, 1)
        self.assertEqual(count.counted_by, self.owner)
        with mock.patch('django.utils.timezone.now', return_value=NOW):
            self.assertEqual(orders.run_due(NOW), 'Supplies: no lists yet.')  # made after the deadline
            self.assertEqual(orders.missed_lists(NOW), [])
        self.assertFalse(SupplyOrder.objects.exists())

    def test_a_second_load_updates_instead_of_doubling_and_undo_clears_it(self):
        self.stage_and_run()
        again = self.stage_and_run()
        self.assertEqual(again.preview['counts']['Items to update'], 41)
        self.assertEqual((SupplyList.objects.count(), SupplyItem.objects.count()), (3, 41))
        ar.undo(again, self.owner)  # the second load made nothing new, so its undo changes nothing
        self.assertEqual(SupplyList.objects.count(), 3)
        req = ar.ApprovalRequest.objects.filter(kind='supplies.load_lists', status='applied').get()
        ar.undo(req, self.owner)
        self.assertFalse(SupplyList.objects.exists())
        self.assertFalse(SupplyCount.objects.exists())

    def test_a_bad_file_name_is_refused(self):
        with self.assertRaises(ar.RequestError):
            ar.stage('supplies.load_lists', title='x', params={'file': '../../settings.py'})
