"""Staff purchases (owner, 2026-10-07): payroll deduction at the register, and Thrift+ free for staff."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AppSetting
from apps.hr.models import TimeEntry
from apps.hr.services.payroll_periods import payroll_period_bounds
from apps.pos.models import Cart
from apps.pos.services import staff_purchases

from .test_cart_card_surcharge import _CartCardSurchargeFixtures


def _staff(email, role='Employee', rate='15.00'):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='Staff',
                                    password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.update_or_create(user=user, defaults={
        'employee_number': f'EMP-T{user.pk}', 'pay_rate': Decimal(rate), 'hire_date': timezone.localdate()})
    return user


def _worked_last_period(user, hours=40):
    start, _ = payroll_period_bounds(timezone.localdate())
    day = start - timedelta(days=3)
    tz = timezone.get_current_timezone()
    clock_in = timezone.make_aware(datetime.combine(day, time(8, 0)), tz)
    for n in range(hours // 8):
        d = day - timedelta(days=n)
        TimeEntry.objects.create(employee=user, date=d, clock_in=clock_in - timedelta(days=n),
                                 clock_out=clock_in - timedelta(days=n) + timedelta(hours=8))


class PayrollDeductionTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.buyer = _staff('dana@example.com')  # $15/hr
        self.owner = _staff('owner@example.com', 'Admin')

    def turn_on(self, **extra):
        staff_purchases.save_settings({'payroll_deduction': True, **extra}, user=self.owner)

    def pay(self, cid, employee=None):
        return self._complete(cid, {'payment_method': 'payroll', 'payroll_employee': (employee or self.buyer).pk})

    def test_off_by_default_and_new_hires_without_a_paycheck_do_not_qualify(self):
        self.assertEqual(staff_purchases.settings_value(),
                         {'payroll_deduction': False, 'payroll_max_percent': 25, 'thrift_plus_free': False})
        cid, _ = self._open_cart_with_item()
        off = self.pay(cid)
        self.assertEqual(off.status_code, 400)
        self.assertIn('switched off', off.data['detail'])
        self.turn_on()
        new = self.pay(cid)
        self.assertEqual(new.status_code, 400)
        self.assertIn('first paycheck', new.data['detail'])

    def test_a_quarter_of_the_last_paycheck_for_the_whole_pay_period(self):
        self.turn_on()
        _worked_last_period(self.buyer, 40)  # 40 h x $15 = $600; 25% = $150
        check = self.client.get('/api/pos/staff-purchases/eligibility/', {'employee': self.buyer.pk}).data
        self.assertEqual((check['eligible'], str(check['limit']), str(check['available'])), (True, '150.00', '150.00'))
        cid, _ = self._open_cart_with_item()  # $100, no tax in these fixtures
        done = self.pay(cid)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual((done.data['payment_method'], done.data['payroll_employee']), ('payroll', self.buyer.pk))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, Decimal('0'))  # nothing in the drawer
        from apps.inventory.models import Category, Item, Product
        second = Item.objects.create(sku='POSTESTSURCH2', price=Decimal('60.00'), status='on_shelf',
                                     product=Product.objects.create(title='Lamp', brand='QA',
                                                                    category=Category.objects.first()))
        cid2, _ = self._open_cart_with_item(sku=second.sku)
        over = self.pay(cid2)
        self.assertEqual(over.status_code, 400)
        self.assertIn('$50.00', over.data['detail'])
        # The list for QuickBooks, then marked entered.
        manager = _staff('boss@example.com', 'Manager')
        self.client.force_authenticate(manager)
        listing = self.client.get('/api/pos/staff-purchases/deductions/').data
        self.assertEqual([(p['employee']['id'], str(p['total'])) for p in listing['people']], [(self.buyer.pk, '100.00')])
        marked = self.client.post('/api/pos/staff-purchases/deductions/mark/', {
            'employee': self.buyer.pk, 'period_start': str(listing['start'])}, format='json').data
        self.assertTrue(marked['people'][0]['entered']['matches'])

    def test_never_your_own_sale_and_a_day_on_the_floor(self):
        self.turn_on()
        _worked_last_period(self.user, 40)
        cid, _ = self._open_cart_with_item()
        own = self.pay(cid, employee=self.user)
        self.assertEqual(own.status_code, 400)
        self.assertIn('Never ring your own sale', own.data['detail'])
        _worked_last_period(self.buyer, 40)
        self.item.listed_at = timezone.now() - timedelta(hours=3)
        self.item.save(update_fields=['listed_at'])
        fresh = self.pay(cid)
        self.assertEqual((fresh.status_code, fresh.data.get('code')), (400, 'FLOOR_DAY'))

    def test_only_the_owner_changes_the_switches(self):
        manager = _staff('boss@example.com', 'Manager')
        self.client.force_authenticate(manager)
        self.assertEqual(self.client.put('/api/pos/staff-purchases/settings/', {'payroll_deduction': True},
                                         format='json').status_code, 403)
        AppSetting.objects.get_or_create(key='pos.staff_purchases', defaults={'value': staff_purchases.DEFAULTS})
        generic = self.client.patch('/api/core/settings/pos.staff_purchases/', {'value': {'payroll_deduction': True}},
                                    format='json')
        self.assertEqual(generic.status_code, 403)
        self.client.force_authenticate(self.owner)
        saved = self.client.put('/api/pos/staff-purchases/settings/', {'payroll_deduction': True,
                                                                        'payroll_max_percent': 30}, format='json')
        self.assertEqual((saved.status_code, saved.data['payroll_max_percent']), (200, 30))
        bad = self.client.put('/api/pos/staff-purchases/settings/', {'payroll_max_percent': 0}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_a_voided_payroll_sale_leaves_the_list(self):
        self.turn_on()
        _worked_last_period(self.buyer, 40)
        cid, _ = self._open_cart_with_item()
        self.assertEqual(self.pay(cid).status_code, 200)
        Cart.objects.filter(pk=cid).update(status='voided')
        self.assertEqual(staff_purchases.deductions()['people'], [])
        self.assertEqual(str(staff_purchases.eligibility(self.buyer)['used']), '0.00')


class StaffThriftPlusTests(TestCase):
    def test_a_staff_membership_pays_no_cover_while_the_switch_is_on(self):
        from apps.thriftplus.models import Account
        from apps.thriftplus.services import ledger

        owner = _staff('owner@example.com', 'Admin')
        clerk = _staff('clerk@example.com')
        account = Account.objects.create()
        normal = ledger.cover(account)['amount']
        self.assertNotEqual(normal, '0.00')
        account.staff_user = clerk
        account.save()
        self.assertEqual(ledger.cover(account)['amount'], normal)  # switch still off
        staff_purchases.save_settings({'thrift_plus_free': True}, user=owner)
        free = ledger.cover(account)
        self.assertEqual((free['amount'], free['remaining'], free['is_covered']), ('0.00', '0.00', True))
        clerk.is_active = False
        clerk.save()
        self.assertEqual(ledger.cover(account)['amount'], normal)  # not staff any more

    def test_managers_link_a_membership_to_a_staff_member(self):
        from apps.thriftplus.models import Account

        manager = _staff('boss@example.com', 'Manager')
        clerk = _staff('clerk@example.com')
        account = Account.objects.create()
        api = APIClient()
        api.force_authenticate(manager)
        linked = api.post(f'/api/thriftplus/accounts/{account.pk}/staff/', {'user': clerk.pk}, format='json')
        self.assertEqual(linked.status_code, 200, linked.data)
        self.assertEqual(linked.data['staff']['id'], clerk.pk)
        second = Account.objects.create()
        dup = api.post(f'/api/thriftplus/accounts/{second.pk}/staff/', {'user': clerk.pk}, format='json')
        self.assertEqual(dup.status_code, 400)
        cleared = api.post(f'/api/thriftplus/accounts/{account.pk}/staff/', {'user': None}, format='json')
        self.assertIsNone(cleared.data['staff'])
