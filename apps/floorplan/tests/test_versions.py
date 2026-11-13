"""Floor plan versions (#130): owner Make / Unset current, past versions keep their pins, alignment on a size change."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.floorplan.models import FloorPlan, FloorPlanCurrentPeriod, MapLayer, MapPin, default_plan_document

from .test_floorplan_api import make_user


def sized(width, height):
    doc = default_plan_document()
    doc['settings']['planWidth'] = width
    doc['settings']['planHeight'] = height
    return doc


class VersionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = get_user_model().objects.create_superuser(
            email='owner@test.com', password='pass1234', first_name='O', last_name='Wner',
        )
        Group.objects.get_or_create(name='Admin')[0].user_set.add(self.owner)  # staff reads need a staff role
        self.manager = make_user('manager', 'Manager')
        self.store = WorkLocation.objects.create(name='Canfield')
        self.old = FloorPlan.objects.create(name='March plan', location=self.store, data=sized(1200, 720))
        self.signage = MapLayer.objects.get(slug='signage')
        self.client.force_authenticate(user=self.owner)
        self.post(self.old, 'make-current')
        MapPin.objects.create(plan=self.old, layer=self.signage, x=100, y=50, name='Exit')
        MapPin.objects.create(plan=self.old, layer=self.signage, x=600, y=360, name='Register')

    def post(self, plan, what, body=None):
        return self.client.post(f'/api/floorplan/plans/{plan.id}/{what}/', body or {}, format='json')

    def test_unset_current_always_answers_and_keeps_the_pins(self):
        resp = self.post(self.old, 'unset-current')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['changed'])
        self.assertIn('no longer the Current plan', resp.data['message'])
        self.old.refresh_from_db()
        self.assertFalse(self.old.is_current)
        self.assertEqual(self.old.pins.count(), 2)
        self.assertIsNotNone(FloorPlanCurrentPeriod.objects.get(plan=self.old).ended_at)
        again = self.post(self.old, 'unset-current')
        self.assertFalse(again.data['changed'])
        self.assertIn('Nothing changed', again.data['message'])
        # The store map then has no plan, but the past version is still there to look at.
        empty = self.client.get('/api/floorplan/store-map/').data
        self.assertIsNone(empty['plan'])
        past = self.client.get(f'/api/floorplan/store-map/?plan={self.old.id}').data
        self.assertTrue(past['is_history'])
        self.assertEqual(len(past['pins']), 2)

    def test_make_current_twice_says_nothing_changed(self):
        resp = self.post(self.old, 'make-current')
        self.assertFalse(resp.data['changed'])
        self.assertIn('already', resp.data['message'])

    def test_only_the_owner_sets_or_unsets(self):
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.post(self.old, 'unset-current').status_code, 403)
        self.assertEqual(self.client.get(f'/api/floorplan/plans/{self.old.id}/current-preview/').status_code, 403)

    def test_same_size_copies_the_pins_and_keeps_history(self):
        new = FloorPlan.objects.create(name='November plan', location=self.store, data=sized(1200, 720))
        preview = self.client.get(f'/api/floorplan/plans/{new.id}/current-preview/').data
        self.assertEqual(preview['source']['id'], self.old.id)
        self.assertTrue(preview['copies_pins'])
        self.assertFalse(preview['needs_align'])
        resp = self.post(new, 'make-current')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['pins_copied'], 2)
        self.assertEqual(self.old.pins.count(), 2)
        self.assertEqual(sorted(new.pins.values_list('x', 'y')), [(100, 50), (600, 360)])
        versions = self.client.get('/api/floorplan/store-map/').data['versions']
        self.assertEqual([v['plan_id'] for v in versions], [new.id, self.old.id])
        self.assertTrue(versions[0]['is_current'])
        self.assertIsNotNone(versions[1]['ended_at'])

    def test_a_different_size_needs_the_owners_alignment(self):
        new = FloorPlan.objects.create(name='Big plan', location=self.store, data=sized(2400, 1440))
        refused = self.post(new, 'make-current')
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.data['code'], 'align_required')
        self.assertTrue(refused.data['preview']['needs_align'])
        new.refresh_from_db()
        self.assertFalse(new.is_current)

        resp = self.post(new, 'make-current', {'transform': {'scale': 2, 'dx': 10, 'dy': -20}})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn('scaled 200%', resp.data['message'])
        self.assertEqual(sorted(new.pins.values_list('x', 'y')), [(210, 80), (1210, 700)])
        self.assertEqual(FloorPlanCurrentPeriod.objects.get(plan=new).transform, {'scale': 2, 'dx': 10, 'dy': -20})
        # The old plan's pins are untouched.
        self.assertEqual(sorted(self.old.pins.values_list('x', 'y')), [(100, 50), (600, 360)])

    def test_pins_that_land_off_the_plan_go_to_its_edge(self):
        new = FloorPlan.objects.create(name='Small plan', location=self.store, data=sized(300, 200))
        resp = self.post(new, 'make-current', {'transform': {'scale': 1, 'dx': 0, 'dy': 0}})
        self.assertIn('set at its edge', resp.data['message'])
        self.assertIn((540, 360), list(new.pins.values_list('x', 'y')))  # 300 + 240 margin

    def test_a_bad_transform_is_refused(self):
        new = FloorPlan.objects.create(name='Big plan', location=self.store, data=sized(2400, 1440))
        self.assertEqual(self.post(new, 'make-current', {'transform': {'scale': 0}}).status_code, 400)
        self.assertEqual(self.post(new, 'make-current', {'transform': {'scale': 'x'}}).status_code, 400)

    def test_back_to_a_past_version_keeps_its_own_pins(self):
        new = FloorPlan.objects.create(name='November plan', location=self.store, data=sized(1200, 720))
        self.post(new, 'make-current')
        resp = self.post(self.old, 'make-current')
        self.assertEqual(resp.data['pins_copied'], 0)
        self.assertIn('keeps its own 2 pins', resp.data['message'])
        self.assertEqual(MapPin.objects.count(), 4)

    def test_unset_then_make_current_copies_from_the_last_current_plan(self):
        self.post(self.old, 'unset-current')
        new = FloorPlan.objects.create(name='November plan', location=self.store, data=sized(1200, 720))
        resp = self.post(new, 'make-current')
        self.assertEqual(resp.data['pins_copied'], 2)

    def test_pins_on_a_past_version_are_history(self):
        new = FloorPlan.objects.create(name='November plan', location=self.store, data=sized(1200, 720))
        self.post(new, 'make-current')
        old_pin = self.old.pins.first()
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.client.patch(f'/api/floorplan/pins/{old_pin.id}/', {'x': 1}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/floorplan/pins/{old_pin.id}/').status_code, 400)
        body = {'plan': self.old.id, 'layer': self.signage.id, 'x': 1, 'y': 1, 'name': 'X', 'ref_id': 1}
        self.assertEqual(self.client.post('/api/floorplan/pins/', body, format='json').status_code, 400)

    def test_list_shows_past_versions_and_pin_counts(self):
        new = FloorPlan.objects.create(name='November plan', location=self.store, data=sized(1200, 720))
        self.post(new, 'make-current')
        rows = {r['id']: r for r in self.client.get('/api/floorplan/plans/').data['results']}
        self.assertEqual(rows[self.old.id]['pin_count'], 2)
        self.assertIsNotNone(rows[self.old.id]['last_current_end'])
        self.assertIsNone(rows[new.id]['last_current_end'])

    def test_deleting_the_current_plan_closes_its_period(self):
        self.client.delete(f'/api/floorplan/plans/{self.old.id}/')
        self.assertIsNotNone(FloorPlanCurrentPeriod.objects.get(plan=self.old).ended_at)

    def test_a_new_plan_goes_to_the_store_without_a_location(self):
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/floorplan/plans/', {'name': 'No location sent'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['location'], self.store.id)
