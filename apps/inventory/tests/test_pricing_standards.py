"""Pricing standards (#180): the suggestion, the commodity price, the deep-stock check and step, the report, the truck."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import (
    BulkPriceChange, Category, Item, ItemHistory, ManifestRow, ProcessingRow, Product, PurchaseOrder, Vendor,
)
from apps.inventory.services import bulk_price
from apps.inventory.services import pricing_standards as ps

D = Decimal


class SuggestAndPriceTests(TestCase):
    def test_the_po428_words(self):
        self.assertEqual(ps.suggest('Energizer 2032 Batteries 2-Pack'), ps.NAME_BRAND)
        self.assertEqual(ps.suggest('Tide Pods Original 42ct', 'Tide'), ps.NAME_BRAND)
        self.assertEqual(ps.suggest('Great Value 13 Gallon Trash Bags'), ps.STORE_BRAND)
        self.assertEqual(ps.suggest('Ibuprofen 200mg 100ct', 'Equate'), ps.STORE_BRAND)     # a store brand alone
        self.assertEqual(ps.suggest('Lego Star Wars Set'), '')
        self.assertEqual(ps.suggest('Kidde Carbon Monoxide Alarm'), '')                     # not "carb"
        self.assertEqual(ps.suggest('Christmas Glade Candle'), '')                          # seasonal first
        self.assertEqual(ps.suggest('Mainstays Bath Towel'), '')                            # not a consumable
        # Durable goods and toys carrying a consumable's word (seen on other trucks), and Target's store brand.
        self.assertEqual(ps.suggest('Skibidi Toilet TV Woman 6" Action Figure'), '')
        self.assertEqual(ps.suggest('Tonamo 80V Battery for Greenworks'), '')
        self.assertEqual(ps.suggest('Clorox One Sweep Broom and Dustpan Set'), '')
        self.assertEqual(ps.suggest('Room Essentials Twist and Shout Curtain Rod'), '')
        self.assertEqual(ps.suggest('Max 9V Battery 1-Pack'), ps.NAME_BRAND)
        self.assertEqual(ps.suggest('up&up Soft & Strong Toilet Paper 18 Rolls'), ps.STORE_BRAND)

    def test_the_price_is_the_share_of_retail_rounded_the_house_way(self):
        s = ps.standards()
        self.assertEqual(ps.commodity_price(ps.NAME_BRAND, '6.47', s), D('4.00'))     # 4.21 -> to 50 cents (PO 428 row 1)
        self.assertEqual(ps.commodity_price(ps.NAME_BRAND, '36.98', s), D('24.00'))   # 24.04 -> to the dollar
        self.assertEqual(ps.commodity_price(ps.STORE_BRAND, '8.87', s), D('5.00'))    # 4.88 at 55%
        self.assertEqual(ps.commodity_price(ps.NAME_BRAND, '0.88', s), D('0.50'))     # under $1 retail: 25 cents
        self.assertIsNone(ps.commodity_price(ps.NOT_ONE, '10', s))
        self.assertIsNone(ps.commodity_price(ps.NAME_BRAND, '', s))

    def test_owner_settings_change_the_share_and_bad_values_fall_back(self):
        AppSetting.objects.create(key='pricing_commodity_name_share', value=0.7)
        AppSetting.objects.create(key='pricing_deep_min_units', value='lots')
        s = ps.standards()
        self.assertEqual((s.name_share, s.deep_min_units), (D('0.7'), 24))
        self.assertEqual(ps.commodity_price(ps.NAME_BRAND, '10', s), D('7.00'))


class Base(TestCase):
    def setUp(self):
        self.cat = Category.objects.get_or_create(name='Household & cleaning', defaults={'slug': 'hc-ps'})[0]
        self.manager = self._user('boss-ps@example.com', 'Manager')
        self.clerk = self._user('clerk-ps@example.com', 'Employee')
        self.today = timezone.localdate()

    def _user(self, email, group):
        u = User.objects.create_user(email=email, first_name=group, last_name='X', password='x-pass-123')
        u.groups.add(Group.objects.get_or_create(name=group)[0])
        return u

    def _product(self, title, standard=''):
        return Product.objects.create(title=title, brand='Brand', category=self.cat, price_standard=standard)

    def _units(self, product, n, *, price='6.50', retail='10.00', days_ago=20, status='on_shelf', sold_days_ago=None):
        at = timezone.now() - timedelta(days=days_ago)
        out = []
        for _ in range(n):
            sku = f'PS{Item.objects.count() + 1:06d}'
            sold_at = timezone.now() - timedelta(days=sold_days_ago) if sold_days_ago is not None else None
            out.append(Item.objects.create(product=product, sku=sku, price=D(price), retail=D(retail), status=status,
                                           listed_at=at, sold_at=sold_at))
        return out

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c


class CheckInLineTests(Base):
    def test_undecided_shows_the_suggestion_and_a_person_confirms_or_says_no(self):
        p = self._product('Duracell AA Batteries 20 pack')
        c = self._client(self.clerk)
        line = c.get(f'/api/inventory/pricing-standards/product/{p.pk}/', {'retail': '17.47'}).json()
        self.assertEqual((line['standard'], line['suggested'], line['price']), ('', ps.NAME_BRAND, '11.00'))
        res = c.post(f'/api/inventory/pricing-standards/product/{p.pk}/mark/', {'standard': 'no'}, format='json')
        self.assertEqual((res.status_code, res.json()['suggested'], res.json()['price']), (200, '', None))
        p.refresh_from_db()
        self.assertEqual(p.price_standard, 'no')
        res = c.post(f'/api/inventory/pricing-standards/product/{p.pk}/mark/', {'standard': 'store_brand', 'retail': '10'}, format='json')
        self.assertEqual((res.json()['standard'], res.json()['price']), ('store_brand', '5.50'))
        self.assertEqual(c.post(f'/api/inventory/pricing-standards/product/{p.pk}/mark/', {'standard': 'x'}, format='json').status_code, 400)


class DeepStockTests(Base):
    def test_not_on_pace_is_due_one_step_and_the_step_is_applied_only_on_approval(self):
        p = self._product('Serta King Pillow')
        units = self._units(p, 30)                                          # 30 on the shelf for 20 days
        self._units(p, 2, status='sold', sold_days_ago=5)                   # 2 sold since: 0.1 a day
        row = ps.deep_stock()['rows'][0]
        self.assertEqual((row['status'], row['units'], row['sold'], row['on_pace']), ('due', 30, 2, False))
        self.assertEqual((row['new_low'], row['pct_now'], row['pct_after']), ('5.50', 65, 55))
        units[0].refresh_from_db()
        self.assertEqual(units[0].price, D('6.50'))                         # the list changes nothing

        self.assertEqual(self._client(self.clerk).post('/api/inventory/pricing-standards/deep-stock/step/',
                                                       {'product_ids': [p.pk]}, format='json').status_code, 403)
        res = self._client(self.manager).post('/api/inventory/pricing-standards/deep-stock/step/',
                                              {'product_ids': [p.pk]}, format='json')
        self.assertEqual(res.status_code, 201)
        change = BulkPriceChange.objects.get()
        self.assertEqual((change.rule['standard'], change.rule['product_id'], change.item_count), ('deep_stock', p.pk, 30))
        self.assertEqual(Item.objects.filter(product=p, status='on_shelf', price=D('5.50')).count(), 30)
        self.assertEqual(ItemHistory.objects.filter(event_type='price_change').count(), 30)
        self.assertEqual(len(res.json()['changes'][0]['items']), 30)        # what the reprint needs

        again = ps.deep_stock()['rows'][0]                                  # the next check is two weeks on
        self.assertEqual((again['status'], again['last_step']), ('waiting', self.today.isoformat()))
        report = ps.stepped()
        self.assertEqual((len(report), report[0]['units'], report[0]['pct_before'], report[0]['pct_after']), (1, 30, 65, 55))
        bulk_price.undo(change, self.manager)                               # Bulk work's undo puts it back
        self.assertEqual(Item.objects.filter(product=p, price=D('6.50')).count(), 32)
        self.assertEqual(ps.deep_stock()['rows'][0]['status'], 'due')      # an undone step does not count

    def test_on_pace_waiting_the_floor_and_under_the_unit_count(self):
        fast = self._product('Fast Seller')
        self._units(fast, 24)
        self._units(fast, 30, status='sold', sold_days_ago=3)               # 1.5 a day: sells out in time
        young = self._product('Just Out')
        self._units(young, 25, days_ago=5)                                  # first check on day 14
        low = self._product('At The Floor')
        self._units(low, 25, price='3.00')                                  # 30% of $10 already
        few = self._product('Only Twenty')
        self._units(few, 20)
        mixed = self._product('Amazing Item')
        self._units(mixed, 20, price='2.00')
        self._units(mixed, 5, price='9.00')                                 # unlike items under one name
        rows = {r['title']: r for r in ps.deep_stock()['rows']}
        self.assertEqual(set(rows), {'Fast Seller', 'Just Out', 'At The Floor', 'Amazing Item'})
        self.assertEqual(rows['Amazing Item']['status'], 'mixed')
        self.assertEqual(rows['Fast Seller']['status'], 'on_pace')
        self.assertEqual(rows['Just Out']['status'], 'waiting')
        self.assertEqual(rows['At The Floor']['status'], 'at_floor')
        with self.assertRaises(ps.StandardError):
            ps.step(self.manager, [fast.pk, young.pk, low.pk, mixed.pk])

    def test_a_commodity_stops_at_its_own_floor(self):
        p = self._product('Tide Pods', standard=ps.NAME_BRAND)
        self._units(p, 24, price='5.00', days_ago=70)                       # past 8 weeks: never on pace
        row = ps.deep_stock()['rows'][0]
        self.assertEqual((row['status'], row['new_low'], row['floor_share']), ('due', '4.50', 0.45))


class ReportsAndTruckTests(Base):
    def test_a_commodity_that_sat_past_the_sit_days_is_asked_about(self):
        p = self._product('Clorox Wipes', standard=ps.NAME_BRAND)
        self._units(p, 2, days_ago=70)
        self._units(self._product('Plain Lamp'), 2, days_ago=70)
        rows = ps.sat_too_long()
        self.assertEqual([(r['title'], r['units'], r['oldest_days']) for r in rows], [('Clorox Wipes', 2, 70)])

    def test_the_truck_preview_prices_commodity_lines_and_apply_confirms_the_products(self):
        vendor = Vendor.objects.create(name='Walmart', code='WMPS')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='PS-428', ordered_date=self.today)
        open_product = self._product('Tide Pods Original 42ct')
        said_no = self._product('Tide Pods Travel', standard=ps.NOT_ONE)
        mr = ManifestRow.objects.create(purchase_order=po, row_number=1, title='TIDE PODS 42CT', unit_retail=D('13.97'))
        tide = ProcessingRow.objects.create(purchase_order=po, row_number=1, manifest_row=mr, title='Tide Pods Original 42ct',
                                            brand='Tide', quantity=4, unit_retail=D('13.97'), matched_product=open_product)
        ProcessingRow.objects.create(purchase_order=po, row_number=2, title='Tide Pods Travel', unit_retail=D('5'),
                                     matched_product=said_no)
        ProcessingRow.objects.create(purchase_order=po, row_number=3, title='Lego Set', unit_retail=D('20'))
        gv = ProcessingRow.objects.create(purchase_order=po, row_number=4, title='Great Value Paper Towels', unit_retail=D('8.87'))
        ProcessingRow.objects.create(purchase_order=po, row_number=5, title='Bounty Paper Towels', unit_retail=D('10'),
                                     qty_dispositioned=1)                   # already checked in: left alone

        c = self._client(self.manager)
        self.assertIn(po.pk, [t['id'] for t in c.get('/api/inventory/pricing-standards/trucks/').json()['results']])
        rows = c.get(f'/api/inventory/pricing-standards/truck/{po.pk}/').json()['rows']
        self.assertEqual([(r['row_number'], r['price'], r['standard']) for r in rows],
                         [(1, '9.00', 'name_brand'), (4, '5.00', 'store_brand')])
        res = c.post(f'/api/inventory/pricing-standards/truck/{po.pk}/apply/', {'row_ids': [tide.pk, gv.pk]}, format='json')
        self.assertEqual(res.json(), {'priced': 2, 'confirmed': 1})
        tide.refresh_from_db()
        mr.refresh_from_db()
        open_product.refresh_from_db()
        self.assertEqual((tide.final_price, tide.shelf_price, mr.proposed_price), (D('9.00'), D('9.00'), D('9.00')))
        self.assertTrue(tide.pricing_notes.startswith('Commodity, name brand: 65% of retail'))
        self.assertEqual(open_product.price_standard, ps.NAME_BRAND)
        self.assertEqual(self._client(self.clerk).get(f'/api/inventory/pricing-standards/truck/{po.pk}/').status_code, 403)
