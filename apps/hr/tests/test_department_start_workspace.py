"""Department "Starts in" (#86): the menu workspace a department's people open on, and how it reaches the menu."""
import importlib
from datetime import date

from django.apps import apps
from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import Department

fill = importlib.import_module('apps.hr.migrations.0023_department_start_workspace').fill


def _staff(email, role, *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, password='x', first_name=role, last_name='User', is_staff=True, is_superuser=superuser,
    )
    user.groups.add(group)
    return user


def _department(name, slug, start=''):
    row, _ = Department.objects.get_or_create(slug=slug, defaults={'name': name})
    row.name = name
    row.start_workspace = start
    row.save(update_fields=['name', 'start_workspace'])
    return row


class StartWorkspaceFillTests(APITestCase):
    def test_the_migration_fills_the_store_departments_from_their_names(self):
        retail = _department('Retail', 'retail-operations')
        processing = _department('Processing', 'processing')
        restoration = _department('Restoration', 'restoration')
        office = _department('Office', 'office')
        fill(apps, None)
        starts = {row.name: row.start_workspace for row in Department.objects.filter(
            pk__in=[retail.pk, processing.pk, restoration.pk, office.pk])}
        self.assertEqual(starts, {
            'Retail': 'storeSales', 'Processing': 'processing', 'Restoration': 'restoration', 'Office': '',
        })

    def test_the_migration_keeps_a_choice_already_made(self):
        processing = _department('Processing', 'processing', start='storeSales')
        fill(apps, None)
        processing.refresh_from_db()
        self.assertEqual(processing.start_workspace, 'storeSales')


class StartWorkspaceApiTests(APITestCase):
    def setUp(self):
        self.manager = _staff('mgr@example.com', 'Manager')
        self.employee = _staff('emp@example.com', 'Employee')
        self.processing = _department('Processing', 'processing', start='processing')

    def test_the_list_carries_it_and_a_manager_can_change_it(self):
        self.client.force_authenticate(self.manager)
        listed = self.client.get('/api/hr/departments/')
        row = next(r for r in listed.data if r['id'] == self.processing.pk)
        self.assertEqual(row['start_workspace'], 'processing')
        changed = self.client.patch(
            f'/api/hr/departments/{self.processing.pk}/', {'start_workspace': 'restoration'}, format='json',
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data['start_workspace'], 'restoration')
        cleared = self.client.patch(
            f'/api/hr/departments/{self.processing.pk}/', {'start_workspace': ''}, format='json',
        )
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertEqual(cleared.data['start_workspace'], '')

    def test_it_must_look_like_a_workspace_id(self):
        self.client.force_authenticate(self.manager)
        refused = self.client.patch(
            f'/api/hr/departments/{self.processing.pk}/', {'start_workspace': 'not a workspace!'}, format='json',
        )
        self.assertEqual(refused.status_code, 400)
        self.assertIn('start_workspace', refused.data)

    def test_an_employee_cannot_change_it(self):
        self.client.force_authenticate(self.employee)
        refused = self.client.patch(
            f'/api/hr/departments/{self.processing.pk}/', {'start_workspace': 'buying'}, format='json',
        )
        self.assertEqual(refused.status_code, 403)


class StartWorkspaceInMyPayloadTests(APITestCase):
    """The signed-in user's payload carries it, so the menu needs no extra request."""

    def _me(self, user):
        self.client.force_authenticate(user)
        return self.client.get('/api/auth/me/').json()

    def test_me_carries_my_departments_start(self):
        user = _staff('processor@example.com', 'Employee')
        EmployeeProfile.objects.create(
            user=user, employee_number='SW-1', hire_date=date(2026, 11, 11),
            department=_department('Processing', 'processing', start='processing'),
        )
        employee = self._me(user)['employee']
        self.assertEqual(employee['department_name'], 'Processing')
        self.assertEqual(employee['department_start_workspace'], 'processing')

    def test_me_is_blank_when_the_department_has_none_or_there_is_no_department(self):
        office = _staff('office@example.com', 'Employee')
        EmployeeProfile.objects.create(
            user=office, employee_number='SW-2', hire_date=date(2026, 11, 11),
            department=_department('Office', 'office'),
        )
        self.assertEqual(self._me(office)['employee']['department_start_workspace'], '')
        nobody = _staff('nodept@example.com', 'Employee')
        EmployeeProfile.objects.create(user=nobody, employee_number='SW-3', hire_date=date(2026, 11, 11))
        self.assertEqual(self._me(nobody)['employee']['department_start_workspace'], '')

    def test_sign_in_carries_it_too(self):
        user = _staff('signin@example.com', 'Employee')
        user.set_password('pw-12345-xx')
        user.save()
        EmployeeProfile.objects.create(
            user=user, employee_number='SW-4', hire_date=date(2026, 11, 11),
            department=_department('Restoration', 'restoration', start='restoration'),
        )
        res = self.client.post('/api/auth/login/', {'email': 'signin@example.com', 'password': 'pw-12345-xx'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['user']['employee']['department_start_workspace'], 'restoration')
