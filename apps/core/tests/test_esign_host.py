"""Eco-Thrift's e-sign adapter (apps/core/esign_host.py): the owner is the superuser alone, signers are current staff,
files go under documents/esign/, links use the dash host. Made-up names only."""
import datetime
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import EmployeeProfile
from apps.core.esign_host import CONTRACTOR_KIND, EcoThriftHost

User = get_user_model()


def _person(email, first, last, *, superuser=False, position='', ended=None):
    user = User.objects.create_user(email=email, password='x-pass-123', first_name=first, last_name=last)
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   position=position, hire_date=datetime.date(2026, 1, 5), termination_date=ended)
    return user


class EcoThriftHostTests(TestCase):
    def setUp(self):
        self.host = EcoThriftHost()
        self.owner = _person('owner@example.test', 'Olive', 'Owner', superuser=True)
        self.staff = _person('sam@example.test', 'Sam', 'Staffer', position='Cashier')

    def test_owner_is_the_superuser_only(self):
        self.assertTrue(self.host.is_owner(self.owner))
        self.assertFalse(self.host.is_owner(self.staff))
        self.assertFalse(self.host.is_owner(SimpleNamespace(is_authenticated=False, is_superuser=True)))
        self.assertFalse(self.host.is_owner(None))
        self.assertEqual(self.host.owner_emails(), ['owner@example.test'])

    def test_a_signer_is_a_current_staff_login(self):
        self.assertEqual(self.host.user_party(self.staff.pk), {'name': 'Sam Staffer', 'email': 'sam@example.test', 'title': 'Cashier'})
        self.assertEqual(self.host.user_party(self.owner.pk)['title'], 'Owner')
        gone = _person('gone@example.test', 'Gus', 'Gone', ended=timezone.localdate() - datetime.timedelta(days=1))
        customer = User.objects.create_user(email='c@example.test', password='x-pass-123', first_name='Cy', last_name='Customer')
        listed = [p['user_id'] for p in self.host.everyone()]
        self.assertEqual(listed, [self.owner.pk, self.staff.pk])  # by first name; no ex-staff, no customers
        self.assertNotIn(gone.pk, listed)
        self.assertNotIn(customer.pk, listed)
        self.assertEqual(self.host.attach_for_user(self.staff.pk), ('user', str(self.staff.pk)))
        self.assertEqual(self.host.attachment_label('user', str(self.staff.pk)), 'Sam Staffer')
        self.assertEqual(self.host.attach_for_user(999999), ('', ''))

    def test_kinds_name_the_contractor_agreement(self):
        keys = [k['key'] for k in self.host.kinds()]
        self.assertEqual(keys[0], CONTRACTOR_KIND)
        self.assertIn('handbook', keys)

    @override_settings(STAFF_DASHBOARD_HOST='dash.example.test', ESIGN_PUBLIC_BASE_URL='')
    def test_links_ip_paths_and_branding(self):
        self.assertEqual(self.host.public_base_url(), 'https://dash.example.test')
        with override_settings(ESIGN_PUBLIC_BASE_URL='http://localhost:5173/'):
            self.assertEqual(self.host.public_base_url(), 'http://localhost:5173')
        self.assertEqual(self.host.in_app_sign_path(7), '/hr/sign/7')
        request = SimpleNamespace(META={'HTTP_X_FORWARDED_FOR': '6.6.6.6, 203.0.113.5', 'REMOTE_ADDR': '10.0.0.1'})
        self.assertEqual(self.host.client_ip(request), '203.0.113.5')
        self.assertEqual(self.host.client_ip(SimpleNamespace(META={'REMOTE_ADDR': '10.0.0.1'})), '10.0.0.1')
        self.assertEqual(self.host.branding()['company_name'], 'Eco-Thrift')

    def test_files_go_under_documents_esign_and_mail_uses_the_store_mailbox(self):
        with mock.patch('django.core.files.storage.default_storage.save', side_effect=lambda key, _f: key) as save:
            self.assertEqual(self.host.storage_save('final/3.pdf', b'%PDF-'), 'documents/esign/final/3.pdf')
        save.assert_called_once()
        with mock.patch('apps.hiring.emails.send', return_value=True) as send:
            self.assertTrue(self.host.send_mail(to=('a@example.test',), subject='S', body='B'))
        self.assertEqual(send.call_args.kwargs['to'], ['a@example.test'])
