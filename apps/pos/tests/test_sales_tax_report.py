"""The owner's sales tax report (2026-10-13): taxable sales and tax for a period, from completed register sales."""
from datetime import datetime, time
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import Cart, CartLine, Drawer, Register

D = Decimal


def _at(y, m, d, hour=12):
    return timezone.make_aware(datetime.combine(datetime(y, m, d).date(), time(hour)), timezone.get_current_timezone())


class SalesTaxReportTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_superuser(email='owner@example.com', first_name='O', last_name='W', password='x-pass-123')
        self.cashier = User.objects.create_user(email='cash@example.com', first_name='C', last_name='A', password='x-pass-123')
        self.cashier.groups.add(Group.objects.get_or_create(name='Employee')[0])
        register = Register.objects.create(location=WorkLocation.objects.create(name='Store'), name='Register 1', code='R1')
        self.drawer = Drawer.objects.create(register=register, date=timezone.now().date(), current_cashier=self.cashier,
                                            opened_by=self.cashier, opened_at=timezone.now(), status='open')
        self.client = APIClient()

    def sale(self, when, lines, *, status='completed', payment='card', surcharge='0'):
        cart = Cart.objects.create(drawer=self.drawer, cashier=self.cashier, status=status, payment_method=payment,
                                   card_surcharge_amount=D(surcharge))
        for kind, price in lines:
            CartLine.objects.create(cart=cart, description=kind, unit_price=D(price), line_kind=kind)
        cart.recalculate()
        Cart.objects.filter(pk=cart.pk).update(completed_at=when)
        return cart

    def get(self, start='2026-09-01', end='2026-09-30', user=None):
        self.client.force_authenticate(user or self.owner)
        return self.client.get('/api/pos/reports/sales-tax/', {'start': start, 'end': end})

    def test_a_month_of_sales_with_its_parts_rates_days_and_what_is_left_out(self):
        self.sale(_at(2026, 9, 2), [('item', '100.00'), ('discount', '-10.00')], surcharge='2.70')
        self.sale(_at(2026, 9, 2, 18), [('item', '20.00'), ('delivery', '30.00')], payment='cash')
        self.sale(_at(2026, 9, 30, 23), [('manual', '5.00'), ('assembly', '15.00')])   # late on the last day: in
        self.sale(_at(2026, 10, 1, 0), [('item', '999.00')])                              # just after: out
        self.sale(_at(2026, 9, 5), [('item', '40.00')], status='voided')                  # voided: apart
        self.sale(_at(2026, 9, 6), [('item', '60.00')], status='training')                # training register: out
        r = self.get()
        self.assertEqual(r.status_code, 200, r.data)
        d = r.data
        self.assertEqual(d['sales'], 3)
        self.assertEqual((d['taxable_sales'], d['exempt_sales'], d['tax_collected']), ('160.00', '0.00', '11.20'))
        self.assertEqual(d['parts'], {'merchandise': '125.00', 'discounts': '-10.00', 'delivery_fees': '30.00', 'assembly': '15.00'})
        rate = d['rates'][0]
        self.assertEqual((rate['rate'], rate['state_tax'], rate['local_tax'], rate['tax_at_rate']), ('0.0700', '8.80', '2.40', '11.20'))
        self.assertEqual(d['rounding'], '0.00')
        self.assertEqual([(x['day'], x['count'], x['taxable']) for x in d['days']], [('2026-09-02', 2, '140.00'), ('2026-09-30', 1, '20.00')])
        self.assertEqual(d['card_surcharge'], '2.70')
        self.assertEqual(d['voided'], {'count': 1, 'taxable': '40.00', 'tax': '2.80'})
        self.assertEqual({p['method'] for p in d['payments']}, {'card', 'cash'})

    def test_only_the_owner_and_a_sane_period(self):
        manager = User.objects.create_user(email='mgr@example.com', first_name='M', last_name='G', password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.assertEqual(self.get(user=manager).status_code, 403)
        self.assertEqual(self.get(start='2026-09-30', end='2026-09-01').status_code, 400)
        self.assertEqual(self.get(start='soon').status_code, 400)
