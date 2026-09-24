from unittest import mock

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.ai_config import ai_effort, ai_model, catalog_provider
from apps.core.models import AiAction, AiModel
from apps.core.services.llm_router import resolve_provider


def make_user(email, group=None, superuser=False):
    user = User.objects.create_user(email=email, first_name='Test', last_name='User', password='pw')
    if group:
        grp, _ = Group.objects.get_or_create(name=group)
        user.groups.add(grp)
    if superuser:
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
    return user


class _FakeResp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = ''

    def json(self):
        return self._payload


@override_settings(AI_PROVIDER='auto', AI_MODEL='env-default')
class AiModelResolutionTests(TestCase):
    def test_seed_rows(self):
        self.assertEqual(AiAction.objects.count(), 15)
        self.assertFalse(AiAction.objects.filter(model__isnull=False).exists())
        self.assertEqual(
            set(AiModel.objects.values_list('slug', flat=True)),
            {
                'grok-4.7', 'claude-opus-5-5', 'gemini-3.5-flash-lite', 'gemini-3.8-flash',
                'muse-spark-1.3', 'muse-spark-1.3-contributor',
            },
        )
        self.assertTrue(AiAction.objects.filter(purpose='INVENTORY_CLEANUP').exists())

    def test_blank_assignment_uses_fallback(self):
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')
        self.assertEqual(ai_model('FLOORPLAN_SVG'), 'env-default')
        self.assertEqual(ai_model('LABEL_IMAGE'), 'grok-imagine-image-quality')

    @override_settings(AI_MODEL_AI_CHAT='ignored-env-model')
    def test_per_purpose_env_values_are_no_longer_read(self):
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')

    def test_assignment_beats_env_and_override_beats_assignment(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=grok)
        self.assertEqual(ai_model('AI_CHAT'), 'grok-4.7')
        self.assertEqual(ai_model('ai_chat'), 'grok-4.7')
        self.assertEqual(ai_model('AI_CHAT', 'claude-sonnet-4-6'), 'claude-sonnet-4-6')

    def test_archived_model_is_ignored(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=grok)
        AiModel.objects.filter(pk=grok.pk).update(status='archived')
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')

    def test_effort(self):
        self.assertEqual(ai_effort('AI_CHAT'), 'off')
        self.assertEqual(ai_effort('FLOORPLAN_SVG'), 'low')
        self.assertEqual(ai_effort('NO_SUCH_PURPOSE'), 'off')

    def test_db_error_falls_back_to_env(self):
        with mock.patch('apps.core.models.AiAction.objects') as objects:
            objects.select_related.side_effect = RuntimeError('db down')
            self.assertEqual(ai_model('AI_CHAT'), 'env-default')
            self.assertEqual(ai_effort('AI_CHAT'), 'off')

    def test_catalog_provider_beats_prefix(self):
        AiModel.objects.create(slug='house-model-1', provider='google')
        self.assertEqual(catalog_provider('house-model-1'), 'google')
        self.assertEqual(resolve_provider('house-model-1'), 'google')
        self.assertEqual(resolve_provider('unknown-model'), 'anthropic')


class AiSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user('owner@example.com', 'Admin', superuser=True)
        self.manager = make_user('mgr@example.com', 'Manager')
        self.employee = make_user('emp@example.com', 'Employee')

    def test_models_list_is_superuser_only(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get('/api/core/ai/models/').status_code, 403)
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/core/ai/models/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)

    def test_add_model_needs_provider_and_strips_models_prefix(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post('/api/core/ai/models/', {'slug': 'models/gemini-9-test'}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(
            '/api/core/ai/models/', {'slug': 'models/gemini-9-test', 'provider': 'google'}, format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['slug'], 'gemini-9-test')
        self.assertEqual(resp.data['source'], 'manual')
        self.assertEqual(resp.data['status'], 'active')
        resp = self.client.post(
            '/api/core/ai/models/', {'slug': 'models/gemini-3.8-flash', 'provider': 'google'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_image_model_must_be_xai(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/core/ai/models/',
            {'slug': 'imagen-9', 'provider': 'google', 'modality': 'image'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_rename_keeps_assignment(self):
        model = AiModel.objects.get(slug='gemini-3.8-flash')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=model)
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            f'/api/core/ai/models/{model.pk}/', {'slug': 'gemini-3.8-flash-001'}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(ai_model('AI_CHAT'), 'gemini-3.8-flash-001')

    def test_archive_clears_actions_and_unarchive_does_not_restore(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=grok)
        self.client.force_authenticate(self.owner)
        resp = self.client.post(f'/api/core/ai/models/{grok.pk}/archive/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['cleared_actions'], 1)
        self.assertIsNone(AiAction.objects.get(purpose='AI_CHAT').model)
        resp = self.client.post(f'/api/core/ai/models/{grok.pk}/unarchive/')
        self.assertEqual(resp.data['status'], 'active')
        self.assertIsNone(AiAction.objects.get(purpose='AI_CHAT').model)

    def test_assign_action_rules(self):
        self.client.force_authenticate(self.owner)
        grok = AiModel.objects.get(slug='grok-4.7')
        resp = self.client.patch(
            '/api/core/ai/actions/AI_CHAT/', {'model': grok.pk, 'effort': 'high'}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['model_slug'], 'grok-4.7')
        self.assertEqual(resp.data['effort'], 'high')
        resp = self.client.patch('/api/core/ai/actions/LABEL_IMAGE/', {'model': grok.pk}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.patch('/api/core/ai/actions/LABEL_IMAGE/', {'effort': 'high'}, format='json')
        self.assertEqual(resp.status_code, 400)
        AiModel.objects.filter(pk=grok.pk).update(status='archived')
        resp = self.client.patch('/api/core/ai/actions/SUGGEST_ITEM/', {'model': grok.pk}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.patch('/api/core/ai/actions/AI_CHAT/', {'model': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['model'])

    def test_manager_cannot_patch_action(self):
        self.client.force_authenticate(self.manager)
        resp = self.client.patch('/api/core/ai/actions/AI_CHAT/', {'effort': 'low'}, format='json')
        self.assertEqual(resp.status_code, 403)

    @override_settings(AI_MODEL='env-default')
    def test_choices_for_manager_not_employee(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(
            self.client.get('/api/core/ai/actions/FLOORPLAN_ADJUST/choices/').status_code, 403,
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.get('/api/core/ai/actions/FLOORPLAN_ADJUST/choices/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['default_model'], 'env-default')
        self.assertEqual(resp.data['default_effort'], 'low')
        slugs = [m['slug'] for m in resp.data['models']]
        self.assertEqual(slugs[0], 'env-default')
        self.assertIn('grok-4.7', slugs)

    def test_discover_adds_new_and_skips_missing_keys(self):
        self.client.force_authenticate(self.owner)
        page = {'models': [
            {'name': 'models/gemini-9-flash', 'displayName': 'Gemini 9 Flash',
             'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/gemini-9-flash-image', 'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/text-embedding-9', 'supportedGenerationMethods': ['embedContent']},
            {'name': 'models/gemini-3.8-flash', 'supportedGenerationMethods': ['generateContent']},
        ]}
        with override_settings(ANTHROPIC_API_KEY='', XAI_API_KEY='', GOOGLE_API_KEY='goo-k', GEMINI_API_KEY='', META_API_KEY=''):
            with mock.patch('requests.get', return_value=_FakeResp(page)) as get:
                resp = self.client.post('/api/core/ai/models/discover/')
        self.assertEqual(resp.status_code, 200)
        by_provider = {r['provider']: r for r in resp.data['providers']}
        self.assertFalse(by_provider['anthropic']['ok'])
        self.assertFalse(by_provider['xai']['ok'])
        self.assertTrue(by_provider['google']['ok'])
        self.assertEqual(by_provider['google']['found'], 2)
        self.assertEqual(by_provider['google']['added'], ['gemini-9-flash'])
        self.assertEqual(get.call_args.kwargs['headers']['x-goog-api-key'], 'goo-k')
        row = AiModel.objects.get(slug='gemini-9-flash')
        self.assertEqual((row.provider, row.source, row.status), ('google', 'discovered', 'active'))


class MetaModelListTests(SimpleTestCase):
    def test_keeps_only_spark_chat_models(self):
        from apps.core.services import ai_catalog

        data = {'data': [{'id': 'muse-spark-1.3'}, {'id': 'muse-image-1.0'}, {'id': 'muse-voice-transcribe-1.0'}]}
        with mock.patch.object(ai_catalog, '_get_json', return_value=data):
            rows = ai_catalog.list_meta_models('k')
        self.assertEqual([r[0] for r in rows], ['muse-spark-1.3'])
