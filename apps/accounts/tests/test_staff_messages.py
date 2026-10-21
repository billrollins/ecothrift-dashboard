"""Staff messages in Dash (owner 2026-10-21): threads to a person or a department, replies, read receipts, the unread
count, one-time secrets, and the accounts.issue_register_pins request."""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, StaffMessage, StaffMessageSecret, User
from apps.accounts.services import register_pin, staff_messages
from apps.accounts.services.one_time_secret import open_sealed, seal
from apps.core.models import ApprovalRequest
from apps.core.services import approval_requests as requests_service
from apps.hr.models import Department


def _person(email, role='Employee', department=None, superuser=False):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='pw-12345-xx', is_staff=True, is_superuser=superuser)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal('15'), hire_date=date(2026, 1, 1), department=department)
    return user


class ThreadTests(APITestCase):
    def setUp(self):
        self.retail = Department.objects.create(name='Msg Retail')
        self.manager = _person('manager@x.com', 'Manager', self.retail)
        self.carrie = _person('carrie@x.com', department=self.retail)
        self.dave = _person('dave@x.com', department=self.retail)
        self.other = _person('other@x.com')

    def test_a_manager_messages_a_department_and_everyone_can_reply(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post('/api/accounts/messages/', {
            'subject': 'Truck Friday', 'body': 'All hands at 8.', 'to_department': self.retail.pk}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        thread = res.json()
        self.assertEqual(thread['audience'], 'Msg Retail')
        self.assertEqual({m['name'] for m in thread['members']},
                         {self.manager.full_name, self.carrie.full_name, self.dave.full_name})

        self.client.force_authenticate(self.carrie)
        self.assertEqual(self.client.get('/api/accounts/messages/unread/').json()['unread'], 1)
        listed = self.client.get('/api/accounts/messages/').json()
        self.assertEqual((listed[0]['subject'], listed[0]['unread']), ('Truck Friday', 1))
        opened = self.client.get(f'/api/accounts/messages/{thread["id"]}/').json()
        self.assertEqual(opened['messages'][0]['body'], 'All hands at 8.')
        self.assertEqual(self.client.get('/api/accounts/messages/unread/').json()['unread'], 0)
        self.client.post(f'/api/accounts/messages/{thread["id"]}/reply/', {'body': "I'll be there."}, format='json')

        self.client.force_authenticate(self.manager)
        seen = self.client.get(f'/api/accounts/messages/{thread["id"]}/').json()
        self.assertEqual([r['name'] for r in seen['messages'][0]['read_by']], [self.carrie.full_name])
        self.assertEqual(seen['messages'][1]['sender'], self.carrie.full_name)

        self.client.force_authenticate(self.other)  # not on the thread
        self.assertEqual(self.client.get(f'/api/accounts/messages/{thread["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/accounts/messages/{thread["id"]}/reply/', {'body': 'hi'},
                                          format='json').status_code, 404)

    def test_staff_cannot_start_a_thread(self):
        self.client.force_authenticate(self.carrie)
        res = self.client.post('/api/accounts/messages/', {
            'subject': 'Hi', 'body': 'x', 'to_user': self.dave.pk}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.client.get('/api/accounts/messages/audiences/').status_code, 403)

    def test_customers_have_no_messages(self):
        customer = User.objects.create_user(email='c@x.com', first_name='C', last_name='C', password='pw-12345-xx')
        customer.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get('/api/accounts/messages/').status_code, 403)


class SecretTests(APITestCase):
    def setUp(self):
        self.manager = _person('manager@x.com', 'Manager')
        self.carrie = _person('carrie@x.com')

    def test_seal_round_trip_and_tamper(self):
        sealed = seal('4071')
        self.assertNotIn('4071', sealed)
        self.assertEqual(open_sealed(sealed), '4071')
        bad = sealed[:-4] + ('AAAA' if not sealed.endswith('AAAA') else 'BBBB')
        with self.assertRaises(Exception):
            open_sealed(bad)

    def test_a_secret_shows_once_to_its_reader_then_is_deleted(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post('/api/accounts/messages/', {
            'subject': 'Wifi', 'body': 'The office wifi password.', 'to_user': self.carrie.pk, 'secret': 'green-fern-42'},
            format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertNotIn('green-fern-42', res.content.decode())
        message_id = res.json()['messages'][0]['id']
        self.assertEqual(res.json()['messages'][0]['secret']['state'], 'waiting')
        self.assertFalse(res.json()['messages'][0]['secret']['can_show'])  # the sender can't
        self.assertEqual(self.client.post(f'/api/accounts/messages/secret/{message_id}/show/').status_code, 403)

        self.client.force_authenticate(self.carrie)
        listing = self.client.get('/api/accounts/messages/').content.decode()
        thread = self.client.get(f'/api/accounts/messages/{res.json()["id"]}/')
        self.assertNotIn('green-fern-42', listing + thread.content.decode())
        self.assertTrue(thread.json()['messages'][0]['secret']['can_show'])
        shown = self.client.post(f'/api/accounts/messages/secret/{message_id}/show/', HTTP_USER_AGENT='TestPhone')
        self.assertEqual(shown.json(), {'secret': 'green-fern-42'})
        self.assertEqual(shown['Cache-Control'], 'no-store')
        self.assertFalse(StaffMessageSecret.objects.filter(message_id=message_id).exists())
        message = StaffMessage.objects.get(pk=message_id)
        self.assertIsNotNone(message.secret_shown_at)
        self.assertIn('TestPhone', message.secret_shown_device)
        again = self.client.post(f'/api/accounts/messages/secret/{message_id}/show/')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()['code'], 'SECRET_GONE')
        after = self.client.get(f'/api/accounts/messages/{res.json()["id"]}/').json()['messages'][0]['secret']
        self.assertEqual(after['state'], 'shown')

    def test_a_secret_goes_to_one_person_only(self):
        dept = Department.objects.create(name='Msg Team')
        _person('x@x.com', department=dept)
        with self.assertRaises(Exception):
            staff_messages.start_thread(self.manager, subject='S', body='B', to_department=dept.pk, secret='1')


class IssuePinsRequestTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner = _person('bill@x.com', 'Admin', superuser=True)
        self.carrie = _person('carrie@x.com', 'Manager')
        self.david = _person('david@x.com', 'Manager')
        self.has = _person('has@x.com', 'Manager')
        register_pin.set_pin(self.has, '5082')

    def test_preview_names_only_then_pins_go_out_once(self):
        request = requests_service.stage('accounts.issue_register_pins', title='PINs', params={
            'users': [self.carrie.pk, 'david@x.com', self.has.pk, 'nobody@x.com']})
        text = str(request.preview)
        self.assertIn(self.carrie.full_name, text)
        self.assertIn('already has a PIN', text)
        self.assertIn('no such login', text)
        self.assertEqual(request.preview['counts']['PINs to issue'], 2)

        requests_service.approve(request, self.owner, start=False)
        requests_service.run(request.pk)
        request.refresh_from_db()
        self.assertEqual(request.status, ApprovalRequest.STATUS_APPLIED, request.error)
        for user in (self.carrie, self.david):
            user.refresh_from_db()
            self.assertTrue(register_pin.has_pin(user))
            message = StaffMessage.objects.get(secret_for=user)
            self.assertEqual(message.sender, self.owner)
            self.assertIn('tap Show', message.body)
            self.client.force_authenticate(user)
            pin = self.client.post(f'/api/accounts/messages/secret/{message.pk}/show/').json()['secret']
            self.assertRegex(pin, r'^\d{4}$')
            self.assertFalse(register_pin._too_easy(pin))
            self.assertEqual(register_pin.check_pin(pin, device='register:T'), user)
            self.assertNotIn(pin, request.log + str(request.result) + str(request.progress) + message.body)
        self.has.refresh_from_db()
        self.assertEqual(register_pin.check_pin('5082', device='register:T'), self.has)  # untouched
        self.assertEqual(len(set(User.objects.exclude(register_pin_hash=None).values_list('register_pin_hash', flat=True))), 3)
