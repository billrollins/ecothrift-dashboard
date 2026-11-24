from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.ai_config import ai_effort, ai_model, best_text_models, catalog_provider, resolve
from apps.core.models import AiAction, AiModel, AiTier, AIUsage
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
        # 26 rows seeded by the apps (core 0005 ... storefront 0001) + Dash #195 (core 0018): product standardize at
        # intake, the hiring reply, the tier review + Dash #209 (core 0020, 0022): the photo editor's four AI actions
        # and its prompt writer.
        self.assertEqual(AiAction.objects.count(), 34)
        self.assertEqual(AiAction.objects.filter(purpose__in=['THRIFTPLUS_FAMILY', 'QA_TRIAGE']).count(), 2)
        self.assertFalse(AiAction.objects.filter(purpose='SUPERVISOR_BRIEF').exists())
        self.assertEqual(list(AiTier.objects.values_list('key', flat=True)), ['fast', 'standard', 'best', 'image'])
        # Every action is placed (Workspace > Page > Function) and on a tier of its own type.
        self.assertFalse(AiAction.objects.filter(workspace='').exists())
        self.assertFalse(AiAction.objects.filter(page='').exists())
        self.assertEqual(list(AiAction.objects.filter(tier='image').values_list('purpose', flat=True)), [
            'LABEL_IMAGE', 'PHOTO_FILTER', 'PHOTO_FREE_EDIT', 'PHOTO_OPTIMIZE', 'PHOTO_REMOVE_BACKGROUND'])
        self.assertEqual(AiAction.objects.filter(modality='image').count(), 5)
        self.assertTrue(AiAction.objects.filter(purpose='INVENTORY_CLEANUP').exists())

    def test_the_migration_keeps_every_action_on_the_model_it_ran_on(self):
        # Spark actions are on Fast (Spark), Opus 5.5 actions on Best (Opus 5.5), blank ones on Standard (no model:
        # the .env fallback, as before). Their own model is cleared only when the tier gives the same one.
        self.assertEqual(AiTier.objects.get(key='fast').model.slug, 'muse-spark-1.3-contributor')
        self.assertEqual(AiTier.objects.get(key='best').model.slug, 'claude-opus-5-5')
        self.assertIsNone(AiTier.objects.get(key='standard').model)
        for purpose in ('KEY_MAPPING', 'CATEGORY_AI', 'TITLE_CATEGORY_ESTIMATE', 'INCIDENT_REVIEW', 'AD_RESULTS'):
            row = AiAction.objects.get(purpose=purpose)
            self.assertEqual((row.tier, row.model_id), ('fast', None), purpose)
            self.assertEqual(ai_model(purpose), 'muse-spark-1.3-contributor')
        miss = AiAction.objects.get(purpose='BUYING_MISS_REVIEW')
        self.assertEqual((miss.tier, miss.model_id, miss.effort), ('best', None, ''))  # medium = Best's effort
        self.assertEqual(ai_effort('BUYING_MISS_REVIEW'), 'medium')
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')
        self.assertEqual(ai_effort('FLOORPLAN_SVG'), 'low')
        self.assertEqual(ai_effort('INVENTORY_CLASSIFY'), 'off')  # its own effort, kept
        std = AiAction.objects.get(purpose='PRODUCT_STANDARDIZE')
        self.assertEqual((std.tier, std.effort, std.workspace, std.page), ('fast', 'high', 'Buying', 'Preprocessing'))
        self.assertEqual((ai_model('PRODUCT_STANDARDIZE'), ai_effort('PRODUCT_STANDARDIZE')),
                         ('muse-spark-1.3-contributor', 'high'))  # as standardize.MODEL / EFFORT in code were

    def test_blank_assignment_uses_fallback(self):
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')
        self.assertEqual(ai_model('FLOORPLAN_SVG'), 'env-default')
        self.assertEqual(ai_model('LABEL_IMAGE'), 'grok-imagine-image-quality')

    @override_settings(AI_MODEL_AI_CHAT='ignored-env-model')
    def test_per_purpose_env_values_are_no_longer_read(self):
        self.assertEqual(ai_model('AI_CHAT'), 'env-default')

    def test_an_action_on_a_tier_follows_a_model_swap_and_an_archive(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        flash = AiModel.objects.get(slug='gemini-3.8-flash')
        AiAction.objects.filter(purpose='QA_TRIAGE').update(tier='standard', model=None, effort='')
        AiTier.objects.filter(key='standard').update(model=grok, effort='high')
        self.assertEqual((ai_model('QA_TRIAGE'), ai_effort('QA_TRIAGE')), ('grok-4.7', 'high'))
        AiTier.objects.filter(key='standard').update(model=flash)  # swap: only the tier map changes
        self.assertEqual(ai_model('QA_TRIAGE'), 'gemini-3.8-flash')
        AiModel.objects.filter(pk=flash.pk).update(status='archived')  # archived: the tier falls back
        self.assertEqual(resolve('QA_TRIAGE'), {'model': 'env-default', 'effort': 'high', 'model_from': 'env',
                                                'effort_from': 'tier'})

    def test_own_model_beats_tier_and_override_beats_both(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=grok, effort='max', tier='best')
        self.assertEqual(resolve('ai_chat'), {'model': 'grok-4.7', 'effort': 'max', 'model_from': 'action',
                                              'effort_from': 'action'})
        self.assertEqual(ai_model('AI_CHAT', 'claude-sonnet-4-6'), 'claude-sonnet-4-6')
        AiModel.objects.filter(pk=grok.pk).update(status='archived')
        self.assertEqual(ai_model('AI_CHAT'), 'claude-opus-5-5')  # back to its tier (Best)

    def test_effort(self):
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
        self.assertEqual(resolve_provider('gpt-6.2-astra'), 'openai')
        self.assertEqual(resolve_provider('o4-mini'), 'openai')
        AiModel.objects.create(slug='gpt-house', provider='openai')
        self.assertEqual(catalog_provider('gpt-house'), 'openai')

    def test_best_text_model_per_provider(self):
        AiModel.objects.filter(slug='muse-spark-1.3').update(aa_intelligence=Decimal('40'))
        AiModel.objects.filter(slug='muse-spark-1.3-contributor').update(aa_intelligence=Decimal('30'))
        AiModel.objects.filter(slug='gemini-3.8-flash').update(output_price=Decimal('3'))
        AiModel.objects.filter(slug='gemini-3.5-flash-lite').update(output_price=Decimal('1'))
        best = best_text_models()
        self.assertEqual(best['anthropic'], 'claude-opus-5-5')     # the Best tier's model wins for its provider
        self.assertEqual(best['meta'], 'muse-spark-1.3')           # highest AA index
        self.assertEqual(best['google'], 'gemini-3.8-flash')       # no AA scores: the priciest (the flagship)
        self.assertNotIn('openai', best)


class AiSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user('owner@example.com', 'Admin', superuser=True)
        self.manager = make_user('mgr@example.com', 'Manager')
        self.employee = make_user('emp@example.com', 'Employee')

    def test_models_list_is_superuser_only(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get('/api/core/ai/models/').status_code, 403)
        self.assertEqual(self.client.get('/api/core/ai/tiers/').status_code, 403)
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/core/ai/models/')
        self.assertEqual(resp.status_code, 200)
        opus = next(m for m in resp.data if m['slug'] == 'claude-opus-5-5')
        self.assertEqual(opus['tier_keys'], ['best'])

    def test_add_model_needs_provider_and_strips_models_prefix(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post('/api/core/ai/models/', {'slug': 'models/gemini-9-test'}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(
            '/api/core/ai/models/', {'slug': 'models/gemini-9-test', 'provider': 'google'}, format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual((resp.data['slug'], resp.data['source'], resp.data['status']), ('gemini-9-test', 'manual', 'active'))
        resp = self.client.post(
            '/api/core/ai/models/', {'slug': 'models/gemini-3.8-flash', 'provider': 'google'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post('/api/core/ai/models/', {'slug': 'gpt-9', 'provider': 'openai'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_image_models_are_xai_openai_or_google(self):
        self.client.force_authenticate(self.owner)
        for slug, provider in (('imagen-9', 'google'), ('gpt-image-9', 'openai'), ('grok-imagine-9', 'xai')):
            resp = self.client.post('/api/core/ai/models/', {'slug': slug, 'provider': provider, 'modality': 'image'},
                                    format='json')
            self.assertEqual(resp.status_code, 201, resp.data)
        resp = self.client.post('/api/core/ai/models/', {'slug': 'muse-image-9', 'provider': 'meta', 'modality': 'image'},
                                format='json')
        self.assertEqual(resp.status_code, 400)

    def test_a_typed_per_image_price_is_logged(self):
        from apps.core.models import AppSettingHistory

        row = AiModel.objects.create(slug='gpt-image-9', provider='openai', modality='image')
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(f'/api/core/ai/models/{row.pk}/', {'image_price': '0.04'}, format='json')
        self.assertEqual((resp.status_code, resp.data['image_price'], resp.data['price_source']), (200, '0.0400', 'typed'))
        log = AppSettingHistory.objects.get(key='ai_model_prices')
        self.assertEqual(log.new_value['gpt-image-9']['how'], 'typed in (per image)')

    def test_try_an_image_model(self):
        row = AiModel.objects.create(slug='gpt-image-9', provider='openai', modality='image', image_price=Decimal('0.04'))
        self.client.force_authenticate(self.owner)
        with mock.patch('apps.core.services.image_router.generate_image',
                        return_value={'b64': 'aGk=', 'content_type': 'image/png', 'model_used': 'gpt-image-9',
                                      'seconds': 9.5, 'cost': '0.0400'}) as gen:
            resp = self.client.post(f'/api/core/ai/models/{row.pk}/test-image/', {'message': 'a leaf'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['image'], resp.data['cost']), ('data:image/png;base64,aGk=', '0.0400'))
        self.assertEqual(gen.call_args.args, ('gpt-image-9', 'a leaf'))
        text = AiModel.objects.get(slug='grok-4.7')
        self.assertEqual(self.client.post(f'/api/core/ai/models/{text.pk}/test-image/', {'message': 'x'}, format='json').status_code, 400)

    def test_rename_keeps_assignment(self):
        model = AiModel.objects.get(slug='gemini-3.8-flash')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=model)
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(f'/api/core/ai/models/{model.pk}/', {'slug': 'gemini-3.8-flash-001'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(ai_model('AI_CHAT'), 'gemini-3.8-flash-001')

    @override_settings(AI_MODEL='env-default')
    def test_archive_clears_tiers_and_actions_and_unarchive_does_not_restore(self):
        grok = AiModel.objects.get(slug='grok-4.7')
        AiAction.objects.filter(purpose='AI_CHAT').update(model=grok, tier='best')
        AiTier.objects.filter(key='standard').update(model=grok)
        self.client.force_authenticate(self.owner)
        resp = self.client.post(f'/api/core/ai/models/{grok.pk}/archive/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual((resp.data['cleared_actions'], resp.data['cleared_tiers']), (1, ['Standard']))
        self.assertIsNone(AiAction.objects.get(purpose='AI_CHAT').model)
        self.assertIsNone(AiTier.objects.get(key='standard').model)
        self.assertEqual(ai_model('AI_CHAT'), 'claude-opus-5-5')  # follows its tier again
        resp = self.client.post(f'/api/core/ai/models/{grok.pk}/unarchive/')
        self.assertEqual(resp.data['status'], 'active')
        self.assertIsNone(AiTier.objects.get(key='standard').model)

    def test_tier_rules(self):
        self.client.force_authenticate(self.owner)
        grok = AiModel.objects.get(slug='grok-4.7')
        resp = self.client.patch('/api/core/ai/tiers/standard/', {'model': grok.pk, 'effort': 'high'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['model_slug'], resp.data['effort']), ('grok-4.7', 'high'))
        self.assertEqual(self.client.patch('/api/core/ai/tiers/image/', {'model': grok.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/core/ai/tiers/image/', {'effort': 'high'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/core/ai/tiers/fast/', {'effort': 'turbo'}, format='json').status_code, 400)
        AiModel.objects.filter(pk=grok.pk).update(status='archived')
        self.assertEqual(self.client.patch('/api/core/ai/tiers/best/', {'model': grok.pk}, format='json').status_code, 400)

    def test_assign_action_rules(self):
        self.client.force_authenticate(self.owner)
        grok = AiModel.objects.get(slug='grok-4.7')
        resp = self.client.patch('/api/core/ai/actions/AI_CHAT/', {'model': grok.pk, 'effort': 'high'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['model_slug'], resp.data['effort'], resp.data['model_from']), ('grok-4.7', 'high', 'action'))
        resp = self.client.patch('/api/core/ai/actions/AI_CHAT/', {'model': None, 'effort': '', 'tier': 'fast'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['run_model'], resp.data['run_effort'], resp.data['model_from']),
                         ('muse-spark-1.3-contributor', 'low', 'tier'))
        self.assertEqual(self.client.patch('/api/core/ai/actions/LABEL_IMAGE/', {'model': grok.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/core/ai/actions/LABEL_IMAGE/', {'effort': 'high'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/core/ai/actions/LABEL_IMAGE/', {'tier': 'best'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/core/ai/actions/AI_CHAT/', {'tier': 'image'}, format='json').status_code, 400)
        AiModel.objects.filter(pk=grok.pk).update(status='archived')
        self.assertEqual(self.client.patch('/api/core/ai/actions/SUGGEST_ITEM/', {'model': grok.pk}, format='json').status_code, 400)

    def test_manager_cannot_patch_action(self):
        self.client.force_authenticate(self.manager)
        resp = self.client.patch('/api/core/ai/actions/AI_CHAT/', {'effort': 'low'}, format='json')
        self.assertEqual(resp.status_code, 403)

    @override_settings(AI_MODEL='env-default')
    def test_choices_for_manager_not_employee(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get('/api/core/ai/actions/FLOORPLAN_ADJUST/choices/').status_code, 403)
        self.client.force_authenticate(self.manager)
        resp = self.client.get('/api/core/ai/actions/FLOORPLAN_ADJUST/choices/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual((resp.data['default_model'], resp.data['default_effort']), ('env-default', 'low'))
        slugs = [m['slug'] for m in resp.data['models']]
        self.assertEqual(slugs[0], 'env-default')
        self.assertIn('grok-4.7', slugs)

    def test_actions_read_in_the_sidebar_workspace_order_with_cost_per_run(self):
        from apps.core.services.ai_actions import WORKSPACE_ORDER

        AiModel.objects.filter(slug='muse-spark-1.3-contributor').update(input_price=Decimal('1'), output_price=Decimal('2'))
        now = timezone.now()
        # Two runs logged by purpose, one by a source with no purpose (an older row): all three are TITLE_CATEGORY_ESTIMATE.
        for source, purpose, inp, out in (('x', 'TITLE_CATEGORY_ESTIMATE', 1000, 3000), ('y', 'TITLE_CATEGORY_ESTIMATE', 3000, 5000),
                                          ('ai_title_category_estimate', '', 2000, 4000)):
            AIUsage.objects.create(created_at=now, source=source, purpose=purpose, model='gemini-3.5-flash-lite',
                                   input_tokens=inp, output_tokens=out, estimated_cost_usd=Decimal('0.5'))
        AIUsage.objects.create(created_at=now, source='x', purpose='TITLE_CATEGORY_ESTIMATE', success=False,
                               input_tokens=99999)  # a failed call is not a run
        self.client.force_authenticate(self.owner)
        rows = self.client.get('/api/core/ai/actions/').data
        order = [WORKSPACE_ORDER.index(r['workspace']) for r in rows]
        self.assertEqual(order, sorted(order))
        buying = [(r['page'], r['label']) for r in rows if r['workspace'] == 'Buying']
        self.assertEqual(buying, sorted(buying, key=lambda p: (p[0].lower(), p[1].lower())))
        title = next(r for r in rows if r['purpose'] == 'TITLE_CATEGORY_ESTIMATE')
        self.assertEqual((title['runs_30d'], title['tokens_in'], title['tokens_out']), (3, 2000, 4000))
        # 2,000 in at $1 + 4,000 out at $2 per 1M, on the model it runs on now (Fast: Spark Contributor).
        self.assertEqual((title['run_model'], title['cost_per_run'], title['spent_30d']),
                         ('muse-spark-1.3-contributor', '0.010000', '1.50'))
        self.assertEqual(title['tier_costs']['fast'], '0.010000')
        self.assertIsNone(title['tier_costs']['standard'])  # no model set on Standard here

    def test_a_typed_price_is_logged_and_marked_typed(self):
        from apps.core.models import AppSettingHistory

        row = AiModel.objects.create(slug='check-blank-x', provider='anthropic')
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(f'/api/core/ai/models/{row.pk}/', {'input_price': '0.25', 'output_price': '1'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.client.patch(f'/api/core/ai/models/{row.pk}/', {'label': 'Blank X'}, format='json')  # not a price change
        log = AppSettingHistory.objects.get(key='ai_model_prices')
        self.assertEqual(log.changed_by, self.owner)
        self.assertEqual(log.new_value['check-blank-x'], {'input': '0.2500', 'output': '1.0000', 'how': 'typed in'})
        self.assertEqual(AiModel.objects.get(pk=row.pk).price_source, 'typed')


class ProviderListTests(SimpleTestCase):
    def test_meta_keeps_only_spark_chat_models(self):
        from apps.core.services import ai_catalog

        data = {'data': [{'id': 'muse-spark-1.3'}, {'id': 'muse-image-1.0'}, {'id': 'muse-voice-transcribe-1.0'}]}
        with mock.patch.object(ai_catalog, '_get_json', return_value=data):
            rows = ai_catalog.list_meta_models('k')
        self.assertEqual([r[0] for r in rows], ['muse-spark-1.3'])

    def test_openai_keeps_chat_models_and_drops_snapshots_of_listed_aliases(self):
        from apps.core.services import ai_catalog

        ids = ['gpt-6.2-astra', 'gpt-6.2-astra-2026-10-01', 'gpt-6-mini', 'o4-mini', 'gpt-4o', 'gpt-image-2',
               'text-embedding-3-large', 'gpt-realtime-2', 'whisper-1', 'gpt-live-1', 'dall-e-3', 'gpt-6-nano-2026-09-09']
        with mock.patch.object(ai_catalog, '_get_json', return_value={'data': [{'id': i} for i in ids]}):
            rows = ai_catalog.drop_snapshots(ai_catalog.list_openai_models('k'))
        self.assertEqual([r[0] for r in rows], ['gpt-6.2-astra', 'gpt-6-mini', 'o4-mini', 'gpt-image-2', 'dall-e-3',
                                                'gpt-6-nano-2026-09-09'])  # image models too, as images (Dash #195)


class AaMatchTests(SimpleTestCase):
    def _aa(self, slug, intelligence):
        return {'slug': slug, 'name': slug, 'intelligence': Decimal(intelligence), 'task_cost': None, 'speed': None,
                'input': None, 'output': None}

    def test_word_order_dates_and_variants(self):
        from apps.core.services.ai_refresh import match_aa

        rows = [self._aa('claude-5-5-opus', '60'), self._aa('claude-5-5-opus-thinking', '70'),
                self._aa('grok-4-20-non-reasoning', '50'), self._aa('grok-4-20-reasoning', '65'),
                self._aa('gemini-3-8-flash', '55')]
        self.assertEqual(match_aa('claude-opus-5-5', rows)['slug'], 'claude-5-5-opus-thinking')  # thinking on: the top score
        self.assertEqual(match_aa('grok-4.20-0309-non-reasoning', rows)['slug'], 'grok-4-20-non-reasoning')
        self.assertEqual(match_aa('gemini-3.8-flash', rows)['slug'], 'gemini-3-8-flash')
        self.assertIsNone(match_aa('gpt-6.2-astra', rows))
        self.assertEqual(match_aa('claude-opus-5-5', rows, saved='claude-5-5-opus')['slug'], 'claude-5-5-opus')

    def test_a_price_plan_gets_aa_perf_but_keeps_its_own_price(self):
        from types import SimpleNamespace

        from apps.core.services.ai_refresh import list_price, match_aa, task_cost

        rows = [{**self._aa('muse-spark-1-3', '36.6'), 'task_cost': Decimal('2.3858'), 'input': Decimal('1.25'),
                 'output': Decimal('4.25')}, self._aa('muse-spark-1-3-xhigh', '0')]
        rows[1]['intelligence'] = None
        m = SimpleNamespace(slug='muse-spark-1.3-contributor', input_price=Decimal('0.1'), output_price=Decimal('0.2'))
        aa = match_aa(m.slug, rows)
        self.assertEqual((aa['slug'], aa['intelligence']), ('muse-spark-1-3', Decimal('36.6')))
        self.assertIsNone(list_price(m, aa))  # the contributor plan is not AA's list price: no flag
        # $2.3858 x (3 x 0.1 + 0.2) / (3 x 1.25 + 4.25) = $0.1491
        self.assertEqual(task_cost(m, aa), Decimal('0.1491'))
        plain = SimpleNamespace(slug='muse-spark-1.3', input_price=None, output_price=None)
        self.assertEqual(list_price(plain, aa), (Decimal('1.25'), Decimal('4.25')))
        self.assertEqual(task_cost(plain, aa), Decimal('2.3858'))

    def test_two_of_three_agree(self):
        from apps.core.services.ai_refresh import agreed

        d = Decimal
        answers = [{'a': (d('1'), d('2')), 'b': (d('5'), d('9'))},
                   {'a': (d('1.01'), d('2')), 'b': (d('3'), d('9'))},
                   {'b': (d('4'), d('9'))}]
        self.assertEqual(agreed(answers), {'a': (d('1'), d('2'))})  # b: three different answers, none counts


@override_settings(ANTHROPIC_API_KEY='', XAI_API_KEY='', GOOGLE_API_KEY='goo-k', GEMINI_API_KEY='', META_API_KEY='',
                   OPENAI_API_KEY='', ARTIFICIAL_ANALYSIS_API_KEY='aa-k')
class AiRefreshTests(TestCase):
    """The Refresh button: lists, AA and the triage merged; a saved price is never overwritten unseen."""

    def setUp(self):
        self.owner = make_user('owner-r@example.com', 'Admin', superuser=True)
        AiModel.objects.filter(slug='gemini-3.8-flash').update(input_price=Decimal('0.5'), output_price=Decimal('3'))
        self.google_list = {'models': [
            {'name': 'models/gemini-9-flash', 'displayName': 'Gemini 9 Flash', 'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/gemini-9-flash-image', 'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/gemini-3.8-flash', 'supportedGenerationMethods': ['generateContent']},
        ]}
        self.aa_page = {'data': [
            {'slug': 'gemini-9-flash', 'name': 'Gemini 9 Flash', 'model_creator': {'name': 'Google'}, 'release_date': '2026-11-02',
             'evaluations': {'artificial_analysis_intelligence_index': 58.4},
             'artificial_analysis_intelligence_index_cost': {'total_cost': 120.5, 'cost_per_task': {'total_cost': 0.1385}},
             'pricing': {'price_1m_input_tokens': 0.3, 'price_1m_output_tokens': 2.5},
             'performance_v3': {'mean_output_tokens_per_second': 210.2}},
            {'slug': 'gemini-3-8-flash', 'name': 'Gemini 3.8 Flash', 'model_creator': {'name': 'Google'},
             'evaluations': {'artificial_analysis_intelligence_index': 51},
             'pricing': {'price_1m_input_tokens': 0.75, 'price_1m_output_tokens': 3.75}},
        ], 'pagination': {'has_more': False}}

    def _get(self, url, headers=None, params=None, timeout=None):
        if 'artificialanalysis' in url:
            self.assertEqual(headers, {'x-api-key': 'aa-k'})
            return _FakeResp(self.aa_page)
        return _FakeResp(self.google_list)

    def _run(self, triage=None):
        from apps.core.services import ai_refresh

        with mock.patch('requests.get', side_effect=self._get), \
                mock.patch.object(ai_refresh, 'triage_models', return_value=list(triage or {})), \
                mock.patch.object(ai_refresh, 'ask_triage', side_effect=lambda mid, slugs: (triage or {})[mid]):
            api = APIClient()
            api.force_authenticate(self.owner)
            resp = api.post('/api/core/ai/models/refresh/')
        self.assertEqual(resp.status_code, 200)
        return resp.data

    def test_new_models_scores_filled_prices_and_flags(self):
        s = self._run()
        google = next(p for p in s['providers'] if p['provider'] == 'google')
        self.assertEqual((google['ok'], google['found'], google['added']),
                         (True, 3, ['gemini-9-flash', 'gemini-9-flash-image']))  # the image model comes in as an image
        self.assertEqual(AiModel.objects.get(slug='gemini-9-flash-image').modality, 'image')
        self.assertFalse(next(p for p in s['providers'] if p['provider'] == 'anthropic')['ok'])  # no key
        self.assertIn('gemini-3.5-flash-lite', s['gone'])  # active, but Google no longer lists it
        self.assertEqual((s['aa']['ok'], s['aa']['matched']), (True, 2))
        new = AiModel.objects.get(slug='gemini-9-flash')
        self.assertEqual((new.input_price, new.output_price, new.price_source), (Decimal('0.3000'), Decimal('2.5000'), 'aa'))
        self.assertEqual(new.release_date.isoformat(), '2026-11-02')  # AA's release date
        self.assertEqual((new.aa_intelligence, new.aa_task_cost, new.aa_speed), (Decimal('58.40'), Decimal('0.1385'), Decimal('210.2')))
        # A saved price that differs waits as a flag; nothing is overwritten.
        flash = AiModel.objects.get(slug='gemini-3.8-flash')
        self.assertEqual((flash.input_price, flash.output_price), (Decimal('0.5000'), Decimal('3.0000')))
        self.assertEqual((flash.flag_input, flash.flag_output), (Decimal('0.7500'), Decimal('3.7500')))
        self.assertIn('AA says $0.75 / $3.75', flash.price_flag)
        self.assertEqual(s['prices']['filled'], 1)
        self.assertEqual(s['prices']['flagged'], 1)
        from apps.core.models import AppSettingHistory

        self.assertEqual(AppSettingHistory.objects.get(key='ai_model_prices').new_value['gemini-9-flash']['how'],
                         'Refresh, filled a missing price')

    def test_accept_and_dismiss_a_flag(self):
        self._run()
        flash = AiModel.objects.get(slug='gemini-3.8-flash')
        api = APIClient()
        api.force_authenticate(self.owner)
        resp = api.post(f'/api/core/ai/models/{flash.pk}/accept-price/')
        self.assertEqual(resp.status_code, 200)
        flash.refresh_from_db()
        self.assertEqual((flash.input_price, flash.output_price, flash.price_flag, flash.price_source),
                         (Decimal('0.7500'), Decimal('3.7500'), '', 'aa'))
        self.assertEqual(api.post(f'/api/core/ai/models/{flash.pk}/accept-price/').status_code, 400)  # nothing waiting
        flash.price_flag, flash.flag_input, flash.flag_output = 'x', Decimal('9'), Decimal('9')
        flash.save()
        api.post(f'/api/core/ai/models/{flash.pk}/dismiss-price/')
        flash.refresh_from_db()
        self.assertEqual((flash.input_price, flash.price_flag, flash.flag_input), (Decimal('0.7500'), '', None))

    @override_settings(ARTIFICIAL_ANALYSIS_API_KEY='')
    def test_without_aa_two_of_three_triage_models_fill_a_blank_price(self):
        d = Decimal
        triage = {'m1': {'gemini-3.5-flash-lite': (d('0.1'), d('0.4'))},
                  'm2': {'gemini-3.5-flash-lite': (d('0.1'), d('0.4')), 'grok-4.7': (d('2'), d('6'))},
                  'm3': {'grok-4.7': (d('3'), d('15'))}}
        s = self._run(triage)
        self.assertEqual((s['aa']['ok'], s['aa']['error'][:10]), (False, 'No AA data'))
        lite = AiModel.objects.get(slug='gemini-3.5-flash-lite')
        self.assertEqual((lite.input_price, lite.output_price, lite.price_source), (d('0.1000'), d('0.4000'), 'triage'))
        self.assertIsNone(AiModel.objects.get(slug='grok-4.7').input_price)  # the two answers disagree: no price
        self.assertEqual([t['priced'] for t in s['triage']], [1, 2, 1])

    def test_the_triage_is_not_waited_for_when_aa_confirms_every_price(self):
        import threading
        import time

        from apps.core.services import ai_refresh

        AiModel.objects.filter(modality='text').exclude(slug='gemini-3.8-flash').update(status='archived')
        AiModel.objects.filter(slug='gemini-3.8-flash').update(input_price=Decimal('0.75'), output_price=Decimal('3.75'))
        release = threading.Event()
        self.addCleanup(release.set)
        started = time.monotonic()
        with mock.patch('requests.get', side_effect=self._get), \
                mock.patch.object(ai_refresh, 'triage_models', return_value=['slow']), \
                mock.patch.object(ai_refresh, 'ask_triage', side_effect=lambda mid, slugs: release.wait(30) and {}):
            s = ai_refresh.refresh()
        self.assertLess(time.monotonic() - started, ai_refresh.TRIAGE_TIMEOUT)
        self.assertEqual(s['triage'][0]['error'], 'Not waited for: AA covered every price.')
        self.assertEqual(s['prices']['confirmed'], 1)

    def test_aa_and_the_triage_disagreeing_is_flagged(self):
        d = Decimal
        triage = {'m1': {'gemini-9-flash': (d('1'), d('5'))}, 'm2': {'gemini-9-flash': (d('1'), d('5'))}}
        self._run(triage)
        new = AiModel.objects.get(slug='gemini-9-flash')
        self.assertEqual((new.input_price, new.price_source), (d('0.3000'), 'aa'))  # AA filled it
        self.assertIn('2 of 3 models say $1 / $5', new.price_flag)
        self.assertEqual((new.flag_input, new.flag_output), (d('1.0000'), d('5.0000')))  # the other answer, to pick


class AiTierReviewTests(TestCase):
    def test_review_proposes_tiers_and_a_new_tier_answers_the_proposal(self):
        from apps.core.services import ai_actions
        from apps.core.services.llm_router import LLMResult

        AiAction.objects.filter(purpose='MANIFEST_TEMPLATE').update(tier='best')
        answer = {'tiers': [
            {'purpose': 'MANIFEST_TEMPLATE', 'tier': 'standard', 'reason': 'Rare and well defined.'},
            {'purpose': 'KEY_MAPPING', 'tier': 'fast', 'reason': 'Already right.'},
            {'purpose': 'QA_TRIAGE', 'tier': 'turbo', 'reason': 'Not a tier.'},
        ]}
        with mock.patch('apps.core.services.llm_router.llm_complete',
                        return_value=LLMResult(text='', model_used='claude-opus-5-5', tool_input=answer)) as call:
            s = ai_actions.run_review('Bill')
        self.assertEqual((s['status'], s['proposed'], s['reviewed']), ('done', 1, 2))
        kwargs = call.call_args.kwargs
        self.assertEqual((kwargs['model_id'], kwargs['effort'], kwargs['log_purpose']), ('claude-opus-5-5', 'low', 'AI_TIER_REVIEW'))
        self.assertIn('MANIFEST_TEMPLATE', kwargs['user'])
        self.assertNotIn('LABEL_IMAGE', kwargs['user'])  # image jobs are not tiered by the review
        row = AiAction.objects.get(purpose='MANIFEST_TEMPLATE')
        self.assertEqual((row.tier, row.suggested_tier, row.suggested_reason), ('best', 'standard', 'Rare and well defined.'))
        self.assertEqual(AiAction.objects.get(purpose='KEY_MAPPING').suggested_tier, '')
        owner = make_user('owner-t@example.com', 'Admin', superuser=True)
        api = APIClient()
        api.force_authenticate(owner)
        resp = api.patch('/api/core/ai/actions/MANIFEST_TEMPLATE/', {'tier': 'standard'}, format='json')
        self.assertEqual((resp.data['tier'], resp.data['suggested_tier']), ('standard', ''))

    def test_a_failed_review_changes_nothing_and_says_so(self):
        from apps.core.services import ai_actions
        from apps.core.services.llm_router import LLMResult

        AiAction.objects.filter(purpose='QA_TRIAGE').update(suggested_tier='best', suggested_reason='kept')
        with mock.patch('apps.core.services.llm_router.llm_complete', return_value=LLMResult(text='no', model_used='x')):
            s = ai_actions.run_review()
        self.assertEqual(s['status'], 'failed')
        self.assertEqual(AiAction.objects.get(purpose='QA_TRIAGE').suggested_tier, 'best')
        self.assertEqual(ai_actions.review_state()['status'], 'failed')


@override_settings(XAI_API_KEY='x-k', OPENAI_API_KEY='o-k', GOOGLE_API_KEY='g-k', GEMINI_API_KEY='')
class ImageRouterTests(TestCase):
    """One image call per provider; logged at the model's per-image price."""

    def _post(self, payload):
        resp = mock.MagicMock(status_code=200)
        resp.json.return_value = payload
        return mock.patch('requests.post', return_value=resp)

    def test_each_provider_gets_its_own_request(self):
        from apps.core.services.image_router import generate_image

        AiModel.objects.create(slug='gpt-image-9', provider='openai', modality='image', image_price=Decimal('0.04'))
        with self._post({'data': [{'b64_json': 'b3A='}]}) as post:
            out = generate_image('gpt-image-9', 'a leaf', aspect='3:2')
        url, payload = post.call_args.args[0], post.call_args.kwargs['json']
        self.assertTrue(url.endswith('/images/generations'))
        self.assertEqual((payload['size'], payload['quality'], 'response_format' in payload), ('1536x1024', 'medium', False))
        self.assertEqual((out['b64'], out['cost']), ('b3A=', '0.0400'))
        self.assertEqual(AIUsage.objects.get(model='gpt-image-9').estimated_cost_usd, Decimal('0.04'))

        with self._post({'data': [{'b64_json': 'eGE='}]}) as post:
            generate_image('grok-imagine-image-2.0', 'a leaf', aspect='2:1')
        self.assertEqual(post.call_args.kwargs['json']['aspect_ratio'], '2:1')
        self.assertEqual(AIUsage.objects.get(model='grok-imagine-image-2.0').estimated_cost_usd, Decimal('0.07'))  # no price yet

        AiModel.objects.create(slug='gemini-9-flash-image', provider='google', modality='image')
        answer = {'candidates': [{'content': {'parts': [{'text': 'Here.'}, {'inlineData': {'mimeType': 'image/jpeg', 'data': 'Z28='}}]}}]}
        with self._post(answer) as post:
            out = generate_image('gemini-9-flash-image', 'a leaf')
        self.assertIn(':generateContent', post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs['json']['generationConfig']['responseModalities'], ['TEXT', 'IMAGE'])
        self.assertEqual((out['b64'], out['content_type']), ('Z28=', 'image/jpeg'))

    def test_no_picture_is_a_plain_error(self):
        from apps.core.services.image_router import ImageError, generate_image

        AiModel.objects.create(slug='gemini-9-flash-image', provider='google', modality='image')
        with self._post({'candidates': [{'content': {'parts': [{'text': 'I cannot draw that.'}]}}]}):
            with self.assertRaises(ImageError):
                generate_image('gemini-9-flash-image', 'a leaf')


class ImageListTests(SimpleTestCase):
    def test_providers_list_their_image_models_as_images(self):
        from apps.core.services import ai_catalog

        openai = {'data': [{'id': 'gpt-image-2', 'created': 1776384000}, {'id': 'chatgpt-image-latest'}, {'id': 'gpt-6-mini'},
                           {'id': 'dall-e-2'}]}
        with mock.patch.object(ai_catalog, '_get_json', return_value=openai):
            rows = ai_catalog.list_openai_models('k')
        self.assertEqual(rows[0][3], {'released': __import__('datetime').date(2026, 4, 17)})  # OpenAI's created stamp
        self.assertEqual([(r[0], r[2]) for r in rows],
                         [('gpt-image-2', 'image'), ('chatgpt-image-latest', 'image'), ('gpt-6-mini', 'text')])
        google = {'models': [
            {'name': 'models/gemini-3.1-flash-image', 'displayName': 'Nano Banana 2', 'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/gemini-nano-banana-2.1', 'displayName': 'Nano Banana 2.1', 'supportedGenerationMethods': ['generateContent']},
            {'name': 'models/imagen-5', 'supportedGenerationMethods': ['predict']},
            {'name': 'models/gemini-9-pro', 'supportedGenerationMethods': ['generateContent']},
        ]}
        with mock.patch.object(ai_catalog, '_get_json', return_value=google):
            rows = ai_catalog.list_google_models('k')
        self.assertEqual([(r[0], r[2]) for r in rows], [('gemini-3.1-flash-image', 'image'), ('gemini-nano-banana-2.1', 'image'),
                                                         ('imagen-5', 'image'), ('gemini-9-pro', 'text')])
        xai = {'models': [{'id': 'grok-imagine-image-2.0', 'image_price': 600000000}]}
        with mock.patch.object(ai_catalog, '_get_json', side_effect=[{'models': []}, xai]):
            rows = ai_catalog.list_xai_models('k')
        self.assertEqual(rows, [('grok-imagine-image-2.0', '', 'image', {'image_price': Decimal('0.06')})])  # no date given


@override_settings(ANTHROPIC_API_KEY='', XAI_API_KEY='x-k', GOOGLE_API_KEY='g-k', GEMINI_API_KEY='', META_API_KEY='',
                   OPENAI_API_KEY='', ARTIFICIAL_ANALYSIS_API_KEY='aa-k')
class ImageRefreshTests(TestCase):
    def test_image_models_get_arena_perf_the_provider_price_and_their_right_type(self):
        from apps.core.services import ai_refresh

        AiModel.objects.create(slug='gemini-nano-banana-2.1', label='Nano Banana 2.1', provider='google', modality='text')
        AiTier.objects.filter(key='standard').update(model=AiModel.objects.get(slug='gemini-nano-banana-2.1'))
        AiModel.objects.create(slug='grok-imagine-image-2.0', provider='xai', modality='image', image_price=Decimal('0.07'))
        AiModel.objects.create(slug='gpt-image-2', provider='openai', modality='image')                      # blank: filled
        AiModel.objects.create(slug='gpt-image-1.5', provider='openai', modality='image', image_price=Decimal('0.05'))  # typed: kept

        def get(url, headers=None, params=None, timeout=None):
            if 'text-to-image' in url:
                return _FakeResp({'data': [{'slug': 'nano-banana-2-1', 'name': 'Nano Banana 2.1', 'elo': 1144},
                                           {'slug': 'grok-imagine-image-2-0', 'name': 'Grok Imagine 2.0', 'elo': 1167}]})
            if 'artificialanalysis' in url:
                return _FakeResp({'data': [], 'pagination': {'has_more': False}})
            if 'image-generation-models' in url:
                return _FakeResp({'models': [{'id': 'grok-imagine-image-2.0', 'image_price': 600000000}]})
            if 'x.ai' in url:
                return _FakeResp({'models': []})
            return _FakeResp({'models': [{'name': 'models/gemini-nano-banana-2.1', 'displayName': 'Nano Banana 2.1',
                                          'supportedGenerationMethods': ['generateContent']}]})

        with mock.patch('requests.get', side_effect=get), mock.patch.object(ai_refresh, 'triage_models', return_value=[]):
            s = ai_refresh.refresh()
        self.assertEqual(s['retyped'], ['gemini-nano-banana-2.1'])
        banana = AiModel.objects.get(slug='gemini-nano-banana-2.1')
        self.assertEqual((banana.modality, banana.aa_intelligence), ('image', Decimal('1144.00')))
        self.assertIsNone(AiTier.objects.get(key='standard').model)  # a text tier cannot keep an image model
        grok = AiModel.objects.get(slug='grok-imagine-image-2.0')
        self.assertEqual((grok.image_price, grok.flag_input), (Decimal('0.0700'), Decimal('0.0600')))  # flagged, not overwritten
        self.assertIn('the provider lists $0.06', grok.price_flag)
        self.assertEqual(AiModel.objects.get(slug='gpt-image-2').image_price, Decimal('0.0530'))  # from OpenAI's page
        kept = AiModel.objects.get(slug='gpt-image-1.5')
        self.assertEqual((kept.image_price, kept.price_flag), (Decimal('0.0500'), ''))  # a set price is never flagged by it
        ai_refresh.accept_flag(grok, None)
        grok.refresh_from_db()
        self.assertEqual((grok.image_price, grok.price_source, grok.price_flag), (Decimal('0.0600'), 'list', ''))


class RouterTokenTests(SimpleTestCase):
    def test_xai_reasoning_tokens_count_as_output_and_openai_uses_max_completion_tokens(self):
        from apps.core.services import llm_router

        xai = {'choices': [{'message': {'content': 'hi'}}], 'usage': {
            'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 115,
            'completion_tokens_details': {'reasoning_tokens': 100}}}
        with mock.patch.object(llm_router, '_requests_post', return_value=xai):
            r = llm_router._xai_complete(model_id='grok-x', api_key='k', system='', messages=[{'role': 'user', 'content': 'q'}],
                                         max_tokens=50, temperature=None, timeout=5, tool_name=None, tools=None)
        self.assertEqual((r.input_tokens, r.output_tokens), (10, 105))
        openai = {'choices': [{'message': {'content': 'hi'}}], 'usage': {
            'prompt_tokens': 10, 'completion_tokens': 105, 'total_tokens': 115,
            'completion_tokens_details': {'reasoning_tokens': 100}}}  # OpenAI counts thinking inside completion
        with mock.patch.object(llm_router, '_requests_post', return_value=openai) as post:
            r = llm_router._openai_complete(model_id='gpt-x', api_key='k', system='', messages=[{'role': 'user', 'content': 'q'}],
                                            max_tokens=50, temperature=None, timeout=5, tool_name=None, tools=None, effort='high')
        self.assertEqual(r.output_tokens, 105)
        payload = post.call_args.kwargs['payload']
        self.assertEqual((payload.get('max_completion_tokens'), payload.get('max_tokens'), payload['reasoning_effort']), (50, None, 'high'))
        self.assertTrue(post.call_args.args[0].startswith('https://api.openai.com/v1/'))

    def test_gemini_thinking_counts_as_output(self):
        from apps.core.services import llm_router

        data = {'candidates': [{'content': {'parts': [{'text': 'hi'}]}}],
                'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 5, 'thoughtsTokenCount': 40}}
        with mock.patch.object(llm_router, '_requests_post', return_value=data):
            r = llm_router._google_complete(model_id='gemini-x', api_key='k', system='', messages=[{'role': 'user', 'content': 'q'}],
                                            max_tokens=50, temperature=None, timeout=5, tool_name=None, tools=None)
        self.assertEqual(r.output_tokens, 45)


class AiModelTestEndpointTests(TestCase):
    def test_one_message_gives_the_answer_time_and_cost_split_in_and_out(self):
        from apps.core.services.ai_usage_log import estimate_cost_usd
        from apps.core.services.llm_router import LLMResult

        boss = User.objects.create_superuser(email='boss-ai@example.com', first_name='B', last_name='O', password='x-pass-123')
        row = AiModel.objects.create(slug='test-model-x', provider='anthropic', input_price=Decimal('4'), output_price=Decimal('20'))
        api = APIClient()
        api.force_authenticate(boss)
        with mock.patch('apps.core.services.llm_router.llm_complete',
                        return_value=LLMResult(text='Hello.', model_used='test-model-x', input_tokens=1000, output_tokens=500)):
            data = api.post(f'/api/core/ai/models/{row.pk}/test/', {'message': 'Hi'}, format='json').json()
        self.assertEqual((data['text'], data['input_cost'], data['output_cost']), ('Hello.', '0.004000', '0.010000'))
        self.assertGreaterEqual(data['seconds'], 0)
        self.assertEqual(estimate_cost_usd('test-model-x', 1000, 500), Decimal('0.014000'))
