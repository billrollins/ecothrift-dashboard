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
        # 50 + 60 + 35 listing retail on the same shelf-eligible items
        self.assertEqual(Decimal(metrics['priced_retail']), Decimal('145.00'))
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

    def test_sold_last_week_includes_recent_cart_only(self):
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
        self.assertEqual(Decimal(metrics['sold_last_week']), Decimal('40.00'))

    def test_summary_ids_subset_and_filters(self):
        r = self.client.get(
            '/api/inventory/orders/summary/',
            {'ids': str(self.po.id), 'status__in': 'delivered'},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['total_orders'], 1)
        self.assertIn('priced', r.data)
        self.assertIn('sold', r.data)
        self.assertIn('profit', r.data)
        self.assertEqual(r.data['cost'], r.data['total_cost'])

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
