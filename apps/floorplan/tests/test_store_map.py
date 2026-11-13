"""The store map (#105): one Current plan per location, layers, and pins that survive plan edits."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.floorplan.models import FloorPlan, MapLayer, MapPin

from .test_floorplan_api import make_user, sample_document


class StoreMapTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = get_user_model().objects.create_superuser(
            email='owner@test.com', password='pass1234', first_name='O', last_name='Wner',
        )
        self.manager = make_user('manager', 'Manager')
        self.employee = make_user('employee', 'Employee')
        self.store = WorkLocation.objects.create(name='Main Store')
        self.other_store = WorkLocation.objects.create(name='Annex')
        self.plan_a = FloorPlan.objects.create(name='Plan A', location=self.store)
        self.plan_b = FloorPlan.objects.create(name='Plan B', location=self.store)
        self.signage = MapLayer.objects.get(slug='signage')
        # A plain layer (no record behind its pins), like cameras or extinguishers will be.
        self.plain = MapLayer.objects.create(slug='extinguishers', name='Fire extinguishers')

    def make_current(self, plan, user=None):
        self.client.force_authenticate(user=user or self.owner)
        return self.client.post(f'/api/floorplan/plans/{plan.id}/make-current/')

    # ---- Current plan ----

    def test_signage_layer_is_seeded(self):
        self.assertEqual(self.signage.name, 'Signage')

    def test_only_a_superuser_marks_current(self):
        self.assertEqual(self.make_current(self.plan_a, self.manager).status_code, 403)
        self.assertEqual(self.make_current(self.plan_a, self.employee).status_code, 403)
        resp = self.make_current(self.plan_a)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['is_current'])

    def test_one_current_per_location_and_the_old_plan_keeps_its_pins(self):
        self.make_current(self.plan_a)
        MapPin.objects.create(plan=self.plan_a, layer=self.signage, x=10, y=20, name='Exit sign')
        other = FloorPlan.objects.create(name='Annex plan', location=self.other_store)
        self.make_current(other)

        resp = self.make_current(self.plan_b)
        self.assertEqual(resp.data['pins_copied'], 1)
        self.assertIn('Plan A', resp.data['message'])
        self.plan_a.refresh_from_db()
        other.refresh_from_db()
        self.assertFalse(self.plan_a.is_current)
        self.assertTrue(other.is_current)  # another location keeps its own
        # Versions (#130): the old plan keeps its pin as history; the new one has a copy at the same spot.
        self.assertEqual(list(self.plan_a.pins.values_list('x', 'y')), [(10, 20)])
        self.assertEqual(list(self.plan_b.pins.values_list('x', 'y', 'name')), [(10, 20, 'Exit sign')])

    def test_is_current_cannot_be_set_through_patch(self):
        self.client.force_authenticate(user=self.manager)
        self.client.patch(f'/api/floorplan/plans/{self.plan_a.id}/', {'is_current': True}, format='json')
        self.plan_a.refresh_from_db()
        self.assertFalse(self.plan_a.is_current)

    def test_deleting_the_current_plan_clears_it(self):
        self.make_current(self.plan_a)
        self.client.force_authenticate(user=self.manager)
        self.client.delete(f'/api/floorplan/plans/{self.plan_a.id}/')
        self.plan_a.refresh_from_db()
        self.assertFalse(self.plan_a.is_current)

    def test_list_shows_the_current_flag(self):
        self.make_current(self.plan_a)
        self.client.force_authenticate(user=self.employee)
        rows = {r['id']: r['is_current'] for r in self.client.get('/api/floorplan/plans/').data['results']}
        self.assertEqual(rows, {self.plan_a.id: True, self.plan_b.id: False})

    # ---- store map read ----

    def test_store_map_for_any_staff(self):
        self.client.force_authenticate(user=self.employee)
        empty = self.client.get('/api/floorplan/store-map/')
        self.assertEqual(empty.status_code, 200)
        self.assertIsNone(empty.data['plan'])
        self.assertIn('signage', [layer['slug'] for layer in empty.data['layers']])

        self.make_current(self.plan_a)
        MapPin.objects.create(plan=self.plan_a, layer=self.signage, x=1, y=2, name='Exit')
        MapPin.objects.create(plan=self.plan_b, layer=self.signage, x=1, y=2, name='Not on the map')
        self.client.force_authenticate(user=self.employee)
        resp = self.client.get('/api/floorplan/store-map/')
        self.assertEqual(resp.data['plan']['id'], self.plan_a.id)
        self.assertFalse(resp.data['is_history'])
        self.assertEqual([p['name'] for p in resp.data['pins']], ['Exit'])
        self.assertEqual([v['plan_id'] for v in resp.data['versions']], [self.plan_a.id])

    # ---- pins ----

    def pins_go_on_a_current_plan(self):
        self.make_current(self.plan_a)

    def test_pins_are_for_managers_to_change(self):
        self.pins_go_on_a_current_plan()
        body = {'plan': self.plan_a.id, 'layer': self.plain.id, 'x': 50, 'y': 60, 'name': 'By the door'}
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(self.client.post('/api/floorplan/pins/', body, format='json').status_code, 403)
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/floorplan/pins/', body, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['layer_slug'], 'extinguishers')
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(len(self.client.get(f'/api/floorplan/pins/?plan={self.plan_a.id}').data), 1)

    def test_pin_off_the_map_is_refused(self):
        self.pins_go_on_a_current_plan()
        self.client.force_authenticate(user=self.manager)
        body = {'plan': self.plan_a.id, 'layer': self.plain.id, 'x': 99_999, 'y': 60, 'name': 'Far'}
        resp = self.client.post('/api/floorplan/pins/', body, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('x', resp.data)

    def test_pin_ref_follows_the_layer(self):
        self.pins_go_on_a_current_plan()
        cams = MapLayer.objects.create(slug='cameras', name='Cameras', ref_type='')
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/floorplan/pins/', {
            'plan': self.plan_a.id, 'layer': cams.id, 'x': 5, 'y': 5, 'name': 'Cam 1', 'ref_id': 7,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual((resp.data['ref_type'], resp.data['ref_id']), ('', None))

    def test_moving_a_pin_and_saving_the_plan_keeps_it(self):
        self.pins_go_on_a_current_plan()
        pin = MapPin.objects.create(plan=self.plan_a, layer=self.signage, x=1, y=2, name='Exit')
        self.client.force_authenticate(user=self.manager)
        resp = self.client.patch(f'/api/floorplan/pins/{pin.id}/', {'x': 30, 'y': 40}, format='json')
        self.assertEqual(resp.status_code, 200)
        # Saving new plan content (the Studio designer) never touches the pins.
        save = self.client.patch(
            f'/api/floorplan/plans/{self.plan_a.id}/',
            {'data': sample_document(), 'revision': self.plan_a.revision}, format='json',
        )
        self.assertEqual(save.status_code, 200)
        pin.refresh_from_db()
        self.assertEqual((pin.plan_id, pin.x, pin.y), (self.plan_a.id, 30, 40))

    def test_a_pin_stays_on_its_plan(self):
        self.pins_go_on_a_current_plan()
        pin = MapPin.objects.create(plan=self.plan_a, layer=self.signage, x=1, y=2, name='Exit')
        self.client.force_authenticate(user=self.manager)
        resp = self.client.patch(f'/api/floorplan/pins/{pin.id}/', {'plan': self.plan_b.id}, format='json')
        self.assertEqual(resp.status_code, 400)
