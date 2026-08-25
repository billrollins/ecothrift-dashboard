"""Staff password reset, the admin send actions, and the two stats endpoints."""
from datetime import timedelta

from django.contrib.auth.models import Group
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import CustomerProfile, EmployeeProfile, MagicLinkToken, User
from apps.accounts.services.staff_password import (
    consume_staff_reset, issue_staff_reset, staff_reset_link,
)


def _staff(email, role='Employee', password='original-pass-123', **kwargs):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email,
        first_name=email.split('@')[0].title(),
        last_name='Tester',
        password=password,
        **kwargs,
    )
    user.groups.add(group)
    return user


def _shopper(email):
    group, _ = Group.objects.get_or_create(name='Customer')
    user = User.objects.create_user(
        email=email, first_name='Ada', last_name='Shopper', password=None,
    )
    user.groups.add(group)
    return user


MAIL_SETTINGS = dict(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='Eco-Thrift <retail@ecothrift.us>',
    STAFF_DASHBOARD_HOST='dash.ecothrift.us',
)


@override_settings(**MAIL_SETTINGS)
class StaffResetTokenTests(APITestCase):
    def setUp(self):
        self.user = _staff('bench@example.com')

    def test_issue_then_consume_sets_the_new_password(self):
        token = issue_staff_reset(user=self.user).token
        consume_staff_reset(token=token, new_password='brand-new-pass')

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('brand-new-pass'))

    def test_a_token_only_works_once(self):
        token = issue_staff_reset(user=self.user).token
        consume_staff_reset(token=token, new_password='first-choice')

        with self.assertRaises(Exception):
            consume_staff_reset(token=token, new_password='second-choice')

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('first-choice'))

    def test_an_expired_token_is_refused(self):
        row = issue_staff_reset(user=self.user)
        row.expires_at = timezone.now() - timedelta(minutes=1)
        row.save(update_fields=['expires_at'])

        with self.assertRaises(Exception):
            consume_staff_reset(token=row.token, new_password='too-late-pass')

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('original-pass-123'))

    def test_issuing_again_spends_the_previous_token(self):
        """Asking twice must not leave two live links in two inboxes."""
        first = issue_staff_reset(user=self.user)
        issue_staff_reset(user=self.user)

        first.refresh_from_db()
        self.assertIsNotNone(first.used_at)

    def test_a_short_password_is_refused(self):
        token = issue_staff_reset(user=self.user).token
        with self.assertRaises(Exception):
            consume_staff_reset(token=token, new_password='abc')

    def test_link_points_at_the_dashboard_reset_page(self):
        self.assertEqual(
            staff_reset_link('abc123'),
            'https://dash.ecothrift.us/reset-password?token=abc123',
        )

    def test_reset_endpoint_rejects_a_made_up_token(self):
        resp = self.client.post(
            '/api/auth/reset-password/',
            {'token': 'not-a-real-token', 'new_password': 'whatever-pass'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_reset_endpoint_works_end_to_end(self):
        self.client.post(
            '/api/auth/forgot-password/', {'email': self.user.email}, format='json',
        )
        row = MagicLinkToken.objects.get(
            email=self.user.email, purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD,
        )
        resp = self.client.post(
            '/api/auth/reset-password/',
            {'token': row.token, 'new_password': 'chosen-by-them'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('chosen-by-them'))


@override_settings(**MAIL_SETTINGS)
class AdminSendResetTests(APITestCase):
    def setUp(self):
        self.admin = _staff('boss@example.com', role='Admin')
        self.employee = _staff('crew@example.com')
        self.client.force_authenticate(self.admin)

    def test_admin_emails_a_reset_link_and_never_sees_a_password(self):
        resp = self.client.post(f'/api/accounts/users/{self.employee.id}/send-password-reset/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn('temporary_password', resp.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/reset-password?token=', mail.outbox[0].body)
        # The old password keeps working until they actually use the link.
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.check_password('original-pass-123'))

    def test_inactive_employee_is_refused(self):
        self.employee.is_active = False
        self.employee.save(update_fields=['is_active'])

        resp = self.client.post(f'/api/accounts/users/{self.employee.id}/send-password-reset/')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_customer_cannot_be_reset_through_the_staff_action(self):
        shopper = _shopper('shopper@example.com')
        resp = self.client.post(f'/api/accounts/users/{shopper.id}/send-password-reset/')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_customer_reset_action_issues_a_customer_magic_link(self):
        shopper = _shopper('ada@example.com')
        CustomerProfile.objects.create(
            user=shopper, customer_number=CustomerProfile.generate_customer_number(),
        )

        resp = self.client.post(
            f'/api/accounts/customers/{shopper.id}/send-password-reset-link/',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(
            MagicLinkToken.objects.filter(
                email='ada@example.com', purpose=MagicLinkToken.PURPOSE_RESET_PASSWORD,
            ).exists(),
        )


class StatsEndpointTests(APITestCase):
    def setUp(self):
        self.admin = _staff('stats-admin@example.com', role='Admin')
        _staff('stats-mgr@example.com', role='Manager')
        # Active staff with no usable password - the number the strip flags.
        locked_out = _staff('stats-new@example.com')
        locked_out.set_unusable_password()
        locked_out.save(update_fields=['password'])
        EmployeeProfile.objects.create(
            user=locked_out,
            employee_number=EmployeeProfile.generate_employee_number(),
            hire_date=timezone.localdate(),
        )

        shopper = _shopper('stats-shopper@example.com')
        CustomerProfile.objects.create(
            user=shopper,
            customer_number=CustomerProfile.generate_customer_number(),
            email_verified_at=timezone.now(),
        )

        self.client.force_authenticate(self.admin)

    def test_employee_stats_counts_roles_and_locked_out_accounts(self):
        resp = self.client.get('/api/accounts/users/stats/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['admins'], 1)
        self.assertEqual(resp.data['managers'], 1)
        self.assertEqual(resp.data['employees'], 1)
        self.assertEqual(resp.data['no_password'], 1)
        self.assertEqual(resp.data['new_hires_90d'], 1)
        self.assertEqual(resp.data['on_the_clock'], 0)

    def test_customer_stats_reports_the_verified_share(self):
        resp = self.client.get('/api/accounts/customers/stats/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['active'], 1)
        self.assertEqual(resp.data['verified'], 1)
        self.assertEqual(resp.data['verified_pct'], 100)
        self.assertEqual(resp.data['new_this_month'], 1)
        self.assertEqual(resp.data['holds_this_month'], 0)
