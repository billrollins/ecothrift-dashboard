"""The phone site's store feeds: the rules behind each number, the wire (gzip, ETag, 304), no query warm, and nothing
private in any payload."""
from __future__ import annotations

import gzip
import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from django.conf import settings

from django.test import Client, TestCase
from django.utils import timezone

from apps.core.models import AppSetting
from apps.inventory.models import Category, Item, ManifestRow, Product, ProductProfile, PurchaseOrder, Vendor
from apps.inventory.services import tag_retail
from apps.storefront import views
from apps.storefront.services import rules as R
from apps.storefront.services import snapshot
from apps.storefront.services.holder import holder
from apps.thriftplus.models import ItemReward, RestrictedProduct
from apps.thriftplus.services import scanner

D = Decimal
STOCK = '/api/storefront/stock.json'
HOME = '/api/storefront/home.json'
FORBIDDEN = ('cost', 'notes', 'proposed_price', 'final_price', 'location', 'pricing', 'secret')


def _reward(item, reward, *, start=None, status=ItemReward.STATUS_CLIMBING):
    ItemReward.objects.create(item=item, family_key=f'p{item.product_id}', floor_date=timezone.localdate() - timedelta(days=20),
                              starting_price=item.price if start is None else start, floor_price=D('1.00'), grow_days=10,
                              reward=reward, status=status, reason='one_unit', day=20, computed_on=timezone.localdate())


class FeedTests(TestCase):
    def setUp(self):
        no_sale = patch.object(scanner, '_sale_factor', return_value=D('1'))  # a store sale must not move the numbers
        no_sale.start()
        self.addCleanup(no_sale.stop)
        for key, value in (('thrift_plus_floor_share', '0.10'), ('category_from_profile', True),
                           ('tags.retail_on_tag', 'checked')):
            AppSetting.objects.update_or_create(key=key, defaults={'value': value})
        tag_retail.clear_cache()
        R.forget()
        holder.reset()
        holder.background = False
        views.clear_item_cache()
        self.addCleanup(holder.reset)
        self.client = Client()
        self.n = 0

    def _product(self, title, *, profile_cat='', photo=''):
        p = Product.objects.create(title=title, photo_thumb=photo)
        if profile_cat:
            ProductProfile.objects.create(product=p, category=profile_cat, display_title=f'{title} (display)')
        return p

    def _item(self, product, price, *, retail=None, check='', source='purchased', status='on_shelf', row=None):
        self.n += 1
        return Item.objects.create(sku=f'ITM{9000000 + self.n}', product=product, price=D(price),
                                   retail=D(retail) if retail else None, retail_check=check, source=source,
                                   status=status, manifest_row=row, cost=D('123.45'), location='BIN-SECRET',
                                   notes='SECRET internal note')

    def _stock(self, **headers):
        response = self.client.get(STOCK, **headers)
        self.assertEqual(response.status_code, 200)
        raw = gzip.decompress(response.content) if response.get('Content-Encoding') == 'gzip' else response.content
        return response, json.loads(raw)

    def _row(self, data, pid):
        return next(r for r in data['instore'] if r[0] == pid)

    # ── The rules ──────────────────────────────────────────────────────────────

    def test_retail_shows_only_when_checked_and_above_the_price(self):
        ok = self._product('Lamp')
        self._item(ok, '40.00', retail='100.00', check='passed')
        unchecked = self._product('Rug')
        self._item(unchecked, '40.00', retail='100.00', check='')
        below = self._product('Vase')
        self._item(below, '40.00', retail='30.00', check='confirmed')
        _, data = self._stock()
        self.assertEqual(self._row(data, ok.pk)[3:5], [40, 100])
        self.assertEqual(self._row(data, unchecked.pk)[4], 0)
        self.assertEqual(self._row(data, below.pk)[4], 0)
        self.assertEqual(data['instore'][0][0], ok.pk)  # rows with a retail come first

    def test_thriftbucks_follow_the_scanner_rule(self):
        plain = self._product('Plain')
        _reward(self._item(plain, '40.00'), D('13.00'))
        marked = self._product('Marked down')
        _reward(self._item(marked, '40.00'), D('10.00'), start=D('50.00'))  # tag lowered since last night
        consigned = self._product('Consigned')
        _reward(self._item(consigned, '40.00', source='consignment'), D('10.00'))
        capped = self._product('Capped')
        _reward(self._item(capped, '10.00'), D('20.00'))  # never more than the tag less its 10% floor
        closed = self._product('Closed')
        _reward(self._item(closed, '40.00'), D('10.00'), status=ItemReward.STATUS_CLOSED)
        _, data = self._stock()
        self.assertEqual(self._row(data, plain.pk)[5], 13)
        self.assertEqual(self._row(data, marked.pk)[5], 0)
        self.assertEqual(self._row(data, consigned.pk)[5], 0)
        self.assertEqual(self._row(data, capped.pk)[5], 9)
        self.assertEqual(self._row(data, closed.pk)[5], 0)
        # The scanner's own reader agrees, unit by unit.
        for p in (plain, marked, consigned, capped, closed):
            item = p.items.get()
            self.assertEqual(R.num(scanner.reward_for(item, item.price)), self._row(data, p.pk)[5])
        # The home card's proof (owner 2026-11-20): 2 of the 5 items carry ThriftBucks (13 of 40, 9 of 10); the typical
        # one (the upper middle of two) carries 90% of its tag.
        home = json.loads(self.client.get(HOME).content)
        self.assertEqual(home['bucks'], {'share': 40, 'typical': 90})

    def test_several_units_count_and_pick_the_representative(self):
        p = self._product('Mug set')
        a = self._item(p, '20.00')
        b = self._item(p, '15.00', retail='40.00', check='passed')
        c = self._item(p, '15.00')
        self._item(p, '15.00', status='sold')  # not on the shelf
        for unit, tb in ((a, '5.00'), (b, '5.00'), (c, '5.00')):
            _reward(unit, D(tb))
        _, data = self._stock()
        pid, name, cat, price, retail, tb, units, tag, photo = self._row(data, p.pk)
        self.assertEqual((price, retail, tb, units, tag), (15, 40, 5, 3, ''))  # b: most ThriftBucks, lowest price, lowest id
        single = self._product('Single')
        item = self._item(single, '5.00')
        holder.reset()
        _, data = self._stock()
        self.assertEqual(self._row(data, single.pk)[7], item.sku[3:])

    def test_category_by_the_effective_rule_and_true_piece_counts(self):
        mixed, _ = Category.objects.get_or_create(name='Mixed lots & uncategorized',
                                                  defaults={'slug': 'mixed-lots-uncategorized'})
        toy = Product.objects.create(title='Robot', category=mixed)
        ProductProfile.objects.create(product=toy, category='Toys & games')
        self._item(toy, '9.00')
        self._item(toy, '9.00')
        electronics, _ = Category.objects.get_or_create(name='Electronics', defaults={'slug': 'electronics'})
        tv = Product.objects.create(title='TV', category=electronics)  # no profile: the product's own category
        self._item(tv, '50.00')
        nothing = self._product('Thing')
        self._item(nothing, '3.00')
        _, data = self._stock()
        ids = [c['id'] for c in data['cats']]
        self.assertEqual(len(ids), 23)
        self.assertEqual([c['name'] for c in data['cats']], list(R.TAXONOMY_V1_CATEGORY_NAMES))
        self.assertEqual(ids[self._row(data, toy.pk)[2]], 'toys')
        self.assertEqual(ids[self._row(data, tv.pk)[2]], 'electronics')
        self.assertEqual(ids[self._row(data, nothing.pk)[2]], 'other')
        pieces = {c['id']: c['pieces'] for c in data['cats']}
        self.assertEqual((pieces['toys'], pieces['electronics'], pieces['other']), (2, 1, 1))
        home = json.loads(self.client.get(HOME).content)
        self.assertEqual(home['shelf'], {'pieces': 4, 'products': 3, 'categories': 23})
        self.assertEqual(home['top_cats'][:2], [{'id': 'toys', 'pieces': 2}, {'id': 'electronics', 'pieces': 1}])
        self.assertEqual(len(home['top_cats']), 6)
        self.assertNotIn('other', [c['id'] for c in home['top_cats']])

    def test_coming_rows_carry_no_price_and_every_paid_truck_lists(self):
        vendor = Vendor.objects.create(name='Target', code='TGT2')
        paid = PurchaseOrder.objects.create(vendor=vendor, order_number='SF-2', ordered_date='2026-11-01', status='paid',
                                            vendor_name_cache='Target', pallet_count=4, total_cost=D('999.00'),
                                            notes='SECRET truck note')
        ManifestRow.objects.create(purchase_order=paid, row_number=1, title='Air fryer XL', quantity=2,
                                   unit_retail=D('80.00'), proposed_price=D('77.77'), final_price=D('66.66'),
                                   pricing_notes='SECRET pricing', category='')
        ManifestRow.objects.create(purchase_order=paid, row_number=2, title='Thing', quantity=1, unit_retail=D('120.00'),
                                   category='Furniture')
        empty = PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='Wayfair', code='WF2'), order_number='SF-3', ordered_date='2026-11-02',
                                             status='shipped', vendor_name_cache='Wayfair')
        gone = PurchaseOrder.objects.create(vendor=vendor, order_number='SF-4', ordered_date='2026-10-01',
                                            status='delivered', vendor_name_cache='Old')
        ManifestRow.objects.create(purchase_order=gone, row_number=1, title='Delivered sofa', unit_retail=D('500.00'))
        _, data = self._stock()
        self.assertEqual(data['trucks'], [
            {'id': paid.pk, 'name': 'Target', 'pallets': 4, 'pieces': 3, 'listed': True},
            {'id': empty.pk, 'name': 'Wayfair', 'pallets': 0, 'pieces': 0, 'listed': False},
        ])
        ids = [c['id'] for c in data['cats']]
        self.assertEqual([(r[1], ids[r[2]], r[3], r[4], r[5]) for r in data['coming']],
                         [('Thing', 'furniture', 120, 1, 0), ('Air fryer XL', 'kitchen', 80, 2, 0)])
        text = json.dumps(data)
        for value in ('77.77', '66.66', '999.0', 'SECRET', 'Delivered sofa'):
            self.assertNotIn(value, text)

    def test_coming_category_words(self):
        self.assertEqual(R.CATS[R.coming_index('', 'Kids dog bed')][0], 'pet')
        self.assertNotEqual(R.CATS[R.coming_index('', 'Wall-to-wall carpet runner')][0], 'pet')  # "carpet" is not "pet"
        self.assertEqual(R.CATS[R.coming_index('MIXED_APPAREL', 'Mystery box')][0], 'apparel')
        self.assertEqual(R.CATS[R.coming_index('Mixed lots & uncategorized', 'Blender')][0], 'kitchen')
        self.assertEqual(R.CATS[R.coming_index('', 'Mystery box')][0], 'other')

    def test_best_finds_rule(self):
        rows = []
        for i in range(10):
            rows.append({'pid': i, 'cat': 0, 'price': D('10'), 'retail': D(100 + i), 'photo': False})
        rows.append({'pid': 50, 'cat': 1, 'price': D('10'), 'retail': D('20'), 'photo': True})
        rows.append({'pid': 51, 'cat': 2, 'price': D('10'), 'retail': D('0'), 'photo': True})  # no shown retail
        for c in range(3, 20):
            rows.append({'pid': 100 + c, 'cat': c, 'price': D('5'), 'retail': D(50 + c), 'photo': False})
        finds = snapshot.best_finds(rows)
        self.assertEqual([f['pid'] for f in finds], [50])  # only pieces with a photo; 51 shows no retail
        for r in rows:
            r['photo'] = True
        finds = snapshot.best_finds(rows)
        self.assertEqual(len(finds), 12)
        self.assertNotIn(51, [f['pid'] for f in finds])
        self.assertEqual([f['pid'] for f in finds if f['cat'] == 0], [9, 8])  # at most 2 per category, biggest saving first

    def test_every_taxonomy_name_has_an_id(self):
        self.assertEqual(len({cid for cid, _ in R.CATS}), 23)
        self.assertEqual(R.CATS[R.OTHER][0], 'other')

    # ── The wire ───────────────────────────────────────────────────────────────

    def test_gzip_etag_304_and_headers(self):
        self._item(self._product('Lamp'), '40.00')
        plain = self.client.get(STOCK)
        self.assertEqual(plain.status_code, 200)
        self.assertEqual(plain['Content-Type'], 'application/json')
        self.assertFalse(plain.has_header('Content-Encoding'))
        self.assertIn('Accept-Encoding', plain['Vary'])  # corsheaders adds "origin"
        self.assertEqual(plain['Cache-Control'], 'public, max-age=120, stale-while-revalidate=300')
        etag = plain['ETag']
        self.assertEqual(json.loads(plain.content)['v'], etag.strip('"'))
        zipped = self.client.get(STOCK, HTTP_ACCEPT_ENCODING='gzip, deflate, br')
        self.assertEqual(zipped['Content-Encoding'], 'gzip')
        self.assertEqual(gzip.decompress(zipped.content), plain.content)
        self.assertLess(len(zipped.content), len(plain.content))
        self.assertFalse(self.client.get(STOCK, HTTP_ACCEPT_ENCODING='gzip;q=0').has_header('Content-Encoding'))
        same = self.client.get(STOCK, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(same.status_code, 304)
        self.assertEqual(same['ETag'], etag)
        self.assertEqual(self.client.get(STOCK, HTTP_IF_NONE_MATCH=f'W/{etag}').status_code, 304)
        self.assertEqual(self.client.get(STOCK, HTTP_IF_NONE_MATCH='"other"').status_code, 200)
        home = self.client.get(HOME, HTTP_ACCEPT_ENCODING='gzip')
        self.assertEqual(home['Content-Encoding'], 'gzip')
        self.assertEqual(self.client.get(HOME, HTTP_IF_NONE_MATCH=home['ETag']).status_code, 304)

    def test_an_unchanged_shelf_keeps_its_etag_and_a_change_is_seen_after_the_refresh(self):
        p = self._product('Lamp')
        self._item(p, '40.00')
        first = self.client.get(STOCK)['ETag']
        holder.reset()
        self.assertEqual(self.client.get(STOCK)['ETag'], first)  # a rebuild of the same shelf: same ETag
        self._item(self._product('Rug'), '12.00')
        self.assertEqual(self.client.get(STOCK)['ETag'], first)  # still the copy in memory
        holder.peek().built_at -= 10_000  # older than the refresh time
        self.client.get(STOCK)  # starts the rebuild (in line in tests) and answers from the old copy
        self.assertNotEqual(self.client.get(STOCK)['ETag'], first)

    def test_a_failed_rebuild_keeps_the_old_copy(self):
        self._item(self._product('Lamp'), '40.00')
        etag = self.client.get(STOCK)['ETag']
        holder.peek().built_at -= 10_000
        with patch.object(snapshot, 'build', side_effect=RuntimeError('db down')), self.assertLogs('apps.storefront', 'ERROR'):
            self.assertEqual(self.client.get(STOCK)['ETag'], etag)
        self.assertEqual(self.client.get(STOCK).status_code, 200)

    def test_a_warm_request_runs_no_query(self):
        self._item(self._product('Lamp'), '40.00')
        self.client.get(STOCK)
        with self.assertNumQueries(0):
            self.assertEqual(self.client.get(STOCK, HTTP_ACCEPT_ENCODING='gzip').status_code, 200)
            self.assertEqual(self.client.get(HOME, HTTP_ACCEPT_ENCODING='gzip').status_code, 200)
            self.assertEqual(self.client.get(STOCK, HTTP_IF_NONE_MATCH=holder.peek().stock.etag).status_code, 304)

    def test_home_shape(self):
        lamp = self._product('Lamp', profile_cat='Home décor & lighting', photo='inventory/products/t.jpg')
        _reward(self._item(lamp, '40.00', retail='100.00', check='passed'), D('6.00'))
        AppSetting.objects.update_or_create(key='storefront.day', defaults={'value': 'bf'})
        home = json.loads(self.client.get(HOME).content)
        self.assertEqual(set(home), {'v', 'as_of', 'app', 'day', 'shelf', 'bucks', 'hours', 'thrift_plus_open', 'finds', 'coming', 'top_cats'})
        self.assertEqual(home['app'], json.loads((Path(settings.BASE_DIR) / 'package.json').read_text(encoding='utf-8'))['version'])
        self.assertEqual(home['day'], 'bf')
        # An Add item photo is never a public photo, and Best finds shows only pieces with one (owner 2026-11-20).
        self.assertEqual(home['finds'], [])
        self.assertIn('label', home['hours'])
        holder.reset()
        with patch.object(snapshot.photos, 'kinds', return_value={lamp.pk: snapshot.photos.KIND_STOCK}):
            home = json.loads(self.client.get(HOME).content)
        self.assertEqual(home['finds'], [{'pid': lamp.pk, 'name': 'Lamp (display)', 'cat': 'decor', 'price': 40, 'retail': 100,
                                          'tb': 6, 'units': 1, 'tag': lamp.items.get().sku[3:],
                                          'photo': f'/api/storefront/photo/{lamp.pk}/', 'photo_kind': 'stock'}])

    # ── One product ────────────────────────────────────────────────────────────

    def test_item_shape_budget_and_404(self):
        lamp = self._product('Brass floor lamp', profile_cat='Home décor & lighting')
        ProductProfile.objects.filter(product=lamp).update(brand='Threshold')
        a = self._item(lamp, '40.00', retail='100.00', check='passed')
        a.condition = 'like_new'
        a.save(update_fields=['condition'])
        _reward(a, D('6.00'))
        self._item(lamp, '45.00')
        R.cached_settings()  # the rules, as after a build
        with self.assertNumQueries(2):
            response = self.client.get(f'/api/storefront/item/{lamp.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'pid': lamp.pk, 'name': 'Brass floor lamp (display)', 'brand': 'Threshold', 'cat': 'decor',
            'condition': 'Like new', 'units': 2, 'tags': [a.sku[3:], lamp.items.order_by('pk').last().sku[3:]],
            'price': 40, 'retail': 100, 'tb': 6, 'returns': '3-day', 'photo': None, 'photo_kind': None,
            'available': True,
        })
        self.assertEqual(response['Cache-Control'], 'public, max-age=60')
        with self.assertNumQueries(0):
            self.assertEqual(self.client.get(f'/api/storefront/item/{lamp.pk}/').status_code, 200)  # kept 60 seconds
        cheap = self._product('Cup')
        self._item(cheap, '4.00')
        self.assertEqual(self.client.get(f'/api/storefront/item/{cheap.pk}/').json()['returns'], 'as_is')
        sold = self._product('Gone')
        self._item(sold, '10.00', status='sold')
        self.assertEqual(self.client.get(f'/api/storefront/item/{sold.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/storefront/item/999999999/').status_code, 404)

    def test_the_photo_address_has_no_source_yet(self):
        """Add item photos never go public (owner 2026-11-19): with or without one, the address answers 404."""
        bare = self._product('Bare')
        shot = self._product('Shot', photo='inventory/products/t.jpg')
        for p in (bare, shot):
            self.assertEqual(self.client.get(f'/api/storefront/photo/{p.pk}/').status_code, 404)

    def test_age_restricted_products_are_in_no_feed(self):
        bow = self._product('Crossbow', profile_cat='Sports & outdoors', photo='inventory/products/b.jpg')
        _reward(self._item(bow, '90.00', retail='300.00', check='passed'), D('9.00'))
        self._item(bow, '90.00')
        RestrictedProduct.objects.create(product=bow, reason='18+')
        ball = self._product('Ball', profile_cat='Sports & outdoors')
        self._item(ball, '5.00', retail='20.00', check='passed')
        with patch.object(snapshot.photos, 'kinds', return_value={bow.pk: snapshot.photos.KIND_STOCK, ball.pk: snapshot.photos.KIND_STOCK}):
            _, data = self._stock()
        self.assertEqual([r[0] for r in data['instore']], [ball.pk])
        self.assertEqual({c['id']: c['pieces'] for c in data['cats']}['sports'], 1)
        home = json.loads(self.client.get(HOME).content)
        self.assertEqual(home['shelf'], {'pieces': 1, 'products': 1, 'categories': 23})
        self.assertEqual([f['pid'] for f in home['finds']], [ball.pk])
        self.assertEqual(home['top_cats'][0], {'id': 'sports', 'pieces': 1})
        self.assertEqual(self.client.get(f'/api/storefront/item/{bow.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/storefront/item/{ball.pk}/').status_code, 200)

    # ── Nothing private ────────────────────────────────────────────────────────

    def test_no_payload_names_cost_notes_prices_or_location(self):
        lamp = self._product('Lamp', profile_cat='Home décor & lighting')
        _reward(self._item(lamp, '40.00', retail='100.00', check='passed'), D('6.00'))
        vendor = Vendor.objects.create(name='Target', code='TGT3')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='SF-5', ordered_date='2026-11-01', status='paid',
                                          total_cost=D('555.55'), notes='SECRET')
        ManifestRow.objects.create(purchase_order=po, row_number=1, title='Chair', unit_retail=D('80.00'),
                                   proposed_price=D('44.44'), final_price=D('33.33'), pricing_notes='SECRET', notes='SECRET')
        texts = [
            gzip.decompress(self.client.get(STOCK, HTTP_ACCEPT_ENCODING='gzip').content).decode(),
            self.client.get(HOME).content.decode(),
            self.client.get(f'/api/storefront/item/{lamp.pk}/').content.decode(),
        ]
        for text in texts:
            low = text.lower()
            for word in FORBIDDEN:
                self.assertNotIn(word, low)
            for value in ('123.45', '555.55', '44.44', '33.33', 'bin-'):
                self.assertNotIn(value, low)


class NoInternalPhotosTests(TestCase):
    """Owner 2026-11-19: "NEVER EVER EVER use photos you got from us for other purposes. like the add item photos."
    A product with an Add item photo shows no photo anywhere public, and its photo address answers 404."""

    def test_add_item_photos_never_reach_a_feed_or_the_photo_address(self):
        p = Product.objects.create(title='Brass lamp', photo='inventory/products/x.jpg', photo_thumb='inventory/products/t.jpg')
        Item.objects.create(product=p, sku='ITM0999001', price=Decimal('40.00'), retail=Decimal('100.00'),
                            retail_check='passed', status='on_shelf')
        snap = snapshot.build()
        text = json.dumps([snapshot.stock_payload(snap), snapshot.home_payload(snap)], default=str)
        self.assertNotIn('inventory/products', text)
        self.assertNotIn(f'/api/storefront/photo/{p.pk}/', text)
        self.assertEqual(self.client.get(f'/api/storefront/photo/{p.pk}/').status_code, 404)
        item = self.client.get(f'/api/storefront/item/{p.pk}/')
        if item.status_code == 200:
            self.assertIsNone(item.json()['photo'])
