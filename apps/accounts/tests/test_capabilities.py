from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.capabilities import ITEMS
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


class MyCapabilitiesTests(APITestCase):
    """``/api/auth/capabilities/``: what the caller holds (People → Permissions, #53). Day one = before #53."""
    def setUp(self):
        self.admin = _staff('admin@example.com', 'Admin')
        self.manager = _staff('mgr@example.com', 'Manager')
        self.employee = _staff('emp@example.com', 'Employee')
        self.owner = _staff('owner@example.com', 'Employee', superuser=True)

    def _mine(self, user):
        self.client.force_authenticate(user)
        res = self.client.get('/api/auth/capabilities/')
        self.assertEqual(res.status_code, 200)
        return set(res.data['capabilities'])

    def test_mine_follows_level_and_owner(self):
        emp = self._mine(self.employee)
        self.assertIn('pos.terminal:use', emp)
        self.assertIn('cashier:work', emp)
        self.assertNotIn('settings:write', emp)
        self.assertNotIn('hr.payroll:read', emp)

        mgr = self._mine(self.manager)
        self.assertIn('settings:write', mgr)
        self.assertIn('admin:manage', mgr)
        self.assertNotIn('users.staff:manage', mgr)
        self.assertNotIn('admin:full', mgr)

        # The retired Admin group is a Manager on the page; the owner holds everything.
        self.assertEqual(self._mine(self.admin), mgr)
        own = self._mine(self.owner)
        self.assertTrue({item.id for item in ITEMS} <= own)

    def test_customers_hold_nothing(self):
        customer = User.objects.create_user(email='c@example.com', password='x', first_name='C', last_name='C')
        customer.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.assertEqual(self._mine(customer), set())


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
