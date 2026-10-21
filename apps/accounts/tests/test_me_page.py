"""The Me page (critic review 2026-10-21): my details and emergency contact, my register PIN (password first), my
weekly shifts, and sign out on all devices."""
from datetime import time
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import AccountEvent, EmployeeProfile, User
from apps.hr.models import Department, Shift, ShiftAssignment

PASSWORD = 'pw-12345-xx'


def _user(email, role='Employee'):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password=PASSWORD, is_staff=role != 'Customer')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if role in ('Employee', 'Manager', 'Admin'):
        EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                       hire_date=timezone.localdate(), pay_rate=Decimal('15'))
    return user


class MePageTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.me = _user('carrie@x.com')
        self.client.force_authenticate(self.me)

    def test_the_page_has_my_details_pin_and_shifts(self):
        dept = Department.objects.create(name='Me Test Dept')
        shift = Shift.objects.create(name='Me Test Open', department=dept, time_in=time(8, 30), time_out=time(14, 30),
                                     weekdays=[1, 2, 3, 4, 5])
        ShiftAssignment.objects.create(employee=self.me, shift=shift, weekdays=[1, 3, 6])
        body = self.client.get('/api/auth/me/page/').json()
        self.assertEqual(body['details']['email'], 'carrie@x.com')
        self.assertEqual(body['employee']['emergency_name'], '')
        self.assertEqual(body['pin'], {'set': False, 'set_at': None, 'can_set': True})
        self.assertEqual(body['schedule'], [{'shift': 'Me Test Open', 'department': 'Me Test Dept', 'time_in': '08:30',
                                             'time_out': '14:30', 'days': [1, 3], 'day_names': ['Tue', 'Thu']}])
        self.assertIsNone(body['drawers'])

    def test_customers_have_no_me_page(self):
        self.client.force_authenticate(_user('cust@x.com', 'Customer'))
        self.assertEqual(self.client.get('/api/auth/me/page/').status_code, 403)

    def test_edit_my_phone_and_emergency_contact(self):
        res = self.client.patch('/api/auth/me/details/', {'phone': '402-555-0101', 'emergency_name': 'Sam T',
                                                         'emergency_phone': '(402) 555-0199'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.me.refresh_from_db()
        self.assertEqual(self.me.phone, '402-555-0101')
        self.assertEqual(self.me.employee.emergency_name, 'Sam T')
        bad = self.client.patch('/api/auth/me/details/', {'emergency_name': 'Sam', 'emergency_phone': '555'},
                                format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.client.patch('/api/auth/me/details/', {'phone': '12'}, format='json').status_code, 400)

    def test_set_my_pin_needs_my_password(self):
        wrong = self.client.post('/api/auth/me/pin/', {'pin': '4071', 'password': 'nope'}, format='json')
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.json()['code'], 'PASSWORD_WRONG')
        easy = self.client.post('/api/auth/me/pin/', {'pin': '1234', 'password': PASSWORD}, format='json')
        self.assertEqual(easy.json()['code'], 'PIN_EASY')
        ok = self.client.post('/api/auth/me/pin/', {'pin': '4071', 'password': PASSWORD}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertTrue(ok.json()['pin']['set'])
        self.assertNotIn('4071', ok.content.decode())

    def test_an_admin_clears_a_forgotten_pin(self):
        from apps.accounts.services.register_pin import set_pin

        set_pin(self.me, '4071')
        admin = _user('admin@x.com', 'Admin')
        self.client.force_authenticate(admin)
        res = self.client.post(f'/api/accounts/users/{self.me.pk}/clear-register-pin/')
        self.assertEqual(res.status_code, 200, res.content)
        self.me.refresh_from_db()
        self.assertIsNone(self.me.register_pin_hash)
        self.client.force_authenticate(_user('emp2@x.com'))
        self.assertEqual(self.client.post(f'/api/accounts/users/{self.me.pk}/clear-register-pin/').status_code, 403)


class SignOutEverywhereTests(APITestCase):
    def setUp(self):
        self.me = _user('carrie@x.com')

    def test_every_sign_in_ends_this_one_too(self):
        phone, desk = RefreshToken.for_user(self.me), RefreshToken.for_user(self.me)
        access = str(desk.access_token)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(client.get('/api/auth/me/page/').status_code, 200)

        # Tokens carry whole seconds: move the sign-out a second on, as if it happened later.
        res = client.post('/api/auth/sign-out-everywhere/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['ended'], 2)
        User.objects.filter(pk=self.me.pk).update(sessions_ended_at=timezone.now() + timezone.timedelta(seconds=1))
        self.assertEqual(client.get('/api/auth/me/page/').status_code, 401)  # the old access token is refused
        refresh = APIClient()
        refresh.cookies['refresh_token'] = str(phone)
        self.assertEqual(refresh.post('/api/auth/refresh/').status_code, 401)  # and the phone's refresh is spent
        self.assertTrue(AccountEvent.objects.filter(user=self.me, kind=AccountEvent.KIND_SIGNED_OUT_ALL).exists())

    def test_a_new_sign_in_after_works(self):
        client = APIClient()
        client.force_authenticate(self.me)
        client.post('/api/auth/sign-out-everywhere/')
        User.objects.filter(pk=self.me.pk).update(sessions_ended_at=timezone.now() - timezone.timedelta(seconds=2))
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.me).access_token}')
        self.assertEqual(fresh.get('/api/auth/me/page/').status_code, 200)
