from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.capabilities import capabilities_for_user, CATALOG
from apps.accounts.models import User


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


class CapabilityCatalogTests(APITestCase):
    def setUp(self):
        self.admin = _staff('admin@example.com', 'Admin')
        self.manager = _staff('mgr@example.com', 'Manager')
        self.employee = _staff('emp@example.com', 'Employee')
        self.owner = _staff('owner@example.com', 'Employee', superuser=True)

    def test_catalog_is_admin_only(self):
        self.client.force_authenticate(self.manager)
        denied = self.client.get('/api/accounts/capability-catalog/')
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        ok = self.client.get('/api/accounts/capability-catalog/')
        self.assertEqual(ok.status_code, 200, ok.data)
        ids = {row['id'] for row in ok.data['results']}
        self.assertIn('users.staff:manage', ids)
        self.assertIn('hr.payroll:read', ids)
        self.assertEqual(len(ok.data['results']), len(CATALOG))

    def test_mine_follows_role_and_superuser(self):
        self.client.force_authenticate(self.employee)
        emp = self.client.get('/api/auth/capabilities/')
        self.assertEqual(emp.status_code, 200)
        self.assertIn('pos.terminal:use', emp.data['capabilities'])
        self.assertNotIn('settings:write', emp.data['capabilities'])
        self.assertNotIn('hr.payroll:read', emp.data['capabilities'])

        self.client.force_authenticate(self.manager)
        mgr = self.client.get('/api/auth/capabilities/')
        self.assertIn('settings:write', mgr.data['capabilities'])
        self.assertNotIn('users.staff:manage', mgr.data['capabilities'])
        self.assertNotIn('mailbox.retail:use', mgr.data['capabilities'])

        self.client.force_authenticate(self.admin)
        adm = self.client.get('/api/auth/capabilities/')
        self.assertIn('users.staff:manage', adm.data['capabilities'])
        self.assertNotIn('hr.payroll:read', adm.data['capabilities'])

        self.client.force_authenticate(self.owner)
        su = self.client.get('/api/auth/capabilities/')
        self.assertIn('hr.payroll:read', su.data['capabilities'])
        self.assertIn('pos.terminal:use', su.data['capabilities'])
        self.assertNotIn('users.staff:manage', su.data['capabilities'])

    def test_helper_matches_endpoint(self):
        self.assertEqual(
            capabilities_for_user(self.admin),
            [cap.id for cap in CATALOG if 'Admin' in cap.holders],
        )


class UserRoleUpdateKeepsExtraGroupsTests(APITestCase):
    def setUp(self):
        self.admin = _staff('boss@example.com', 'Admin')
        consignee, _ = Group.objects.get_or_create(name='Consignee')
        employee, _ = Group.objects.get_or_create(name='Employee')
        self.dual = User.objects.create_user(
            email='dual@example.com',
            password='x',
            first_name='Both',
            last_name='Hats',
            is_staff=True,
        )
        self.dual.groups.add(employee, consignee)

    def test_changing_staff_role_keeps_consignee(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f'/api/accounts/users/{self.dual.id}/',
            {'role': 'Manager'},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        names = set(self.dual.groups.values_list('name', flat=True))
        self.assertEqual(names, {'Manager', 'Consignee'})
        self.dual.refresh_from_db()
        self.assertTrue(self.dual.is_staff)
