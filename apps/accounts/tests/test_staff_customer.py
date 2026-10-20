"""Staff logins on the website. Since 2026-10-16 staff are not customers (no CustomerProfile, not in the Customer group,
never on Users → Customers), but they still use the storefront's own pages with their Dash password; the website's
sign-in takes a staff email to the password step, and staff never sign in by an emailed link. No staff-side access
changes, and a customer never gains any."""
from __future__ import annotations

import io
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, MagicLinkToken, User
from apps.accounts.permissions import IsCustomer, IsStaff, IsTeamMember
from apps.accounts.services import magic_link, staff_customer
from apps.accounts.services.staff_customer import STAFF_LOGIN_MESSAGE, ensure_staff_customer

PASSWORD = 'correct-horse-9'


def _user(email, group='Employee', first='Sam', last='Staff', **extra):
    user = User.objects.create_user(email, first, last, password=PASSWORD, **extra)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


def _req(user):
    return type('R', (), {'user': user})()


def _customer(email='shopper@example.com', password=PASSWORD):
    user = User.objects.create_user(email, 'Sue', 'Shopper', password=password)
    user.groups.add(Group.objects.get_or_create(name='Customer')[0])
    return user


class StaffAreNotCustomersTests(TestCase):
    """Owner 2026-10-16: staff are not customers. Nothing makes a staff login a website customer any more."""

    def test_nothing_makes_a_staff_login_a_customer(self):
        sam = _user('sam@ecothrift.us', 'Manager')
        self.assertEqual(ensure_staff_customer(sam), (None, False))
        owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        self.assertEqual(ensure_staff_customer(owner), (None, False))
        self.assertEqual(staff_customer.missing_customers().count(), 0)
        self.assertEqual(staff_customer.create_missing_customers(),
                         {'customers_made': 0, 'customers_fixed': 0, 'customers_missing': 0})
        magic_link._get_or_create_customer('sam@ecothrift.us')
        magic_link.stamp_email_verified(sam)
        self.assertFalse(CustomerProfile.objects.exists())
        self.assertFalse(sam.groups.filter(name='Customer').exists())
        self.assertEqual(sam.role, 'Manager')

    def test_saving_or_adding_a_staff_group_makes_nothing(self):
        with self.captureOnCommitCallbacks(execute=True):
            sam = _user('sam@ecothrift.us')
            dee = _user('dee@ecothrift.us', None)
            dee.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.assertFalse(CustomerProfile.objects.filter(user__in=[sam, dee]).exists())
        self.assertFalse(Group.objects.get(name='Customer').user_set.exists() if Group.objects.filter(name='Customer').exists() else False)

    def test_a_failure_never_fails_the_user_save(self):
        with patch.object(staff_customer, 'ensure_staff_customer', side_effect=RuntimeError('boom')):
            with self.assertLogs('apps.accounts.signals', level='ERROR'):
                with self.captureOnCommitCallbacks(execute=True):
                    sam = _user('sam@ecothrift.us')
        self.assertTrue(User.objects.filter(pk=sam.pk).exists())


class IsCustomerTests(TestCase):
    def test_active_staff_use_the_storefront_pages_without_a_customer_record(self):
        sam = _user('sam@ecothrift.us')
        self.assertTrue(IsCustomer().has_permission(_req(sam), None))  # since 2026-10-16: no record needed
        self.assertTrue(IsTeamMember().has_permission(_req(sam), None))
        self.assertFalse(CustomerProfile.objects.filter(user=sam).exists())

    def test_a_customer_never_gains_staff_access(self):
        shopper = _customer()
        self.assertTrue(IsCustomer().has_permission(_req(shopper), None))
        self.assertFalse(IsStaff().has_permission(_req(shopper), None))
        self.assertFalse(IsTeamMember().has_permission(_req(shopper), None))
        api = APIClient()
        api.force_authenticate(shopper)
        for url in ('/api/accounts/users/', '/api/accounts/customers/', '/api/thriftplus/staff-memberships/',
                    '/api/accounts/login-merge/candidates/', '/api/webstore/conversations/'):
            self.assertIn(api.get(url).status_code, (403, 404), url)

    def test_the_group_counts_a_retired_record_alone_does_not_and_switched_off_never(self):
        a = User.objects.create_user('a@example.com', 'A', 'A', password=PASSWORD)
        CustomerProfile.objects.create(user=a, customer_number='CUS-501')  # retired (T62): not a customer by itself
        b = _user('b@example.com', 'Customer')
        self.assertFalse(IsCustomer().has_permission(_req(a), None))
        self.assertTrue(IsCustomer().has_permission(_req(b), None))
        b.is_active = False
        self.assertFalse(IsCustomer().has_permission(_req(b), None))
        nobody = _user('n@example.com', None)
        self.assertFalse(IsCustomer().has_permission(_req(nobody), None))


@override_settings(
    ONLINE_SALES_ACCOUNTS_ENABLED=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    MS_GRAPH_ENABLED=False,
)
class WebsiteSignInTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        self.sam = _user('sam@ecothrift.us', 'Manager')
        ensure_staff_customer(self.sam)

    def test_the_lookup_takes_a_staff_email_to_the_password_step(self):
        r = self.api.post('/api/auth/customer/lookup/', {'email': 'Sam@EcoThrift.us'}, format='json')
        self.assertEqual(r.json(), {'has_account': True, 'has_password': True, 'password_only': True})
        # Even a staff login that has no password yet (a Set password link pending) goes to the password step.
        newbie = User.objects.create_user('newbie@ecothrift.us', 'New', 'Bie')  # no password
        newbie.groups.add(Group.objects.get_or_create(name='Employee')[0])
        r = self.api.post('/api/auth/customer/lookup/', {'email': 'newbie@ecothrift.us'}, format='json')
        self.assertTrue(r.json()['has_password'])
        # A switched-off staff login still looks like nobody.
        self.sam.is_active = False
        self.sam.save()
        r = self.api.post('/api/auth/customer/lookup/', {'email': 'sam@ecothrift.us'}, format='json')
        self.assertEqual(r.json(), {'has_account': False, 'has_password': False})

    def test_a_customer_lookup_never_offers_a_password(self):  # owner 2026-10-16: only staff have passwords
        _customer()
        r = self.api.post('/api/auth/customer/lookup/', {'email': 'shopper@example.com'}, format='json')
        self.assertEqual(r.json(), {'has_account': True, 'has_password': False})

    def test_staff_sign_in_on_the_website_with_their_dash_password_and_use_the_account_pages(self):
        r = self.api.post('/api/auth/login/', {'email': 'sam@ecothrift.us', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['user']['role'], body['user']['email_verified']), ('Manager', True))
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
        self.assertEqual(self.api.get('/api/webstore/my/holds/').status_code, 200)
        self.assertEqual(self.api.get('/api/webstore/my/conversations/').status_code, 200)

    def test_a_wrong_staff_password_on_the_website_counts_toward_the_lockout(self):
        for _ in range(5):
            r = self.api.post('/api/auth/login/', {'email': 'sam@ecothrift.us', 'password': 'nope'}, format='json')
            self.assertEqual(r.status_code, 401)
        r = self.api.post('/api/auth/login/', {'email': 'sam@ecothrift.us', 'password': PASSWORD}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'LOCKED'))

    def test_staff_never_get_an_emailed_sign_in_link(self):
        r = self.api.post('/api/auth/magic-link/request/', {'email': 'sam@ecothrift.us'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(MagicLinkToken.objects.filter(email='sam@ecothrift.us').exists())
        self.assertEqual(len(mail.outbox), 0)
        # A link made some other way is still refused at the door, and issues no session.
        token = magic_link.issue_magic_link(email='sam@ecothrift.us')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': token.token}, format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (400, STAFF_LOGIN_MESSAGE))
        self.assertNotIn('access', r.json())
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))

    def test_a_superuser_without_a_staff_group_is_refused_a_link_too(self):
        owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        self.assertIsNone(owner.role)
        token = magic_link.issue_magic_link(email='owner@ecothrift.us')
        r = self.api.post('/api/auth/magic-link/consume/', {'token': token.token}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(User.objects.get(pk=owner.pk).has_usable_password())

    def test_registering_with_a_staff_email_points_to_the_password(self):
        r = self.api.post('/api/auth/customer/register/', {'email': 'SAM@ecothrift.us', 'first_name': 'Sam'},
                          format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual((r.json()['detail'], r.json()['code']), (STAFF_LOGIN_MESSAGE, 'STAFF_LOGIN'))
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))

    def test_forgot_password_with_a_staff_email_sends_the_dash_reset_never_the_customer_one(self):
        r = self.api.post('/api/auth/customer/reset-password/', {'email': 'sam@ecothrift.us'}, format='json')
        self.assertEqual(r.json()['detail'], 'If that email can receive mail, a link is on its way.')
        self.assertFalse(MagicLinkToken.objects.filter(purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD).exists())
        self.assertTrue(MagicLinkToken.objects.filter(email='sam@ecothrift.us',
                                                      purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD).exists())
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))  # nothing cleared

    def test_the_website_never_changes_a_staff_password(self):
        self.api.force_authenticate(self.sam)
        r = self.api.post('/api/auth/customer/set-password/', {'password': 'abcdef', 'old_password': PASSWORD},
                          format='json')
        self.assertEqual((r.status_code, r.json()['code']), (410, 'PASSWORDS_GONE'))  # gone for everyone (2026-10-16)
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))

    def test_resend_verification_sends_nothing_to_staff(self):
        self.api.force_authenticate(self.sam)
        r = self.api.post('/api/auth/customer/resend-verification/', {}, format='json')
        self.assertEqual(r.json(), {'detail': 'Email is already verified.', 'email_verified': True})
        self.assertFalse(MagicLinkToken.objects.exists())


class CustomerRecordGuardTests(TestCase):
    """Owner 2026-10-16: a staff login never shows on Dash → Customers, even with a customer record left from 10-15, and
    nothing there can reach it."""

    def setUp(self):
        self.manager = _user('boss@ecothrift.us', 'Manager', first='Mia', last='Boss')
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        Group.objects.get_or_create(name='Admin')[0].user_set.add(self.owner)
        CustomerProfile.objects.create(user=self.owner, customer_number='CUS-038')  # left from 10-15
        self.api = APIClient()
        self.api.force_authenticate(self.manager)
        self.url = f'/api/accounts/customers/{self.owner.pk}/'

    def test_a_staff_login_is_not_listed_and_cannot_be_changed_from_customers(self):
        listed = [c['email'] for c in self.api.get('/api/accounts/customers/').json()['results']]
        self.assertNotIn('owner@ecothrift.us', listed)
        self.assertEqual(self.api.get('/api/accounts/customers/stats/').json()['total'], 0)
        self.assertEqual(self.api.patch(self.url, {'email': 'thief@example.com'}, format='json').status_code, 404)
        self.assertEqual(self.api.delete(self.url).status_code, 404)
        self.assertEqual(self.api.post(self.url + 'send-sign-in-link/').status_code, 404)
        owner = User.objects.get(pk=self.owner.pk)
        self.assertEqual((owner.email, owner.is_active), ('owner@ecothrift.us', True))
        self.assertFalse(MagicLinkToken.objects.exists())

    def test_a_real_customer_record_is_unchanged(self):
        shopper = _customer()
        r = self.api.patch(f'/api/accounts/customers/{shopper.pk}/', {'first_name': 'Susan'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(User.objects.get(pk=shopper.pk).first_name, 'Susan')


@override_settings(DEBUG=True)
class PurgeKeepsStaffTests(TestCase):
    def test_purging_online_sales_customers_never_deletes_a_staff_login(self):
        sam = _user('sam@ecothrift.us')
        ensure_staff_customer(sam)
        shopper = _customer()
        call_command('purge_online_sales', '--yes', '--customers', stdout=io.StringIO())
        self.assertTrue(User.objects.filter(pk=sam.pk).exists())
        self.assertFalse(User.objects.filter(pk=shopper.pk).exists())
