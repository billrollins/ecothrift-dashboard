"""Add item > Clean up with AI (Dash Updates #96): dump anything, one button; typed boxes win; the AI call is stubbed."""
import io
import json
from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.core.models import AIUsage
from apps.core.services.llm_router import LLMAPIError
from apps.inventory.models import ItemCheckIn, Product
from apps.inventory.tests.test_add_item import API, AddItemBase, _llm

SPARK = 'muse-spark-1.3-contributor'


def _photo(n: int) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new('RGB', (800, 600), (20, 30, 200)).save(buf, format='JPEG')
    return SimpleUploadedFile(f'p{n}.jpg', buf.getvalue(), content_type='image/jpeg')


class CleanUpTests(AddItemBase):
    answer = {'title': 'Keurig K-Mini Single Serve Coffee Maker', 'short_name': 'Keurig K-Mini Coffee Maker',
              'brand': 'Keurig', 'model': 'K-Mini', 'category': 'Kitchen & dining', 'subcategory': 'Small appliances',
              'upc': '611247373064', 'condition': 'like_new', 'tags': ['coffee', 'single serve', 'pod'],
              'identifiers': {'upc': '611247373064', 'mpn': '5000200237'},
              'specifications': {'Capacity': '6-12 oz', 'Color': 'Black'},
              'price': 18, 'retail_estimate': 89.99, 'confidence': 'high'}

    def _clean(self, payload, answer=None, photos=None, fail=False):
        call = (mock.Mock(side_effect=LLMAPIError('boom', kind='api', status_code=500)) if fail
                else mock.Mock(return_value=_llm(answer or self.answer, model=SPARK)))
        body = {'payload': json.dumps(payload)}
        if photos:
            body['photos'] = photos
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: call for p in ('anthropic', 'xai', 'google', 'meta')}):
            r = self.client.post(API + 'clean-up/', body, format='multipart')
        return r, call

    def test_a_dump_fills_every_box_and_the_call_is_logged(self):
        r, call = self._clean({'text': 'Keurig K-Mini coffee maker, open box, black. UPC 611247373064'})
        self.assertEqual(r.status_code, 200, r.data)
        v = r.data['values']
        self.assertEqual((v['title'], v['brand'], v['category'], v['subcategory'], v['condition']),
                         (self.answer['title'], 'Keurig', 'Kitchen & dining', 'Small appliances', 'like_new'))
        self.assertEqual(v['retail_estimate'], Decimal('89.99'))
        self.assertEqual(v['specifications'], {'Capacity': '6-12 oz', 'Color': 'Black'})
        self.assertIn('title', r.data['filled'])
        self.assertEqual(r.data['problems'], [])
        self.assertEqual(call.call_args.kwargs['model_id'], SPARK)       # Spark when Settings > AI has none picked
        usage = AIUsage.objects.get()
        self.assertEqual((usage.source, usage.purpose, usage.success), ('inventory.add_item_ai', 'SUGGEST_PRODUCT', True))

    def test_what_a_person_typed_always_wins(self):
        typed = {'title': 'My Coffee Thing', 'brand': 'Keurig', 'condition': 'fair', 'price': '7.50',
                 'specifications': {'color': 'Red'}, 'tags': 'kitchen'}
        r, call = self._clean({'text': 'keurig mini', 'typed': typed})
        v, filled = r.data['values'], r.data['filled']
        self.assertEqual((v['title'], v['brand'], v['condition'], v['price'], v['tags']),
                         ('My Coffee Thing', 'Keurig', 'fair', Decimal('7.50'), ['kitchen']))
        self.assertEqual(v['specifications'], {'color': 'Red', 'Capacity': '6-12 oz'})   # Color was typed (any case)
        for f in ('title', 'brand', 'condition', 'price', 'tags'):
            self.assertNotIn(f, filled)
        self.assertIn('specifications', filled)                                         # added to, not replaced
        self.assertIn('model', filled)
        sent = json.loads(call.call_args.kwargs['messages'][0]['content'][0]['text'])
        self.assertEqual(sent['already_filled']['title'], 'My Coffee Thing')             # the AI is told, too

    def test_a_typed_category_keeps_the_ai_subcategory_only_when_it_belongs(self):
        r, _ = self._clean({'text': 'x', 'typed': {'category': 'Tools & hardware'}})
        self.assertEqual((r.data['values']['category'], r.data['values']['subcategory']), ('Tools & hardware', ''))
        self.assertNotIn('subcategory', r.data['filled'])

    def test_the_ai_price_leads_and_our_sales_fill_in_when_it_cannot_tell(self):
        blender = {**self.answer, 'title': 'Ninja Professional Blender 1000W', 'price': 60}
        r, _ = self._clean({'text': 'ninja professional blender 1000w'}, answer=blender)
        self.assertEqual((r.data['values']['price'], r.data['price_from']), (Decimal('60.00'), 'the AI'))
        r, _ = self._clean({'text': 'ninja professional blender 1000w'}, answer={**blender, 'price': 0})
        self.assertIsNotNone(r.data['values']['price'])
        self.assertIn('price', r.data['filled'])
        self.assertTrue(r.data['price_from'].startswith('our sales'), r.data['price_from'])

    def test_nothing_to_go_on_is_refused_kindly_and_no_ai_call_is_made(self):
        r, call = self._clean({'text': '   ', 'typed': {'title': '', 'tags': []}})
        self.assertEqual(r.status_code, 400)
        self.assertIn('something to go on', r.data['detail'])
        call.assert_not_called()
        self.assertFalse(AIUsage.objects.exists())

    def test_a_failed_call_leaves_the_form_usable_and_is_logged(self):
        r, _ = self._clean({'text': 'keurig mini'}, fail=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn('as you left them', r.data['detail'])
        self.assertFalse(AIUsage.objects.get().success)
        c = self.post({'new_product': {'title': 'Keurig K-Mini', 'brand': 'Keurig', 'category': 'Kitchen & dining',
                                       'subcategory': 'Small appliances', 'how': 'typed', 'source_text': 'keurig mini'},
                       'destination': 'floor', 'price': '12.00'})
        self.assertEqual(c.status_code, 201, c.data)                 # the boxes still check in by hand

    def test_made_up_names_are_dropped(self):
        r, _ = self._clean({'text': 'thing'}, answer={**self.answer, 'category': 'Coffee', 'condition': 'mint',
                                                     'upc': '12', 'brand': 'generic'})
        v = r.data['values']
        self.assertEqual((v['category'], v['subcategory'], v['condition'], v['upc'], v['brand']),
                         ('', '', '', '', 'Generic'))
        self.assertIn('Pick a category.', r.data['problems'])

    def test_photos_go_to_the_model_and_all_are_kept_at_check_in(self):
        r, call = self._clean({'text': 'one line'}, photos=[_photo(1), _photo(2)])
        self.assertEqual(r.status_code, 200, r.data)
        sent = call.call_args.kwargs['messages'][0]['content']
        self.assertEqual([b['type'] for b in sent], ['text', 'image', 'image'])

        v = r.data['values']
        new = {'title': v['title'], 'brand': v['brand'], 'model': v['model'], 'category': v['category'],
               'subcategory': v['subcategory'], 'tags': v['tags'], 'identifiers': v['identifiers'],
               'specifications': v['specifications'], 'how': 'ai', 'source_text': 'one line',
               'ai': {'model': r.data['model'], 'draft': {'title': v['title'], 'brand': v['brand']}}}
        payload = {'new_product': new, 'destination': 'floor', 'price': '20.00', 'condition': 'like_new'}
        with mock.patch('django.db.models.fields.files.FieldFile.save', autospec=True), \
                mock.patch('django.core.files.storage.default_storage.save', return_value='inventory/x.jpg') as extra:
            c = self.client.post(API + 'check-in/', {'payload': json.dumps(payload), 'photos': [_photo(1), _photo(2)]},
                                 format='multipart')
        self.assertEqual(c.status_code, 201, c.data)
        self.assertEqual(extra.call_count, 1)                          # the second photo, kept
        product = Product.objects.get(pk=c.data['product_id'])
        self.assertEqual(product.specifications, {'Capacity': '6-12 oz', 'Color': 'Black'})
        self.assertEqual(product.identifiers.get('mpn'), '5000200237')
        self.assertIn('coffee', product.tags)
        self.assertEqual(product.profile.field_meta['display_title']['source'], f'ai:{SPARK}')
        snap = ItemCheckIn.objects.get(pk=c.data['item_check_in_id']).defaults_snapshot['add_item']
        self.assertEqual((snap['source_text'], snap['more_photos']), ('one line', ['inventory/x.jpg']))
