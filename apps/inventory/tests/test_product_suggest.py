from django.test import SimpleTestCase, TestCase

from apps.inventory.views import _suggest_product_parse_suggestions_from_text

_SUGGEST_PRODUCT_ALLOWED = {
    'title', 'brand', 'model', 'category', 'tags', 'identifiers', 'specifications',
}


class TestProductSuggestParse(SimpleTestCase):
    def test_parse_basic_fields(self):
        raw = '{"suggestions": {"title": "LEGO Castle", "brand": "LEGO", "model": "10316", "category": "Toys / Building Sets"}}'
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['title', 'brand', 'model', 'category'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['title'], 'LEGO Castle')
        self.assertEqual(out['brand'], 'LEGO')
        self.assertEqual(out['model'], '10316')
        self.assertEqual(out['category'], 'Toys / Building Sets')

    def test_parse_tags_identifiers_specifications(self):
        raw = (
            '{"suggestions": {"tags": ["vintage", "ceramic"], '
            '"identifiers": {"upc": "123"}, "specifications": {"color": "blue"}}}'
        )
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['tags', 'identifiers', 'specifications'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['tags'], ['vintage', 'ceramic'])
        self.assertEqual(out['identifiers'], {'upc': '123'})
        self.assertEqual(out['specifications'], {'color': 'blue'})

    def test_parse_invalid_json_returns_none(self):
        out, parsed = _suggest_product_parse_suggestions_from_text(
            'not json at all', ['title'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNone(out)
        self.assertIsNone(parsed)

    def test_parse_strips_markdown_fence(self):
        raw = '```json\n{"suggestions": {"title": "Glass Vase"}}\n```'
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['title'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['title'], 'Glass Vase')


class TestProductSuggestRequest(SimpleTestCase):
    """The "AI request" box (Dash Update #230): the staff member's own words steer Suggest and Duplicate."""

    def test_no_request_adds_nothing(self):
        from apps.inventory.views import suggest_product_request_rules

        self.assertEqual(suggest_product_request_rules('', False), '')
        self.assertEqual(suggest_product_request_rules('   ', True), '')

    def test_a_request_is_followed_and_a_copy_gets_the_copy_rule(self):
        from apps.inventory.views import (
            SUGGEST_PRODUCT_DUPLICATE_RULE,
            SUGGEST_PRODUCT_REQUEST_RULE,
            suggest_product_request_rules,
        )

        self.assertEqual(suggest_product_request_rules('the 12-pack', False), SUGGEST_PRODUCT_REQUEST_RULE)
        both = suggest_product_request_rules('the 12-pack in blue', True)
        self.assertEqual(both, SUGGEST_PRODUCT_REQUEST_RULE + SUGGEST_PRODUCT_DUPLICATE_RULE)
        self.assertIn('staff_request', both)
        self.assertIn('COPY', both)


class TestProductSuggestRequestApi(TestCase):
    URL = '/api/inventory/products/suggest/'

    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Group
        from rest_framework.test import APIClient

        self.client = APIClient()
        user = get_user_model().objects.create_user(email='sg@example.com', first_name='S', last_name='G', password='pw')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=user)

    def _post(self, body):
        from unittest import mock

        from apps.core.services.llm_router import LLMResult

        answer = LLMResult(text='{"suggestions": {"title": "Energizer MAX AA Batteries 12-Pack"}}',
                           model_used='muse-spark-1.3-contributor', input_tokens=900, output_tokens=40)
        call = mock.Mock(return_value=answer)
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: call for p in ('anthropic', 'openai', 'xai', 'google', 'meta')}), \
                mock.patch('apps.core.services.llm_router.resolve_api_key', return_value='test-key'):
            r = self.client.post(self.URL, body, format='json')
        return r, call

    def _sent(self, call):
        import json

        kwargs = call.call_args.kwargs
        content = kwargs['messages'][-1]['content']
        text = content if isinstance(content, str) else ''.join(b.get('text', '') for b in content)
        return kwargs['system'], json.loads(text)

    def test_the_request_goes_to_the_ai_in_the_staff_members_words(self):
        body = {'fields': ['title'], 'context': {'title': 'Energizer MAX AA Batteries 8-Pack', 'brand': 'Energizer'},
                'instruction': 'this is the 12-pack'}
        r, call = self._post(body)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['suggestions']['title'], 'Energizer MAX AA Batteries 12-Pack')
        system, sent = self._sent(call)
        self.assertEqual(sent['staff_request'], 'this is the 12-pack')
        self.assertNotIn('mode', sent)
        self.assertIn('staff_request', system)
        self.assertNotIn('COPY', system)

    def test_duplicate_with_a_request_says_the_draft_is_a_copy(self):
        body = {'fields': ['title'], 'context': {'title': 'Energizer MAX AA Batteries 8-Pack'},
                'instruction': 'the 12-pack', 'duplicate': True}
        r, call = self._post(body)
        self.assertEqual(r.status_code, 200, r.data)
        system, sent = self._sent(call)
        self.assertEqual(sent['mode'], 'duplicate')
        self.assertIn('COPY', system)

    def test_without_a_request_the_call_is_as_before(self):
        r, call = self._post({'fields': ['title'], 'context': {'title': 'Glass Vase'}, 'duplicate': True})
        self.assertEqual(r.status_code, 200, r.data)
        system, sent = self._sent(call)
        self.assertNotIn('staff_request', sent)
        self.assertNotIn('mode', sent)              # a copy with no words is the plain copy: nothing to tell the AI
        self.assertNotIn('staff_request', system)
