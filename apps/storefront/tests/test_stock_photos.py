"""Stock photos and photo-sheet photos on the phone site (Dash Update #185): which photo is public, the finder's accept
rule, reuse, reject, the daily pick, and the cost of the build. No real AI call and no real download: both are mocked."""
from __future__ import annotations

import io
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from PIL import Image

from apps.core.models import AiAction, AiModel, AppSetting, S3File
from apps.core.services.llm_router import LLMAPIError, LLMResult
from apps.inventory.models import (
    Item, ManifestRow, PhotoSheet, PreprocessingRow, Product, ProductProfile, PurchaseOrder, Vendor,
)
from apps.storefront import views
from apps.storefront.models import StockPhoto
from apps.storefront.services import photos, snapshot
from apps.storefront.services import stock_photos as S
from apps.storefront.services.holder import holder
from apps.thriftplus.services import scanner

D = Decimal
UPC = '036000291452'  # a valid UPC-A
MEMORY = {'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
          'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}


def picture(w=800, h=600, fmt='PNG') -> bytes:
    buf = io.BytesIO()
    Image.new('RGB', (w, h), (200, 120, 40)).save(buf, format=fmt)
    return buf.getvalue()


@override_settings(STORAGES=MEMORY)
class Base(TestCase):
    def setUp(self):
        no_sale = patch.object(scanner, '_sale_factor', return_value=D('1'))
        no_sale.start()
        self.addCleanup(no_sale.stop)
        for key, value in (('tags.retail_on_tag', 'checked'), ('category_from_profile', True)):
            AppSetting.objects.update_or_create(key=key, defaults={'value': value})
        from apps.inventory.services import tag_retail
        from apps.storefront.services import rules as R

        tag_retail.clear_cache()
        R.forget()
        holder.reset()
        holder.background = False
        views.clear_item_cache()
        self.addCleanup(holder.reset)
        self.client = Client()
        self.n = 0

    def product(self, title, *, cat='Toys & games', price='10.00', retail='100.00', thumb='', brand='', model=''):
        p = Product.objects.create(title=title, photo_thumb=thumb, photo='inventory/products/x.jpg' if thumb else '',
                                   brand=brand or 'Generic', model=model)
        ProductProfile.objects.create(product=p, category=cat, display_title=title)
        self.n += 1
        Item.objects.create(sku=f'ITM{8000000 + self.n}', product=p, price=D(price), retail=D(retail),
                            retail_check='passed', status='on_shelf')
        return p

    def sheet(self, product, *, by_item=False, photos_=None):
        key = default_storage.save(f'photo-sheets/s{product.pk}.jpg', ContentFile(picture(), name='s.jpg'))
        s3 = S3File.objects.create(key=key, filename='s.jpg')
        files = [{'file': s3.pk, 'width': 800, 'height': 600}] if photos_ is None else photos_
        if by_item:
            return PhotoSheet.objects.create(item=product.items.first(), title=product.title, photos=files), s3
        return PhotoSheet.objects.create(product=product, title=product.title, photos=files), s3

    def stock(self, product, status=StockPhoto.STATUS_FOUND, *, key=None, match=''):
        row = StockPhoto.objects.create(key=key or f'p{product.pk}', product=product, status=status, title=product.title,
                                        match_key=match, found_at=timezone.now(), width=640, height=480)
        row.image.save(f'{row.key}.jpg', ContentFile(picture(640, 480, 'JPEG')), save=True)
        return row

    def stock_json(self):
        return json.loads(self.client.get('/api/storefront/stock.json').content)

    def home_json(self):
        return json.loads(self.client.get('/api/storefront/home.json').content)


class PublicPhotoTests(Base):
    def test_the_photo_flag_and_the_feeds(self):
        sheet = self.product('Sheet piece', cat='Furniture')
        self.sheet(sheet)
        by_item = self.product('Sheet by its item')
        self.sheet(by_item, by_item=True)
        stocked = self.product('Stocked piece', cat='Electronics')
        self.stock(stocked)
        rejected = self.product('Rejected piece')
        self.stock(rejected, StockPhoto.STATUS_REJECTED)
        missed = self.product('Missed piece')
        StockPhoto.objects.create(key=f'p{missed.pk}', product=missed, status=StockPhoto.STATUS_NONE)
        added = self.product('Add item photo', thumb='inventory/products/t.jpg')
        both = self.product('Sheet and stock', cat='Kitchen & dining')
        self.sheet(both)
        self.stock(both)
        empty_sheet = self.product('Sheet with no photos')
        self.sheet(empty_sheet, photos_=[])
        rows = {r[0]: r for r in self.stock_json()['instore']}
        self.assertEqual(len(rows[sheet.pk]), 9)
        self.assertEqual({pid: rows[pid][8] for pid in rows}, {
            sheet.pk: 1, by_item.pk: 1, stocked.pk: 2, rejected.pk: 0, missed.pk: 0, added.pk: 0, both.pk: 1,
            empty_sheet.pk: 0,
        })
        finds = {f['pid']: f for f in self.home_json()['finds']}
        self.assertEqual((finds[sheet.pk]['photo'], finds[sheet.pk]['photo_kind']),
                         (f'/api/storefront/photo/{sheet.pk}/', 'sheet'))
        self.assertEqual(finds[stocked.pk]['photo_kind'], 'stock')
        self.assertEqual(finds[both.pk]['photo_kind'], 'sheet')

    def test_best_finds_are_only_the_best_with_a_photo(self):
        cats = ['Toys & games', 'Electronics', 'Furniture', 'Kitchen & dining', 'Bedding & bath', 'Tools & hardware',
                'Pet supplies', 'Automotive', 'Appliances', 'Arts & crafts']
        big = self.product('Big saving, no photo', cat='Sports & outdoors', retail='900.00')
        with_photo = []
        for i, cat in enumerate(cats[:7]):
            p = self.product(f'Photo {i}', cat=cat, retail=str(50 + i))
            self.stock(p)
            with_photo.append(p.pk)
        finds = [f['pid'] for f in self.home_json()['finds']]
        self.assertEqual(finds, list(reversed(with_photo)))  # only the 7 with a photo, best saving first
        self.assertNotIn(big.pk, finds)  # never a fill without a photo (owner 2026-11-20)
        p = self.product('Photo 7', cat=cats[7], retail='40.00')
        self.stock(p)
        holder.reset()
        finds = self.home_json()['finds']
        self.assertEqual(len(finds), 8)
        self.assertNotIn(big.pk, [f['pid'] for f in finds])  # 8 have a photo: only those
        self.assertTrue(all(f['photo_kind'] == 'stock' for f in finds))

    def test_the_photo_address_serves_only_a_sheet_or_a_public_stock_photo(self):
        sheet = self.product('Sheet piece')
        _, s3 = self.sheet(sheet)
        stocked = self.product('Stocked')
        row = self.stock(stocked)
        rejected = self.product('Rejected')
        self.stock(rejected, StockPhoto.STATUS_REJECTED)
        added = self.product('Add item photo', thumb='inventory/products/t.jpg')
        with patch.object(default_storage, 'url', side_effect=lambda name: f'https://bucket.example/{name}?sig=1'):
            r = self.client.get(f'/api/storefront/photo/{sheet.pk}/')
            self.assertEqual((r.status_code, r['Location']), (302, f'https://bucket.example/{s3.key}?sig=1'))
            self.assertEqual(r['Cache-Control'], 'public, max-age=300')
            r = self.client.get(f'/api/storefront/photo/{stocked.pk}/')
            self.assertEqual((r.status_code, r['Location']), (302, f'https://bucket.example/{row.image.name}?sig=1'))
            for pid in (rejected.pk, added.pk, 999999):
                self.assertEqual(self.client.get(f'/api/storefront/photo/{pid}/').status_code, 404)

    def test_a_sheet_file_outside_the_sheet_folder_is_never_served(self):
        p = self.product('Odd sheet')
        other = S3File.objects.create(key='photo-drops/1/x.jpg', filename='x.jpg')  # a marketing photo drop
        PhotoSheet.objects.create(product=p, title='x', photos=[{'file': other.pk}])
        self.assertEqual(self.client.get(f'/api/storefront/photo/{p.pk}/').status_code, 404)

    def test_the_item_endpoint_stays_at_two_queries_and_names_the_kind(self):
        stocked = self.product('Stocked')
        self.stock(stocked)
        sheet = self.product('Sheet piece')
        self.sheet(sheet)
        from apps.storefront.services import rules as R

        R.cached_settings()
        with self.assertNumQueries(2):
            body = self.client.get(f'/api/storefront/item/{stocked.pk}/').json()
        self.assertEqual((body['photo'], body['photo_kind']), (f'/api/storefront/photo/{stocked.pk}/', 'stock'))
        self.assertEqual(self.client.get(f'/api/storefront/item/{sheet.pk}/').json()['photo_kind'], 'sheet')

    def test_the_build_adds_one_query_and_a_warm_request_none(self):
        self.product('Plain')
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            snapshot.build()
        self.assertEqual(sum('storefront_stockphoto' in q['sql'] for q in ctx.captured_queries), 1)
        self.client.get('/api/storefront/stock.json')
        with self.assertNumQueries(0):
            self.client.get('/api/storefront/stock.json')
            self.client.get('/api/storefront/home.json')


class IdentifierTests(TestCase):
    def test_junk_upcs_are_dropped_and_the_match_key(self):
        ids = S.clean_identifiers({'upc': f'196507000000, {UPC}', 'asin': 'b091dbk5tz', 'item_number': 'LBNF7662.1'})
        self.assertEqual(ids, {'gtin': [UPC], 'asin': ['B091DBK5TZ'], 'item_number': ['LBNF7662.1']})
        self.assertEqual(S.match_key(ids), f'gtin:00{UPC}')
        same = S.clean_identifiers({'upc': ['0047406182350', '047406182350', '662987000000']})
        self.assertEqual(same['gtin'], ['047406182350'])  # one code with or without a leading zero; a rounded one dropped
        none = S.clean_identifiers({'upc': '19473514'})
        self.assertEqual(S.match_key(none, 'KitchenAid', 'KSM-150 PS'), 'bm:kitchenaid|ksm150ps')
        self.assertEqual(S.match_key(none, 'Generic', 'KSM150'), '')
        self.assertEqual(S.match_key(none, 'Sony', 'X1'), '')


def answer(**over):
    base = {'image_url': 'https://maker.example/p/1.jpg', 'page_url': 'https://maker.example/p/1', 'confidence': 0.9,
            'why': 'The maker page.'}
    return {**base, **over}


@override_settings(STORAGES=MEMORY)
class FinderTests(TestCase):
    def setUp(self):
        self.p = Product.objects.create(title='KitchenAid stand mixer', brand='KitchenAid', model='KSM150PS')
        self.calls = {'search': 0, 'check': 0}
        self.found = answer()
        self.verdict = {'same_product': True, 'clean': True, 'why': 'A clean product photo.'}
        patches = [
            patch.object(S, '_search', side_effect=self._search),
            patch.object(S, '_check', side_effect=self._check),
            patch.object(S, 'download', return_value=picture(1200, 900, 'JPEG')),
        ]
        for one in patches:
            one.start()
            self.addCleanup(one.stop)

    def _search(self, facts):
        self.calls['search'] += 1
        if isinstance(self.found, Exception):
            raise self.found
        return self.found, D('0.05'), {'model': 'claude-sonnet-5-5', 'searches': 2, 'fetches': 1}

    def _check(self, facts, raw):
        self.calls['check'] += 1
        return self.verdict, D('0.001')

    def find(self, key=None, **kw):
        args = {'key': key or f'p{self.p.pk}', 'title': self.p.title, 'brand': 'KitchenAid', 'model': 'KSM150PS',
                'identifiers': {'upc': UPC}, 'product': self.p, 'web': True, **kw}
        return S.find_stock_photo(**args)

    def test_accepted_photo_is_saved_small(self):
        row = self.find()
        self.assertEqual(row.status, StockPhoto.STATUS_FOUND)
        self.assertEqual((row.width, row.height), (640, 480))
        self.assertTrue(row.image.name.startswith('storefront/stock/'))
        self.assertEqual(row.match_key, f'gtin:00{UPC}')
        self.assertEqual((row.tries, row.cost_usd, row.next_try_on), (1, D('0.051'), None))
        self.assertEqual(row.page_url, 'https://maker.example/p/1')
        self.assertIn('Finder (2 searches, 1 pages, 0.90)', row.why)
        with Image.open(row.image.open('rb')) as img:
            self.assertEqual((img.format, img.size), ('JPEG', (640, 480)))
        again = self.find()  # already found: returned, no call
        self.assertEqual((again.pk, self.calls['search']), (row.pk, 1))

    def assert_miss(self, words, days=S.MISS_DAYS, check=True):
        row = self.find()
        self.assertEqual(row.status, StockPhoto.STATUS_NONE)
        self.assertFalse(row.image)
        self.assertIn(words, row.why)
        self.assertEqual(row.next_try_on, timezone.localdate() + timedelta(days=days))
        self.assertEqual(self.calls['check'], 1 if check else 0)
        return row

    def test_low_confidence_is_a_miss(self):
        self.found = answer(confidence=0.6)
        self.assert_miss('Not sure enough', check=False)

    def test_no_answer_is_a_miss(self):
        self.found = None
        self.assert_miss('no answer', check=False)

    def test_the_check_must_say_same_and_clean(self):
        self.verdict = {'same_product': True, 'clean': False, 'why': 'A collage.'}
        self.assert_miss('not a clean product photo')

    def test_not_the_same_product(self):
        self.verdict = {'same_product': False, 'clean': True, 'why': 'Another model.'}
        self.assert_miss('not this product')

    def test_a_small_picture_is_a_miss(self):
        with patch.object(S, 'download', return_value=picture(300, 300)):
            self.assert_miss('too small', check=False)

    def test_an_api_failure_is_tried_again_tomorrow(self):
        self.found = LLMAPIError('overloaded', kind='api', status_code=529)
        self.assert_miss('The AI call failed', days=S.ERROR_DAYS, check=False)

    def test_a_miss_not_yet_due_is_not_looked_up_again(self):
        self.found = None
        self.find()
        self.find()
        self.assertEqual(self.calls['search'], 1)

    def test_the_same_upc_is_reused_without_a_call(self):
        first = self.find()
        other = Product.objects.create(title='Stand mixer, tilt head')
        row = self.find(key=f'p{other.pk}', product=other, title=other.title)
        self.assertEqual(self.calls['search'], 1)
        self.assertEqual((row.status, row.image.name), (StockPhoto.STATUS_FOUND, first.image.name))
        self.assertTrue(row.why.startswith('Reused the photo of'))

    def test_reject_takes_every_copy_off_for_ninety_days(self):
        first = self.find()
        other = Product.objects.create(title='Same UPC')
        copy = self.find(key=f'p{other.pk}', product=other)
        self.assertEqual(S.reject(StockPhoto.objects.filter(pk=first.pk)), 2)
        for row in (first, copy):
            row.refresh_from_db()
            self.assertEqual(row.status, StockPhoto.STATUS_REJECTED)
            self.assertEqual(row.next_try_on, timezone.localdate() + timedelta(days=S.REJECT_DAYS))
        self.assertEqual(self.client.get(f'/api/storefront/photo/{self.p.pk}/').status_code, 404)

    def test_admin_reject_action(self):
        row = self.find()
        user = get_user_model().objects.create_superuser(email='boss@example.com', first_name='B', last_name='R',
                                                         password='x-test-only-1')
        self.client.force_login(user)
        r = self.client.post('/db-admin/storefront/stockphoto/', {'action': 'reject', '_selected_action': [row.pk]})
        self.assertEqual(r.status_code, 302)
        row.refresh_from_db()
        self.assertEqual(row.status, StockPhoto.STATUS_REJECTED)
        self.assertEqual(self.client.get('/db-admin/storefront/stockphoto/').status_code, 200)


class RouterCallTests(TestCase):
    """The finder's call: Sonnet 5.5 at medium by default, the answer tool beside the web tools (tool choice auto)."""

    def test_the_finder_call(self):
        seen = {}

        def fake(**kw):
            seen.update(kw)
            return LLMResult(text='', model_used='claude-sonnet-5-5', tool_input=answer(), web_search_requests=2)

        with patch('apps.core.services.llm_router.llm_complete', side_effect=fake):
            got, cost, used = S._search(S.Facts(key='p1', title='Mixer', ids={'gtin': [UPC]}))
        self.assertEqual(got['confidence'], 0.9)
        self.assertEqual((seen['model_id'], seen['effort']), ('claude-sonnet-5-5', 'medium'))
        self.assertIsNone(seen.get('tools'))
        self.assertEqual(seen['tool_name'], S.REPORT)
        self.assertEqual([t['name'] for t in seen['server_tools']], ['web_search', 'web_fetch', S.REPORT])
        self.assertEqual(seen['log_source'], 'storefront_stock_photos')
        self.assertIn(f'UPC/EAN: {UPC}', seen['user'])
        self.assertEqual(used['searches'], 2)
        self.assertGreaterEqual(cost, D('0.02'))

    def test_settings_ai_picks_the_models_never_ai_model(self):
        AiAction.objects.filter(purpose__startswith='STOREFRONT_').delete()
        self.assertEqual(S._choice(S.CHECK_PURPOSE, S.CHECK_MODEL, S.CHECK_EFFORT), ('gemini-3.8-flash', 'low'))
        grok = AiModel.objects.create(slug='grok-test', provider='xai', modality='text', status='active')
        AiAction.objects.create(purpose=S.FINDER_PURPOSE, label='x', model=grok, effort='high')
        # The finder searches the web: a model that is not Claude falls back to the default.
        self.assertEqual(S._choice(S.FINDER_PURPOSE, S.FINDER_MODEL, S.FINDER_EFFORT, anthropic=True),
                         ('claude-sonnet-5-5', 'high'))

    def test_the_check_sends_the_image_block(self):
        seen = {}

        def fake(**kw):
            seen.update(kw)
            return LLMResult(text='', model_used='gemini-3.8-flash', tool_input={'same_product': True, 'clean': True,
                                                                                 'why': 'ok'})

        with patch('apps.core.services.llm_router.llm_complete', side_effect=fake):
            verdict, _ = S._check(S.Facts(key='p1', title='Mixer'), picture())
        self.assertTrue(verdict['clean'])
        image = seen['messages'][0]['content'][1]
        self.assertEqual((image['type'], image['source']['media_type']), ('image', 'image/jpeg'))
        self.assertEqual(seen['tool_name'], S.CHECK)

    def test_download_wants_https(self):
        with self.assertRaises(S.Miss):
            S.download('http://maker.example/1.jpg')
        with self.assertRaises(S.Miss):
            S.download('https://127.0.0.1/1.jpg')


class DailyTests(Base):
    def test_the_daily_pick(self):
        sheet = self.product('Sheet piece', cat='Furniture', retail='500.00')
        self.sheet(sheet)
        stocked = self.product('Stocked', cat='Electronics', retail='400.00')
        self.stock(stocked)
        waiting = self.product('Waiting', cat='Kitchen & dining', retail='300.00')
        StockPhoto.objects.create(key=f'p{waiting.pk}', product=waiting, status=StockPhoto.STATUS_NONE,
                                  next_try_on=timezone.localdate() + timedelta(days=3))
        due = self.product('Due again', cat='Pet supplies', retail='250.00')
        StockPhoto.objects.create(key=f'p{due.pk}', product=due, status=StockPhoto.STATUS_NONE,
                                  next_try_on=timezone.localdate())
        new = self.product('New piece', cat='Toys & games', retail='200.00', brand='LEGO', model='10305')
        vendor = Vendor.objects.create(name='Target', code='TGT9')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='SP-1', ordered_date='2026-11-01', status='delivered')
        row = ManifestRow.objects.create(purchase_order=po, row_number=1, title='x', identifiers={'upc': UPC, 'asin': 'B0TEST1234'})
        new.items.update(manifest_row=row)
        no_retail = self.product('No retail', cat='Automotive', retail='5.00', price='10.00')
        plan = S.plan(10)
        self.assertEqual((plan.sheet, plan.have, plan.waiting), (1, 1, 1))
        self.assertEqual([pid for pid, _ in plan.todo], [due.pk, new.pk])
        kw = dict(plan.todo)[new.pk]
        self.assertEqual((kw['brand'], kw['model'], kw['identifiers']['upc'], kw['identifiers']['asin']),
                         ('LEGO', '10305', [UPC], ['B0TEST1234']))
        self.assertNotIn(no_retail.pk, [pid for pid, _ in plan.todo])
        self.assertEqual(len(S.plan(1).todo), 1)

        looked = []
        fake = patch.object(S, 'find_stock_photo', side_effect=lambda **kw: looked.append(kw['key']) or StockPhoto(
            key=kw['key'], status=StockPhoto.STATUS_NONE, why='x'))
        with fake:
            done = S.daily(1)
        self.assertEqual((looked, done['looked_up'], done['web']), ([], 0, False))  # the web search is off by default
        self.assertIn('web search off', S.summary(done))
        AppSetting.objects.update_or_create(key=S.WEB_KEY, defaults={'value': 'on'})
        with fake:
            done = S.daily(1)
        self.assertEqual((looked, done['looked_up'], done['missed']), ([f'p{due.pk}'], 1, 1))
        self.assertIn('web search: 1 looked up', S.summary(done))

    def test_the_switch_and_the_morning_never_fails(self):
        AppSetting.objects.update_or_create(key=S.SWITCH_KEY, defaults={'value': 'off'})
        self.assertEqual(S.morning_stock_photos(), 'Stock photos: off (storefront.stock_photos).')
        AppSetting.objects.filter(key=S.SWITCH_KEY).delete()
        with patch.object(S, 'daily', side_effect=RuntimeError('boom')), self.assertLogs('apps.storefront', 'ERROR'):
            self.assertIn('failed', S.morning_stock_photos())
        AppSetting.objects.update_or_create(key=S.DAILY_KEY, defaults={'value': 3})
        self.assertEqual(S.daily_cap(), 3)

    def test_the_time_cap_stops_new_look_ups(self):
        for i in range(3):
            self.product(f'Piece {i}', cat=['Toys & games', 'Furniture', 'Electronics'][i])
        AppSetting.objects.update_or_create(key=S.WEB_KEY, defaults={'value': 'on'})
        clock = iter([0.0, 0.0, S.DAILY_SECONDS + 1, S.DAILY_SECONDS + 1])
        with patch.object(S, '_clock', side_effect=lambda: next(clock)), \
                patch.object(S, 'find_stock_photo', return_value=StockPhoto(key='p', status='none', why='x')):
            done = S.daily(3)
        self.assertEqual((done['looked_up'], done['stopped']), (1, 2))


PLACEHOLDER = 'https://secure.img1-fg.wfcdn.com/im/12345678/resize-w800%5Ecompr-r85/1234/441217599/default_name.jpg'
REAL = 'https://assets.wfcdn.com/im/1/resize-h800-w800%5Ecompr-r85/4412/441217599/x.jpg'


@override_settings(STORAGES=MEMORY)
class ManifestPhotoTests(Base):
    """The seller's manifest photo (Wayfair "Image URL"): free, no AI call, the placeholder refused."""

    def setUp(self):
        super().setUp()
        vendor = Vendor.objects.create(name='Wayfair', code='WF9')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='SP-421', ordered_date='2026-11-01',
                                               status='delivered')
        self.rows = 0
        self.searched = []
        patcher = patch.object(S, '_search', side_effect=lambda facts: self.searched.append(facts.key) or (None, D(0), {}))
        patcher.start()
        self.addCleanup(patcher.stop)

    def linked(self, title, url=PLACEHOLDER, key='Image URL', **kw):
        p = self.product(title, **kw)
        self.rows += 1
        row = ManifestRow.objects.create(purchase_order=self.po, row_number=self.rows, title=title)
        PreprocessingRow.objects.create(purchase_order=self.po, row_number=self.rows, raw_row={key: url, 'Name': title})
        p.items.update(manifest_row=row)
        return p, row

    def test_the_real_address_is_rebuilt(self):
        self.assertEqual(S.real_image_url(PLACEHOLDER), REAL)
        self.assertEqual(S.real_image_url('https://img.example.com/a/b.jpg'), 'https://img.example.com/a/b.jpg')
        for junk in ('', 'not a link', 'https://secure.img1-fg.wfcdn.com/im/no-id/default_name.jpg', 'ftp://x/y.jpg'):
            self.assertIsNone(S.real_image_url(junk))
        _, row = self.linked('Console table', key='Image Url')
        self.assertEqual(S.manifest_image_url(row), REAL)
        bare = ManifestRow.objects.create(purchase_order=self.po, row_number=99, title='No preprocessing row')
        self.assertIsNone(S.manifest_image_url(bare))

    def test_a_manifest_photo_is_saved_free_and_shows_in_the_feeds(self):
        p, _ = self.linked('Travertine console table', cat='Furniture', retail='500.00')
        with patch.object(S, 'download', return_value=picture(800, 800, 'JPEG')) as got:
            row = S.find_stock_photo(key=f'p{p.pk}', title=p.title, product=p)
        got.assert_called_once_with(REAL)
        self.assertEqual((row.status, row.why, row.page_url, row.image_url), (StockPhoto.STATUS_FOUND, S.MANIFEST_WHY, '', REAL))
        self.assertEqual((row.width, row.height, row.cost_usd, self.searched), (640, 640, D(0), []))
        holder.reset()
        rows = {r[0]: r for r in self.stock_json()['instore']}
        self.assertEqual(rows[p.pk][8], 2)
        self.assertEqual(self.home_json()['finds'][0]['photo_kind'], 'stock')

    def test_the_placeholder_and_small_pictures_are_refused(self):
        p, _ = self.linked('Panel bed')
        for raw in (picture(513, 321, 'JPEG'), picture(300, 300), b'x' * S.PLACEHOLDER_BYTES):
            StockPhoto.objects.filter(key=f'p{p.pk}').delete()
            with patch.object(S, 'download', return_value=raw):
                row = S.find_stock_photo(key=f'p{p.pk}', title=p.title, product=p)
            self.assertEqual(row.status, StockPhoto.STATUS_NONE)
            self.assertIn('Manifest photo:', row.why)
            self.assertEqual(row.next_try_on, timezone.localdate() + timedelta(days=S.MISS_DAYS))
        self.assertEqual(self.searched, [])  # the web search is off by default

    def test_no_manifest_photo_and_the_web_off_looks_again_tomorrow(self):
        p = self.product('Plain piece')
        with patch.object(S, 'download') as got:
            row = S.find_stock_photo(key=f'p{p.pk}', title=p.title, product=p)
        got.assert_not_called()
        self.assertEqual((row.status, row.next_try_on), (StockPhoto.STATUS_NONE, timezone.localdate() + timedelta(days=1)))
        self.assertIn('storefront.stock_photos_web is off', row.why)
        self.assertEqual(self.searched, [])

    def test_the_web_search_runs_only_when_switched_on(self):
        p = self.product('Plain piece')
        AppSetting.objects.update_or_create(key=S.WEB_KEY, defaults={'value': 'on'})
        S.find_stock_photo(key=f'p{p.pk}', title=p.title, product=p)
        self.assertEqual(self.searched, [f'p{p.pk}'])

    def test_the_daily_run_uses_manifest_photos_with_the_web_off(self):
        with_photo, _ = self.linked('Chair', cat='Furniture', retail='300.00')
        without = self.product('No manifest photo', cat='Electronics', retail='200.00')
        with patch.object(S, 'download', return_value=picture(800, 800, 'JPEG')):
            done = S.daily(40)
        self.assertEqual((done['manifest'], done['manifest_missed'], done['looked_up'], done['web']), (1, 0, 0, False))
        self.assertIn('1 manifest photos saved', S.summary(done))
        self.assertEqual(StockPhoto.objects.get(key=f'p{with_photo.pk}').status, StockPhoto.STATUS_FOUND)
        self.assertFalse(StockPhoto.objects.filter(product=without).exists())  # no manifest photo: no row
        self.assertEqual(self.searched, [])

    def test_the_manifest_pass_covers_every_shown_retail_not_just_the_top_forty(self):
        pieces = [self.linked(f'Chair {i}', cat='Furniture', retail=str(300 - i))[0] for i in range(4)]
        no_retail, _ = self.linked('No shown retail', retail='5.00', price='10.00')
        self.sheet(pieces[3])  # a photo sheet comes first
        with patch.object(S, 'CANDIDATES', 1), patch.object(S, 'download', return_value=picture(800, 800, 'JPEG')):
            done = S.daily()
        self.assertEqual((done['manifest'], done['sheet'], done['downloads']), (3, 1, 3))  # 3 of one category, past top 1
        self.assertFalse(StockPhoto.objects.filter(product__in=[no_retail, pieces[3]]).exists())
        rows = {r[0]: r[8] for r in (holder.reset() or self.stock_json())['instore']}
        self.assertEqual([rows[p.pk] for p in pieces], [2, 2, 2, 1])

    def test_the_manifest_pass_stops_at_its_download_cap(self):
        for i in range(3):
            self.linked(f'Lamp {i}', cat='Home décor & lighting', retail=str(100 - i))
        AppSetting.objects.update_or_create(key=S.MANIFEST_DAILY_KEY, defaults={'value': 2})
        with patch.object(S, 'download', return_value=picture(800, 800, 'JPEG')) as got:
            done = S.daily()
        self.assertEqual((got.call_count, done['manifest'], done['manifest_left']), (2, 2, 1))
        self.assertIn('1 left for tomorrow', S.summary(done))
        with patch.object(S, 'download', return_value=picture(800, 800, 'JPEG')):
            self.assertEqual(S.daily()['manifest'], 1)  # the next run takes the rest; the found ones are skipped


class RoutinesHookTests(TestCase):
    def test_materialize_routines_ends_with_the_stock_photos_and_never_fails(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        with patch('apps.marketing.services.ideas.morning_ideas', return_value='Post ideas: x'), \
                patch.object(S, 'morning_stock_photos', return_value='Stock photos: 0 looked up') as run:
            call_command('materialize_routines', stdout=out)
        run.assert_called_once()
        self.assertTrue(out.getvalue().rstrip().endswith('Stock photos: 0 looked up'))
        out = StringIO()
        with patch('apps.marketing.services.ideas.morning_ideas', return_value='Post ideas: x'), \
                patch.object(S, 'morning_stock_photos', side_effect=RuntimeError('boom')):
            call_command('materialize_routines', stdout=out)
        self.assertIn('Stock photos: could not start', out.getvalue())
        self.assertIn('Created', out.getvalue())
