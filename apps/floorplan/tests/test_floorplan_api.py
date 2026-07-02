import copy

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.floorplan.models import CURRENT_SCHEMA_VERSION, FloorPlan, default_plan_document


def make_user(username, role):
    user = get_user_model().objects.create_user(
        email=f'{username}@test.com', first_name='Test', last_name=role,
        password='pass1234',
    )
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    return user


def sample_document():
    doc = default_plan_document()
    doc['elements'] = [
        {'id': 'el_1', 'kind': 'gondola', 'x': 120, 'y': 48, 'w': 48, 'h': 144,
         'rotation': 90, 'label': 'Aisle 1', 'active': True},
    ]
    doc['zones'] = [
        {'id': 'zn_1', 'label': 'Toys', 'x': 0, 'y': 0, 'w': 240, 'h': 180,
         'color': '#4caf50', 'opacity': 0.25},
    ]
    doc['paths'] = [
        {'id': 'pa_1', 'points': [[0, 0], [10.5, 12.25]], 'stroke': '#333', 'width': 2},
    ]
    doc['labels'] = [
        {'id': 'lb_1', 'text': 'Restrooms', 'x': 100, 'y': 200, 'fontSize': 18,
         'color': '#000'},
    ]
    doc['infoBlocks'] = [
        {'id': 'ib_1', 'type': 'northArrow', 'x': 0, 'y': 0, 'w': 60, 'h': 60,
         'props': {'rotation': 0}},
    ]
    return doc


class FloorPlanApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('manager', 'Manager')
        self.employee = make_user('employee', 'Employee')
        self.consignee = make_user('consignee', 'Consignee')
        self.location = WorkLocation.objects.create(name='Main Store')
        self.plan = FloorPlan.objects.create(
            name='Existing plan', location=self.location, created_by=self.manager,
        )

    def as_manager(self):
        self.client.force_authenticate(user=self.manager)

    # ---- permissions ----

    def test_unauthenticated_denied(self):
        resp = self.client.get('/api/floorplan/plans/')
        self.assertEqual(resp.status_code, 401)

    def test_consignee_denied(self):
        self.client.force_authenticate(user=self.consignee)
        resp = self.client.get('/api/floorplan/plans/')
        self.assertEqual(resp.status_code, 403)

    def test_employee_can_view_but_not_edit(self):
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(self.client.get('/api/floorplan/plans/').status_code, 200)
        self.assertEqual(
            self.client.get(f'/api/floorplan/plans/{self.plan.id}/').status_code, 200)
        resp = self.client.post(
            '/api/floorplan/plans/',
            {'name': 'New', 'location': self.location.id}, format='json')
        self.assertEqual(resp.status_code, 403)
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/', {'name': 'Renamed'}, format='json')
        self.assertEqual(resp.status_code, 403)
        resp = self.client.delete(f'/api/floorplan/plans/{self.plan.id}/')
        self.assertEqual(resp.status_code, 403)

    # ---- CRUD ----

    def test_create_gets_default_document(self):
        self.as_manager()
        resp = self.client.post(
            '/api/floorplan/plans/',
            {'name': 'New plan', 'location': self.location.id}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['revision'], 1)
        self.assertEqual(resp.data['schema_version'], CURRENT_SCHEMA_VERSION)
        self.assertEqual(resp.data['data']['schema_version'], CURRENT_SCHEMA_VERSION)
        self.assertEqual(resp.data['data']['elements'], [])
        self.assertEqual(resp.data['created_by'], self.manager.id)

    def test_list_excludes_data_and_filters_by_location(self):
        self.as_manager()
        other = WorkLocation.objects.create(name='Second Store')
        FloorPlan.objects.create(name='Other', location=other)
        resp = self.client.get('/api/floorplan/plans/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)
        self.assertNotIn('data', resp.data['results'][0])
        resp = self.client.get(f'/api/floorplan/plans/?location={other.id}')
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['name'], 'Other')

    def test_soft_delete(self):
        self.as_manager()
        resp = self.client.delete(f'/api/floorplan/plans/{self.plan.id}/')
        self.assertEqual(resp.status_code, 204)
        self.plan.refresh_from_db()
        self.assertFalse(self.plan.is_active)
        self.assertEqual(
            self.client.get(f'/api/floorplan/plans/{self.plan.id}/').status_code, 404)

    def test_rename_without_data_does_not_require_revision(self):
        self.as_manager()
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/', {'name': 'Renamed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['name'], 'Renamed')
        self.assertEqual(resp.data['revision'], 1)

    # ---- save / round-trip ----

    def test_save_round_trip_preserves_document_exactly(self):
        self.as_manager()
        doc = sample_document()
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/',
            {'data': doc, 'revision': 1}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['revision'], 2)

        reloaded = self.client.get(f'/api/floorplan/plans/{self.plan.id}/')
        self.assertEqual(reloaded.data['data'], doc)
        # coordinates preserved exactly, including floats
        self.assertEqual(reloaded.data['data']['paths'][0]['points'][1], [10.5, 12.25])

    def test_save_increments_revision_each_time(self):
        self.as_manager()
        doc = sample_document()
        for expected in (2, 3, 4):
            resp = self.client.patch(
                f'/api/floorplan/plans/{self.plan.id}/',
                {'data': doc, 'revision': expected - 1}, format='json')
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data['revision'], expected)

    # ---- optimistic locking ----

    def test_stale_revision_conflicts(self):
        self.as_manager()
        doc = sample_document()
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/',
            {'data': doc, 'revision': 1}, format='json')
        self.assertEqual(resp.status_code, 200)
        # A second client still holding revision 1
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/',
            {'data': doc, 'revision': 1}, format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['code'], 'revision_conflict')
        self.assertEqual(resp.data['current_revision'], 2)

    def test_missing_revision_rejected(self):
        self.as_manager()
        resp = self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/',
            {'data': sample_document()}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'revision_required')

    # ---- document validation ----

    def _save(self, doc):
        return self.client.patch(
            f'/api/floorplan/plans/{self.plan.id}/',
            {'data': doc, 'revision': 1}, format='json')

    def test_rejects_wrong_schema_version(self):
        self.as_manager()
        doc = sample_document()
        doc['schema_version'] = 99
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_non_object_document(self):
        self.as_manager()
        self.assertEqual(self._save(['not', 'a', 'dict']).status_code, 400)

    def test_rejects_missing_collections(self):
        self.as_manager()
        doc = sample_document()
        del doc['zones']
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_non_numeric_coordinates(self):
        self.as_manager()
        doc = sample_document()
        doc['elements'][0]['x'] = 'twelve'
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_insane_coordinates(self):
        self.as_manager()
        doc = sample_document()
        doc['elements'][0]['y'] = 10_000_000
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_missing_object_id(self):
        self.as_manager()
        doc = sample_document()
        del doc['labels'][0]['id']
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_malformed_path_points(self):
        self.as_manager()
        doc = sample_document()
        doc['paths'][0]['points'] = [[1, 2, 3]]
        self.assertEqual(self._save(doc).status_code, 400)

    def test_rejects_invalid_settings(self):
        self.as_manager()
        doc = sample_document()
        doc['settings']['planWidth'] = -5
        self.assertEqual(self._save(doc).status_code, 400)

    def test_valid_save_does_not_mutate_document(self):
        self.as_manager()
        doc = sample_document()
        original = copy.deepcopy(doc)
        resp = self._save(doc)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(doc, original)
