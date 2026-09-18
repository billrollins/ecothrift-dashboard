import importlib
from datetime import date, time

from django.contrib.auth.models import Group
from django.apps import apps
from rest_framework.test import APITestCase

from apps.accounts.capabilities import CATALOG
from apps.accounts.models import EmployeeProfile, User
from apps.accounts.permissions import IsManagerOrAdmin
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.hr.services.departments import strip_department_from_routines
from apps.routines.models import Routine

backfill = importlib.import_module('apps.hr.migrations.0010_department_slug_icon_sort').backfill


def _staff(email, role, *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email,
        password='x',
        first_name=role,
        last_name='User',
        is_staff=True,
        is_superuser=superuser,
    )
    user.groups.add(group)
    return user


def _profile(user, department, number):
    return EmployeeProfile.objects.create(
        user=user,
        employee_number=number,
        department=department,
        hire_date=date(2026, 1, 1),
    )


class DepartmentBackfillTests(APITestCase):
    def test_operations_becomes_office(self):
        Department.objects.all().delete()
        ops = Department.objects.create(name='Operations', slug='tmp-ops')
        retail = Department.objects.create(name='Retail Operations', slug='tmp-retail')
        processing = Department.objects.create(name='Processing', slug='tmp-proc')
        restoration = Department.objects.create(name='Restoration', slug='tmp-rest')
        extra = Department.objects.create(name='Special Projects', slug='tmp-extra')
        backfill(apps, None)
        ops.refresh_from_db()
        retail.refresh_from_db()
        processing.refresh_from_db()
        restoration.refresh_from_db()
        extra.refresh_from_db()
        self.assertEqual((ops.name, ops.slug, ops.icon, ops.sort_order), ('Management', 'office', 'home', 3))
        self.assertEqual(retail.name, 'Retail')
        self.assertEqual(
            (retail.slug, retail.icon, retail.sort_order),
            ('retail-operations', 'cart', 0),
        )
        self.assertEqual((processing.slug, processing.icon, processing.sort_order), ('processing', 'box', 1))
        self.assertEqual((restoration.slug, restoration.icon, restoration.sort_order), ('restoration', 'tool', 2))
        self.assertEqual(extra.icon, 'none')
        self.assertGreaterEqual(extra.sort_order, 4)
        from apps.core.models import AppSetting
        setting = AppSetting.objects.get(key='retail_qa.program_department')
        self.assertEqual(setting.value, 'retail-operations')


class DepartmentApiTests(APITestCase):
    def setUp(self):
        self.employee = _staff('emp@example.com', 'Employee')
        self.manager = _staff('mgr@example.com', 'Manager')
        self.admin = _staff('admin@example.com', 'Admin')
        self.owner = _staff('owner@example.com', 'Employee', superuser=True)
        self.retail, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'icon': 'cart'},
        )
        if self.retail.name != 'Retail':
            self.retail.name = 'Retail'
            self.retail.save(update_fields=['name'])
        self.restoration, _ = Department.objects.get_or_create(
            name='Restoration', defaults={'slug': 'restoration', 'icon': 'tool'},
        )
        self.ghost, _ = Department.objects.get_or_create(
            name='Ghost Dept', defaults={'slug': 'ghost-dept', 'is_active': False},
        )
        if self.ghost.is_active:
            self.ghost.is_active = False
            self.ghost.save(update_fields=['is_active'])

    def test_catalog_includes_department_admin(self):
        ids = {cap.id for cap in CATALOG}
        self.assertIn('hr.department:admin', ids)
        self.assertIn('hr.department:write', ids)

    def test_list_omits_inactive_unless_requested(self):
        self.client.force_authenticate(self.employee)
        listed = self.client.get('/api/hr/departments/')
        self.assertEqual(listed.status_code, 200)
        names = {row['name'] for row in listed.data}
        self.assertIn('Retail', names)
        self.assertNotIn('Retail Operations', names)
        self.assertNotIn('Ghost Dept', names)

        everyone = self.client.get('/api/hr/departments/?include_inactive=1')
        self.assertEqual(everyone.status_code, 200)
        all_names = {row['name'] for row in everyone.data}
        self.assertIn('Ghost Dept', all_names)

    def test_delete_409_includes_counts(self):
        Shift.objects.create(
            name='Inventory',
            department=self.retail,
            time_in=time(9, 0),
            time_out=time(17, 0),
            weekdays=[0, 1, 2, 3, 4],
        )
        self.client.force_authenticate(self.owner)
        refused = self.client.delete(f'/api/hr/departments/{self.retail.pk}/')
        self.assertEqual(refused.status_code, 409, refused.data)
        self.assertGreaterEqual(refused.data['dependencies']['shifts'], 1)

    def test_delete_204_strips_assigned_department_ids(self):
        empty = Department.objects.create(name='Disposable')
        leftover = Department.objects.create(name='Keep Listed')
        routine = Routine.objects.create(
            title='Dept list',
            definition={'template_version': 1, 'sections': []},
            assigned_department_ids=[empty.pk, leftover.pk],
        )
        # JSON leftovers must not survive a clean delete. Strip first so the
        # only remaining lock is empty, then delete.
        strip_department_from_routines(empty.pk)
        routine.refresh_from_db()
        self.assertEqual(routine.assigned_department_ids, [leftover.pk])
        self.client.force_authenticate(self.owner)
        gone = self.client.delete(f'/api/hr/departments/{empty.pk}/')
        self.assertEqual(gone.status_code, 204, getattr(gone, 'data', None))
        self.assertFalse(Department.objects.filter(pk=empty.pk).exists())

    def test_manager_cannot_rename_but_can_edit_description(self):
        self.client.force_authenticate(self.manager)
        refused = self.client.patch(
            f'/api/hr/departments/{self.retail.pk}/',
            {'name': 'Retail Desk'},
            format='json',
        )
        self.assertEqual(refused.status_code, 403)
        ok = self.client.patch(
            f'/api/hr/departments/{self.retail.pk}/',
            {'description': 'The sales floor'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data['description'], 'The sales floor')

    def test_superuser_without_admin_group_can_patch_description(self):
        request = type('R', (), {'user': self.owner})()
        self.assertTrue(IsManagerOrAdmin().has_permission(request, None))
        self.client.force_authenticate(self.owner)
        ok = self.client.patch(
            f'/api/hr/departments/{self.retail.pk}/',
            {'description': 'Owner edit'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.data)

    def test_summary_cross_department_assignment(self):
        michael = _staff('michael@example.com', 'Employee')
        michael.first_name = 'Michael'
        michael.last_name = 'Foley'
        michael.save(update_fields=['first_name', 'last_name'])
        _profile(michael, self.restoration, 'M1')
        shift = Shift.objects.create(
            name='Retail inventory',
            department=self.retail,
            time_in=time(9, 0),
            time_out=time(17, 0),
            weekdays=[0, 1, 2, 3, 4, 5, 6],
        )
        ShiftAssignment.objects.create(
            employee=michael,
            shift=shift,
            weekdays=[0, 1, 2, 3, 4, 5, 6],
        )
        self.client.force_authenticate(self.manager)
        retail = self.client.get(f'/api/hr/departments/{self.retail.pk}/summary/')
        restoration = self.client.get(f'/api/hr/departments/{self.restoration.pk}/summary/')
        self.assertEqual(retail.status_code, 200, retail.data)
        self.assertEqual(restoration.status_code, 200, restoration.data)
        also = [row['full_name'] for row in retail.data['also_scheduled_here']]
        elsewhere = [row['full_name'] for row in restoration.data['home_scheduled_elsewhere']]
        self.assertIn('Michael Foley', also)
        self.assertIn('Michael Foley', elsewhere)
        self.assertEqual(elsewhere[0] if elsewhere else '', 'Michael Foley')
        self.assertEqual(restoration.data['home_scheduled_elsewhere'][0]['shift_name'], 'Retail inventory')
