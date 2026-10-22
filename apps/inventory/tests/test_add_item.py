"""Add item (Misfit items from Find item): find, price, copy similar, AI fill, check-in, restoration, filter, who."""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AIUsage
from apps.core.services.llm_router import LLMAPIError, LLMResult
from apps.inventory.models import (
    Category, Item, ItemCheckIn, ItemNote, Product, ProductProfile, PurchaseOrder, RestorationJob, Vendor,
)
from apps.inventory.services import add_item, inventory_search
from apps.inventory.services.misfit import is_misfit_order, misfit_order

API = '/api/inventory/add-item/'


def _user(email, role=None):
    user = get_user_model().objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='Tester',
                                                password='pw')
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


class AddItemBase(TestCase):
    def setUp(self):
        self.cat = Category.objects.get_or_create(name='Appliances', defaults={'slug': 'appliances-ai'})[0]
        self.staff = _user('dana@example.com', 'Employee')
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)
        with self.captureOnCommitCallbacks(execute=True):
            self.blender = Product.objects.create(title='Ninja Professional Blender 1000W', brand='Ninja', model='BL610',
                                                  category=self.cat, identifiers={'upc': '622356530927'})
            ProductProfile.objects.create(product=self.blender, short_name='Ninja Blender 1000W', brand='Ninja',
                                          category='Kitchen & dining', subcategory='Small appliances')
            self.boot = Product.objects.create(title='Silicone Base Boot for Ninja Blender', brand='Kyrgeu',
                                               category=self.cat)
            self.cup = Product.objects.create(title='Ninja Blender Cup 16oz', brand='Ninja', category=self.cat)
            self.toaster = Product.objects.create(title='Hamilton Beach 2-Slice Toaster', brand='Hamilton Beach',
                                                  category=self.cat)
        now = timezone.now()
        self.tag = Item.objects.create(product=self.blender, sku='ITMAI0001', price=Decimal('30.00'), retail=Decimal('99.99'),
                                       status='on_shelf')
        for n, sold in enumerate(('25.00', '35.00', '40.00'), start=2):
            Item.objects.create(product=self.blender, sku=f'ITMAI000{n}', price=Decimal(sold), status='sold',
                                sold_for=Decimal(sold), sold_at=now, retail=Decimal('99.99'))
        Item.objects.create(product=self.cup, sku='ITMAI0010', price=Decimal('6.00'), status='sold',
                            sold_for=Decimal('6.00'), sold_at=now)
        Item.objects.create(product=self.toaster, sku='ITMAI0011', price=Decimal('12.00'), status='sold',
                            sold_for=Decimal('12.00'), sold_at=now)
        Item.objects.create(product=self.toaster, sku='ITMAI0012', price=Decimal('14.00'), status='sold',
                            sold_for=Decimal('14.00'), sold_at=now)

    def post(self, payload, **kw):
        return self.client.post(API + 'check-in/', payload, format='json', **kw)


class FindTests(AddItemBase):
    def test_identifiers_come_first_scanned_or_typed(self):
        for q, kind in (('ITMAI0001', 'tag'), ('itmai0001', 'tag'), ('622356530927', 'barcode'),
                        ('0622356530927', 'barcode'), ('BL610', 'model')):
            top = add_item.find(q)['results'][0]
            self.assertEqual((top['product_id'], top['match']), (self.blender.pk, kind), q)
        self.assertEqual(add_item.find('ITMAI0001')['results'][0]['matched_sku'], 'ITMAI0001')
        number = Product.objects.get(pk=self.blender.pk).product_number
        if number:
            self.assertEqual(add_item.find(number)['results'][0]['match'], 'product_number')

    def test_words_rank_what_the_product_is_over_accessories_and_carry_the_numbers(self):
        r = add_item.find('ninja blender')
        ids = [x['product_id'] for x in r['results']]
        # The words as typed lead; then the product that holds both words in its name (and sold 3); a boot "for" a
        # Ninja blender is a boot, so it comes last.
        self.assertEqual(ids, [self.cup.pk, self.blender.pk, self.boot.pk])
        with self.captureOnCommitCallbacks(execute=True):   # the same name: what sold more comes first
            big = Product.objects.create(title='Ninja Blender Cup 24oz', brand='Ninja', category=self.cat)
        for n in range(3):
            Item.objects.create(product=big, sku=f'ITMAB{n:04d}', price=Decimal('7'), status='sold',
                                sold_for=Decimal('7'), sold_at=timezone.now())
        self.assertEqual([x['product_id'] for x in add_item.find('ninja blender cup')['results']], [big.pk, self.cup.pk])
        top = next(x for x in r['results'] if x['product_id'] == self.blender.pk)
        self.assertEqual((top['short_name'], top['sold'], top['on_shelf'], top['typical_price'], top['typical_retail']),
                         ('Ninja Blender 1000W', 3, 1, Decimal('35.00'), Decimal('99.99')))
        self.assertEqual(top['typical_price_from'], 'sold')
        self.assertIn('photo_url', top)
        self.assertIsInstance(r['took_ms'], int)

    def test_a_search_is_a_handful_of_indexed_queries(self):
        add_item.find('ninja blender')
        with self.assertNumQueries(5):   # words (trigram index), counts, products with profiles, medians, photos
            add_item.find('ninja blender')
        with self.assertNumQueries(8):   # a scanned tag: tag, product number, identifiers, model; no word search
            add_item.find('ITMAI0001')

    def test_short_words_and_misspellings(self):
        self.assertEqual(add_item.find('ni')['results'], [])          # too short for the index: type more
        ids = [x['product_id'] for x in add_item.find('ninja 16oz cup')['results']]
        self.assertEqual(ids, [self.cup.pk])
        close = add_item.find('hamiltn toaster')
        self.assertTrue(close['fuzzy'])
        self.assertEqual(close['results'][0]['product_id'], self.toaster.pk)

    def test_the_api_is_staff_only(self):
        self.assertEqual(self.client.get(API + 'find/', {'q': 'ninja'}).status_code, 200)
        outsider = APIClient()
        outsider.force_authenticate(user=_user('shopper@example.com', 'Customer'))
        for path in ('find/?q=ninja', 'price/?product=1', 'taxonomy/'):
            self.assertEqual(outsider.get(API + path).status_code, 403, path)
        self.assertEqual(outsider.post(API + 'check-in/', {}, format='json').status_code, 403)
        self.assertEqual(outsider.post(API + 'ai-fill/', {'title': 'x'}, format='json').status_code, 403)
        self.assertEqual(APIClient().get(API + 'find/', {'q': 'ninja'}).status_code, 401)


class PriceTests(AddItemBase):
    def test_own_sales_first_then_similar_items(self):
        own = add_item.suggest_price(product_id=self.blender.pk)
        self.assertEqual((own['price'], own['basis'], own['sold_count'], own['method']),
                         (Decimal('35.00'), 'this product', 3, 'own'))
        similar = add_item.suggest_price(title='Hamilton Beach Toaster 2 Slice')
        self.assertEqual((similar['price'], similar['basis'], similar['method']), (Decimal('13.00'), 'similar items', 'title'))
        self.assertEqual(similar['comps'][0]['product_id'], self.toaster.pk)
        self.assertIsNone(add_item.suggest_price(title='zz')['price'])
        r = self.client.get(API + 'price/', {'product': self.blender.pk})
        self.assertEqual(r.data['price'], Decimal('35.00'))


class CheckInTests(AddItemBase):
    def test_floor_check_in_is_a_misfit_on_the_year_misfit_order_with_who_and_when(self):
        r = self.post({'product_id': self.blender.pk, 'quantity': 2, 'condition': 'good', 'destination': 'floor',
                       'price': '32.00', 'retail': '99.99'})
        self.assertEqual(r.status_code, 201, r.data)
        order = PurchaseOrder.objects.get(pk=r.data['purchase_order_id'])
        self.assertEqual(order.order_number, f'MISFIT-{timezone.localdate().year}')
        self.assertTrue(is_misfit_order(order))
        self.assertEqual(order.vendor.code, 'MIS')
        items = Item.objects.filter(pk__in=r.data['created_item_ids'])
        self.assertEqual(items.count(), 2)
        for item in items:
            self.assertEqual((item.source, item.status, item.location, item.price, item.checked_in_by_id),
                             ('misfit', 'on_shelf', 'on_shelf', Decimal('32.00'), self.staff.pk))
            self.assertIsNotNone(item.checked_in_at)
            self.assertIsNone(item.cost)            # no purchase: no cost (unknown, not $0)
        self.assertEqual(len(r.data['printed_items_preview']), 2)   # the tags print the Processing way
        snap = ItemCheckIn.objects.get(pk=r.data['item_check_in_id']).defaults_snapshot
        self.assertEqual(snap['add_item'], {'product': 'existing', 'destination': 'floor'})
        # the same order next time
        again = self.post({'product_id': self.blender.pk, 'destination': 'back_stock', 'price': '30', 'retail': '99.99'})
        self.assertEqual(again.data['purchase_order_id'], order.pk)
        self.assertEqual(Item.objects.get(pk=again.data['created_item_ids'][0]).location, 'back_storage')

    def test_price_and_destination_are_required(self):
        self.assertIn('price', self.post({'product_id': self.blender.pk, 'destination': 'floor'}).data['detail'])
        self.assertEqual(self.post({'product_id': self.blender.pk, 'destination': 'shelf', 'price': '1'}).status_code, 400)
        self.assertEqual(self.post({'destination': 'floor', 'price': '1'}).status_code, 400)
        self.assertFalse(Item.objects.filter(source='misfit').exists())

    def test_the_retail_check_stops_it_and_nothing_is_kept_until_answered(self):
        payload = {'product_id': self.blender.pk, 'destination': 'floor', 'price': '30.00', 'retail': '900.00'}
        r = self.post(payload)
        self.assertEqual((r.status_code, r.data['code']), (409, 'retail_check'))
        self.assertFalse(Item.objects.filter(source='misfit').exists())
        self.assertFalse(PurchaseOrder.objects.filter(order_number__startswith='MISFIT-').exists())   # not even the order
        fixed = self.post({**payload, 'retail_check': 'fix', 'retail': '99.00'})
        self.assertEqual(fixed.status_code, 201)
        item = Item.objects.get(pk=fixed.data['created_item_ids'][0])
        self.assertEqual((item.retail, item.retail_check), (Decimal('99.00'), 'passed'))   # the new figure passes

    def test_an_ai_retail_is_an_estimate_and_is_asked_about(self):
        payload = {'product_id': self.toaster.pk, 'destination': 'floor', 'price': '12.00', 'retail': '29.99',
                   'retail_source': 'estimate'}
        r = self.post(payload)
        self.assertEqual(r.status_code, 409)
        self.assertIn('estimate', ' '.join(r.data['reasons']))
        ok = self.post({**payload, 'retail_check': 'confirm'})
        item = Item.objects.get(pk=ok.data['created_item_ids'][0])
        self.assertEqual((item.retail_source, item.retail_check), ('estimate', 'confirmed'))
        typed = self.post({**payload, 'retail_source': 'typed'})
        self.assertEqual(Item.objects.get(pk=typed.data['created_item_ids'][0]).retail_source, 'typed')

    def test_restoration_needs_its_estimates_and_lands_in_the_queue(self):
        base = {'product_id': self.blender.pk, 'destination': 'restoration', 'price': '30.00', 'retail': '99.99'}
        self.assertIn('work', self.post(base).data['detail'])
        self.assertIn('hours', self.post({**base, 'restoration': {'work': ['repair']}}).data['detail'])
        self.assertIn('worth', self.post({**base, 'restoration': {'work': ['repair'], 'hours': '2'}}).data['detail'])
        self.assertIn('one item', self.post({**base, 'quantity': 2, 'restoration': {
            'work': ['repair'], 'hours': '2', 'value_after': '60'}}).data['detail'])
        self.assertFalse(RestorationJob.objects.exists())
        r = self.post({**base, 'restoration': {'work': ['test', 'repair', 'paint'], 'parts_cost': '15',
                                               'value_after': '60'}})
        self.assertEqual(r.status_code, 201, r.data)
        job = RestorationJob.objects.get(pk=r.data['restoration_job_id'])
        self.assertEqual(job.stage, RestorationJob.STAGE_QUEUED)
        self.assertEqual(job.queue_note, 'Estimate: test, repair · parts $15.00 · worth $60.00 after')
        snap = job.item_check_in.defaults_snapshot['restoration_estimate']
        self.assertEqual((snap['work'], snap['hours'], snap['parts_cost'], snap['value_after']),
                         (['test', 'repair'], None, '15.00', '60.00'))
        item = Item.objects.get(pk=r.data['created_item_ids'][0])
        self.assertEqual((item.source, item.location), ('misfit', 'restoration'))
        self.assertTrue(ItemNote.objects.filter(item=item, surface='queue', body=job.queue_note).exists())
        hours = self.post({**base, 'restoration': {'work': ['assemble'], 'hours': '1.5', 'value_after': '80'}})
        self.assertEqual(RestorationJob.objects.get(pk=hours.data['restoration_job_id']).queue_note,
                         'Estimate: assemble · about 1.5 h · worth $80.00 after')


class NewProductTests(AddItemBase):
    def test_copy_similar_makes_a_new_product_with_the_edits(self):
        r = self.post({'new_product': {'title': 'Ninja Professional Blender 1500W', 'brand': 'Ninja', 'model': 'BL710',
                                       'category': 'Kitchen & dining', 'subcategory': 'Small appliances',
                                       'how': 'copy', 'copied_from': self.blender.pk},
                       'destination': 'floor', 'price': '35.00', 'retail': '119.99'})
        self.assertEqual(r.status_code, 201, r.data)
        product = Product.objects.get(pk=r.data['product_id'])
        self.assertNotEqual(product.pk, self.blender.pk)
        self.assertEqual((product.title, product.brand, product.model, product.category.name),
                         ('Ninja Professional Blender 1500W', 'Ninja', 'BL710', 'Kitchen & dining'))
        profile = product.profile
        self.assertEqual((profile.category, profile.subcategory, profile.field_meta['category']['source']),
                         ('Kitchen & dining', 'Small appliances', 'human'))
        snap = ItemCheckIn.objects.get(pk=r.data['item_check_in_id']).defaults_snapshot['add_item']
        self.assertEqual((snap['product'], snap['how'], snap['copied_from']), ('new', 'copy', self.blender.pk))
        # The same product again is found, not made twice.
        again = self.post({'new_product': {'title': 'Ninja Professional Blender 1500W', 'brand': 'Ninja', 'model': 'BL710',
                                           'category': 'Kitchen & dining', 'subcategory': 'Small appliances'},
                           'destination': 'floor', 'price': '35.00', 'retail': '119.99'})
        self.assertEqual(again.data['product_id'], product.pk)

    def test_the_taxonomy_is_exact(self):
        bad = {'title': 'Thing', 'brand': 'X', 'category': 'Kitchen stuff', 'subcategory': ''}
        r = self.post({'new_product': bad, 'destination': 'floor', 'price': '1'})
        self.assertIn('category', r.data['detail'])
        r = self.post({'new_product': {**bad, 'category': 'Appliances', 'subcategory': 'Blenders'},
                       'destination': 'floor', 'price': '1'})
        self.assertIn('not a subcategory', r.data['detail'])
        self.assertFalse(Product.objects.filter(title='Thing').exists())
        cats = self.client.get(API + 'taxonomy/').data['categories']
        self.assertIn('Small appliances', next(c for c in cats if c['name'] == 'Kitchen & dining')['subcategories'])


def _llm(tool_input, model='claude-test'):
    return LLMResult(text='', model_used=model, input_tokens=900, output_tokens=80, tool_input=tool_input)


class AiFillTests(AddItemBase):
    draft = {'title': 'Keurig K-Mini Single Serve Coffee Maker', 'short_name': 'Keurig K-Mini Coffee Maker',
             'brand': 'Keurig', 'model': 'K-Mini', 'category': 'Kitchen & dining', 'subcategory': 'Small appliances',
             'retail_estimate': 89.99, 'confidence': 'high'}

    def _fill(self, tool_input, **data):
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: mock.Mock(return_value=_llm(tool_input)) for p in ('anthropic', 'xai', 'google', 'meta')}) as calls:
            r = self.client.post(API + 'ai-fill/', {'title': 'keurig mini coffee', **data}, format='json')
        return r, calls

    def test_the_ai_drafts_in_our_taxonomy_and_is_logged_as_the_feature(self):
        r, _ = self._fill(self.draft)
        self.assertEqual(r.status_code, 200, r.data)
        d = r.data['draft']
        self.assertEqual((d['title'], d['brand'], d['category'], d['subcategory'], d['retail_estimate']),
                         (self.draft['title'], 'Keurig', 'Kitchen & dining', 'Small appliances', Decimal('89.99')))
        self.assertEqual(r.data['problems'], [])
        usage = AIUsage.objects.get()
        self.assertEqual((usage.source, usage.purpose, usage.success), ('inventory.add_item_ai', 'SUGGEST_PRODUCT', True))

    def test_a_made_up_category_is_never_kept(self):
        r, _ = self._fill({**self.draft, 'category': 'Coffee Makers', 'subcategory': 'Pods'})
        self.assertEqual((r.data['draft']['category'], r.data['draft']['subcategory']), ('', ''))
        self.assertIn('Pick a category.', r.data['problems'])
        r, _ = self._fill({**self.draft, 'subcategory': 'Pods', 'retail_estimate': 0})
        self.assertEqual((r.data['draft']['subcategory'], r.data['draft']['retail_estimate']), ('', None))

    def test_a_failed_call_is_logged_and_said_plainly(self):
        failing = mock.Mock(side_effect=LLMAPIError('boom', kind='api', status_code=500))
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: failing for p in ('anthropic', 'xai', 'google', 'meta')}):
            r = self.client.post(API + 'ai-fill/', {'title': 'keurig'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('by hand', r.data['detail'])
        self.assertFalse(AIUsage.objects.get().success)

    def test_the_photo_goes_to_the_model_and_then_onto_the_new_product(self):
        import io

        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile

        buf = io.BytesIO()
        Image.new('RGB', (1600, 1200), (200, 30, 30)).save(buf, format='JPEG')
        photo = lambda: SimpleUploadedFile('k.jpg', buf.getvalue(), content_type='image/jpeg')  # noqa: E731
        with mock.patch('apps.core.services.llm_router._PROVIDER_CALLS',
                        {p: mock.Mock(return_value=_llm(self.draft)) for p in ('anthropic', 'xai', 'google', 'meta')}) as calls:
            r = self.client.post(API + 'ai-fill/', {'title': '', 'photo': photo()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        sent = [c for c in calls.values() if c.called][0].call_args.kwargs['messages'][0]['content']
        self.assertEqual(sent[1]['type'], 'image')
        import json

        new = {'title': r.data['draft']['title'], 'brand': 'Keurig', 'model': 'K-Mini', 'category': 'Kitchen & dining',
               'subcategory': 'Small appliances', 'retail_estimate': '89.99', 'short_name': 'Keurig K-Mini',
               'how': 'ai', 'ai': {'model': 'claude-test', 'draft': self.draft}}   # the draft's retail is a number
        payload = {'new_product': new, 'destination': 'floor', 'price': '20.00', 'retail': '89.99',
                   'retail_source': 'estimate', 'retail_check': 'confirm'}
        with mock.patch('django.db.models.fields.files.FieldFile.save', autospec=True) as save:
            c = self.client.post(API + 'check-in/', {'payload': json.dumps(payload), 'photo': photo()}, format='multipart')
        self.assertEqual(c.status_code, 201, c.data)
        self.assertEqual(save.call_count, 2)            # the photo and its thumbnail
        profile = Product.objects.get(pk=c.data['product_id']).profile
        self.assertEqual(profile.field_meta['brand']['source'], 'ai:claude-test')      # kept as the AI wrote it
        self.assertEqual(profile.field_meta['short_name']['source'], 'human')          # the person changed it
        self.assertEqual(profile.retail_estimate, Decimal('89.99'))
        self.assertEqual(profile.field_meta['retail_estimate']['source'], 'ai:claude-test')


class MisfitFilterTests(AddItemBase):
    def test_find_item_filters_to_misfits_including_the_old_catch_alls(self):
        r = self.post({'product_id': self.cup.pk, 'destination': 'floor', 'price': '6.00', 'retail': '19.99'})
        self.assertEqual(r.status_code, 201)
        old = PurchaseOrder.objects.create(vendor=Vendor.objects.get(code='MIS'), order_number='MISFIT-V2-2025',
                                           ordered_date='2025-08-01', status='complete')
        Item.objects.create(product=self.toaster, sku='ITMAI0099', price=Decimal('9.00'), status='on_shelf',
                            purchase_order=old)
        everything = {x['product_id'] for x in inventory_search.search('', page_size=50)['results']}
        self.assertIn(self.blender.pk, everything)
        misfits = {x['product_id'] for x in inventory_search.search('', misfit=True)['results']}
        self.assertEqual(misfits, {self.cup.pk, self.toaster.pk})
        self.assertEqual([x['product_id'] for x in inventory_search.search('ninja', misfit=True)['results']], [self.cup.pk])
        api = self.client.get('/api/inventory/search/', {'misfit': 1, 'q': 'toaster'}).data['results']
        self.assertEqual([x['product_id'] for x in api], [self.toaster.pk])
        items = inventory_search.product_items(self.cup.pk)['items']
        mine = next(i for i in items if i['id'] == r.data['created_item_ids'][0])
        self.assertEqual((mine['misfit'], mine['source'], mine['checked_in_by']), (True, 'misfit', 'Dana Tester'))
        self.assertFalse(next(i for i in items if i['sku'] == 'ITMAI0010')['misfit'])

    def test_pr_fixit_quick_adds_with_no_order_are_misfits_too(self):
        with self.captureOnCommitCallbacks(execute=True):
            found = Product.objects.create(title='Brass Floor Lamp', brand='Generic', category=self.cat)
            house = Product.objects.create(title='Brass Desk Lamp', brand='Generic', category=self.cat)
        Item.objects.create(product=found, sku='ITMAI0200', price=Decimal('15.00'), status='on_shelf', source='misc',
                            notes='INVENTORY_COUNT_QUICK_ADD')
        po = PurchaseOrder.objects.create(vendor=Vendor.objects.create(code='HSE', name='House'), order_number='HSE-1',
                                          ordered_date='2026-10-01', status='complete')
        Item.objects.create(product=house, sku='ITMAI0201', price=Decimal('9.00'), status='on_shelf', source='misc',
                            purchase_order=po)    # misc on a real order is not a Misfit
        self.assertEqual([x['product_id'] for x in inventory_search.search('brass lamp', misfit=True)['results']],
                         [found.pk])
        self.assertEqual(len(inventory_search.search('brass lamp')['results']), 2)
        self.assertTrue(inventory_search.product_items(found.pk)['items'][0]['misfit'])
        self.assertFalse(inventory_search.product_items(house.pk)['items'][0]['misfit'])

    def test_misfit_order_is_made_once_per_year(self):
        a = misfit_order(timezone.localdate())
        self.assertEqual(misfit_order(timezone.localdate()).pk, a.pk)
        nxt = misfit_order(timezone.localdate().replace(year=a.ordered_date.year + 1))
        self.assertNotEqual(nxt.pk, a.pk)
        self.assertEqual((a.status, a.retail_value, a.compute_item_cost(Decimal('10'))), ('complete', Decimal('0'), None))
