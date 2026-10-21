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
        self.assertEqual((d['thrift_plus_returns']['count'], d['thrift_plus_returns']['tax_back']), (0, '0.00'))

    def test_thrift_plus_returns_show_the_price_and_tax_given_back_on_the_return_day(self):
        from apps.thriftplus.models import Account, Person, ReturnRecord

        sale = self.sale(_at(2026, 9, 2), [('item', '80.00')])
        line = sale.lines.get()
        account = Account.objects.create()
        person = Person.objects.create(account=account, first_name='Ana')
        record = ReturnRecord.objects.create(account=account, person=person, cart_line=line, paid=D('68.48'), credit=D('68.48'),
                                             taxable_back=D('64.00'), tax_back=D('4.48'))
        ReturnRecord.objects.filter(pk=record.pk).update(created_at=_at(2026, 9, 4))
        practice = Account.objects.create(is_practice=True)
        other = self.sale(_at(2026, 9, 2), [('item', '10.00')]).lines.get()
        ReturnRecord.objects.create(account=practice, person=Person.objects.create(account=practice, first_name='P'),
                                    cart_line=other, paid=D('8.56'), taxable_back=D('8.00'), tax_back=D('0.56'))
        ReturnRecord.objects.filter(account=practice).update(created_at=_at(2026, 9, 5))
        d = self.get().data
        returns = d['thrift_plus_returns']
        self.assertEqual((returns['count'], returns['taxable_back'], returns['tax_back'], returns['refund']),
                         (1, '64.00', '4.48', '68.48'))  # practice memberships are left out
        self.assertEqual(returns['days'], [{'day': '2026-09-04', 'count': 1, 'taxable_back': '64.00', 'tax_back': '4.48'}])
        self.assertEqual(d['taxable_sales'], '90.00')  # the sale itself is never changed (W11)
        self.assertEqual((d['tax_collected'], d['tax_collected_less_returns']), ('6.30', '1.82'))
        self.assertEqual(d['taxable_sales_less_returns'], '26.00')

    def test_only_the_owner_and_a_sane_period(self):
        manager = User.objects.create_user(email='mgr@example.com', first_name='M', last_name='G', password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.assertEqual(self.get(user=manager).status_code, 403)
        self.assertEqual(self.get(start='2026-09-30', end='2026-09-01').status_code, 400)
        self.assertEqual(self.get(start='soon').status_code, 400)
