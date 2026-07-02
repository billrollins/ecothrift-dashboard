from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.floorplan.models import FloorPlanElementKind

SEEDED_SLUGS = {
    'wall', 'door', 'window', 'column',
    'gondola', 'wallShelf', 'displayTable', 'rackRound', 'rackStraight',
    'bookcase', 'glassCase', 'binTable',
    'checkoutCounter', 'register', 'fittingRoom', 'cartCorral',
    'pallet', 'trash', 'genericRect',
}

BASE = '/api/floorplan/element-kinds/'


def make_user(username, role, is_superuser=False):
    user = get_user_model().objects.create_user(
        email=f'{username}@test.com', first_name='Test', last_name=role,
        password='pass1234',
    )
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    if is_superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


def valid_payload(**overrides):
    payload = {
        'label': 'Vinyl crate',
        'category': 'Fixtures',
        'default_w': 30,
        'default_h': 30,
        'fill_color': '#123abc',
        'shape': 'rect',
        'corner_radius': 0,
        'resizable': True,
    }
    payload.update(overrides)
    return payload


class ElementKindApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = make_user('employee', 'Employee')
        self.manager = make_user('manager', 'Manager')
        self.superadmin = make_user('super', 'Admin', is_superuser=True)

    # ---- seed ----

    def test_seed_matches_legacy_palette(self):
        kinds = FloorPlanElementKind.objects.filter(is_system=True, is_active=True)
        self.assertEqual({k.kind for k in kinds}, SEEDED_SLUGS)
        by_kind = {k.kind: k for k in kinds}
        self.assertEqual(by_kind['column'].shape, 'circle')
        self.assertEqual(by_kind['rackRound'].shape, 'circle')
        self.assertEqual(by_kind['gondola'].shape, 'rect')
        self.assertEqual(by_kind['gondola'].corner_radius, 0)
        self.assertEqual(by_kind['gondola'].fill_color, '#7986cb')
        self.assertEqual(by_kind['gondola'].default_w, 48)
        self.assertEqual(by_kind['gondola'].default_h, 144)
        self.assertFalse(by_kind['register'].resizable)

    # ---- permissions ----

    def test_unauthenticated_denied(self):
        self.assertEqual(self.client.get(BASE).status_code, 401)

    def test_staff_can_read(self):
        for user in (self.employee, self.manager):
            self.client.force_authenticate(user=user)
            resp = self.client.get(BASE)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(
                {row['kind'] for row in resp.data['results']}, SEEDED_SLUGS)

    def test_non_superuser_cannot_write(self):
        for user in (self.employee, self.manager):
            self.client.force_authenticate(user=user)
            self.assertEqual(
                self.client.post(BASE, valid_payload(), format='json').status_code, 403)
            kind = FloorPlanElementKind.objects.get(kind='gondola')
            self.assertEqual(
                self.client.patch(f'{BASE}{kind.id}/', {'label': 'X'}, format='json').status_code,
                403,
            )
            self.assertEqual(self.client.delete(f'{BASE}{kind.id}/').status_code, 403)

    # ---- superuser CRUD ----

    def test_superuser_creates_kind_with_auto_slug(self):
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(BASE, valid_payload(), format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['kind'], 'vinyl-crate')
        self.assertFalse(resp.data['is_system'])
        # Same label again → unique suffix
        resp2 = self.client.post(BASE, valid_payload(), format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(resp2.data['kind'], 'vinyl-crate-2')

    def test_create_rejects_duplicate_explicit_slug(self):
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(BASE, valid_payload(kind='gondola'), format='json')
        self.assertEqual(resp.status_code, 400)

    def test_superuser_edits_system_kind_but_not_slug(self):
        self.client.force_authenticate(user=self.superadmin)
        kind = FloorPlanElementKind.objects.get(kind='gondola')
        resp = self.client.patch(
            f'{BASE}{kind.id}/', {'label': 'Gondola (double)', 'corner_radius': 2},
            format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['label'], 'Gondola (double)')
        self.assertEqual(resp.data['corner_radius'], 2)
        resp = self.client.patch(f'{BASE}{kind.id}/', {'kind': 'gondola2'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_system_kind_cannot_be_deleted(self):
        self.client.force_authenticate(user=self.superadmin)
        kind = FloorPlanElementKind.objects.get(kind='gondola')
        resp = self.client.delete(f'{BASE}{kind.id}/')
        self.assertEqual(resp.status_code, 400)
        kind.refresh_from_db()
        self.assertTrue(kind.is_active)

    def test_custom_kind_soft_deletes(self):
        self.client.force_authenticate(user=self.superadmin)
        created = self.client.post(BASE, valid_payload(), format='json').data
        resp = self.client.delete(f"{BASE}{created['id']}/")
        self.assertEqual(resp.status_code, 204)
        row = FloorPlanElementKind.objects.get(pk=created['id'])
        self.assertFalse(row.is_active)
        listed = self.client.get(BASE).data['results']
        self.assertNotIn(created['kind'], {r['kind'] for r in listed})

    # ---- validation ----

    def test_invalid_fill_color_rejected(self):
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(BASE, valid_payload(fill_color='red'), format='json')
        self.assertEqual(resp.status_code, 400)

    def test_dimension_bounds(self):
        self.client.force_authenticate(user=self.superadmin)
        self.assertEqual(
            self.client.post(BASE, valid_payload(default_w=0), format='json').status_code, 400)
        self.assertEqual(
            self.client.post(BASE, valid_payload(default_h=20_000), format='json').status_code, 400)

    def test_circle_normalizes_corner_radius(self):
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(
            BASE, valid_payload(shape='circle', corner_radius=6), format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['corner_radius'], 0)
