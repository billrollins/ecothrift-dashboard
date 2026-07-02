import base64
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.floorplan.models import FloorPlan, FloorPlanAsset, default_plan_document

from .test_floorplan_api import make_user

SAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
EVIL_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'
    b'<script>alert(2)</script>'
    b'<a href="javascript:alert(3)"><rect width="10" height="10" onclick="x()"/></a>'
    b'<image href="https://evil.example/x.png"/>'
    b'</svg>'
)


def png_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (255, 0, 0)).save(buf, format='PNG')
    return buf.getvalue()


def svg_file(content=SAFE_SVG, name='shape.svg'):
    return SimpleUploadedFile(name, content, content_type='image/svg+xml')


def results(resp):
    """Unwrap paginated list responses."""
    data = resp.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class FloorPlanAssetApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('assetmanager', 'Manager')
        self.employee = make_user('assetemployee', 'Employee')
        self.location = WorkLocation.objects.create(name='Asset Store')

    def upload(self, **kwargs):
        payload = {'file': svg_file()}
        payload.update(kwargs)
        return self.client.post('/api/floorplan/assets/', payload, format='multipart')

    # ---- permissions ----

    def test_unauthenticated_denied(self):
        self.assertEqual(self.client.get('/api/floorplan/assets/').status_code, 401)

    def test_employee_can_list_but_not_upload(self):
        self.client.force_authenticate(user=self.employee)
        self.assertEqual(self.client.get('/api/floorplan/assets/').status_code, 200)
        self.assertEqual(self.upload().status_code, 403)

    # ---- upload ----

    def test_manager_can_upload_svg(self):
        self.client.force_authenticate(user=self.manager)
        resp = self.upload(name='My Shape')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['name'], 'My Shape')
        self.assertEqual(resp.data['content_type'], 'image/svg+xml')
        self.assertTrue(resp.data['data'].startswith('data:image/svg+xml;base64,'))

    def test_upload_defaults_name_to_filename(self):
        self.client.force_authenticate(user=self.manager)
        resp = self.upload()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['name'], 'shape')

    def test_upload_png(self):
        self.client.force_authenticate(user=self.manager)
        f = SimpleUploadedFile('photo.png', png_bytes(), content_type='image/png')
        resp = self.upload(file=f)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['content_type'], 'image/png')

    def test_rejects_disallowed_type(self):
        self.client.force_authenticate(user=self.manager)
        f = SimpleUploadedFile('x.gif', b'GIF89a', content_type='image/gif')
        self.assertEqual(self.upload(file=f).status_code, 400)

    def test_rejects_mislabeled_raster(self):
        self.client.force_authenticate(user=self.manager)
        f = SimpleUploadedFile('x.png', b'not a png', content_type='image/png')
        self.assertEqual(self.upload(file=f).status_code, 400)

    def test_rejects_oversize(self):
        self.client.force_authenticate(user=self.manager)
        big = SAFE_SVG + b' ' * (600 * 1024)
        self.assertEqual(self.upload(file=svg_file(big)).status_code, 400)

    def test_svg_is_sanitized(self):
        self.client.force_authenticate(user=self.manager)
        resp = self.upload(file=svg_file(EVIL_SVG))
        self.assertEqual(resp.status_code, 201)
        stored = base64.b64decode(resp.data['data'].split(',', 1)[1]).decode('utf-8')
        self.assertNotIn('script', stored)
        self.assertNotIn('onload', stored)
        self.assertNotIn('onclick', stored)
        self.assertNotIn('javascript:', stored)
        self.assertNotIn('evil.example', stored)
        self.assertIn('rect', stored)

    # ---- list / filter / delete ----

    def test_location_filter_includes_shared(self):
        other = WorkLocation.objects.create(name='Other Store')
        FloorPlanAsset.objects.create(name='shared', data='data:image/png;base64,x', content_type='image/png')
        FloorPlanAsset.objects.create(name='mine', location=self.location, data='data:image/png;base64,x', content_type='image/png')
        FloorPlanAsset.objects.create(name='theirs', location=other, data='data:image/png;base64,x', content_type='image/png')
        self.client.force_authenticate(user=self.employee)
        resp = self.client.get(f'/api/floorplan/assets/?location={self.location.id}')
        names = {a['name'] for a in results(resp)}
        self.assertEqual(names, {'shared', 'mine'})

    def test_delete_purges_unreferenced_asset(self):
        # Unreferenced assets are hard-deleted by the orphan sweep that runs
        # after the soft delete (see services.purge_orphan_assets).
        asset = FloorPlanAsset.objects.create(name='gone', data='data:image/png;base64,x', content_type='image/png')
        self.client.force_authenticate(user=self.manager)
        resp = self.client.delete(f'/api/floorplan/assets/{asset.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(FloorPlanAsset.objects.filter(pk=asset.pk).exists())
        resp = self.client.get('/api/floorplan/assets/')
        self.assertEqual(len(results(resp)), 0)

    def test_delete_keeps_row_when_still_referenced_by_plan(self):
        # A deleted-but-referenced asset stays as a soft-deleted row so any
        # plan elements pointing at it degrade gracefully.
        asset = FloorPlanAsset.objects.create(name='in use', data='data:image/png;base64,x', content_type='image/png')
        doc = default_plan_document()
        doc['elements'] = [{
            'id': 'el_1', 'kind': 'gondola', 'x': 0, 'y': 0, 'w': 48, 'h': 144,
            'rotation': 0, 'label': '', 'active': True, 'image': asset.pk,
        }]
        FloorPlan.objects.create(name='Plan', location=self.location, data=doc)
        self.client.force_authenticate(user=self.manager)
        resp = self.client.delete(f'/api/floorplan/assets/{asset.id}/')
        self.assertEqual(resp.status_code, 204)
        asset.refresh_from_db()
        self.assertFalse(asset.is_active)
