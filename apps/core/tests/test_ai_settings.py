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
        # + Thrift+ families, QA triage, hiring's careers file (hiring 0002), Social Studio post ideas (marketing 0003),
        # keys (keys 0002), the supply-item fill (supplies 0002), the buying miss review (buying 0042, Dash #78);
        # the supervisor brief left 10-21
        self.assertEqual(AiAction.objects.count(), 22)
        self.assertEqual(AiAction.objects.filter(purpose__in=['THRIFTPLUS_FAMILY', 'QA_TRIAGE']).count(), 2)
        self.assertFalse(AiAction.objects.filter(purpose='SUPERVISOR_BRIEF').exists())
        self.assertFalse(AiAction.objects.filter(model__isnull=False).exclude(purpose__in=[
            'SOCIAL_POST', 'KEYS', 'SUPPLY_FILL',
            # Dash #78: buying volume on Spark, the monthly miss review on Opus 5.5 (buying 0042)
            'KEY_MAPPING', 'CATEGORY_AI', 'TITLE_CATEGORY_ESTIMATE', 'BUYING_MISS_REVIEW',
        ]).exists())
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


class AiModelTestEndpointTests(TestCase):
    def test_one_message_gives_the_answer_time_and_cost_split_in_and_out(self):
        from decimal import Decimal
        from unittest.mock import patch

        from rest_framework.test import APIClient

        from apps.accounts.models import User
        from apps.core.services.ai_usage_log import estimate_cost_usd
        from apps.core.services.llm_router import LLMResult

        boss = User.objects.create_superuser(email='boss-ai@example.com', first_name='B', last_name='O', password='x-pass-123')
        row = AiModel.objects.create(slug='test-model-x', provider='anthropic', input_price=Decimal('4'), output_price=Decimal('20'))
        api = APIClient()
        api.force_authenticate(boss)
        with patch('apps.core.services.llm_router.llm_complete',
                   return_value=LLMResult(text='Hello.', model_used='test-model-x', input_tokens=1000, output_tokens=500)):
            data = api.post(f'/api/core/ai/models/{row.pk}/test/', {'message': 'Hi'}, format='json').json()
        self.assertEqual((data['text'], data['input_cost'], data['output_cost']), ('Hello.', '0.004000', '0.010000'))
        self.assertGreaterEqual(data['seconds'], 0)
        self.assertEqual(estimate_cost_usd('test-model-x', 1000, 500), Decimal('0.014000'))  # usage logs use the same prices
        self.assertEqual(api.post(f'/api/core/ai/models/{row.pk}/test/', {'message': ' '}, format='json').status_code, 400)


class AiPriceCheckTests(TestCase):
    """Settings > AI price check (Dash Update #110). The model call (``ai_prices._ask``) is faked."""

    USED = {'model': 'claude-opus-5-5', 'web_searches': 3, 'web_fetches': 4}

    def setUp(self):
        from decimal import Decimal

        AiModel.objects.all().delete()  # only the models each test makes
        self.blank = AiModel.objects.create(slug='check-blank-x', provider='google')
        self.mine = AiModel.objects.create(slug='check-mine-x', provider='xai', input_price=Decimal('2'), output_price=Decimal('6'))
        self.same = AiModel.objects.create(slug='check-same-x', provider='anthropic', input_price=Decimal('4'), output_price=Decimal('20'))
        self.lost = AiModel.objects.create(slug='check-lost-x', provider='meta', input_price=Decimal('1'), output_price=Decimal('3'))
        AiModel.objects.create(slug='check-old-x', provider='xai', status=AiModel.STATUS_ARCHIVED)
        AiModel.objects.create(slug='check-image-x', provider='xai', modality=AiModel.MODALITY_IMAGE)
        self.owner = make_user('price-owner@example.com', superuser=True)

    @staticmethod
    def _row(slug, inp, out, url='https://provider.example/pricing', verified=True, note=''):
        return {'slug': slug, 'verified': verified, 'input_per_million': inp, 'output_per_million': out,
                'source_url': url, 'note': note}

    def _answer(self):
        return {'prices': [
            self._row('check-blank-x', 0.1, 0.4, 'https://g.example/p'),
            self._row('check-mine-x', 3, 15, 'https://x.example/p'),
            self._row('check-same-x', 4, 20, 'https://a.example/p'),
            self._row('check-lost-x', None, None, '', verified=False, note='Not on the pricing page.'),
        ]}

    def _run(self, answer=None, used=None, **kwargs):
        from apps.core.services import ai_prices

        with mock.patch.object(ai_prices, '_ask', return_value=(answer or self._answer(), used or self.USED)) as ask:
            state = ai_prices.run(**kwargs)
        return state, ask

    def _prices(self, row):
        row.refresh_from_db()
        return row.input_price, row.output_price

    def test_every_model_that_is_not_archived_is_sent_with_our_estimates(self):
        from apps.core.services import ai_prices

        _state, ask = self._run(save_blanks=False)
        sent = ask.call_args.args[0]
        self.assertEqual({m.slug for m in sent}, {'check-blank-x', 'check-mine-x', 'check-same-x', 'check-lost-x'})
        question = ai_prices._question(sent)
        self.assertIn('check-mine-x, provider xai. Our estimate per 1M tokens: input $2, output $6.', question)
        self.assertIn('check-blank-x, provider google. Our estimate per 1M tokens: input not set, output not set.', question)
        self.assertIn('https://ai.google.dev/gemini-api/docs/pricing', question)  # pages to read go in the user message

    def test_refresh_proposes_and_saves_nothing(self):
        from decimal import Decimal

        from apps.core.models import AppSettingHistory

        state, _ask = self._run(save_blanks=False, user=self.owner)
        rows = {r['slug']: r for r in state['results']}
        self.assertEqual(rows['check-blank-x']['verdict'], 'changed')
        self.assertEqual((rows['check-blank-x']['current_input'], rows['check-blank-x']['found_input']), (None, '0.1000'))
        self.assertEqual(rows['check-mine-x']['verdict'], 'changed')
        self.assertEqual((rows['check-mine-x']['found_input'], rows['check-mine-x']['found_output']), ('3.0000', '15.0000'))
        self.assertEqual(rows['check-mine-x']['source_url'], 'https://x.example/p')
        self.assertEqual(rows['check-same-x']['verdict'], 'confirmed')
        self.assertEqual(rows['check-lost-x']['verdict'], 'not_verified')
        self.assertEqual(rows['check-lost-x']['note'], 'Not on the pricing page.')
        self.assertTrue(all(r['saved'] == '' for r in state['results']))
        self.assertEqual(self._prices(self.blank), (None, None))
        self.assertEqual(self._prices(self.mine), (Decimal('2'), Decimal('6')))
        self.assertEqual(state['requested_by'], 'Test User')
        self.assertEqual((state['checker'], state['web_searches'], state['web_fetches']), ('claude-opus-5-5', 3, 4))
        self.assertFalse(AppSettingHistory.objects.filter(key='ai_model_prices').exists())

    def test_the_automatic_run_fills_missing_prices_and_leaves_set_ones_for_review(self):
        from decimal import Decimal

        from apps.core.models import AppSettingHistory

        state, _ask = self._run(save_blanks=True)
        rows = {r['slug']: r for r in state['results']}
        self.assertEqual(self._prices(self.blank), (Decimal('0.1000'), Decimal('0.4000')))
        self.assertEqual(rows['check-blank-x']['saved'], 'auto')
        self.assertEqual(self._prices(self.mine), (Decimal('2'), Decimal('6')))  # a price somebody set waits for review
        self.assertEqual((rows['check-mine-x']['verdict'], rows['check-mine-x']['saved']), ('changed', ''))
        log = AppSettingHistory.objects.get(key='ai_model_prices')
        self.assertIsNone(log.changed_by)
        self.assertEqual(log.old_value, {'check-blank-x': {'input': None, 'output': None}})
        self.assertEqual(log.new_value['check-blank-x'], {
            'input': '0.1000', 'output': '0.4000', 'source': 'https://g.example/p',
            'how': 'price check, filled a missing price'})

    def test_a_price_is_never_used_without_a_source_or_without_the_web(self):
        answer = {'prices': [
            self._row('check-blank-x', 0.1, 0.4, url=''),                       # no source link
            self._row('check-mine-x', 3, 15, url='the pricing page'),           # not a link
            self._row('check-same-x', -4, 20),                                  # not a price
            # check-lost-x is missing from the answer
        ]}
        state, _ask = self._run(answer=answer, save_blanks=True)
        rows = {r['slug']: r for r in state['results']}
        self.assertEqual({r['verdict'] for r in rows.values()}, {'not_verified'})
        self.assertTrue(all(r['found_input'] is None and r['found_output'] is None for r in rows.values()))
        self.assertEqual(rows['check-blank-x']['note'], 'A price came back with no source link, so it was not used.')
        self.assertEqual(rows['check-lost-x']['note'], 'The check did not report on this model.')
        self.assertEqual(self._prices(self.blank), (None, None))

        # The model answered from memory (no search, no page read): nothing counts as verified.
        state, _ask = self._run(used={'model': 'claude-opus-5-5', 'web_searches': 0, 'web_fetches': 0}, save_blanks=True)
        self.assertEqual({r['verdict'] for r in state['results']}, {'not_verified'})
        self.assertEqual(self._prices(self.blank), (None, None))

    def test_a_failed_call_is_kept_as_failed_and_changes_nothing(self):
        from apps.core.services import ai_prices

        with mock.patch.object(ai_prices, '_ask', side_effect=ValueError('The checker did not report prices. Try again.')):
            state = ai_prices.run(save_blanks=True)
        self.assertEqual((state['status'], state['results']), ('failed', []))
        self.assertIn('did not report prices', ai_prices.state()['error'])
        self.assertEqual(self._prices(self.blank), (None, None))

    def test_save_applies_the_reviewed_changes_and_logs_who(self):
        from decimal import Decimal

        from apps.core.models import AppSettingHistory

        self._run(save_blanks=False, user=self.owner)
        api = APIClient()
        api.force_authenticate(self.owner)
        url = '/api/core/ai/models/price-check/apply/'
        self.assertEqual(api.post(url, {'ids': []}, format='json').status_code, 400)
        # The confirmed and the could-not-verify rows are ignored even when asked for.
        resp = api.post(url, {'ids': [self.mine.pk, self.same.pk, self.lost.pk]}, format='json')
        self.assertEqual(resp.status_code, 200)
        rows = {r['slug']: r for r in resp.data['results']}
        self.assertEqual(rows['check-mine-x']['saved'], 'review')
        self.assertEqual(rows['check-blank-x']['saved'], '')  # not picked, so not saved
        self.assertEqual(self._prices(self.mine), (Decimal('3.0000'), Decimal('15.0000')))
        self.assertEqual(self._prices(self.blank), (None, None))
        self.assertEqual(self._prices(self.lost), (Decimal('1'), Decimal('3')))
        self.assertEqual((resp.data['saved']['by'], resp.data['saved']['count']), ('Test User', 1))
        log = AppSettingHistory.objects.get(key='ai_model_prices')
        self.assertEqual(log.changed_by, self.owner)
        self.assertEqual(log.old_value, {'check-mine-x': {'input': '2.0000', 'output': '6.0000'}})
        self.assertEqual(log.new_value, {'check-mine-x': {
            'input': '3.0000', 'output': '15.0000', 'source': 'https://x.example/p', 'how': 'price check, reviewed'}})
        # Saving the same row again does nothing.
        api.post(url, {'ids': [self.mine.pk]}, format='json')
        self.assertEqual(AppSettingHistory.objects.filter(key='ai_model_prices').count(), 1)

    def test_save_skips_a_price_that_changed_after_the_check(self):
        from decimal import Decimal

        from apps.core.services import ai_prices

        self._run(save_blanks=False, user=self.owner)
        AiModel.objects.filter(pk=self.mine.pk).update(input_price=Decimal('2.5'))
        state = ai_prices.apply([self.mine.pk], self.owner)
        row = next(r for r in state['results'] if r['slug'] == 'check-mine-x')
        self.assertTrue(row['stale'])
        self.assertEqual(row['saved'], '')
        self.assertEqual(self._prices(self.mine), (Decimal('2.5000'), Decimal('6')))

    def test_the_buttons_start_the_check_and_update_only_when_a_price_is_missing(self):
        from apps.core.services import ai_prices

        api = APIClient()
        api.force_authenticate(self.owner)
        url = '/api/core/ai/models/price-check/'
        with mock.patch.object(ai_prices.subprocess, 'Popen') as popen:
            resp = api.post(url, {}, format='json')  # Refresh prices
            self.assertEqual((resp.data['status'], resp.data['auto'], resp.data['requested_by']), ('running', False, 'Test User'))
            args = popen.call_args.args[0]
            self.assertEqual(args[-4:], ['check_ai_prices', '--review', '--by', str(self.owner.pk)])
            api.post(url, {}, format='json')  # a second click while it runs starts nothing
            self.assertEqual(popen.call_count, 1)

            self._run(save_blanks=True)  # the run finishes and fills the one missing price
            self.assertFalse(ai_prices.has_blank())
            resp = api.post(url, {'auto': True}, format='json')  # Update: nothing is missing, so no check
            self.assertEqual(resp.data['status'], 'done')
            self.assertEqual(popen.call_count, 1)

            AiModel.objects.create(slug='check-new-x', provider='google')
            resp = api.post(url, {'auto': True}, format='json')  # Update with a new, unpriced model
            self.assertEqual((resp.data['status'], resp.data['auto']), ('running', True))
            self.assertNotIn('--review', popen.call_args.args[0])

    def test_a_check_that_never_finished_is_reported_as_stopped(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.core.services import ai_prices

        ai_prices._save({'status': 'running', 'started_at': (timezone.now() - timedelta(minutes=30)).isoformat(), 'results': []})
        self.assertEqual(ai_prices.state()['status'], 'failed')

    def test_a_price_typed_in_by_hand_is_logged_too(self):
        from apps.core.models import AppSettingHistory

        api = APIClient()
        api.force_authenticate(self.owner)
        resp = api.patch(f'/api/core/ai/models/{self.blank.pk}/', {'input_price': '0.25', 'output_price': '1'}, format='json')
        self.assertEqual(resp.status_code, 200)
        api.patch(f'/api/core/ai/models/{self.blank.pk}/', {'label': 'Blank X'}, format='json')  # not a price change
        log = AppSettingHistory.objects.get(key='ai_model_prices')
        self.assertEqual(log.changed_by, self.owner)
        self.assertEqual(log.new_value['check-blank-x'], {'input': '0.2500', 'output': '1.0000', 'source': '', 'how': 'typed in'})

    def test_the_call_goes_through_the_router_as_opus_high_with_the_web_tools(self):
        from apps.core.services import ai_prices
        from apps.core.services.llm_router import LLMResult

        result = LLMResult(text='', model_used='claude-opus-5-5', tool_input=self._answer(),
                           web_search_requests=2, web_fetch_requests=5)
        with mock.patch('apps.core.services.llm_router.llm_complete', return_value=result) as complete:
            body, used = ai_prices._ask([self.blank, self.mine])
        kwargs = complete.call_args.kwargs
        self.assertEqual((kwargs['model_id'], kwargs['effort']), ('claude-opus-5-5', 'high'))
        self.assertEqual([t['type'] for t in kwargs['server_tools']], ['web_search_20260209', 'web_fetch_20260209'])
        self.assertEqual((kwargs['tool_name'], kwargs['tools'][0]['strict']), ('report_prices', True))
        self.assertEqual(kwargs['log_source'], 'ai_price_check')
        self.assertEqual(used, {'model': 'claude-opus-5-5', 'web_searches': 2, 'web_fetches': 5})
        self.assertEqual(body, self._answer())
        with mock.patch('apps.core.services.llm_router.llm_complete', return_value=LLMResult(text='I could not.', model_used='claude-opus-5-5')):
            with self.assertRaises(ValueError):
                ai_prices._ask([self.blank])
