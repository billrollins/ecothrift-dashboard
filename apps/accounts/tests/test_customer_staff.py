"""Staff customer CRUD + service actions for Online Sales."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from rest_framework.test import APITestCase

from apps.accounts.models import CustomerProfile, MagicLinkToken

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
        self.assertFalse(res.data['email_verified'])
        user = User.objects.get(id=res.data['id'])
        self.assertTrue(user.groups.filter(name='Customer').exists())
        self.assertFalse(user.is_staff)

    def test_lookup_uses_user_id_not_profile_id(self):
        res = self._create_customer()
        user_id = res.data['id']
        profile = CustomerProfile.objects.get(user_id=user_id)
        # If these ever diverge, URL must still resolve by user id.
        self.assertEqual(profile.user_id, user_id)

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
        self.assertTrue(CustomerProfile.objects.filter(user_id=user_id).exists())

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
