"""Labor Day / Summer sale mode, assembly line, and per-line sale labels."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import CartLine, DeliveryAvailability, Drawer, Register
from apps.pos.services.sale_mode import (
    ASSEMBLY_PRICE,
    get_sale_mode,
    labor_day_window,
    set_labor_day_override,
)


class LaborDayWindowTests(TestCase):
    def test_2026_is_sept_7_through_12(self):
        start, end = labor_day_window(2026)
        self.assertEqual(start, date(2026, 9, 7))
        self.assertEqual(end, date(2026, 9, 12))

    def test_2025_is_sept_1_through_6(self):
        start, end = labor_day_window(2025)
        self.assertEqual(start, date(2025, 9, 1))
        self.assertEqual(end, date(2025, 9, 6))


class SaleModeCalendarTests(TestCase):
    def test_calendar_inside_window(self):
        mode = get_sale_mode(today=date(2026, 9, 7))
        self.assertTrue(mode['active'])
        self.assertEqual(mode['source'], 'calendar')
        self.assertEqual(mode['start'], date(2026, 9, 7))
        self.assertEqual(mode['end'], date(2026, 9, 12))

    def test_calendar_outside_window(self):
        mode = get_sale_mode(today=date(2026, 9, 5))
        self.assertFalse(mode['active'])
        self.assertEqual(mode['source'], 'calendar')

    def test_override_on_outside_window(self):
        set_labor_day_override(True)
        mode = get_sale_mode(today=date(2026, 9, 5))
        self.assertTrue(mode['active'])
        self.assertEqual(mode['source'], 'override')

    def test_override_off_inside_window(self):
        set_labor_day_override(False)
        mode = get_sale_mode(today=date(2026, 9, 8))
        self.assertFalse(mode['active'])
        self.assertEqual(mode['source'], 'override')


class CartSaleModeAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-sale@example.com',
            first_name='Pos',
            last_name='Sale',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Sale Loc')
        self.register = Register.objects.create(
            location=self.location,
            name='Register S',
            code='POS-S1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        cat = Category.objects.create(name='POS Sale Cat', slug='pos-sale-cat')
        product = Product.objects.create(title='Sale Test Item', brand='QA', category=cat)
        self.item = Item.objects.create(
            sku='POSTESTSALE1',
            product=product,
            price=Decimal('20.00'),
            status='on_shelf',
        )

    def _open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def _set_override(self, value):
        r = self.client.post('/api/pos/sale-mode/', {'override': value}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def test_sale_mode_get(self):
        r = self.client.get('/api/pos/sale-mode/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('active', r.data)
        self.assertEqual(r.data['assembly_price'], '35.00')
        self.assertEqual(r.data['summer_percent'], '50')

    def test_add_item_gets_10_when_active(self):
        self._set_override(True)
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        line = r.data['lines'][0]
        self.assertEqual(line['sale_label'], 'labor_day')
        self.assertEqual(Decimal(str(line['sale_percent'])), Decimal('10'))
        self.assertEqual(Decimal(str(line['unit_price'])), Decimal('20.00'))
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('18.00'))
        self.assertEqual(Decimal(str(line['list_total'])), Decimal('20.00'))
        self.assertEqual(Decimal(str(line['sale_savings'])), Decimal('2.00'))

    def test_add_item_no_sale_when_inactive(self):
        self._set_override(False)
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        line = r.data['lines'][0]
        self.assertEqual(line['sale_label'], '')
        self.assertEqual(Decimal(str(line['sale_percent'])), Decimal('0'))
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('20.00'))

    def test_manual_line_gets_10_when_active(self):
        self._set_override(True)
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-manual-line/',
            {'description': 'Pink Tag Item', 'unit_price': '10.00'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        line = r.data['lines'][0]
        self.assertEqual(line['line_kind'], 'manual')
        self.assertEqual(line['sale_label'], 'labor_day')
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('9.00'))

    def test_assembly_never_gets_sale(self):
        self._set_override(True)
        cid = self._open_cart()
        r = self.client.post(f'/api/pos/carts/{cid}/add-assembly/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        line = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'assembly')
        self.assertEqual(Decimal(str(line['unit_price'])), ASSEMBLY_PRICE)
        self.assertEqual(Decimal(str(line['line_total'])), ASSEMBLY_PRICE)
        self.assertEqual(line['sale_label'], '')
        sale = self.client.post(
            f'/api/pos/carts/{cid}/lines/{line["id"]}/sale/',
            {'sale': 'summer'},
            format='json',
        )
        self.assertEqual(sale.status_code, 400)
        self.assertEqual(sale.data['code'], 'INVALID_TARGET')

    def test_add_assembly_bumps_quantity(self):
        self._set_override(False)
        cid = self._open_cart()
        self.client.post(f'/api/pos/carts/{cid}/add-assembly/', {}, format='json')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-assembly/',
            {'quantity': 2},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        assemblies = [ln for ln in r.data['lines'] if ln['line_kind'] == 'assembly']
        self.assertEqual(len(assemblies), 1)
        self.assertEqual(assemblies[0]['quantity'], 3)
        self.assertEqual(Decimal(str(assemblies[0]['line_total'])), Decimal('105.00'))

    def test_delivery_never_gets_sale(self):
        self._set_override(True)
        slot = DeliveryAvailability.objects.create(
            date=timezone.localdate() + timedelta(days=2),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'is_apt': False,
                'availability_id': slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        delivery = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'delivery')
        self.assertEqual(Decimal(str(delivery['unit_price'])), Decimal('50.00'))
        self.assertEqual(Decimal(str(delivery['line_total'])), Decimal('50.00'))
        self.assertEqual(delivery.get('sale_label') or '', '')

    def test_summer_50_and_stays_after_toggle(self):
        self._set_override(True)
        cid = self._open_cart()
        added = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        line_id = added.data['lines'][0]['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/lines/{line_id}/sale/',
            {'sale': 'summer'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        line = r.data['lines'][0]
        self.assertEqual(line['sale_label'], 'summer')
        self.assertEqual(Decimal(str(line['sale_percent'])), Decimal('50'))
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('10.00'))

        self._set_override(False)
        synced = self.client.post(f'/api/pos/carts/{cid}/sync-sale/', {}, format='json')
        self.assertEqual(synced.status_code, 200, synced.content)
        line = synced.data['lines'][0]
        self.assertEqual(line['sale_label'], 'summer')
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('10.00'))

    def test_sync_sale_relabels_after_toggle(self):
        self._set_override(True)
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        self._set_override(False)
        synced = self.client.post(f'/api/pos/carts/{cid}/sync-sale/', {}, format='json')
        self.assertEqual(synced.status_code, 200)
        line = synced.data['lines'][0]
        self.assertEqual(line['sale_label'], '')
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('20.00'))

    def test_complete_writes_discounted_sold_for(self):
        self._set_override(True)
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        r = self.client.post(
            f'/api/pos/carts/{cid}/complete/',
            {'payment_method': 'cash', 'cash_tendered': '20.00'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'sold')
        self.assertEqual(self.item.sold_for, Decimal('18.00'))

    def test_none_clears_to_labor_day_when_active(self):
        self._set_override(True)
        cid = self._open_cart()
        added = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': self.item.sku},
            format='json',
        )
        line_id = added.data['lines'][0]['id']
        self.client.post(
            f'/api/pos/carts/{cid}/lines/{line_id}/sale/',
            {'sale': 'summer'},
            format='json',
        )
        r = self.client.post(
            f'/api/pos/carts/{cid}/lines/{line_id}/sale/',
            {'sale': 'none'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        line = r.data['lines'][0]
        self.assertEqual(line['sale_label'], 'labor_day')
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('18.00'))
