"""Staff customer CRUD + service actions for Online Sales."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from rest_framework.test import APITestCase

from apps.accounts.models import CustomerProfile, MagicLinkToken
from apps.thriftplus.models import Account, Person

User = get_user_model()


class CustomerStaffApiTests(APITestCase):
    def setUp(self):
        Group.objects.get_or_create(name='Customer')
        Group.objects.get_or_create(name='Manager')
        self.mgr = User.objects.create_user(
            email='mgr@example.com',
            password='x',
            first_name='Mo',
            last_name='Manager',
            is_staff=True,
        )
        self.mgr.groups.add(Group.objects.get(name='Manager'))
        self.client.force_authenticate(self.mgr)

    def _create_customer(self, **overrides):
        payload = {
            'email': 'ada@example.com',
            'first_name': 'Ada',
            'last_name': 'Lovelace',
            'phone': '3305550100',
            'notes': 'VIP',
        }
        payload.update(overrides)
        return self.client.post('/api/accounts/customers/', payload, format='json')

    def test_create_assigns_customer_group_and_returns_flags(self):
        res = self._create_customer()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['is_active'])
        self.assertTrue(res.data['email_verified'])  # an address typed in Dash is trusted, as for a staff-made member
        user = User.objects.get(id=res.data['id'])
        self.assertTrue(user.groups.filter(name='Customer').exists())
        self.assertFalse(user.is_staff)

    def test_the_customer_is_a_thriftplus_person_and_no_customer_record_is_made(self):
        """One customer system (T62): the note lives on the membership, the old record is never written."""
        res = self._create_customer()
        user = User.objects.get(id=res.data['id'])
        person = Person.objects.get(user=user)
        self.assertEqual(person.account.status, Account.STATUS_PENDING)
        self.assertEqual(person.account.notes, 'VIP')
        self.assertEqual((person.first_name, person.last_name, person.email), ('Ada', 'Lovelace', 'ada@example.com'))
        self.assertIsNotNone(person.email_verified_at)
        self.assertFalse(CustomerProfile.objects.exists())

    def test_a_note_needs_a_name_to_live_on(self):
        """A login with no name (made by a bare email sign-in) is no member, so a note has no place yet."""
        nameless = User.objects.create_user(email='anon@example.com', first_name='', last_name='')
        nameless.groups.add(Group.objects.get(name='Customer'))
        res = self.client.patch(f'/api/accounts/customers/{nameless.pk}/', {'notes': 'x'}, format='json')
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn('notes', res.data)
        self.assertFalse(Person.objects.exists())  # no name, no member
        ok = self.client.patch(f'/api/accounts/customers/{nameless.pk}/', {'phone': '555'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data['customer_number'], '')

    def test_member_code_is_the_customer_number(self):
        from apps.thriftplus.models import Card

        res = self._create_customer()
        user = User.objects.get(id=res.data['id'])
        code = Card.objects.get(person__user=user, status=Card.STATUS_ACTIVE).code
        self.assertEqual(res.data['customer_number'].replace(' ', ''), code)
        got = self.client.get(f'/api/accounts/customers/{user.pk}/')
        self.assertEqual(got.data['customer_number'].replace(' ', ''), code)
        self.assertEqual(got.data['notes'], 'VIP')

    def test_lookup_by_old_customer_number_is_gone(self):
        self.assertEqual(self.client.get('/api/accounts/customers/lookup/CUS-001/').status_code, 404)

    def test_patch_by_user_id(self):
        res = self._create_customer()
        user_id = res.data['id']
        patch = self.client.patch(
            f'/api/accounts/customers/{user_id}/',
            {'notes': 'Updated'},
            format='json',
        )
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertEqual(patch.data['notes'], 'Updated')

    def test_delete_soft_deactivates(self):
        res = self._create_customer()
        user_id = res.data['id']
        delete = self.client.delete(f'/api/accounts/customers/{user_id}/')
        self.assertEqual(delete.status_code, 200, delete.data)
        self.assertFalse(delete.data['is_active'])
        self.assertTrue(User.objects.filter(id=user_id).exists())
        self.assertTrue(Person.objects.filter(user_id=user_id).exists())  # history stays

        again = self.client.post(f'/api/accounts/customers/{user_id}/reactivate/')
        self.assertEqual(again.status_code, 200, again.data)
        self.assertTrue(again.data['is_active'])

    def test_send_sign_in_link(self):
        res = self._create_customer()
        user_id = res.data['id']
        mail.outbox.clear()
        sent = self.client.post(f'/api/accounts/customers/{user_id}/send-sign-in-link/')
        self.assertEqual(sent.status_code, 200, sent.data)
        self.assertEqual(MagicLinkToken.objects.filter(email='ada@example.com').count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_filter_inactive(self):
        res = self._create_customer()
        user_id = res.data['id']
        self.client.delete(f'/api/accounts/customers/{user_id}/')
        active = self.client.get('/api/accounts/customers/', {'is_active': '1'})
        inactive = self.client.get('/api/accounts/customers/', {'is_active': '0'})
        self.assertEqual(active.status_code, 200)
        self.assertEqual(inactive.status_code, 200)
        self.assertEqual(active.data['count'], 0)
        self.assertEqual(inactive.data['count'], 1)
