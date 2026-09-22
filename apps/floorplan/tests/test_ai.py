import base64
import json
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import WorkLocation
from apps.core.services.llm_router import LLMAPIError, LLMConfigError, LLMResult
from apps.floorplan.ai import COLLECTIONS
from apps.floorplan.models import FloorPlan, FloorPlanElementKind

from .test_element_kinds_api import make_user
from .test_floorplan_api import sample_document

GEN_URL = '/api/floorplan/element-kinds/generate-svg/'
GOOD_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
    '<rect x="0.5" y="0.5" width="47" height="47" fill="#9e9e9e"/></svg>'
)


def ok(text):
    return LLMResult(text=text, model_used='test-model', stop_reason='end_turn')


def decode(data_uri):
    return base64.b64decode(data_uri.split(',', 1)[1]).decode('utf-8')


@override_settings(AI_MODEL='env-default', AI_PROVIDER='auto')
class GenerateSvgTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = make_user('manager', 'Manager')
        self.superadmin = make_user('super', 'Admin', is_superuser=True)
        self.body = {'label': 'Test table', 'width': 48, 'depth': 48, 'category': 'Fixtures'}

    def test_manager_forbidden(self):
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.client.post(GEN_URL, self.body, format='json').status_code, 403)

    @patch('apps.floorplan.ai.llm_complete')
    def test_fenced_reply_is_extracted_and_cleaned(self, mock_llm):
        mock_llm.return_value = ok(
            'Here you go:\n```svg\n<svg viewBox="0 0 48 48" width="48" height="48">'
            '<rect x="0.5" y="0.5" width="47" height="47" fill="#9e9e9e" onclick="x()"/>'
            '<script>alert(1)</script></svg>\n```',
        )
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(GEN_URL, self.body, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.data['svg_data_uri'].startswith('data:image/svg+xml;base64,'))
        svg = decode(resp.data['svg_data_uri'])
        self.assertIn('xmlns="http://www.w3.org/2000/svg"', svg)
        self.assertNotIn('script', svg)
        self.assertNotIn('onclick', svg)
        kwargs = mock_llm.call_args.kwargs
        self.assertEqual(kwargs['model_id'], 'env-default')
        self.assertIsNone(kwargs['temperature'])
        self.assertEqual(kwargs['timeout'], 25.0)
        self.assertEqual(kwargs['max_retries'], 0)
        self.assertEqual(kwargs['effort'], 'low')

    @patch('apps.floorplan.ai.llm_complete')
    def test_missing_viewbox_is_added(self, mock_llm):
        mock_llm.return_value = ok(
            '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48"/></svg>',
        )
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(GEN_URL, self.body, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn('viewBox="0 0 48 48"', decode(resp.data['svg_data_uri']))

    @patch('apps.floorplan.ai.llm_complete')
    def test_wrong_shape_is_rejected(self, mock_llm):
        mock_llm.return_value = ok(GOOD_SVG)
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(GEN_URL, {**self.body, 'depth': 144}, format='json')
        self.assertEqual(resp.status_code, 422)

    @patch('apps.floorplan.ai.llm_complete')
    def test_truncated_reply_is_rejected(self, mock_llm):
        mock_llm.return_value = LLMResult(text=GOOD_SVG[:40], model_used='m', stop_reason='max_tokens')
        self.client.force_authenticate(user=self.superadmin)
        self.assertEqual(self.client.post(GEN_URL, self.body, format='json').status_code, 422)

    @patch('apps.floorplan.ai.llm_complete')
    def test_no_svg_is_rejected(self, mock_llm):
        mock_llm.return_value = ok('Sorry, I cannot draw that.')
        self.client.force_authenticate(user=self.superadmin)
        self.assertEqual(self.client.post(GEN_URL, self.body, format='json').status_code, 422)

    @patch('apps.floorplan.ai.llm_complete')
    def test_bad_width_never_calls_the_model(self, mock_llm):
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(GEN_URL, {**self.body, 'width': 0}, format='json')
        self.assertEqual(resp.status_code, 400)
        mock_llm.assert_not_called()

    @patch('apps.floorplan.ai.llm_complete')
    def test_override_model_must_be_in_catalog(self, mock_llm):
        mock_llm.return_value = ok(GOOD_SVG)
        self.client.force_authenticate(user=self.superadmin)
        resp = self.client.post(GEN_URL, {**self.body, 'model': 'made-up-model'}, format='json')
        self.assertEqual(resp.status_code, 400)
        mock_llm.assert_not_called()
        resp = self.client.post(GEN_URL, {**self.body, 'model': 'grok-4.7', 'effort': 'high'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(mock_llm.call_args.kwargs['model_id'], 'grok-4.7')
        self.assertEqual(mock_llm.call_args.kwargs['effort'], 'high')

    @patch('apps.floorplan.ai.llm_complete')
    def test_errors_map_to_status(self, mock_llm):
        self.client.force_authenticate(user=self.superadmin)
        mock_llm.side_effect = LLMConfigError('no key')
        self.assertEqual(self.client.post(GEN_URL, self.body, format='json').status_code, 503)
        mock_llm.side_effect = LLMAPIError('Request timed out.', kind='connection')
        self.assertEqual(self.client.post(GEN_URL, self.body, format='json').status_code, 504)


@override_settings(AI_MODEL='env-default', AI_PROVIDER='auto')
class AdjustPlanTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = make_user('employee', 'Employee')
        self.manager = make_user('manager', 'Manager')
        self.location = WorkLocation.objects.create(name='Main Store')
        self.plan = FloorPlan.objects.create(
            name='Plan', location=self.location, created_by=self.manager, data=sample_document(),
        )
        self.url = f'/api/floorplan/plans/{self.plan.pk}/ai-adjust/'
        self.doc = sample_document()

    def post(self, reply, document=None, **extra):
        self.client.force_authenticate(user=self.manager)
        body = {'instruction': 'Move aisle 1 right', 'document': document or self.doc, **extra}
        with patch('apps.floorplan.ai.llm_complete', return_value=ok(reply)) as mock_llm:
            resp = self.client.post(self.url, body, format='json')
        return resp, mock_llm

    def test_employee_forbidden(self):
        self.client.force_authenticate(user=self.employee)
        resp = self.client.post(self.url, {'instruction': 'x', 'document': self.doc}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_happy_path(self):
        reply = json.dumps({
            'notes': 'Moved aisle 1 and added a gondola.',
            'ops': [
                {'op': 'update', 'collection': 'elements', 'id': 'el_1', 'changes': {'x': 240}},
                {'op': 'add', 'collection': 'elements',
                 'object': {'kind': 'gondola', 'x': 400, 'y': 48, 'label': 'Aisle 2'}},
                {'op': 'delete', 'collection': 'zones', 'id': 'zn_1'},
            ],
        })
        resp, _ = self.post('```json\n' + reply + '\n```')
        self.assertEqual(resp.status_code, 200, resp.content)
        layers = resp.data['layers']
        self.assertEqual(set(layers), set(COLLECTIONS))
        self.assertEqual(len(layers['elements']), 2)
        self.assertEqual(layers['elements'][0]['x'], 240)
        added = layers['elements'][1]
        gondola = FloorPlanElementKind.objects.get(kind='gondola')
        self.assertTrue(added['id'].startswith('el_ai'))
        self.assertEqual((added['w'], added['h']), (gondola.default_w, gondola.default_h))
        self.assertEqual(added['rotation'], 0)
        self.assertEqual(layers['zones'], [])
        counts = resp.data['summary']['counts']
        self.assertEqual(counts['elements'], {'added': 1, 'changed': 1, 'removed': 0})
        self.assertEqual(counts['zones'], {'added': 0, 'changed': 0, 'removed': 1})
        self.assertEqual(resp.data['settings_patch'], {})
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.revision, 1)

    def test_config_store_is_ignored(self):
        doc = sample_document()
        doc['configStore'] = {'cfg_x': {'elements': [], 'zones': [], 'paths': [], 'labels': [], 'infoBlocks': []}}
        resp, mock_llm = self.post(json.dumps({'ops': []}), document=doc)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertNotIn('configStore', mock_llm.call_args.kwargs['user'])
        self.assertNotIn('configStore', resp.data['layers'])

    def test_unknown_kind_rejected(self):
        reply = json.dumps({'ops': [{'op': 'add', 'collection': 'elements',
                                     'object': {'kind': 'hovercraft', 'x': 1, 'y': 1, 'w': 10, 'h': 10}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)
        reply = json.dumps({'ops': [{'op': 'add', 'collection': 'elements',
                                     'object': {'kind': ['gondola'], 'x': 1, 'y': 1}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)
        reply = json.dumps({'ops': [{'op': 'update', 'collection': 'zones', 'id': 'zn_1',
                                     'changes': {'label': {'a': 1}}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)

    def test_invented_image_rejected(self):
        reply = json.dumps({'ops': [{'op': 'update', 'collection': 'elements', 'id': 'el_1',
                                     'changes': {'image': 999999}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)

    def test_unknown_id_rejected(self):
        reply = json.dumps({'ops': [{'op': 'delete', 'collection': 'elements', 'id': 'el_nope'}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)

    def test_disallowed_field_rejected(self):
        reply = json.dumps({'ops': [{'op': 'update', 'collection': 'infoBlocks', 'id': 'ib_1',
                                     'changes': {'type': 'legend'}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)

    def test_bad_rotation_rejected(self):
        reply = json.dumps({'ops': [{'op': 'update', 'collection': 'elements', 'id': 'el_1',
                                     'changes': {'rotation': 45}}]})
        self.assertEqual(self.post(reply)[0].status_code, 422)

    def test_settings_limited(self):
        bad = json.dumps({'ops': [], 'settings': {'activeConfigId': 'cfg_x'}})
        self.assertEqual(self.post(bad)[0].status_code, 422)
        good = json.dumps({'ops': [], 'settings': {'planWidth': 2400}})
        resp = self.post(good)[0]
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['settings_patch'], {'planWidth': 2400})

    def test_invalid_sent_document(self):
        resp, mock_llm = self.post(json.dumps({'ops': []}), document={'elements': []})
        self.assertEqual(resp.status_code, 400)
        mock_llm.assert_not_called()

    def test_non_json_reply(self):
        self.assertEqual(self.post('I moved it for you!')[0].status_code, 422)
        nan_reply = '{"ops": [{"op": "update", "collection": "elements", "id": "el_1", "changes": {"x": NaN}}]}'
        self.assertEqual(self.post(nan_reply)[0].status_code, 422)
