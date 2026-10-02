"""Orders dashboard Cost / Retail / Priced / Sold / Profit metrics."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemHistory, Product, PurchaseOrder, Vendor
from apps.pos.models import Cart, CartLine, Drawer, Register

User = get_user_model()


class PurchaseOrderFinancialsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='po-fin@example.com',
            first_name='Fin',
            last_name='Tester',
            password='testpw',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='Walmart', code='WM-FIN')
        self.product = Product.objects.create(title='Fin Widget', brand='Acme')
        today = timezone.localdate()
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-FIN-1',
            ordered_date=today - timedelta(days=10),
            paid_date=today - timedelta(days=8),
            shipped_date=today - timedelta(days=5),
            delivered_date=today - timedelta(days=2),
            status='delivered',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('400.00'),
            item_count=3,
            description='Finance test pallet',
            condition='good',
        )
        self.po.refresh_from_db()

        self.item_shelf = Item.objects.create(
            sku='FIN-SHELF-1',
            product=self.product,
            purchase_order=self.po,
            price=Decimal('40.00'),
            retail=Decimal('50.00'),
            status='on_shelf',
            listed_at=timezone.now(),
        )
        self.item_sold = Item.objects.create(
            sku='FIN-SOLD-1',
            product=self.product,
            purchase_order=self.po,
            price=Decimal('55.00'),
            retail=Decimal('60.00'),
            status='sold',
            listed_at=timezone.now() - timedelta(days=1),
            sold_at=timezone.now(),
            sold_for=Decimal('50.00'),
        )
        self.item_history_only = Item.objects.create(
            sku='FIN-HIST-1',
            product=self.product,
            purchase_order=self.po,
            price=Decimal('30.00'),
            retail=Decimal('35.00'),
            status='scrapped',
            listed_at=None,
        )
        ItemHistory.objects.create(
            item=self.item_history_only,
            event_type='status_change',
            old_value='processing',
            new_value='on_shelf',
            created_by=self.user,
        )

        loc = WorkLocation.objects.create(name='Fin Loc')
        reg = Register.objects.create(location=loc, name='Fin Reg', code='FIN-R1')
        self.drawer = Drawer.objects.create(
            register=reg,
            date=today,
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )

    def _complete_cart_with_discount(self, *, line_price: Decimal, discount: Decimal, scope='cart', target=None):
        cart = Cart.objects.create(
            drawer=self.drawer,
            cashier=self.user,
            status='open',
        )
        line = CartLine.objects.create(
            cart=cart,
            item=self.item_sold,
            description='Sold widget',
            quantity=1,
            unit_price=line_price,
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        meta = {'reason': 'test', 'scope': scope, 'amount': str(discount)}
        if target is not None:
            meta['target_line_id'] = target
        CartLine.objects.create(
            cart=cart,
            item=None,
            description='Discount',
            quantity=1,
            unit_price=-discount,
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            meta=meta,
        )
        cart.status = 'completed'
        cart.completed_at = timezone.now()
        cart.save(update_fields=['status', 'completed_at'])
        return cart, line

    def test_page_metrics_priced_includes_shelf_history_and_sold(self):
        r = self.client.get(
            '/api/inventory/orders/page-metrics/',
            {'ids': str(self.po.id)},
        )
        self.assertEqual(r.status_code, 200)
        metrics = r.data['orders'][str(self.po.id)]
        # 40 + 55 + 30 (history-only still uses retained tag price)
        self.assertEqual(Decimal(metrics['priced']), Decimal('125.00'))
        # 50 + 60 + 35: the processor-approved retail of every checked-in item
        self.assertEqual(Decimal(metrics['approved_retail']), Decimal('145.00'))
        self.assertEqual(Decimal(metrics['cost']), Decimal('100.00'))
        self.assertEqual(Decimal(metrics['retail']), Decimal('400.00'))

    def test_sold_uses_cart_line_discount_and_profit_is_sold_minus_cost(self):
        self._complete_cart_with_discount(
            line_price=Decimal('50.00'),
            discount=Decimal('5.00'),
            scope='line',
            target=None,
        )
        # Fix target after line create
        cart = Cart.objects.filter(status='completed').latest('id')
        line = cart.lines.filter(line_kind=CartLine.LINE_KIND_ITEM).first()
        disc = cart.lines.filter(line_kind=CartLine.LINE_KIND_DISCOUNT).first()
        disc.meta = {'reason': 'test', 'scope': 'line', 'target_line_id': line.id, 'amount': '5.00'}
        disc.save(update_fields=['meta'])

        r = self.client.get(
            '/api/inventory/orders/page-metrics/',
            {'ids': str(self.po.id)},
        )
        self.assertEqual(r.status_code, 200)
        metrics = r.data['orders'][str(self.po.id)]
        self.assertEqual(Decimal(metrics['sold']), Decimal('45.00'))
        self.assertEqual(Decimal(metrics['profit']), Decimal('-55.00'))  # 45 - 100

    def test_cart_wide_discount_allocated_proportionally(self):
        other = Item.objects.create(
            sku='FIN-SOLD-2',
            product=self.product,
            purchase_order=self.po,
            price=Decimal('20.00'),
            status='sold',
            listed_at=timezone.now(),
            sold_for=Decimal('20.00'),
        )
        cart = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='open')
        CartLine.objects.create(
            cart=cart,
            item=self.item_sold,
            description='A',
            quantity=1,
            unit_price=Decimal('80.00'),
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        CartLine.objects.create(
            cart=cart,
            item=other,
            description='B',
            quantity=1,
            unit_price=Decimal('20.00'),
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        CartLine.objects.create(
            cart=cart,
            item=None,
            description='Cart discount',
            quantity=1,
            unit_price=Decimal('-10.00'),
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            meta={'scope': 'cart', 'reason': 'promo', 'amount': '10.00'},
        )
        cart.status = 'completed'
        cart.completed_at = timezone.now()
        cart.save(update_fields=['status', 'completed_at'])

        r = self.client.get(
            '/api/inventory/orders/page-metrics/',
            {'ids': str(self.po.id)},
        )
        self.assertEqual(r.status_code, 200)
        # 100 gross - 10 discount = 90
        self.assertEqual(Decimal(r.data['orders'][str(self.po.id)]['sold']), Decimal('90.00'))

    def test_voided_cart_excluded_uses_sold_for_fallback(self):
        cart = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='open')
        CartLine.objects.create(
            cart=cart,
            item=self.item_sold,
            description='Voided sale',
            quantity=1,
            unit_price=Decimal('99.00'),
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        cart.status = 'voided'
        cart.save(update_fields=['status'])

        r = self.client.get(
            '/api/inventory/orders/page-metrics/',
            {'ids': str(self.po.id)},
        )
        self.assertEqual(r.status_code, 200)
        # Falls back to item.sold_for = 50
        self.assertEqual(Decimal(r.data['orders'][str(self.po.id)]['sold']), Decimal('50.00'))

    def test_sold_counts_every_completed_cart(self):
        recent = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='open')
        CartLine.objects.create(
            cart=recent,
            item=self.item_sold,
            description='Recent sale',
            quantity=1,
            unit_price=Decimal('40.00'),
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        recent.status = 'completed'
        recent.completed_at = timezone.now() - timedelta(days=2)
        recent.save(update_fields=['status', 'completed_at'])

        old_item = Item.objects.create(
            sku='FIN-SOLD-OLD',
            product=self.product,
            purchase_order=self.po,
            price=Decimal('25.00'),
            status='sold',
            listed_at=timezone.now() - timedelta(days=40),
            sold_at=timezone.now() - timedelta(days=30),
            sold_for=Decimal('25.00'),
        )
        old = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='open')
        CartLine.objects.create(
            cart=old,
            item=old_item,
            description='Old sale',
            quantity=1,
            unit_price=Decimal('25.00'),
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        old.status = 'completed'
        old.completed_at = timezone.now() - timedelta(days=30)
        old.save(update_fields=['status', 'completed_at'])

        r = self.client.get(
            '/api/inventory/orders/page-metrics/',
            {'ids': str(self.po.id)},
        )
        self.assertEqual(r.status_code, 200)
        metrics = r.data['orders'][str(self.po.id)]
        self.assertEqual(Decimal(metrics['sold']), Decimal('65.00'))
        self.assertEqual(metrics['sold_pct'], '43')   # 65 sold / 150 priced (starting: 125 + the old item's 25)

    def test_summary_ids_subset_and_filters(self):
        r = self.client.get(
            '/api/inventory/orders/summary/',
            {'ids': str(self.po.id), 'status__in': 'delivered'},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['total_orders'], 1)
        self.assertIn('priced', r.data)
        self.assertIn('priced_start', r.data)
        self.assertIn('sold', r.data)
        self.assertIn('unsold_left', r.data)
        self.assertIn('profit', r.data)
        self.assertIn('in_transit_count', r.data)
        self.assertIn('pallet_count', r.data)
        self.assertEqual(r.data['cost'], r.data['total_cost'])
        self.assertEqual(r.data['in_transit_count'], 0)

    def test_summary_in_transit_and_pallets(self):
        shipped = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-FIN-SHIP',
            ordered_date=timezone.localdate() - timedelta(days=4),
            paid_date=timezone.localdate() - timedelta(days=3),
            shipped_date=timezone.localdate() - timedelta(days=1),
            status='shipped',
            purchase_cost=Decimal('250.00'),
            retail_value=Decimal('800.00'),
            item_count=10,
            pallet_count=4,
            description='In transit truck',
            condition='good',
        )
        shipped.refresh_from_db()
        r = self.client.get(
            '/api/inventory/orders/summary/',
            {'ids': f'{self.po.id},{shipped.id}'},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['total_orders'], 2)
        self.assertEqual(r.data['in_transit_count'], 1)
        self.assertEqual(Decimal(r.data['in_transit_cost']), Decimal(shipped.total_cost))
        self.assertEqual(r.data['pallet_count'], 4)

    def test_list_condition_and_item_count_filters(self):
        r = self.client.get(
            '/api/inventory/orders/',
            {
                'condition': 'good',
                'item_count_min': 2,
                'item_count_max': 5,
                'date_field': 'delivered_date',
                'date_after': (timezone.localdate() - timedelta(days=3)).isoformat(),
            },
        )
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(self.po.id, ids)


class OwnerDefinitionsTests(TestCase):
    """Phase 1 of intake_updates: each column's definition, with extras, a dispute, a row not received, a markdown and
    a lost item (2026-10-02)."""

    def setUp(self):
        from apps.inventory.models import Dispute, ManifestRow
        from apps.inventory.services import purchase_order_financials as f

        self.f = f
        vendor = Vendor.objects.create(name='Def Vendor', code='DEFV')
        product = Product.objects.create(title='Def Widget', brand='Acme')
        today = timezone.localdate()
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='PO-DEF-1', ordered_date=today,
                                               purchase_cost=Decimal('100.00'), retail_value=Decimal('204.00'))
        row1 = ManifestRow.objects.create(purchase_order=self.po, row_number=1, quantity=2, unit_retail=Decimal('50.00'))
        row2 = ManifestRow.objects.create(purchase_order=self.po, row_number=2, quantity=1, unit_retail=Decimal('100.00'))
        ManifestRow.objects.create(purchase_order=self.po, row_number=3, quantity=0, unit_retail=Decimal('0.00'))
        t0 = timezone.now() - timedelta(days=3)
        mk = lambda sku, **kw: Item.objects.create(sku=sku, product=product, purchase_order=self.po, checked_in_at=t0, **kw)  # noqa: E731
        self.marked = mk('DEF-A', manifest_row=row1, price=Decimal('20.00'), retail=Decimal('50.00'), status='on_shelf')
        disputed = mk('DEF-B', manifest_row=row1, price=Decimal('15.00'), retail=Decimal('50.00'), status='sold',
                      sold_at=timezone.now(), sold_for=Decimal('12.00'))
        mk('DEF-C', price=Decimal('10.00'), retail=Decimal('30.00'), status='on_shelf')                    # an extra
        mk('DEF-D', manifest_row=row2, price=Decimal('40.00'), retail=Decimal('100.00'), status='lost')    # shrink
        # The check-in's own price line (ignored), then a real markdown from 25 to 20.
        at_check_in = ItemHistory.objects.create(item=self.marked, event_type='price_change', old_value='0', new_value='25.00')
        markdown = ItemHistory.objects.create(item=self.marked, event_type='price_change', old_value='25.00', new_value='20.00')
        ItemHistory.objects.filter(pk=at_check_in.pk).update(created_at=t0 + timedelta(seconds=5))
        ItemHistory.objects.filter(pk=markdown.pk).update(created_at=t0 + timedelta(hours=2))
        Dispute.objects.create(purchase_order=self.po, kind='processing', title='Broken', subject_item=disputed)

    def test_each_definition(self):
        m = self.f.financials_for_orders([self.po.pk])[self.po.pk]
        self.assertEqual(m['manifest_retail'], Decimal('200.00'))                 # 2 x 50 + 1 x 100
        self.assertEqual((m['retail_processed'], m['retail_processed_pct']), (Decimal('150.00'), Decimal('75')))  # A + D; not B (disputed), not C (extra)
        self.assertEqual(m['priced_start'], Decimal('90.00'))                    # 25 (before the markdown) + 15 + 10 + 40
        self.assertEqual((m['approved_retail'], m['approved_pct_of_manifest']), (Decimal('230.00'), Decimal('115')))
        self.assertEqual(m['unsold_left'], Decimal('30.00'))                      # A 20 + C 10; sold B and lost D left out
        self.assertEqual((m['sold'], m['sold_pct']), (Decimal('12.00'), Decimal('13')))
        self.assertEqual((m['recovery_expected'], m['recovery_actual']), (Decimal('90'), Decimal('12')))
        self.assertEqual(m['flags'], [])                                         # 204 is within 2% of 200

    def test_missing_data_is_flagged_not_zero(self):
        vendor = Vendor.objects.get(code='DEFV')
        bare = PurchaseOrder.objects.create(vendor=vendor, order_number='PO-DEF-2', ordered_date=timezone.localdate(),
                                            purchase_cost=Decimal('50.00'))
        Item.objects.create(sku='DEF-OLD', product=Product.objects.get(title='Def Widget'), purchase_order=bare, price=Decimal('9.00'), status='on_shelf')
        off = PurchaseOrder.objects.create(vendor=vendor, order_number='PO-DEF-3', ordered_date=timezone.localdate(),
                                           purchase_cost=Decimal('50.00'), retail_value=Decimal('300.00'))
        from apps.inventory.models import ManifestRow
        ManifestRow.objects.create(purchase_order=off, row_number=1, quantity=1, unit_retail=Decimal('200.00'))
        fin = self.f.financials_for_orders([bare.pk, off.pk])
        self.assertEqual(fin[bare.pk]['flags'], ['no_manifest', 'no_listing_retail', 'no_price_history'])
        self.assertIsNone(fin[bare.pk]['manifest_retail'])
        self.assertIsNone(fin[bare.pk]['retail_processed_pct'])
        self.assertEqual(fin[off.pk]['flags'], ['manifest_mismatch'])

    def test_summary_is_the_same_arithmetic_on_the_sums(self):
        s = self.f.aggregate_financials(PurchaseOrder.objects.filter(pk=self.po.pk))
        self.assertEqual((s['manifest_retail'], s['priced_start'], s['unsold_left'], s['sold_pct']), ('200.00', '90.00', '30.00', '13'))
        self.assertEqual(s['orders_flagged']['manifest_mismatch'], 0)
