"""Register PIN (critic review 2026-10-21): one unique PIN per staff member, kept hashed, checked with an optional
lowest role, and five wrong tries lock PIN entry on that register only (REG-11)."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import AccountEvent, EmployeeProfile, User
from apps.accounts.services import register_pin
from apps.accounts.services.register_pin import PinError, check_pin, clear_pin, set_pin


def _user(email, role='Employee', **kw):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='pw-12345-xx', is_staff=role != 'Customer', **kw)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if role in ('Employee', 'Manager', 'Admin'):
        EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                       hire_date=timezone.localdate(), pay_rate=Decimal('15'))
    return user


class SetPinTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.cashier = _user('cashier@x.com')
        self.manager = _user('manager@x.com', 'Manager')

    def test_a_pin_is_kept_hashed_and_logged(self):
        status = set_pin(self.cashier, '4071')
        self.assertTrue(status['set'])
        self.cashier.refresh_from_db()
        self.assertNotIn('4071', self.cashier.register_pin_hash)
        self.assertEqual(len(self.cashier.register_pin_hash), 64)
        event = AccountEvent.objects.get(user=self.cashier, kind=AccountEvent.KIND_PIN_SET)
        self.assertEqual(event.detail, 'set')
        set_pin(self.cashier, '5082')
        self.assertEqual(AccountEvent.objects.filter(kind=AccountEvent.KIND_PIN_SET, detail='changed').count(), 1)

    def test_format_and_too_easy_pins_are_refused(self):
        for pin, code in [('12', 'PIN_FORMAT'), ('1234567', 'PIN_FORMAT'), ('12a4', 'PIN_FORMAT'), ('', 'PIN_FORMAT'),
                          ('1111', 'PIN_EASY'), ('1234', 'PIN_EASY'), ('9876', 'PIN_EASY'), ('345678', 'PIN_EASY')]:
            with self.assertRaises(PinError) as caught:
                set_pin(self.cashier, pin)
            self.assertEqual(caught.exception.code, code, pin)
        set_pin(self.cashier, '135790')  # 6 digits is fine

    def test_a_pin_someone_else_has_is_refused_without_saying_whose(self):
        set_pin(self.manager, '4071')
        with self.assertRaises(PinError) as caught:
            set_pin(self.cashier, '4071')
        self.assertEqual(caught.exception.code, 'PIN_TAKEN')
        self.assertNotIn('Manager', str(caught.exception))
        set_pin(self.manager, '4071')  # your own again is fine

    def test_five_taken_answers_in_an_hour_stop_setting(self):
        for n in range(5):
            set_pin(self.manager, f'40{n}9')
            with self.assertRaises(PinError):
                set_pin(self.cashier, f'40{n}9')
        with self.assertRaises(PinError) as caught:
            set_pin(self.cashier, '8642')
        self.assertEqual(caught.exception.code, 'PIN_SET_LOCKED')

    def test_only_active_staff_hold_a_pin(self):
        customer = _user('cust@x.com', 'Customer')
        with self.assertRaises(PinError) as caught:
            set_pin(customer, '4071')
        self.assertEqual(caught.exception.code, 'PIN_NOT_STAFF')
        owner = User.objects.create_superuser(email='owner@x.com', first_name='O', last_name='W', password='pw-12345-xx')
        set_pin(owner, '4071')  # the owner has no employee profile and still holds one
        self.assertTrue(register_pin.has_pin(owner))

    def test_clear_pin(self):
        set_pin(self.cashier, '4071')
        clear_pin(self.cashier, actor=self.manager)
        self.cashier.refresh_from_db()
        self.assertFalse(register_pin.has_pin(self.cashier))
        self.assertEqual(AccountEvent.objects.get(kind=AccountEvent.KIND_PIN_CLEARED).actor, self.manager)
        set_pin(self.manager, '4071')  # the cleared PIN is free again


class CheckPinTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.cashier = _user('cashier@x.com')
        self.manager = _user('manager@x.com', 'Manager')
        self.owner = User.objects.create_superuser(email='owner@x.com', first_name='O', last_name='W', password='pw-12345-xx')
        set_pin(self.cashier, '4071')
        set_pin(self.manager, '5082')
        set_pin(self.owner, '6093')

    def test_the_pin_says_who(self):
        self.assertEqual(check_pin('4071', device='register:R1'), self.cashier)
        self.assertEqual(check_pin('5082', device='register:R1', min_role='Manager'), self.manager)
        self.assertEqual(check_pin('6093', device='register:R1', min_role='Admin'), self.owner)

    def test_below_the_role_counts_as_wrong(self):
        with self.assertRaises(PinError) as caught:
            check_pin('4071', device='register:R1', min_role='Manager')
        self.assertEqual(caught.exception.code, 'PIN_WRONG')
        self.assertEqual(caught.exception.extra['tries_left'], 4)
        with self.assertRaises(PinError):
            check_pin('5082', device='register:R1', min_role='Admin')
        with self.assertRaises(ValueError):
            check_pin('5082', device='register:R1', min_role='Boss')

    def test_five_wrong_lock_that_register_only(self):
        for _ in range(4):
            with self.assertRaises(PinError):
                check_pin('0000', device='register:R1')
        with self.assertRaises(PinError) as caught:
            check_pin('0000', device='register:R1')
        self.assertEqual(caught.exception.code, 'PIN_LOCKED')
        self.assertEqual(caught.exception.http, 429)
        with self.assertRaises(PinError) as caught:
            check_pin('4071', device='register:R1')  # even a right PIN waits out the lock there
        self.assertEqual(caught.exception.code, 'PIN_LOCKED')
        self.assertEqual(check_pin('4071', device='register:R2'), self.cashier)  # another register is not locked

    def test_a_right_pin_clears_the_count(self):
        for _ in range(4):
            with self.assertRaises(PinError):
                check_pin('0000', device='register:R1')
        check_pin('4071', device='register:R1')
        with self.assertRaises(PinError) as caught:
            check_pin('0000', device='register:R1')
        self.assertEqual(caught.exception.extra['tries_left'], 4)

    def test_switched_off_or_ended_staff_have_no_working_pin(self):
        self.cashier.is_active = False
        self.cashier.save()
        with self.assertRaises(PinError):
            check_pin('4071', device='register:R1')
        profile = self.manager.employee
        profile.termination_date = timezone.localdate() - timedelta(days=1)
        profile.save()
        with self.assertRaises(PinError):
            check_pin('5082', device='register:R1')

    def test_empty_pin(self):
        with self.assertRaises(PinError) as caught:
            check_pin('', device='register:R1')
        self.assertEqual(caught.exception.code, 'PIN_NEEDED')

    def test_device_key(self):
        class Reg:
            code = 'R7'

        class Req:
            META = {'REMOTE_ADDR': '10.0.0.5'}

        self.assertEqual(register_pin.device_key(Req(), Reg()), 'register:R7')
        self.assertEqual(register_pin.device_key(Req(), 'R8'), 'register:R8')
        self.assertEqual(register_pin.device_key(Req()), 'ip:10.0.0.5')
