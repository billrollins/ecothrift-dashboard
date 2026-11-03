"""People → Permissions (Dash Update #53): levels, departments, exceptions, grants opening doors, and History."""
import datetime as dt

from django.contrib.auth.models import Group
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts import capabilities as cat
from apps.accounts.models import AccessEvent, AccessSet, EmployeeProfile, User
from apps.accounts.services import access, register_pin
from apps.hr.models import Department


def _staff(email, role, *, superuser=False, department=None):
    user = User.objects.create_user(email=email, password='x', first_name=email.split('@')[0].title(),
                                    last_name='Test', is_staff=role != 'Customer', is_superuser=superuser)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    if role != 'Customer':
        EmployeeProfile.objects.create(user=user, employee_number=f'E{user.pk:04d}', department=department,
                                       hire_date=timezone.localdate())
    return user


def _exception(user, areas):
    AccessSet.objects.update_or_create(key=f'person:{user.pk}', defaults={'kind': 'person', 'user': user,
                                                                         'areas': areas})
    access.forget(user)  # the test client reuses this object for every request


class DayOneTests(APITestCase):
    """Before anyone changes a dial, everyone holds exactly what their level held before #53."""
    def setUp(self):
        self.employee = _staff('emp@x.com', 'Employee')
        self.manager = _staff('mgr@x.com', 'Manager')
        self.owner = _staff('own@x.com', 'Admin', superuser=True)

    def test_employee_holds_the_staff_floor_only(self):
        held = access.resolve(self.employee).items
        for item in cat.ITEMS:
            expected = item.step <= cat.WORK and cat.LEVEL_DEFAULTS['Employee'][item.area] >= item.step \
                and not item.locked
            self.assertEqual(item.id in held, expected, item.id)

    def test_manager_holds_everything_up_to_manage(self):
        held = access.resolve(self.manager).items
        for item in cat.ITEMS:
            self.assertEqual(item.id in held, item.step <= cat.MANAGE and not item.locked, item.id)

    def test_owner_holds_everything_including_locked(self):
        self.assertEqual(set(access.resolve(self.owner).items), {i.id for i in cat.ITEMS})

    def test_old_gates_unchanged_without_grants(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get('/api/core/settings/').status_code, 403)
        self.assertEqual(self.client.get('/api/hr/modification-requests/').status_code, 200)  # own rows only
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get('/api/core/settings/').status_code, 200)
        self.assertEqual(self.client.get('/api/blog/posts/').status_code, 403)


class GrantTests(APITestCase):
    """Giving more opens the doors the old level checks kept shut (phase 1)."""
    def setUp(self):
        self.employee = _staff('emp@x.com', 'Employee')
        self.manager = _staff('mgr@x.com', 'Manager')

    def test_a_dial_exception_opens_the_areas_manager_pages(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get('/api/core/settings/').status_code, 403)
        _exception(self.employee, {'admin': {'step': cat.MANAGE}})
        self.assertEqual(self.client.get('/api/core/settings/').status_code, 200)
        self.assertEqual(self.client.get('/api/core/ai/models/').status_code, 403)  # Full stays shut

    def test_a_single_item_opens_only_its_own_paths(self):
        _exception(self.manager, {'studios': {'add': ['blog:write']}})
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get('/api/blog/posts/').status_code, 200)
        self.assertEqual(self.client.get('/api/floorplan/element-kinds/').status_code, 200)  # read stays open
        self.assertEqual(self.client.post('/api/floorplan/element-kinds/', {}, format='json').status_code, 403)

    def test_a_manage_item_never_opens_an_owner_gate_on_the_same_path(self):
        _exception(self.employee, {'admin': {'add': ['hr.department:write']}})
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.post('/api/hr/departments/', {'name': 'X'}, format='json').status_code, 403)

    def test_inline_checks_honor_grants(self):
        self.assertFalse(access.owner_or(self.manager, 'marketing:owner'))
        _exception(self.manager, {'studios': {'add': ['marketing:owner']}})
        self.assertTrue(access.owner_or(self.manager, 'marketing:owner'))
        self.assertFalse(access.owner_or(self.manager, 'blog:write'))

    def test_department_adds(self):
        dept = Department.objects.create(name='Perm Test Office', slug='tmp-office')
        clerk = _staff('clerk@x.com', 'Employee', department=dept)
        AccessSet.objects.create(kind='department', key=f'department:{dept.pk}', department=dept,
                                 areas={'admin': {'step': cat.MANAGE}})
        resolved = access.resolve(clerk)
        self.assertEqual(resolved.steps['admin'], cat.MANAGE)
        self.assertEqual(resolved.step_from['admin'], access.SOURCE_DEPARTMENT)
        self.assertEqual(resolved.items['settings:write'], access.SOURCE_DEPARTMENT)
        self.assertEqual(resolved.steps['cashier'], cat.WORK)  # never lowers the level

    def test_a_personal_no_beats_level_and_department(self):
        _exception(self.manager, {'cashier': {'remove': ['pos.cash:manage']}})
        resolved = access.resolve(self.manager)
        self.assertNotIn('pos.cash:manage', resolved.items)
        self.assertIn('pos.cash:manage', resolved.denied)
        self.assertIn('pos.override:use', resolved.items)

    def test_an_ended_exception_stops(self):
        yesterday = (timezone.localdate() - dt.timedelta(days=1)).isoformat()
        _exception(self.employee, {'admin': {'step': cat.MANAGE, 'until': yesterday}})
        self.assertEqual(access.resolve(self.employee).steps['admin'], cat.NONE)

    def test_customers_never_hold_anything(self):
        customer = _staff('c@x.com', 'Customer')
        _exception(customer, {'admin': {'step': cat.FULL}})
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get('/api/core/settings/').status_code, 403)
        self.assertEqual(access.access_ids(customer), [])

    def test_a_granted_pin_approves_like_a_managers(self):
        register_pin.set_pin(self.employee, '4826')
        with self.assertRaises(register_pin.PinError):
            register_pin.check_pin('4826', device='t1', min_role='Manager')
        _exception(self.employee, {'cashier': {'add': ['pos.override:use']}})
        self.assertEqual(register_pin.check_pin('4826', device='t2', min_role='Manager'), self.employee)

    def test_a_staff_account_grant_cannot_make_managers(self):
        _exception(self.employee, {'people': {'add': ['users.staff:manage']}})
        other = _staff('o@x.com', 'Employee')
        self.client.force_authenticate(self.employee)
        ok = self.client.patch(f'/api/accounts/users/{other.pk}/', {'phone': '555'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        res = self.client.patch(f'/api/accounts/users/{other.pk}/', {'role': 'Manager'}, format='json')
        self.assertEqual(res.status_code, 403)


class PageTests(APITestCase):
    def setUp(self):
        self.owner = _staff('own@x.com', 'Admin', superuser=True)
        self.manager = _staff('mgr@x.com', 'Manager')
        self.employee = _staff('emp@x.com', 'Employee')

    def test_managers_read_only_the_owner_changes(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get('/api/accounts/access/').status_code, 403)
        self.client.force_authenticate(self.manager)
        page = self.client.get('/api/accounts/access/')
        self.assertEqual(page.status_code, 200)
        self.assertFalse(page.data['can_edit'])
        self.assertEqual(page.data['levels']['Employee']['cashier']['step'], cat.WORK)
        body = {'kind': 'level', 'level': 'Employee', 'areas': {'buying': {'step': cat.VIEW}}}
        self.assertEqual(self.client.put('/api/accounts/access/layer/', body, format='json').status_code, 403)
        # A grant at People Full still never changes permissions.
        _exception(self.manager, {'people': {'step': cat.FULL}})
        self.assertEqual(self.client.put('/api/accounts/access/layer/', body, format='json').status_code, 403)

    def test_owner_saves_a_level_and_history_says_so(self):
        self.client.force_authenticate(self.owner)
        body = {'kind': 'level', 'level': 'Employee', 'areas': {'buying': {'step': cat.VIEW}}}
        res = self.client.put('/api/accounts/access/layer/', body, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data['levels']['Employee']['buying']['step'], cat.VIEW)
        self.assertEqual(res.data['levels']['Employee']['cashier']['step'], cat.WORK)  # left alone
        event = AccessEvent.objects.get()
        self.assertEqual((event.target, event.area, event.change), ('Employee level', 'buying', 'Work → View'))
        self.assertEqual(access.resolve(User.objects.get(pk=self.employee.pk)).steps['buying'], cat.VIEW)

    def test_owner_sets_an_exception_with_an_end_date(self):
        self.client.force_authenticate(self.owner)
        until = (timezone.localdate() + dt.timedelta(days=10)).isoformat()
        body = {'kind': 'person', 'user_id': self.employee.pk,
                'areas': {'admin': {'add': ['hr.mod_requests:triage'], 'until': until, 'note': 'Covering payroll'}}}
        res = self.client.put('/api/accounts/access/layer/', body, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        row = next(p for p in res.data['people'] if p['id'] == self.employee.pk)
        self.assertEqual(row['items']['hr.mod_requests:triage'], access.SOURCE_PERSON)
        self.assertEqual(row['exception_count'], 1)
        changes = list(AccessEvent.objects.values_list('change', 'note'))
        self.assertIn(('+ Approve or reject time-change requests', 'Covering payroll'), changes)

    def test_locked_items_and_departments_taking_away_are_refused(self):
        self.client.force_authenticate(self.owner)
        locked = {'kind': 'person', 'user_id': self.employee.pk, 'areas': {'people': {'add': ['access:edit']}}}
        self.assertEqual(self.client.put('/api/accounts/access/layer/', locked, format='json').status_code, 400)
        dept = Department.objects.create(name='Perm Test Retail', slug='tmp-retail')
        take = {'kind': 'department', 'department_id': dept.pk, 'areas': {'cashier': {'remove': ['pos.drawer:use']}}}
        self.assertEqual(self.client.put('/api/accounts/access/layer/', take, format='json').status_code, 400)

    def test_owner_sets_a_level(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post('/api/accounts/access/level/', {'user_id': self.employee.pk, 'level': 'Manager'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(User.objects.get(pk=self.employee.pk).role, 'Manager')
        self.assertTrue(AccessEvent.objects.filter(change='Level: Employee → Manager').exists())
        owner = self.client.post('/api/accounts/access/level/', {'user_id': self.owner.pk, 'level': 'Employee'},
                                 format='json')
        self.assertEqual(owner.status_code, 400)

    def test_me_carries_access(self):
        self.client.force_authenticate(self.employee)
        me = self.client.get('/api/auth/me/').json()
        self.assertIn('cashier:work', me['access'])
        self.assertNotIn('admin:view', me['access'])


class CatalogTests(APITestCase):
    def test_every_gated_endpoint_has_an_area(self):
        """A new owner or manager endpoint must sit in a sidebar area, or a grant can never open it."""
        from apps.accounts.permissions import IsAdmin, IsManagerOrAdmin, IsSuperAdmin

        gated = (IsAdmin, IsManagerOrAdmin, IsSuperAdmin)
        missing = []

        def walk(patterns, prefix=''):
            for p in patterns:
                if isinstance(p, URLResolver):
                    walk(p.url_patterns, prefix + str(p.pattern))
                elif isinstance(p, URLPattern):
                    cls = getattr(p.callback, 'cls', None)
                    if cls is None:
                        continue
                    initkwargs = getattr(p.callback, 'initkwargs', {}) or {}
                    perms = initkwargs.get('permission_classes') or getattr(cls, 'permission_classes', [])
                    path = (prefix + str(p.pattern)).replace('^', '')
                    if path.startswith('api/') and (any(issubclass(c, gated) for c in perms)
                                                    or 'get_permissions' in cls.__dict__):
                        if cat.area_for_path(path) is None:
                            missing.append(path)

        walk(get_resolver().url_patterns)
        self.assertEqual(missing, [])

    def test_items_name_paths_in_their_own_area(self):
        for item in cat.ITEMS:
            for path in item.paths:
                self.assertEqual(cat.area_for_path(path.split('*')[0]), item.area, (item.id, path))

    def test_defaults_cover_every_area(self):
        for level in cat.LEVELS:
            self.assertEqual(set(cat.LEVEL_DEFAULTS[level]), set(cat.AREA_IDS))

    def test_no_item_reads_like_a_dial_step(self):
        steps = {cat.step_key(a, s) for a in cat.AREA_IDS for s in range(1, 5)}
        self.assertEqual({i.id for i in cat.ITEMS} & steps, set())


class StaffAccountGrantTests(APITestCase):
    def test_a_granted_account_manager_never_touches_the_owner_or_a_manager(self):
        owner = _staff('own@x.com', 'Admin', superuser=True)
        manager = _staff('mgr@x.com', 'Manager')
        clerk = _staff('clerk@x.com', 'Employee')
        _exception(clerk, {'people': {'add': ['users.staff:manage']}})
        self.client.force_authenticate(clerk)
        for target in (owner, manager):
            res = self.client.patch(f'/api/accounts/users/{target.pk}/', {'email': 'me@x.com'}, format='json')
            self.assertEqual(res.status_code, 403, target.email)
        self.assertEqual(self.client.get(f'/api/accounts/users/{owner.pk}/').status_code, 200)
