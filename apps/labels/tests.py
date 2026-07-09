"""Tests for Custom Label Studio: permissions, CRUD/soft-archive, definition validation, uploads."""
from __future__ import annotations

import io
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache.backends.locmem import LocMemCache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.test import APITestCase

from apps.core.models import S3File
from apps.core.services.llm_router import LLMResult
from apps.labels.ai_create import aspect_ratio_for_inches
from apps.labels.definition import DefinitionError, validate_definition
from apps.labels.models import CustomLabel
from apps.labels.services import purge_orphan_label_media
from apps.labels.views import _upload_has_signature

User = get_user_model()

BASE = '/api/labels/labels/'


def _make_user(email, group=None):
    user = User.objects.create_user(email, 'Test', 'User', password='pw')
    if group:
        g, _ = Group.objects.get_or_create(name=group)
        user.groups.add(g)
    return user


def _template_payload(**overrides):
    payload = {
        'name': 'Shelf tag',
        'kind': 'template',
        'width_in': '3.00',
        'height_in': '2.00',
        'definition': {
            'variables': [{'key': 'title', 'name': 'Title', 'kind': 'text', 'default': ''}],
            'elements': [
                {'type': 'text', 'variable': 'title', 'x_pct': 10, 'y_pct': 20,
                 'font': 'arial', 'size_pt': 18, 'align': 'left'},
            ],
        },
    }
    payload.update(overrides)
    return payload


class DefinitionValidationTests(APITestCase):
    def test_valid_document_normalized(self):
        doc = validate_definition(_template_payload()['definition'])
        self.assertEqual(doc['variables'][0]['key'], 'title')
        self.assertEqual(doc['variables'][0]['name'], 'Title')
        self.assertEqual(doc['variables'][0]['kind'], 'text')
        self.assertNotIn('label', doc['variables'][0])
        self.assertNotIn('required', doc['variables'][0])
        self.assertEqual(doc['elements'][0]['x_pct'], 10.0)

    def test_legacy_label_migrates_to_name(self):
        doc = validate_definition({
            'variables': [{'key': 'title', 'label': 'Old Label', 'required': True, 'default': 'x'}],
            'elements': [],
        })
        self.assertEqual(doc['variables'][0]['name'], 'Old Label')
        self.assertEqual(doc['variables'][0]['kind'], 'text')
        self.assertEqual(doc['variables'][0]['default'], 'x')
        self.assertNotIn('required', doc['variables'][0])

    def test_increment_variable_normalized(self):
        doc = validate_definition({
            'variables': [{
                'key': 'price', 'name': 'Price', 'kind': 'increment',
                'default_start': '10', 'default_step': '0.5', 'format': 'currency',
            }],
            'elements': [
                {'type': 'text', 'variable': 'price', 'x_pct': 0, 'y_pct': 0},
            ],
        })
        v = doc['variables'][0]
        self.assertEqual(v['kind'], 'increment')
        self.assertEqual(v['default_start'], '10')
        self.assertEqual(v['default_step'], '0.5')
        self.assertEqual(v['format'], 'currency')

    def test_increment_bad_format_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [{
                    'key': 'n', 'name': 'N', 'kind': 'increment',
                    'default_start': '1', 'default_step': '1', 'format': 'hex',
                }],
                'elements': [],
            })

    def test_increment_bad_start_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [{
                    'key': 'n', 'name': 'N', 'kind': 'increment',
                    'default_start': 'nope', 'default_step': '1',
                }],
                'elements': [],
            })

    def test_increment_accepts_negative_fractional_and_zero_start(self):
        doc = validate_definition({
            'variables': [{
                'key': 'n', 'name': 'N', 'kind': 'increment',
                'default_start': '0', 'default_step': '-0.25',
            }],
            'elements': [],
        })
        variable = doc['variables'][0]
        self.assertEqual(variable['default_start'], '0')
        self.assertEqual(variable['default_step'], '-0.25')

    def test_increment_zero_step_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [{
                    'key': 'n', 'name': 'N', 'kind': 'increment',
                    'default_start': '-1.5', 'default_step': '0',
                }],
                'elements': [],
            })

    def test_increment_nonfinite_values_rejected(self):
        for field, value in (
            ('default_start', 'nan'),
            ('default_start', float('inf')),
            ('default_step', '-Infinity'),
        ):
            with self.subTest(field=field, value=value), self.assertRaises(DefinitionError):
                variable = {
                    'key': 'n', 'name': 'N', 'kind': 'increment',
                    'default_start': '1', 'default_step': '1',
                }
                variable[field] = value
                validate_definition({'variables': [variable], 'elements': []})

    def test_unknown_variable_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [],
                'elements': [{'type': 'text', 'variable': 'nope', 'x_pct': 0, 'y_pct': 0}],
            })

    def test_variable_and_literal_mutually_exclusive(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [{'key': 'a', 'name': 'A'}],
                'elements': [{'type': 'text', 'variable': 'a', 'literal': 'x'}],
            })

    def test_bad_font_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [],
                'elements': [{'type': 'text', 'literal': 'x', 'font': 'comic-sans'}],
            })

    def test_duplicate_variable_keys_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [{'key': 'a', 'name': 'A'}, {'key': 'a', 'name': 'B'}],
                'elements': [],
            })

    def test_qr_and_barcode_normalized(self):
        doc = validate_definition({
            'variables': [{'key': 'sku', 'name': 'SKU'}],
            'elements': [
                {'type': 'qr', 'variable': 'sku', 'x_pct': 70, 'y_pct': 10, 'w_pct': 30, 'h_pct': 20, 'ecc': 'H'},
                {'type': 'barcode', 'literal': 'ABC', 'x_pct': 5, 'y_pct': 70, 'w_pct': 90, 'h_pct': 15},
                {'type': 'text', 'literal': 'Hi', 'x_pct': 0, 'y_pct': 0, 'bold': True},
            ],
        })
        qr = doc['elements'][0]
        self.assertEqual(qr['type'], 'qr')
        self.assertEqual(qr['w_pct'], 20.0)  # square = min(30, 20)
        self.assertEqual(qr['h_pct'], 20.0)
        self.assertEqual(qr['ecc'], 'H')
        self.assertEqual(doc['elements'][1]['show_text'], True)
        self.assertTrue(doc['elements'][2]['bold'])

    def test_unknown_element_type_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [],
                'elements': [{'type': 'image', 'literal': 'x'}],
            })

    def test_bad_ecc_rejected(self):
        with self.assertRaises(DefinitionError):
            validate_definition({
                'variables': [],
                'elements': [{'type': 'qr', 'literal': 'x', 'w_pct': 10, 'h_pct': 10, 'ecc': 'Z'}],
            })


class PermissionTests(APITestCase):
    def setUp(self):
        self.manager = _make_user('m@e.com', 'Manager')
        self.employee = _make_user('e@e.com', 'Employee')

    def test_unauthenticated_blocked(self):
        self.assertIn(self.client.get(BASE).status_code, (401, 403))

    def test_employee_forbidden(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get(BASE).status_code, 403)

    def test_manager_allowed(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get(BASE).status_code, 200)

    def test_employee_cannot_restore_archived_label(self):
        label = CustomLabel.objects.create(
            name='Archived', kind=CustomLabel.KIND_PDF, is_active=False,
        )
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.post(f'{BASE}{label.pk}/restore/').status_code, 403)

    def test_unauthenticated_cannot_restore_archived_label(self):
        label = CustomLabel.objects.create(
            name='Archived', kind=CustomLabel.KIND_PDF, is_active=False,
        )
        self.assertIn(self.client.post(f'{BASE}{label.pk}/restore/').status_code, (401, 403))


class CrudTests(APITestCase):
    def setUp(self):
        self.manager = _make_user('m@e.com', 'Manager')
        self.client.force_authenticate(self.manager)

    def test_create_template_label(self):
        resp = self.client.post(BASE, _template_payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertEqual(data['kind'], 'template')
        self.assertEqual(data['slug'], 'shelf-tag')
        self.assertEqual(len(data['definition']['variables']), 1)

    def test_create_pdf_label(self):
        resp = self.client.post(BASE, {'name': 'Sale sign', 'kind': 'pdf'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.json()['definition'], {})

    def test_template_requires_size(self):
        payload = _template_payload()
        payload.pop('width_in')
        payload.pop('height_in')
        resp = self.client.post(BASE, payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_invalid_definition_rejected(self):
        payload = _template_payload()
        payload['definition']['elements'][0]['variable'] = 'missing'
        resp = self.client.post(BASE, payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_kind_immutable(self):
        label_id = self.client.post(BASE, {'name': 'Sign', 'kind': 'pdf'}, format='json').json()['id']
        resp = self.client.patch(f'{BASE}{label_id}/', {'kind': 'template'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_soft_archive(self):
        label_id = self.client.post(BASE, {'name': 'Sign', 'kind': 'pdf'}, format='json').json()['id']
        resp = self.client.delete(f'{BASE}{label_id}/')
        self.assertEqual(resp.status_code, 204)
        label = CustomLabel.objects.get(pk=label_id)
        self.assertFalse(label.is_active)
        # Hidden from default list; visible with include_archived.
        def _rows(resp):
            data = resp.json()
            return data['results'] if isinstance(data, dict) else data

        self.assertEqual(len(_rows(self.client.get(BASE))), 0)
        self.assertEqual(len(_rows(self.client.get(BASE + '?include_archived=1'))), 1)

    def test_restore_lifecycle_preserves_media(self):
        media = S3File.objects.create(
            key='label-studio/restore/label.pdf',
            filename='label.pdf',
            size=12,
            content_type='application/pdf',
            uploaded_by=self.manager,
        )
        label = CustomLabel.objects.create(
            name='Restore me',
            kind=CustomLabel.KIND_PDF,
            pdf_file=media,
            created_by=self.manager,
        )

        self.assertEqual(self.client.delete(f'{BASE}{label.pk}/').status_code, 204)
        self.assertEqual(self.client.get(f'{BASE}{label.pk}/').status_code, 404)
        self.assertEqual(
            self.client.get(f'{BASE}{label.pk}/?include_archived=1').status_code,
            404,
        )
        self.assertTrue(S3File.objects.filter(pk=media.pk).exists())

        restored = self.client.post(f'{BASE}{label.pk}/restore/')
        self.assertEqual(restored.status_code, 200, restored.content)
        self.assertTrue(restored.json()['is_active'])
        self.assertEqual(restored.json()['pdf']['id'], media.pk)
        label.refresh_from_db()
        self.assertTrue(label.is_active)
        self.assertEqual(label.pdf_file_id, media.pk)
        self.assertEqual(self.client.get(f'{BASE}{label.pk}/').status_code, 200)

    def test_restore_only_targets_archived_labels(self):
        label = CustomLabel.objects.create(name='Active', kind=CustomLabel.KIND_PDF)
        self.assertEqual(self.client.post(f'{BASE}{label.pk}/restore/').status_code, 404)

    def test_is_active_is_read_only(self):
        created = self.client.post(
            BASE,
            {'name': 'Cannot pre-archive', 'kind': 'pdf', 'is_active': False},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertTrue(created.json()['is_active'])
        label_id = created.json()['id']

        updated = self.client.patch(
            f'{BASE}{label_id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertTrue(updated.json()['is_active'])

    def test_slug_uniqueness_suffix(self):
        self.client.post(BASE, {'name': 'Sign', 'kind': 'pdf'}, format='json')
        second = self.client.post(BASE, {'name': 'Sign', 'kind': 'pdf'}, format='json')
        self.assertEqual(second.json()['slug'], 'sign-1')

    def test_duplicate(self):
        label_id = self.client.post(BASE, _template_payload(), format='json').json()['id']
        resp = self.client.post(f'{BASE}{label_id}/duplicate/')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json()['name'].startswith('Copy of'))
        self.assertEqual(resp.json()['kind'], 'template')
        self.assertNotEqual(resp.json()['id'], label_id)


class UploadTests(APITestCase):
    def setUp(self):
        self.manager = _make_user('m@e.com', 'Manager')
        self.client.force_authenticate(self.manager)
        self.template_id = self.client.post(BASE, _template_payload(), format='json').json()['id']
        self.pdf_id = self.client.post(BASE, {'name': 'Sale sign', 'kind': 'pdf'}, format='json').json()['id']

    def _png(self):
        # Tiny valid PNG header + data (content is irrelevant; view checks content_type/size).
        f = io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'0' * 64)
        f.name = 'bg.png'
        return f

    def _pdf(self):
        f = io.BytesIO(b'%PDF-1.4\n%%EOF\n')
        f.name = 'label.pdf'
        return f

    def test_background_upload(self):
        resp = self.client.post(
            f'{BASE}{self.template_id}/background/',
            {'file': self._png()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNotNone(resp.json()['background_file'])

    def test_background_rejected_on_pdf_label(self):
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/background/',
            {'file': self._png()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_pdf_upload(self):
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/pdf/',
            {'file': self._pdf()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNotNone(resp.json()['pdf'])

    def test_pdf_rejected_on_template_label(self):
        resp = self.client.post(
            f'{BASE}{self.template_id}/pdf/',
            {'file': self._pdf()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_non_pdf_rejected(self):
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/pdf/',
            {'file': self._png()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_image_signature_must_match_mime_type(self):
        fake_png = SimpleUploadedFile(
            'fake.png',
            b'GIF89a' + b'0' * 32,
            content_type='image/png',
        )
        before = S3File.objects.count()
        resp = self.client.post(
            f'{BASE}{self.template_id}/background/',
            {'file': fake_png},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(S3File.objects.count(), before)

    def test_supported_image_signatures_are_accepted(self):
        uploads = (
            ('image.png', 'image/png', b'\x89PNG\r\n\x1a\n' + b'0' * 16),
            ('image.jpg', 'image/jpeg', b'\xff\xd8\xff\xe0' + b'0' * 16),
            ('image.gif', 'image/gif', b'GIF89a' + b'0' * 16),
            ('image.webp', 'image/webp', b'RIFF\x10\x00\x00\x00WEBP' + b'0' * 16),
        )
        for name, content_type, content in uploads:
            with self.subTest(content_type=content_type):
                upload = SimpleUploadedFile(name, content, content_type=content_type)
                resp = self.client.post(
                    f'{BASE}{self.template_id}/background/',
                    {'file': upload},
                    format='multipart',
                )
                self.assertEqual(resp.status_code, 200, resp.content)

    def test_pdf_signature_required_even_with_pdf_name_and_mime(self):
        fake_pdf = SimpleUploadedFile(
            'fake.pdf',
            b'not a pdf',
            content_type='application/pdf',
        )
        before = S3File.objects.count()
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/pdf/',
            {'file': fake_pdf},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(S3File.objects.count(), before)

    def test_signature_check_preserves_stream_position(self):
        upload = io.BytesIO(b'prefix%PDF-1.7')
        upload.seek(6)
        self.assertFalse(
            _upload_has_signature(upload, lambda header: header.startswith(b'%PDF-'))
        )
        self.assertEqual(upload.tell(), 6)

    def test_clear_background(self):
        self.client.post(f'{BASE}{self.template_id}/background/', {'file': self._png()}, format='multipart')
        resp = self.client.delete(f'{BASE}{self.template_id}/background/clear/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()['background_file'])


class MediaApiTests(APITestCase):
    def setUp(self):
        self.manager = _make_user('media-manager@example.com', 'Manager')
        self.employee = _make_user('media-employee@example.com', 'Employee')
        self.media = S3File.objects.create(
            key='label-studio/media/missing.pdf',
            filename='missing.pdf',
            size=12,
            content_type='application/pdf',
            uploaded_by=self.manager,
        )
        self.label = CustomLabel.objects.create(
            name='Media label',
            kind=CustomLabel.KIND_PDF,
            pdf_file=self.media,
            created_by=self.manager,
        )

    def test_media_requires_manager_or_admin(self):
        url = f'{BASE}{self.label.pk}/media/pdf_file/'
        self.assertIn(self.client.get(url).status_code, (401, 403))
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get(url).status_code, 403)

    def test_missing_attachment_returns_404(self):
        label = CustomLabel.objects.create(name='No media', kind=CustomLabel.KIND_PDF)
        self.client.force_authenticate(self.manager)
        self.assertEqual(
            self.client.get(f'{BASE}{label.pk}/media/pdf_file/').status_code,
            404,
        )

    @patch('apps.labels.views.default_storage.open', side_effect=FileNotFoundError)
    def test_missing_storage_object_returns_404(self, _mock_open):
        self.client.force_authenticate(self.manager)
        resp = self.client.get(f'{BASE}{self.label.pk}/media/pdf_file/')
        self.assertEqual(resp.status_code, 404)

    @patch('apps.labels.views.default_storage.url', return_value='https://bucket.example/presigned')
    @patch('apps.labels.views.default_storage.open')
    def test_media_streams_bytes_even_when_s3_url_exists(self, mock_open, _mock_url):
        """Prod must not 302 to S3 — axios arraybuffer cannot read cross-origin bodies."""
        from io import BytesIO

        mock_open.return_value = BytesIO(b'%PDF-1.4 stream-me')
        self.client.force_authenticate(self.manager)
        resp = self.client.get(f'{BASE}{self.label.pk}/media/pdf_file/')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(resp.status_code, (301, 302, 303, 307, 308))
        self.assertEqual(b''.join(resp.streaming_content), b'%PDF-1.4 stream-me')
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertIn('no-store', resp['Cache-Control'])
        mock_open.assert_called_once()


class AspectRatioHelperTests(TestCase):
    def test_three_by_two(self):
        self.assertEqual(aspect_ratio_for_inches(3, 2), '3:2')

    def test_square(self):
        self.assertEqual(aspect_ratio_for_inches(2, 2), '1:1')


@override_settings(XAI_API_KEY='test-xai-key', AI_MODEL_LABEL_STRUCTURE='grok-4-1-fast')
class AiCreateApiTests(APITestCase):
    def setUp(self):
        throttle_cache = LocMemCache(f'label-ai-{id(self)}', {})
        throttle_patcher = patch.object(ScopedRateThrottle, 'cache', throttle_cache)
        throttle_patcher.start()
        self.addCleanup(throttle_patcher.stop)
        self.manager = _make_user('m@e.com', 'Manager')
        self.employee = _make_user('e@e.com', 'Employee')
        self.client.force_authenticate(self.manager)
        self.template_id = self.client.post(BASE, _template_payload(), format='json').json()['id']
        self.pdf_id = self.client.post(BASE, {'name': 'Sale sign', 'kind': 'pdf'}, format='json').json()['id']

    def test_employee_forbidden_on_ai_structure(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/propose-structure/',
            {'brief': 'shelf tag'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_structure_rejected_on_pdf_label(self):
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/ai/propose-structure/',
            {'brief': 'shelf tag'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_structure_requires_brief(self):
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/propose-structure/',
            {'brief': ''},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    @patch('apps.labels.ai_create.llm_complete')
    def test_propose_structure_success(self, mock_llm):
        mock_llm.return_value = LLMResult(
            text='{"variables":[{"key":"title","name":"Title","kind":"text","default":""}],'
                 '"elements":[{"type":"text","variable":"title","x_pct":10,"y_pct":20,'
                 '"font":"arial","size_pt":18,"align":"left","bold":false}]}',
            model_used='grok-4-1-fast',
        )
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/propose-structure/',
            {'brief': 'Simple title shelf tag'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()['definition']['variables'][0]['key'], 'title')
        mock_llm.assert_called_once()

    @patch('apps.labels.ai_create.llm_complete')
    def test_propose_structure_invalid_then_retry(self, mock_llm):
        bad = LLMResult(text='not json', model_used='grok-4-1-fast')
        good = LLMResult(
            text='{"variables":[{"key":"sku","name":"SKU","kind":"text","default":""}],'
                 '"elements":[{"type":"text","variable":"sku","x_pct":5,"y_pct":5,'
                 '"font":"consolas","size_pt":14,"align":"left"}]}',
            model_used='grok-4-1-fast',
        )
        mock_llm.side_effect = [bad, good]
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/propose-structure/',
            {'brief': 'SKU tag'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(mock_llm.call_count, 2)

    @patch('apps.labels.ai_create.requests.post')
    def test_generate_background_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'data': [{'b64_json': 'aGVsbG8='}]}
        mock_post.return_value = mock_resp
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/generate-background/',
            {'brief': 'leaf border mono'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()['image_b64'], 'aGVsbG8=')
        self.assertEqual(resp.json()['content_type'], 'image/png')
        # Approval gate: no S3 write from this endpoint.
        label = CustomLabel.objects.get(pk=self.template_id)
        self.assertIsNone(label.background_id)

    def test_generate_background_rejected_on_pdf(self):
        resp = self.client.post(
            f'{BASE}{self.pdf_id}/ai/generate-background/',
            {'brief': 'x'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_employee_forbidden_on_ai_background(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.post(
            f'{BASE}{self.template_id}/ai/generate-background/',
            {'brief': 'x'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)


@override_settings(REST_FRAMEWORK={
    'DEFAULT_THROTTLE_RATES': {
        'labels_propose_structure': '1/hour',
        'labels_generate_background': '1/hour',
    },
})
class AiThrottleTests(APITestCase):
    def setUp(self):
        throttle_cache = LocMemCache(f'label-throttle-{id(self)}', {})
        throttle_patcher = patch.object(ScopedRateThrottle, 'cache', throttle_cache)
        rates_patcher = patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {
            'labels_propose_structure': '1/hour',
            'labels_generate_background': '1/hour',
        })
        throttle_patcher.start()
        rates_patcher.start()
        self.addCleanup(throttle_patcher.stop)
        self.addCleanup(rates_patcher.stop)
        self.manager = _make_user('throttle-manager@example.com', 'Manager')
        self.other_manager = _make_user('throttle-other@example.com', 'Manager')
        self.client.force_authenticate(self.manager)
        self.template_id = self.client.post(
            BASE,
            _template_payload(name='Throttle template'),
            format='json',
        ).json()['id']

    @patch('apps.labels.views.propose_structure')
    def test_structure_throttle_is_per_user(self, mock_propose):
        mock_propose.return_value = {'variables': [], 'elements': []}
        url = f'{BASE}{self.template_id}/ai/propose-structure/'

        self.assertEqual(
            self.client.post(url, {'brief': 'first'}, format='json').status_code,
            200,
        )
        self.assertEqual(
            self.client.post(url, {'brief': 'second'}, format='json').status_code,
            429,
        )

        self.client.force_authenticate(self.other_manager)
        self.assertEqual(
            self.client.post(url, {'brief': 'other user'}, format='json').status_code,
            200,
        )

    @patch('apps.labels.views.generate_background_image')
    @patch('apps.labels.views.propose_structure')
    def test_ai_actions_have_independent_scopes(self, mock_propose, mock_generate):
        mock_propose.return_value = {'variables': [], 'elements': []}
        mock_generate.return_value = {
            'image_b64': 'aGVsbG8=',
            'content_type': 'image/png',
        }
        structure_url = f'{BASE}{self.template_id}/ai/propose-structure/'
        image_url = f'{BASE}{self.template_id}/ai/generate-background/'

        self.assertEqual(
            self.client.post(structure_url, {'brief': 'structure'}, format='json').status_code,
            200,
        )
        self.assertEqual(
            self.client.post(structure_url, {'brief': 'again'}, format='json').status_code,
            429,
        )
        self.assertEqual(
            self.client.post(image_url, {'brief': 'image'}, format='json').status_code,
            200,
        )
        self.assertEqual(
            self.client.post(image_url, {'brief': 'again'}, format='json').status_code,
            429,
        )


class LabelThrottleSettingsTests(TestCase):
    def test_explicit_ai_rates(self):
        rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        self.assertEqual(rates['labels_propose_structure'], '30/hour')
        self.assertEqual(rates['labels_generate_background'], '10/hour')


class OrphanLabelMediaTests(TestCase):
    def _s3(self, key: str, *, hours_old: float = 48) -> S3File:
        s3 = S3File.objects.create(
            key=key,
            filename=key.split('/')[-1],
            size=10,
            content_type='image/png',
        )
        if hours_old:
            S3File.objects.filter(pk=s3.pk).update(
                uploaded_at=timezone.now() - timedelta(hours=hours_old),
            )
            s3.refresh_from_db()
        return s3

    def test_purges_old_unreferenced_label_media(self):
        orphan = self._s3('label-studio/99/bg-orphan.png', hours_old=48)
        self.assertEqual(purge_orphan_label_media(), 1)
        self.assertFalse(S3File.objects.filter(pk=orphan.pk).exists())

    @patch('apps.labels.services.default_storage.delete', side_effect=OSError('storage down'))
    def test_storage_delete_failure_retains_retryable_row(self, mock_delete):
        orphan = self._s3('label-studio/99/bg-retry.png', hours_old=48)
        self.assertEqual(purge_orphan_label_media(), 0)
        self.assertTrue(S3File.objects.filter(pk=orphan.pk).exists())
        mock_delete.assert_called_once_with(orphan.key)

    @patch('apps.labels.services.default_storage.delete')
    def test_management_command_is_idempotent_and_prints_count(self, _mock_delete):
        orphan = self._s3('label-studio/99/bg-command.png', hours_old=48)
        first_out = io.StringIO()
        second_out = io.StringIO()

        call_command('purge_label_media', stdout=first_out)
        call_command('purge_label_media', stdout=second_out)

        self.assertFalse(S3File.objects.filter(pk=orphan.pk).exists())
        self.assertIn('Purged 1 label media file(s).', first_out.getvalue())
        self.assertIn('Purged 0 label media file(s).', second_out.getvalue())

    def test_keeps_referenced_background(self):
        s3 = self._s3('label-studio/1/bg-used.png', hours_old=48)
        CustomLabel.objects.create(
            name='Keep',
            kind=CustomLabel.KIND_TEMPLATE,
            width_in='3',
            height_in='2',
            definition={'variables': [], 'elements': []},
            background=s3,
        )
        self.assertEqual(purge_orphan_label_media(), 0)
        self.assertTrue(S3File.objects.filter(pk=s3.pk).exists())

    def test_soft_archived_label_still_protects_media(self):
        s3 = self._s3('label-studio/1/bg-archived.png', hours_old=48)
        CustomLabel.objects.create(
            name='Archived',
            kind=CustomLabel.KIND_TEMPLATE,
            width_in='3',
            height_in='2',
            definition={'variables': [], 'elements': []},
            background=s3,
            is_active=False,
        )
        self.assertEqual(purge_orphan_label_media(), 0)

    def test_grace_window_protects_fresh_uploads(self):
        fresh = self._s3('label-studio/1/bg-fresh.png', hours_old=0)
        self.assertEqual(purge_orphan_label_media(), 0)
        self.assertTrue(S3File.objects.filter(pk=fresh.pk).exists())

    def test_ignores_non_label_studio_keys(self):
        other = self._s3('blog/other.png', hours_old=48)
        self.assertEqual(purge_orphan_label_media(), 0)
        self.assertTrue(S3File.objects.filter(pk=other.pk).exists())
