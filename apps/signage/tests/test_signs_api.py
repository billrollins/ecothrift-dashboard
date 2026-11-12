"""Signage (#106): the sign list, its PDFs, and its pins on the store map's Signage layer."""
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import S3File, WorkLocation
from apps.floorplan.models import FloorPlan, MapLayer, MapPin
from apps.floorplan.tests.test_floorplan_api import make_user
from apps.signage.models import SIGN_REF_TYPE, Sign

PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


class SignApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('manager', 'Manager')
        self.employee = make_user('employee', 'Employee')
        store = WorkLocation.objects.create(name='Main Store')
        self.plan = FloorPlan.objects.create(name='Main', location=store, is_current=True)
        self.old_plan = FloorPlan.objects.create(name='Old', location=store)
        self.layer = MapLayer.objects.get(slug='signage')
        self.sign = Sign.objects.create(name='Thrift+ Meet', status=Sign.STATUS_UP, copies_up=2)

    def pin(self, sign, plan=None, x=10):
        return MapPin.objects.create(
            plan=plan or self.plan, layer=self.layer, x=x, y=10, name=sign.name,
            ref_type=SIGN_REF_TYPE, ref_id=sign.id,
        )

    def test_the_signage_layer_points_at_signs(self):
        self.assertEqual(self.layer.ref_type, SIGN_REF_TYPE)

    def test_staff_read_managers_change(self):
        self.client.force_authenticate(user=self.employee)
        rows = self.client.get('/api/signage/signs/').data
        self.assertEqual([r['name'] for r in rows], ['Thrift+ Meet'])
        self.assertEqual(self.client.post('/api/signage/signs/', {'name': 'X'}, format='json').status_code, 403)
        self.assertEqual(
            self.client.patch(f'/api/signage/signs/{self.sign.id}/', {'status': 'printed'}, format='json').status_code,
            403,
        )
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/signage/signs/', {'name': ' Restrooms '}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual((resp.data['name'], resp.data['status']), ('Restrooms', 'to_make'))

    def test_mark_off_and_filter_by_status(self):
        todo = Sign.objects.create(name='Restrooms')
        self.client.force_authenticate(user=self.manager)
        resp = self.client.patch(f'/api/signage/signs/{todo.id}/', {'status': 'printed'}, format='json')
        self.assertEqual(resp.data['status_label'], 'Printed')
        names = [r['name'] for r in self.client.get('/api/signage/signs/?status=up').data]
        self.assertEqual(names, ['Thrift+ Meet'])

    def test_pin_count_is_the_current_map_only(self):
        self.pin(self.sign)
        self.pin(self.sign, x=40)
        self.pin(self.sign, plan=self.old_plan)
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(self.client.get('/api/signage/signs/').data[0]['pins'], 2)
        self.assertEqual(self.client.get(f'/api/signage/signs/{self.sign.id}/').data['pins'], 2)

    def test_rename_renames_its_pins(self):
        pin = self.pin(self.sign)
        self.client.force_authenticate(user=self.manager)
        self.client.patch(f'/api/signage/signs/{self.sign.id}/', {'name': 'Meet Thrift+'}, format='json')
        pin.refresh_from_db()
        self.assertEqual(pin.name, 'Meet Thrift+')

    def test_remove_hides_the_sign_and_drops_its_pins(self):
        self.pin(self.sign)
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.client.delete(f'/api/signage/signs/{self.sign.id}/').status_code, 204)
        self.sign.refresh_from_db()
        self.assertFalse(self.sign.is_active)
        self.assertFalse(MapPin.objects.exists())
        self.assertEqual(self.client.get('/api/signage/signs/').data, [])

    # ---- the PDF ----

    def test_upload_and_open_the_pdf(self):
        self.client.force_authenticate(user=self.manager)
        upload = SimpleUploadedFile('meet.pdf', PDF, content_type='application/pdf')
        with mock.patch('apps.core.files.default_storage') as storage:
            storage.save.return_value = 'signage/abc.pdf'
            resp = self.client.post(f'/api/signage/signs/{self.sign.id}/pdf/', {'file': upload}, format='multipart')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['pdf_name'], 'meet.pdf')
        self.sign.refresh_from_db()
        self.assertEqual(self.sign.pdf.key, 'signage/abc.pdf')

        self.client.force_authenticate(user=self.employee)
        with mock.patch('apps.signage.views.stream_s3') as stream:
            from django.http import HttpResponse
            stream.return_value = HttpResponse(PDF, content_type='application/pdf')
            got = self.client.get(f'/api/signage/signs/{self.sign.id}/pdf/?download=1')
        self.assertEqual(got.status_code, 200)
        stream.assert_called_once()
        self.assertTrue(stream.call_args.kwargs['as_attachment'])

    def test_a_non_pdf_is_refused(self):
        self.client.force_authenticate(user=self.manager)
        upload = SimpleUploadedFile('meet.pdf', b'not a pdf at all', content_type='application/pdf')
        resp = self.client.post(f'/api/signage/signs/{self.sign.id}/pdf/', {'file': upload}, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(S3File.objects.exists())

    def test_no_pdf_yet_is_404_and_staff_cannot_upload(self):
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(self.client.get(f'/api/signage/signs/{self.sign.id}/pdf/').status_code, 404)
        upload = SimpleUploadedFile('meet.pdf', PDF, content_type='application/pdf')
        resp = self.client.post(f'/api/signage/signs/{self.sign.id}/pdf/', {'file': upload}, format='multipart')
        self.assertEqual(resp.status_code, 403)

    # ---- pins on the Signage layer ----

    def test_a_signage_pin_must_name_a_live_sign(self):
        self.client.force_authenticate(user=self.manager)
        base = {'plan': self.plan.id, 'layer': self.layer.id, 'x': 5, 'y': 5, 'name': 'Thrift+ Meet'}
        self.assertIn('ref_id', self.client.post('/api/floorplan/pins/', base, format='json').data)
        gone = Sign.objects.create(name='Gone', is_active=False)
        self.assertEqual(
            self.client.post('/api/floorplan/pins/', {**base, 'ref_id': gone.id}, format='json').status_code, 400,
        )
        resp = self.client.post('/api/floorplan/pins/', {**base, 'ref_id': self.sign.id}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual((resp.data['ref_type'], resp.data['ref_id']), (SIGN_REF_TYPE, self.sign.id))
        pins = self.client.get(f'/api/floorplan/pins/?ref_type={SIGN_REF_TYPE}&ref_id={self.sign.id}').data
        self.assertEqual(len(pins), 1)
        # Moving it needs no ref again.
        moved = self.client.patch(f'/api/floorplan/pins/{resp.data["id"]}/', {'x': 50}, format='json')
        self.assertEqual(moved.status_code, 200, moved.data)
