"""One Target vendor (intake_updates Phase 3): merge an old vendor into another, then delete it; undo puts it back."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.inventory.management.commands.backfill_phase1_vendors_pos import V1_PREFIX_TO_VENDOR
from apps.inventory.models import CSVTemplate, Product, PurchaseOrder, Vendor, VendorProductRef
from apps.inventory.services import vendor_merge


class VendorMergeTests(TestCase):
    def setUp(self):
        today = timezone.localdate()
        self.old = Vendor.objects.create(name='Target (old)', code='QOLDT', is_active=False, notes='legacy')
        self.new = Vendor.objects.create(name='Target', code='QNEWT')
        self.po_old = PurchaseOrder.objects.create(vendor=self.old, order_number='QNEWT-OLD-1', ordered_date=today)
        self.po_new = PurchaseOrder.objects.create(vendor=self.new, order_number='QNEWT-NEW-1', ordered_date=today)
        self.template = CSVTemplate.objects.create(vendor=self.old, name='old basic')
        p1 = Product.objects.create(title='Lamp')
        p2 = Product.objects.create(title='Mug')
        # A clash on vendor item number 111: merged. 222 only on the old vendor: moved.
        self.ref_old_clash = VendorProductRef.objects.create(vendor=self.old, product=p1, vendor_item_number='111',
                                                             last_unit_cost=Decimal('4.00'), times_seen=2)
        self.ref_new_clash = VendorProductRef.objects.create(vendor=self.new, product=p1, vendor_item_number='111',
                                                             last_unit_cost=Decimal('5.00'), times_seen=3)
        VendorProductRef.objects.filter(pk=self.ref_old_clash.pk).update(last_seen_date=date(2026, 9, 1))
        VendorProductRef.objects.filter(pk=self.ref_new_clash.pk).update(last_seen_date=date(2026, 3, 1))
        self.ref_old_only = VendorProductRef.objects.create(vendor=self.old, product=p2, vendor_item_number='222')

    def test_preview_counts_every_table(self):
        info = vendor_merge.preview('QOLDT', 'QNEWT')
        self.assertEqual(info['counts']['inventory.PurchaseOrder'], 1)
        self.assertEqual(info['counts']['inventory.CSVTemplate'], 1)
        self.assertEqual(info['counts']['inventory.VendorProductRef'], 2)
        self.assertEqual(info['counts']['PurchaseOrder.vendor_code_cache'], 1)
        self.assertEqual(info['clashes'], 1)

    def test_merge_moves_everything_and_deletes_the_old_vendor(self):
        record = vendor_merge.merge('QOLDT', 'QNEWT')
        self.assertFalse(Vendor.objects.filter(code='QOLDT').exists())
        self.po_old.refresh_from_db()
        self.assertEqual(self.po_old.vendor_id, self.new.id)
        self.assertEqual(self.po_old.vendor_code_cache, 'QNEWT')
        self.assertIn('qnewt', self.po_old.search_text)
        self.template.refresh_from_db()
        self.assertEqual(self.template.vendor_id, self.new.id)
        self.ref_old_only.refresh_from_db()
        self.assertEqual(self.ref_old_only.vendor_id, self.new.id)
        # The clash: times seen added, the newer cost and date (the old vendor's) kept.
        self.assertFalse(VendorProductRef.objects.filter(pk=self.ref_old_clash.pk).exists())
        kept = VendorProductRef.objects.get(pk=self.ref_new_clash.pk)
        self.assertEqual(kept.times_seen, 5)
        self.assertEqual(kept.last_unit_cost, Decimal('4.00'))
        self.assertEqual(kept.last_seen_date, date(2026, 9, 1))
        self.assertEqual(record['refs_merged'], 1)
        self.assertEqual(vendor_merge.counts('QOLDT')['inventory.PurchaseOrder'], 0)

    def test_undo_puts_it_back(self):
        record = vendor_merge.merge('QOLDT', 'QNEWT')
        vendor_merge.undo(record)
        old = Vendor.objects.get(code='QOLDT')
        self.assertEqual(old.pk, self.old.pk)
        self.assertEqual(old.notes, 'legacy')
        self.assertFalse(old.is_active)
        self.po_old.refresh_from_db()
        self.assertEqual(self.po_old.vendor_id, old.pk)
        self.assertEqual(self.po_old.vendor_code_cache, 'QOLDT')
        self.template.refresh_from_db()
        self.assertEqual(self.template.vendor_id, old.pk)
        restored = VendorProductRef.objects.get(pk=self.ref_old_clash.pk)
        self.assertEqual((restored.vendor_id, restored.times_seen, restored.last_unit_cost), (old.pk, 2, Decimal('4.00')))
        kept = VendorProductRef.objects.get(pk=self.ref_new_clash.pk)
        self.assertEqual((kept.times_seen, kept.last_unit_cost, kept.last_seen_date), (3, Decimal('5.00'), date(2026, 3, 1)))
        self.po_new.refresh_from_db()
        self.assertEqual(self.po_new.vendor_id, self.new.id)

    def test_nothing_to_merge_is_a_no_op(self):
        vendor_merge.merge('QOLDT', 'QNEWT')
        self.assertIn('skipped', vendor_merge.merge('QOLDT', 'QNEWT'))

    def test_request_kind_previews_and_applies(self):
        from apps.core.services.approval_requests import get_kind

        kind = get_kind('inventory.merge_vendor')
        info = kind.preview({'from': 'qoldt', 'to': 'QNEWT'})
        self.assertEqual(info['params'], {'from': 'QOLDT', 'to': 'QNEWT'})
        self.assertEqual(info['counts']['inventory.PurchaseOrder at QOLDT'], 1)
        self.assertEqual(info['sample'][0]['order'], 'QNEWT-OLD-1')

    def test_into_itself_is_refused(self):
        with self.assertRaises(ValueError):
            vendor_merge.merge('QNEWT', 'QNEWT')


class BackfillMappingTests(TestCase):
    def test_legacy_tgt_prefix_maps_to_trget(self):
        self.assertEqual(V1_PREFIX_TO_VENDOR['TGT'][0], 'TRGET')
