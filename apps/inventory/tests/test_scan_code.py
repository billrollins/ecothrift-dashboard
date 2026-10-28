"""The Thrift+ Perks tag's QR link (HTTPS://ECOTHRIFT.US/I/<SKU>, 2026-10-28) scans as its SKU in every lookup."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.inventory.services.scan_code import sku_from_scan, tag_link

LINK = 'HTTPS://ECOTHRIFT.US/I/ITM0226342'


class SkuFromScanTests(SimpleTestCase):
    def test_the_link_in_any_case_with_or_without_https(self):
        for raw in (LINK, 'https://ecothrift.us/i/itm0226342', 'ecothrift.us/I/ITM0226342/', 'www.ecothrift.us/i/ITM0226342',
                    'HTTPS;//ECOTHRIFT.US/I/ITM0226342', '  http://ecothrift.us/i/ITM0226342?x=1 '):
            self.assertEqual(sku_from_scan(raw), 'ITM0226342', raw)

    def test_old_tags_and_other_codes_come_through_as_they_were(self):
        self.assertEqual(sku_from_scan(' ITM0048211 '), 'ITM0048211')
        self.assertEqual(sku_from_scan('itm0048211'), 'itm0048211')
        self.assertEqual(sku_from_scan('012345678905'), '012345678905')
        self.assertEqual(sku_from_scan('https://ecothrift.us/terms'), 'https://ecothrift.us/terms')
        self.assertEqual(sku_from_scan('https://example.com/i/ITM0226342'), 'https://example.com/i/ITM0226342')
        self.assertEqual(sku_from_scan(None), '')

    def test_the_link_is_built_in_capitals(self):
        self.assertEqual(tag_link('itm0226342'), LINK)
        self.assertEqual(sku_from_scan(tag_link('ITM0226342')), 'ITM0226342')


class EveryLookupTests(TestCase):
    """Register, Restoration, Count / PR Fix-it, the Thrift+ scanner, Social, search and the public lookup."""

    def setUp(self):
        self.item = Item.objects.create(sku='ITM0226342', product=Product.objects.create(title='Toaster'),
                                        price=Decimal('12.00'), status='on_shelf')

    def test_restoration_scan(self):
        from apps.inventory.services.restoration import _find_item_by_identifier

        self.assertEqual(_find_item_by_identifier(LINK), self.item)
        self.assertEqual(_find_item_by_identifier('ITM0226342'), self.item)

    def test_count_and_pr_fixit_codes(self):
        from apps.stocktake.services.counting import normalize_code

        self.assertEqual(normalize_code(LINK), 'ITM0226342')
        self.assertEqual(normalize_code(' itm0226342 '), 'ITM0226342')

    def test_thrift_plus_scanner_and_social(self):
        from apps.marketing.services.tags import lookup
        from apps.thriftplus.services.scanner import find_item

        self.assertEqual(find_item(LINK), self.item)
        self.assertEqual(find_item('ecothrift.us/i/itm0226342'), self.item)
        self.assertEqual(lookup(LINK)['status'], 'found')

    def test_inventory_search(self):
        from apps.inventory.services.inventory_search import search

        found = search(LINK)
        self.assertEqual(found['q'], 'ITM0226342')
        self.assertEqual(found['results'][0]['matched_sku'], 'ITM0226342')

    def test_public_item_lookup_any_case(self):
        r = APIClient().get('/api/inventory/items/lookup/itm0226342/')
        self.assertEqual(r.status_code, 200, r.content)


class RegisterScanTests(TestCase):
    def setUp(self):
        from apps.pos.models import Drawer, Register

        self.client = APIClient()
        self.user = User.objects.create_user(email='reg@example.com', first_name='R', last_name='S', password='x')
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client.force_authenticate(user=self.user)
        register = Register.objects.create(location=WorkLocation.objects.create(name='Front'), name='Reg 1', code='R1')
        self.drawer = Drawer.objects.create(register=register, date=timezone.now().date(), current_cashier=self.user,
                                            opened_by=self.user, opened_at=timezone.now(), status='open')
        category = Category.objects.create(name='Kitchen', slug='kitchen')
        self.item = Item.objects.create(sku='ITM0226342', price=Decimal('12.00'), status='on_shelf',
                                        product=Product.objects.create(title='Toaster', category=category))

    def test_the_register_rings_up_a_scanned_tag_link(self):
        from apps.pos.models import CartLine

        cart = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json').json()
        r = self.client.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': LINK}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertTrue(CartLine.objects.filter(cart_id=cart['id'], item=self.item).exists())
