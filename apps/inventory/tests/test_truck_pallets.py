"""E1 pallet numbers: pallets from the manifest, arrival, start/finish, check-ins carry the pallet, the ledger."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, ManifestRow, ProcessingRow, PurchaseOrder, TruckPallet, Vendor
from apps.inventory.services.truck_pallets import (
    ensure_truck_pallets,
    find_pallet,
    pallet_ledger,
    short_label,
)


class TruckPalletBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='proc@example.com', first_name='Pat', last_name='Proc', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

    def _order(self, pallet_ids=('LIQ:3PL:PALLET:A:PAL-1', 'LIQ:3PL:PALLET:A:PAL-2'), pallet_count=2):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-PAL',
            ordered_date='2026-10-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('400.00'),
            pallet_count=pallet_count,
            status='processing',
        )
        rows = []
        # Two lines on each pallet: 4 x $10 and 2 x $50.
        n = 0
        for code in pallet_ids:
            for qty, retail in ((4, '10.00'), (2, '50.00')):
                n += 1
                tracking = {'pallet_id': code} if code else {}
                mr = ManifestRow.objects.create(
                    purchase_order=order, row_number=n, quantity=qty, title=f'Line {n}',
                    unit_retail=Decimal(retail), tracking=tracking,
                )
                pr = ProcessingRow.objects.create(
                    purchase_order=order, manifest_row=mr, row_number=n, quantity=qty, title=f'Line {n}',
                    unit_retail=Decimal(retail), shelf_price=Decimal('3.00'), tracking=tracking,
                )
                rows.append(pr)
        return order, rows

    def _check_in(self, order, row, qty):
        r = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': row.id, 'quantity': qty, 'condition': 'good',
                'dispatch': 'on_shelf', 'price': '3.00', 'product_mode': 'new', 'title': row.title,
                # $50 retail on a $3 tag trips the retail check; these tests are about pallets.
                'retail_check': 'confirm',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        return r


class SeedAndMatchTests(TruckPalletBase):
    def test_pallets_seeded_from_manifest_ids_in_order(self):
        order, _ = self._order()
        pallets = ensure_truck_pallets(order)
        self.assertEqual([p.number for p in pallets], [1, 2])
        self.assertEqual([short_label(p.code) for p in pallets], ['PAL-1', 'PAL-2'])
        self.assertTrue(all(p.from_manifest for p in pallets))
        # Idempotent.
        ensure_truck_pallets(order)
        self.assertEqual(TruckPallet.objects.filter(purchase_order=order).count(), 2)

    def test_blank_pallets_up_to_pallet_count(self):
        order, _ = self._order(pallet_ids=('', ''), pallet_count=3)
        pallets = ensure_truck_pallets(order)
        self.assertEqual(len(pallets), 3)
        self.assertTrue(all(p.code == '' for p in pallets))

    def test_find_by_short_label_ending_and_number(self):
        order, _ = self._order()
        ensure_truck_pallets(order)
        self.assertEqual(find_pallet(order, 'pal-2').number, 2)
        self.assertEqual(find_pallet(order, 'LIQ:3PL:PALLET:A:PAL-1').number, 1)
        self.assertEqual(find_pallet(order, '#2').number, 2)
        self.assertIsNone(find_pallet(order, 'nope'))


class ArrivalTests(TruckPalletBase):
    def test_record_arrival_stamps_and_swaps_codes(self):
        order, _ = self._order()
        r = self.client.post(
            f'/api/inventory/orders/{order.id}/pallets/record/',
            {'number': 1, 'code': 'LIQ:3PL:PALLET:A:PAL-2'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        p1 = TruckPallet.objects.get(purchase_order=order, number=1)
        p2 = TruckPallet.objects.get(purchase_order=order, number=2)
        self.assertEqual(short_label(p1.code), 'PAL-2')
        self.assertEqual(short_label(p2.code), 'PAL-1')
        self.assertIsNotNone(p1.arrived_at)
        self.assertIsNone(p2.arrived_at)
        self.assertEqual(r.data['pallets_arrived'], 1)

    def test_typed_label_on_order_without_manifest_ids(self):
        order, _ = self._order(pallet_ids=('', ''), pallet_count=2)
        r = self.client.post(
            f'/api/inventory/orders/{order.id}/pallets/record/', {'number': 2, 'code': '99123'}, format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        p2 = TruckPallet.objects.get(purchase_order=order, number=2)
        self.assertEqual(p2.code, '99123')
        self.assertFalse(p2.from_manifest)


class ProcessingTests(TruckPalletBase):
    def test_check_in_carries_started_pallet_and_running_missing(self):
        order, rows = self._order()
        r = self.client.post(f'/api/inventory/orders/{order.id}/pallets/start/', {'code': 'PAL-1'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        p1 = TruckPallet.objects.get(purchase_order=order, number=1)
        self.assertEqual(r.data['current_pallet_id'], p1.id)
        self.assertEqual(r.data['pallets'][0]['started_by'], 'Pat Proc')

        # Pallet 1: 3 of 4 of the $10 line, both $50 units.
        self._check_in(order, rows[0], 3)
        self._check_in(order, rows[1], 2)
        self.assertEqual(Item.objects.filter(purchase_order=order, pallet=p1).count(), 5)

        led = pallet_ledger(order, user=self.user)
        self.assertIsNone(led['running'])  # nothing finished yet
        r = self.client.post(f'/api/inventory/orders/{order.id}/pallets/finish/', {'pallet_id': p1.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        led = r.data
        pal = led['pallets'][0]
        self.assertEqual(pal['status'], 'done')
        self.assertEqual(pal['manifest_units'], 6)
        self.assertEqual(pal['manifest_retail'], '140.00')
        self.assertEqual(pal['missing_units'], 1)
        self.assertEqual(pal['missing_retail'], '10.00')
        self.assertEqual(led['running']['missing_pct_retail'], round(10 * 100 / 140, 1))
        # Truck-wide, pallet 2 is still all missing; the running % ignores it.
        self.assertEqual(led['truck']['missing_units'], 7)
        self.assertIsNone(led['current_pallet_id'])

    def test_unit_found_on_other_pallet_counts_for_its_manifest_pallet(self):
        order, rows = self._order()
        ensure_truck_pallets(order)
        p1 = TruckPallet.objects.get(purchase_order=order, number=1)
        self.client.post(f'/api/inventory/orders/{order.id}/pallets/start/', {'pallet_id': p1.id}, format='json')
        # A pallet-2 line turns up on pallet 1.
        self._check_in(order, rows[2], 4)
        led = pallet_ledger(order, user=self.user)
        by_n = {p['number']: p for p in led['pallets']}
        self.assertEqual(by_n[1]['from_other_pallets_units'], 4)
        self.assertEqual(by_n[1]['checked_in_units'], 4)
        self.assertEqual(by_n[2]['received_units'], 4)

    def test_no_manifest_ids_running_unknown_but_items_carry_pallet(self):
        order, rows = self._order(pallet_ids=('', ''), pallet_count=2)
        ensure_truck_pallets(order)
        p2 = TruckPallet.objects.get(purchase_order=order, number=2)
        self.client.post(f'/api/inventory/orders/{order.id}/pallets/start/', {'code': '2'}, format='json')
        self._check_in(order, rows[0], 4)
        self.client.post(f'/api/inventory/orders/{order.id}/pallets/finish/', {'pallet_id': p2.id}, format='json')
        led = pallet_ledger(order, user=self.user)
        self.assertFalse(led['has_manifest_pallets'])
        self.assertIsNone(led['running'])
        self.assertEqual(led['running_basis'], 'no_manifest_pallet_ids')
        self.assertEqual({p['number']: p['checked_in_units'] for p in led['pallets']}[2], 4)
        self.assertEqual(led['unassigned']['manifest_units'], 12)

    def test_without_a_started_pallet_check_in_uses_manifest_pallet(self):
        order, rows = self._order()
        ensure_truck_pallets(order)
        self._check_in(order, rows[2], 1)
        item = Item.objects.get(purchase_order=order)
        self.assertEqual(item.pallet.number, 2)
        self.assertEqual(item.check_in.pallet_id, item.pallet_id)

    def test_cannot_swap_codes_once_items_are_checked_in(self):
        order, rows = self._order()
        ensure_truck_pallets(order)
        self._check_in(order, rows[2], 1)  # lands on pallet 2 by the manifest
        r = self.client.post(
            f'/api/inventory/orders/{order.id}/pallets/record/',
            {'number': 1, 'code': 'LIQ:3PL:PALLET:A:PAL-2'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
