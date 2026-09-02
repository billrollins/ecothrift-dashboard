"""Optional-password customer account endpoints."""
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
class CustomerPasswordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Group.objects.get_or_create(name='Customer')
        Group.objects.get_or_create(name='Manager')

    def test_lookup_and_register(self):
        empty = self.client.post(
            '/api/auth/customer/lookup/',
            {'email': 'new@example.com'},
            format='json',
        )
        self.assertEqual(empty.status_code, 200)
        self.assertFalse(empty.json()['has_account'])

        reg = self.client.post(
            '/api/auth/customer/register/',
            {'email': 'new@example.com', 'first_name': 'New', 'password': 'secret1'},
            format='json',
        )
        self.assertEqual(reg.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        found = self.client.post(
            '/api/auth/customer/lookup/',
            {'email': 'new@example.com'},
            format='json',
        )
        self.assertTrue(found.json()['has_account'])
        self.assertTrue(found.json()['has_password'])

    def test_set_password_without_old_when_unusable(self):
        user = User.objects.create_user(
            email='nopw@example.com', first_name='No', last_name='Pw', password='temp',
        )
        user.set_unusable_password()
        user.save()
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        self.client.force_authenticate(user)
        r = self.client.post(
            '/api/auth/customer/set-password/',
            {'password': 'newpass1'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.has_usable_password())
        self.assertTrue(user.check_password('newpass1'))
        self.assertTrue(r.json()['user']['has_password'])

    def test_set_password_requires_old_when_present(self):
        user = User.objects.create_user(
            email='haspw@example.com', first_name='Has', last_name='Pw', password='oldpass1',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        self.client.force_authenticate(user)
        bad = self.client.post(
            '/api/auth/customer/set-password/',
            {'password': 'newpass1'},
            format='json',
        )
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post(
            '/api/auth/customer/set-password/',
            {'old_password': 'oldpass1', 'password': 'newpass1'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)

    def test_reset_unsets_on_consume_not_request(self):
        user = User.objects.create_user(
            email='resetme@example.com', first_name='R', last_name='M', password='keepme1',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        r = self.client.post(
            '/api/auth/customer/reset-password/',
            {'email': 'resetme@example.com'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.has_usable_password())

        tok = MagicLinkToken.objects.get(
            email='resetme@example.com',
            purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD,
        ).token
        result = consume_magic_link(token=tok)
        user.refresh_from_db()
        self.assertFalse(user.has_usable_password())
        self.assertTrue(result.needs_password_prompt)
        self.assertEqual(result.redirect_to, '/account?set_password=1')

    def test_staff_email_cannot_be_touched_by_customer_reset(self):
        mgr = User.objects.create_user(
            email='staff@example.com', first_name='S', last_name='T', password='staffpass',
        )
        mgr.groups.add(Group.objects.get(name='Manager'))
        r = self.client.post(
            '/api/auth/customer/reset-password/',
            {'email': 'staff@example.com'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(
            MagicLinkToken.objects.filter(
                email='staff@example.com',
                purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD,
            ).exists()
        )
        lookup = self.client.post(
            '/api/auth/customer/lookup/',
            {'email': 'staff@example.com'},
            format='json',
        )
        self.assertFalse(lookup.json()['has_account'])

    def test_me_exposes_has_password_and_email_verified(self):
        user = User.objects.create_user(
            email='me@example.com', first_name='Me', last_name='U', password='secret1',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        self.client.force_authenticate(user)
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()['has_password'])
        self.assertFalse(me.json()['email_verified'])

    def test_login_works_for_customer_with_password(self):
        user = User.objects.create_user(
            email='login@example.com', first_name='L', last_name='O', password='secret1',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        r = self.client.post(
            '/api/auth/login/',
            {'email': 'login@example.com', 'password': 'secret1'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.json())

    def test_email_validation_always_prompts_password_create_or_update(self):
        """Every magic-link consume asks create/update, even when a password exists."""
        from apps.accounts.services.magic_link import issue_magic_link

        user = User.objects.create_user(
            email='prompt@example.com', first_name='P', last_name='W', password='oldpass1',
        )
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(
            user=user,
            customer_number=CustomerProfile.generate_customer_number(),
        )
        tok = issue_magic_link(
            email='prompt@example.com',
            purpose=MagicLinkToken.PURPOSE_SIGN_IN,
        )
        result = consume_magic_link(token=tok.token)
        self.assertTrue(result.needs_password_prompt)

        # Unlock lets update without old_password right after email validation.
        self.client.force_authenticate(user)
        r = self.client.post(
            '/api/auth/customer/set-password/',
            {'password': 'brandnew1'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('brandnew1'))

        # Unlock is single-use - further updates still need the current password.
        blocked = self.client.post(
            '/api/auth/customer/set-password/',
            {'password': 'another1'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)

    def test_purpose_scoped_invalidation(self):
        from apps.accounts.services.magic_link import issue_magic_link

        sign_in = issue_magic_link(email='scope@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN)
        hold = issue_magic_link(
            email='scope@example.com',
            purpose=MagicLinkToken.PURPOSE_VERIFY_HOLD,
            hold_token='abc123',
        )
        # Issuing another hold token for the same hold should not kill sign-in.
        issue_magic_link(
            email='scope@example.com',
            purpose=MagicLinkToken.PURPOSE_VERIFY_HOLD,
            hold_token='abc123',
        )
        sign_in.refresh_from_db()
        hold.refresh_from_db()
        self.assertTrue(sign_in.is_usable)
        self.assertFalse(hold.is_usable)
