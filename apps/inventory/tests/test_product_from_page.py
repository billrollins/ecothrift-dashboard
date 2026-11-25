"""Dash Update #224: a new product from a pasted vendor page (services/product_from_page.py). The AI call is stubbed."""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AiAction, AIUsage
from apps.core.services.llm_router import LLMAPIError, LLMResult
from apps.inventory.models import ManifestRow, ProcessingRow, Product, PurchaseOrder, Vendor

URL = '/api/inventory/products/from-page/'
PAGE = ('Home > Health > Feminine care. Tampax Pearl Tampons, Regular Absorbency, Unscented, 3 boxes of 50 count. '
        'Price $14.97. Item 55512345. Customer reviews 4.7 stars. Add to cart. Free pickup today.') * 2
ANSWER = {
    'title': 'Tampax Pearl Tampons Regular Unscented', 'short_name': 'Tampax Pearl Tampons', 'brand': 'Tampax',
    'model': '', 'category': 'Health & beauty', 'subcategory': '', 'retail_estimate': 14.97, 'confidence': 'high',
    'identifiers': {'item_number': '55512345'}, 'specifications': {'Absorbency': 'Regular'},
    'tags': ['tampons', 'feminine care'], 'unit_count': 50, 'unit_name': 'boxes', 'pack_units': 3,
}


def _llm(tool_input):
    return LLMResult(text='', model_used='muse-spark-1.3-contributor', input_tokens=1200, output_tokens=120,
                     tool_input=tool_input)


class ProductFromPageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(email='pg@example.com', first_name='P', last_name='G', password='pw')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=user)
        vendor = Vendor.objects.create(name='Walmart', code='WLMPG')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='PO-PG-1', ordered_date='2026-11-01',
                                          purchase_cost=Decimal('10'), retail_value=Decimal('100'), status='processing')
        mr = ManifestRow.objects.create(purchase_order=po, row_number=1, quantity=2, title='TAMPAX PRL REG 3PK',
                                        brand='Tampax', unit_retail=Decimal('15.98'))
        self.row = ProcessingRow.objects.create(
            purchase_order=po, manifest_row=mr, row_number=1, quantity=2, title='TAMPAX PRL REG 3PK', brand='Tampax',
            model='PRL-REG', unit_retail=Decimal('15.98'), identifiers={'upc': '073010719996'},
        )

    def _post(self, body, answer=None, fail=False):
        call = (mock.Mock(side_effect=LLMAPIError('boom', kind='api', status_code=500)) if fail
                else mock.Mock(return_value=_llm(answer or ANSWER)))
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: call for p in ('anthropic', 'openai', 'xai', 'google', 'meta')}):
            return self.client.post(URL, body, format='json'), call

    def test_the_page_drafts_the_product_and_the_row_fills_the_gaps(self):
        r, call = self._post({'text': PAGE, 'row': self.row.id})
        self.assertEqual(r.status_code, 200, r.data)
        d = r.data['draft']
        self.assertEqual((d['title'], d['brand'], d['retail']), (ANSWER['title'], 'Tampax', '14.97'))
        self.assertEqual((d['unit_count'], d['unit_name'], d['pack_units'], d['pack_label']), (50, 'box', 3, '3 boxes × 50'))
        self.assertEqual(d['model'], 'PRL-REG')                      # the page had none: the row's
        self.assertEqual(r.data['source']['model'], 'row')
        self.assertEqual(r.data['source']['title'], 'page')
        self.assertEqual(d['identifiers'], {'upc': '073010719996', 'item_number': '55512345'})
        # The row went to the AI with the page; nothing was saved.
        sent = call.call_args.kwargs['messages'][0]['content']
        self.assertIn('TAMPAX PRL REG 3PK', sent)
        self.assertFalse(Product.objects.filter(title=ANSWER['title']).exists())
        # Logged under its own Settings > AI action, with model, time and cost on the answer.
        usage = AIUsage.objects.get()
        self.assertEqual((usage.source, usage.purpose, usage.success), ('inventory.product_from_page', 'PRODUCT_FROM_PAGE', True))
        self.assertEqual(r.data['model'], 'muse-spark-1.3-contributor')
        self.assertIn('took_ms', r.data)
        self.assertIn('cost_usd', r.data)

    def test_the_action_is_in_settings_ai(self):
        self.assertTrue(AiAction.objects.filter(purpose='PRODUCT_FROM_PAGE', workspace='Processing').exists())

    def test_no_price_on_the_page_keeps_the_rows_retail(self):
        r, _ = self._post({'text': PAGE, 'row': self.row.id}, answer={**ANSWER, 'retail_estimate': 0})
        self.assertEqual(r.data['draft']['retail'], '15.98')
        self.assertEqual(r.data['source']['retail'], 'row')

    def test_plain_words_when_there_is_nothing_to_read_or_the_ai_fails(self):
        r, call = self._post({'text': 'too short', 'row': self.row.id})
        self.assertEqual(r.status_code, 400)
        self.assertIn('Paste all the text', r.data['detail'])
        call.assert_not_called()
        r, _ = self._post({'text': PAGE}, fail=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn('could not read this page', r.data['detail'])
