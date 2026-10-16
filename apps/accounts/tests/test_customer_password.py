"""No customer passwords (owner 2026-10-16: "the only passwords are for staff"). A customer signs in to ecothrift.us
with an emailed link; every password path answers that, and a staff login keeps its Dash password."""
from django.contrib.auth.models import Group
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.accounts.services.magic_link import consume_magic_link


@override_settings(
    ONLINE_SALES_ACCOUNTS_ENABLED=True,
    ONLINE_SALES_ENABLED=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEBUG=True,
)
class NoCustomerPasswordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Group.objects.get_or_create(name='Customer')
        Group.objects.get_or_create(name='Manager')

    def _customer(self, email='shop@example.com', password='old-secret-1'):
        user = User.objects.create_user(email=email, first_name='Shop', last_name='Per', password=password)
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(user=user, customer_number=CustomerProfile.generate_customer_number())
        return user

    def test_register_takes_no_password_and_lookup_never_offers_one(self):
        reg = self.client.post('/api/auth/customer/register/',
                               {'email': 'new@example.com', 'first_name': 'New', 'password': 'secret1'}, format='json')
        self.assertEqual(reg.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(User.objects.get(email='new@example.com').has_usable_password())
        found = self.client.post('/api/auth/customer/lookup/', {'email': 'new@example.com'}, format='json').json()
        self.assertEqual(found, {'has_account': True, 'has_password': False})

    def test_a_customer_with_an_old_password_is_told_to_use_an_emailed_link(self):
        self._customer()
        r = self.client.post('/api/auth/login/', {'login': 'shop@example.com', 'password': 'old-secret-1'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (401, 'EMAIL_LINK'))
        self.assertNotIn('refresh_token', r.cookies)

    def test_staff_still_sign_in_with_their_password(self):
        staff = User.objects.create_user(email='boss@example.com', first_name='Bo', last_name='Ss', password='staff-pass-99')
        staff.groups.add(Group.objects.get(name='Manager'))
        r = self.client.post('/api/auth/login/', {'login': 'boss@example.com', 'password': 'staff-pass-99'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_set_password_is_gone(self):
        self.client.force_authenticate(self._customer())
        r = self.client.post('/api/auth/customer/set-password/', {'password': 'new-secret-2'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (410, 'PASSWORDS_GONE'))

    def test_forgot_password_sends_a_sign_in_link(self):
        self._customer()
        r = self.client.post('/api/auth/customer/reset-password/', {'email': 'shop@example.com'}, format='json')
        self.assertEqual(r.status_code, 200)
        row = MagicLinkToken.objects.get(email='shop@example.com')
        self.assertEqual(row.purpose, MagicLinkToken.PURPOSE_SIGN_IN)
        self.assertEqual(len(mail.outbox), 1)

    def test_an_emailed_link_never_asks_for_a_password(self):
        self._customer(password=None)
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        self.assertFalse(consume_magic_link(token=row.token).needs_password_prompt)
        again = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                              expires_at='2099-01-01T00:00Z')
        r = self.client.post('/api/auth/magic-link/consume/', {'token': again.token}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['needs_password_prompt'])
