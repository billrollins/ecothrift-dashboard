"""One customer account (owner 2026-10-16): a Thrift+ person and their ecothrift.us login are one account. An emailed
sign-in on either side signs in to both, signing out of either ends both, a website-only customer gets a pending
membership, and the one-account request links what exists and removes every customer password. Mail is mocked."""
from __future__ import annotations

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.core.models import AppSetting
from apps.thriftplus.models import Account, MemberLogin, MemberSession, Person
from apps.thriftplus.services import member_auth, members, one_account
from apps.thriftplus.tests.test_email_sign_in import BASE, IP, MailMixin


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us', ONLINE_SALES_ACCOUNTS_ENABLED=True,
                   ONLINE_SALES_ENABLED=True)
class OneAccountTests(MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        Group.objects.get_or_create(name='Customer')
        self.api = APIClient()

    def _website_customer(self, email='shop@example.com', password=None):
        user = User.objects.create_user(email=email, first_name='Shop', last_name='Per', password=password)
        user.groups.add(Group.objects.get(name='Customer'))
        CustomerProfile.objects.create(user=user, customer_number=CustomerProfile.generate_customer_number())
        return user

    def test_an_app_sign_in_also_signs_in_to_the_website_with_the_same_account(self):
        self.api.post(BASE + 'join/', {'name': 'Ana Diaz', 'email': 'ana@example.com'}, format='json', REMOTE_ADDR=IP)
        r = self.api.post(BASE + 'session/code/', {'email': 'ana@example.com', 'code': self.code()}, format='json',
                          REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(member_auth.COOKIE, r.cookies)
        self.assertIn('refresh_token', r.cookies)  # ecothrift.us is signed in too
        person = Person.objects.get(email='ana@example.com')
        self.assertEqual(person.user.email, 'ana@example.com')
        self.assertFalse(person.user.has_usable_password())
        me = self.api.post('/api/auth/refresh/')
        self.assertEqual(me.status_code, 200, me.content)

    def test_a_website_sign_in_also_signs_in_to_the_app_and_makes_a_pending_membership(self):
        user = self._website_customer()
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(member_auth.COOKIE, r.cookies)
        person = Person.objects.get(user=user)
        self.assertEqual((person.account.status, person.email), (Account.STATUS_PENDING, 'shop@example.com'))
        self.assertEqual(self.api.get(BASE + 'session/').json()['status'], 'member')

    def test_a_website_sign_in_joins_the_member_with_the_same_email(self):
        account = members.create_account(first_name='Bo', last_name='Lee', phone='4025550102', email='bo@example.com')
        user = self._website_customer('Bo@Example.com')
        self.assertEqual(one_account.person_for_user(user).account, account)
        self.assertEqual(Account.objects.count(), 1)

    def test_signing_out_of_either_side_ends_both(self):
        user = self._website_customer()
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.api.post('/api/auth/logout/')
        self.assertIsNotNone(MemberSession.objects.get(person__user=user).revoked_at)
        self.assertEqual(self.api.get(BASE + 'session/').json()['status'], 'signed_out')

    def test_a_deactivated_member_cannot_sign_in_on_the_website_either(self):
        user = self._website_customer()
        person = one_account.person_for_user(user)
        members.deactivate(person.account)
        row = MagicLinkToken.objects.create(email='shop@example.com', purpose=MagicLinkToken.PURPOSE_SIGN_IN,
                                            expires_at='2099-01-01T00:00Z')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': row.token}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'ACCOUNT_OFF'))

    def test_a_staff_login_never_gets_a_website_session_from_the_app(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', first_name='Sam', last_name='Staff', password='staff-pass-9')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api.post(BASE + 'session/email/', {'email': 'sam@ecothrift.us'}, format='json', REMOTE_ADDR=IP)
        r = self.api.post(BASE + 'session/code/', {'email': 'sam@ecothrift.us', 'code': self.code()}, format='json',
                          REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('refresh_token', r.cookies)
        self.assertTrue(User.objects.get(pk=staff.pk).check_password('staff-pass-9'))

    def test_the_request_links_everyone_and_removes_customer_passwords(self):
        shopper = self._website_customer('shop@example.com', password='old-secret-1')
        account = members.create_account(first_name='Ana', phone='4025550101', email='ana@example.com')
        MemberLogin.objects.create(person=account.people.get(), email='ana@example.com', password=make_password('x-pass-1'))
        boss = User.objects.create_user(email='boss@ecothrift.us', first_name='Bo', last_name='Ss', password='staff-pass-9')
        boss.groups.add(Group.objects.get_or_create(name='Manager')[0])
        plan = one_account.plan()
        self.assertEqual((plan['make_memberships'], plan['customer_passwords'], plan['app_passwords']), (1, 1, 1))
        counts = one_account.apply()
        self.assertEqual((counts['made'], counts['logins_made'], counts['passwords_removed'], counts['app_passwords_removed']),
                         (1, 1, 1, 1))
        shopper.refresh_from_db()
        self.assertFalse(shopper.has_usable_password())
        self.assertEqual(Person.objects.get(user=shopper).account.status, Account.STATUS_PENDING)
        self.assertEqual(Person.objects.get(email='ana@example.com').user.email, 'ana@example.com')
        self.assertFalse(MemberLogin.objects.exists())
        self.assertTrue(User.objects.get(pk=boss.pk).check_password('staff-pass-9'))  # staff keep theirs
        self.assertEqual(one_account.apply()['passwords_removed'], 0)  # safe to run again
