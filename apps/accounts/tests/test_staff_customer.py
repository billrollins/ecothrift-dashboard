"""Staff logins are website customers too (owner 2026-10-15): every active staff user is in the Customer group with a
CustomerProfile, the website's sign-in takes a staff email to the password step, and staff never sign in by an emailed
link. No staff-side access changes, and a customer never gains any."""
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
    CustomerProfile.objects.create(user=user, customer_number=CustomerProfile.generate_customer_number())
    return user


class EnsureTests(TestCase):
    def test_a_staff_user_gets_the_customer_group_and_a_confirmed_profile_and_keeps_their_role(self):
        sam = _user('sam@ecothrift.us', 'Manager')
        profile, made = ensure_staff_customer(sam)
        self.assertTrue(made)
        self.assertEqual(profile.user, sam)
        self.assertTrue(profile.customer_number.startswith('CUS-'))
        self.assertIsNotNone(profile.email_verified_at)  # a Dash email is trusted
        self.assertTrue(sam.groups.filter(name='Customer').exists())
        self.assertEqual(sam.role, 'Manager')  # Customer is the lowest role
        self.assertEqual(sam.roles, ['Manager', 'Customer'])
        self.assertTrue(IsStaff().has_permission(_req(sam), None))

    def test_it_is_idempotent_and_stamps_an_unconfirmed_profile(self):
        sam = _user('sam@ecothrift.us')
        CustomerProfile.objects.create(user=sam, customer_number='CUS-900')
        profile, made = ensure_staff_customer(sam)
        again, made_again = ensure_staff_customer(sam)
        self.assertEqual((made, made_again, profile.pk, again.pk), (False, False, again.pk, again.pk))
        self.assertEqual(profile.customer_number, 'CUS-900')
        self.assertIsNotNone(CustomerProfile.objects.get(user=sam).email_verified_at)
        self.assertEqual(sam.groups.filter(name='Customer').count(), 1)

    def test_a_superuser_is_staff(self):
        owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        self.assertTrue(ensure_staff_customer(owner)[1])

    def test_customers_consignees_and_former_staff_are_left_alone(self):
        shopper = _user('shopper@example.com', 'Customer')
        consignee = _user('con@example.com', 'Consignee')
        nobody = _user('nobody@example.com', None)
        gone = _user('gone@ecothrift.us')
        gone.is_active = False
        gone.save()
        for user in (shopper, consignee, nobody, gone):
            self.assertEqual(ensure_staff_customer(user), (None, False))
        self.assertFalse(CustomerProfile.objects.exists())
        self.assertEqual(Group.objects.get(name='Customer').user_set.count(), 1)  # only the shopper, as before

    def test_create_missing_counts(self):
        _user('a@ecothrift.us')
        b = _user('b@ecothrift.us', 'Admin')
        ensure_staff_customer(b)
        _customer()
        self.assertEqual(staff_customer.missing_customers().count(), 1)
        self.assertEqual(staff_customer.create_missing_customers(),
                         {'customers_made': 1, 'customers_fixed': 0, 'customers_missing': 0})
        # A profile without the group is fixed, not doubled.
        c = _user('c@ecothrift.us')
        CustomerProfile.objects.create(user=c, customer_number='CUS-777')
        self.assertEqual(staff_customer.create_missing_customers()['customers_fixed'], 1)
        self.assertEqual(CustomerProfile.objects.filter(user=c).count(), 1)


class SignalTests(TestCase):
    """Made after the commit (TestCase never commits, so these run the on-commit callbacks)."""

    def test_a_new_staff_user_becomes_a_website_customer(self):
        with self.captureOnCommitCallbacks(execute=True):
            sam = _user('sam@ecothrift.us')
        self.assertTrue(CustomerProfile.objects.filter(user=sam).exists())
        self.assertTrue(sam.groups.filter(name='Customer').exists())
        self.assertEqual(User.objects.get(pk=sam.pk).role, 'Employee')

    def test_a_staff_group_added_later_and_the_reverse_side(self):
        with self.captureOnCommitCallbacks(execute=True):
            dee = _user('dee@ecothrift.us', None)
        self.assertFalse(CustomerProfile.objects.filter(user=dee).exists())
        with self.captureOnCommitCallbacks(execute=True):
            dee.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.assertTrue(CustomerProfile.objects.filter(user=dee).exists())
        with self.captureOnCommitCallbacks(execute=True):
            eve = _user('eve@ecothrift.us', None)
            Group.objects.get_or_create(name='Employee')[0].user_set.add(eve)
        self.assertTrue(CustomerProfile.objects.filter(user=eve).exists())

    def test_a_staff_api_create_makes_it(self):
        owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        Group.objects.get_or_create(name='Admin')[0].user_set.add(owner)
        api = APIClient()
        api.force_authenticate(owner)
        with self.captureOnCommitCallbacks(execute=True):
            r = api.post('/api/accounts/users/', {'email': 'new@ecothrift.us', 'first_name': 'New', 'last_name': 'Hire',
                                                  'role': 'Employee'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        new = User.objects.get(email='new@ecothrift.us')
        self.assertTrue(CustomerProfile.objects.filter(user=new).exists())
        self.assertEqual(new.role, 'Employee')

    def test_customers_get_nothing_new(self):
        with self.captureOnCommitCallbacks(execute=True):
            shopper = _user('shopper@example.com', 'Customer')
            _user('nobody@example.com', None)
        self.assertFalse(CustomerProfile.objects.filter(user=shopper).exists())
        self.assertFalse(CustomerProfile.objects.exists())

    def test_a_failure_never_fails_the_user_save(self):
        with patch.object(staff_customer, 'ensure_staff_customer', side_effect=RuntimeError('boom')):
            with self.assertLogs('apps.accounts.signals', level='ERROR'):
                with self.captureOnCommitCallbacks(execute=True):
                    sam = _user('sam@ecothrift.us')
        self.assertTrue(User.objects.filter(pk=sam.pk).exists())
        self.assertFalse(CustomerProfile.objects.exists())


class IsCustomerTests(TestCase):
    def test_staff_with_a_customer_account_pass_and_keep_staff_access(self):
        sam = _user('sam@ecothrift.us')
        self.assertFalse(IsCustomer().has_permission(_req(sam), None))  # not yet a website customer
        ensure_staff_customer(sam)
        self.assertTrue(IsCustomer().has_permission(_req(sam), None))
        self.assertTrue(IsTeamMember().has_permission(_req(sam), None))

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

    def test_a_profile_alone_or_the_group_alone_counts_and_switched_off_never(self):
        a = User.objects.create_user('a@example.com', 'A', 'A', password=PASSWORD)
        CustomerProfile.objects.create(user=a, customer_number='CUS-501')
        b = _user('b@example.com', 'Customer')
        self.assertTrue(IsCustomer().has_permission(_req(a), None))
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

    def test_a_customer_lookup_is_unchanged(self):
        _customer()
        r = self.api.post('/api/auth/customer/lookup/', {'email': 'shopper@example.com'}, format='json')
        self.assertEqual(r.json(), {'has_account': True, 'has_password': True})

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
        self.assertEqual(r.json()['detail'], 'If that email can receive mail, a reset link is on its way.')
        self.assertFalse(MagicLinkToken.objects.filter(purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD).exists())
        self.assertTrue(MagicLinkToken.objects.filter(email='sam@ecothrift.us',
                                                      purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD).exists())
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))  # nothing cleared

    def test_the_website_never_changes_a_staff_password(self):
        self.api.force_authenticate(self.sam)
        r = self.api.post('/api/auth/customer/set-password/', {'password': 'abcdef', 'old_password': PASSWORD},
                          format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'STAFF_LOGIN'))
        self.assertTrue(User.objects.get(pk=self.sam.pk).check_password(PASSWORD))

    def test_resend_verification_sends_nothing_to_staff(self):
        self.api.force_authenticate(self.sam)
        r = self.api.post('/api/auth/customer/resend-verification/', {}, format='json')
        self.assertEqual(r.json(), {'detail': 'Email is already verified.', 'email_verified': True})
        self.assertFalse(MagicLinkToken.objects.exists())


class CustomerRecordGuardTests(TestCase):
    """A staff login shows on Dash → Customers now, but a manager can't change it there (People is Admin only)."""

    def setUp(self):
        self.manager = _user('boss@ecothrift.us', 'Manager', first='Mia', last='Boss')
        self.owner = User.objects.create_superuser('owner@ecothrift.us', 'Bill', 'Rollins', password=PASSWORD)
        Group.objects.get_or_create(name='Admin')[0].user_set.add(self.owner)
        ensure_staff_customer(self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.manager)
        self.url = f'/api/accounts/customers/{self.owner.pk}/'

    def test_a_manager_cannot_change_a_staff_logins_email_or_switch_it_off(self):
        r = self.api.patch(self.url, {'email': 'thief@example.com'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.api.patch(self.url, {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.api.delete(self.url).status_code, 400)
        self.assertEqual(self.api.post(self.url + 'send-sign-in-link/').status_code, 400)
        self.assertEqual(self.api.post(self.url + 'send-password-reset-link/').status_code, 400)
        owner = User.objects.get(pk=self.owner.pk)
        self.assertEqual((owner.email, owner.is_active), ('owner@ecothrift.us', True))
        self.assertFalse(MagicLinkToken.objects.exists())

    def test_notes_and_an_unchanged_save_still_work(self):
        r = self.api.patch(self.url, {'notes': 'Owner', 'email': 'owner@ecothrift.us', 'first_name': 'Bill'},
                           format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(CustomerProfile.objects.get(user=self.owner).notes, 'Owner')

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
