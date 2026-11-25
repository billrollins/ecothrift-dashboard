"""Dash Update #224, pack sizes: the shared pack standard and "New pack size" (services/product_packs.py)."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.inventory.services import product_packs as packs


class PackWordsTests(SimpleTestCase):
    def test_the_standard_words(self):
        self.assertEqual(packs.pack_label(100, 'box', 3), '3 boxes × 100')
        self.assertEqual(packs.pack_label(100, '', 1), '100 ct')
        self.assertEqual(packs.pack_label(48, 'case', 2), '2 cases × 48')
        self.assertEqual(packs.pack_label(None, 'box', 3), '3 boxes')
        self.assertEqual(packs.pack_label(None, '', 1), '')
        self.assertEqual(packs.total_pieces(200, 3), 600)

    def test_a_title_is_read_for_the_first_guess(self):
        self.assertEqual(packs.parse_pack('Tampons Regular, 3 boxes × 100')['pack_units'], 3)
        self.assertEqual(packs.parse_pack('Tampons Regular, 3 boxes × 100')['unit_name'], 'box')
        self.assertEqual(packs.parse_pack('Tampons Pack of 100')['unit_count'], 100)
        self.assertEqual(packs.parse_pack('Kleenex Tissues 100 ct')['unit_count'], 100)
        self.assertEqual(packs.parse_pack('Energizer 2032 Batteries 2-Pack')['unit_count'], 2)
        self.assertEqual(packs.parse_pack('Picture frame 8 x 10 in'), {})
        self.assertEqual(packs.parse_pack('Bar stool'), {})

    def test_retitle_swaps_the_pack_words_for_the_standard(self):
        self.assertEqual(packs.retitle('Tampons Regular Pack of 100', '3 boxes × 200'), 'Tampons Regular - 3 boxes × 200')
        self.assertEqual(packs.retitle('Bar stool', '2 ct'), 'Bar stool - 2 ct')

    def test_price_scales_from_the_base(self):
        # Bill: "if 100 tampons is $1 then 3 box set of 200 is $6".
        self.assertEqual(packs.scale('1.00', 100, 600), Decimal('6.00'))
        self.assertEqual(packs.scale('', 100, 600), None)
        self.assertEqual(packs.scale('5', None, 600), None)


class NewPackTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(email='pk@example.com', first_name='P', last_name='K', password='pw')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=user)
        self.base = Product.objects.create(title='Tampons Regular Pack of 100', brand='Tampax')
        self.other = Product.objects.create(title='Something else', brand='Acme')

    def test_new_pack_is_linked_scaled_and_changes_nothing_else(self):
        r = self.client.post(f'/api/inventory/products/{self.base.id}/new-pack/', {
            'unit_count': 200, 'unit_name': 'boxes', 'pack_units': 3, 'base_price': '1.00', 'base_retail': '4.00',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['price'], r.data['retail']), ('6.00', '24.00'))
        self.assertEqual(r.data['label'], '3 boxes × 200')
        new = Product.objects.get(pk=r.data['product']['id'])
        self.assertEqual((new.unit_count, new.unit_name, new.pack_units, new.base_product_id), (200, 'box', 3, self.base.id))
        self.assertEqual(new.title, 'Tampons Regular - 3 boxes × 200')
        self.assertEqual(new.brand, 'Tampax')
        self.base.refresh_from_db()
        self.assertEqual((self.base.unit_count, self.base.title), (None, 'Tampons Regular Pack of 100'))

    def test_it_was_really_10_fixes_the_base_only_when_asked(self):
        r = self.client.post(f'/api/inventory/products/{self.base.id}/new-pack/', {
            'unit_count': 10, 'unit_name': '', 'pack_units': 3, 'base_unit_count': 10, 'base_price': '1.00',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['price'], '3.00')  # scaled from the corrected 10
        self.base.refresh_from_db()
        self.assertIsNone(self.base.unit_count)

        r = self.client.post(f'/api/inventory/products/{self.base.id}/new-pack/', {
            'unit_count': 10, 'pack_units': 2, 'base_unit_count': 10, 'fix_base': True,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['base']['fixed'])
        self.base.refresh_from_db()
        self.assertEqual((self.base.unit_count, self.base.pack_units), (10, 1))
        self.assertEqual(self.base.title, 'Tampons Regular - 10 ct')

    def test_a_pack_of_a_pack_links_to_the_first_base(self):
        r = self.client.post(f'/api/inventory/products/{self.base.id}/new-pack/', {'unit_count': 100, 'pack_units': 3}, format='json')
        pack_id = r.data['product']['id']
        r = self.client.post(f'/api/inventory/products/{pack_id}/new-pack/', {'unit_count': 100, 'pack_units': 6}, format='json')
        self.assertEqual(Product.objects.get(pk=r.data['product']['id']).base_product_id, self.base.id)

    def test_plain_words_for_a_bad_count(self):
        r = self.client.post(f'/api/inventory/products/{self.other.id}/new-pack/', {'unit_count': 5, 'pack_units': 2}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('how many', r.data['detail'])
        r = self.client.post(f'/api/inventory/products/{self.base.id}/new-pack/', {'unit_count': 0}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_the_pack_view_guesses_from_the_title(self):
        r = self.client.get(f'/api/inventory/products/{self.base.id}/pack/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['guess'], {'unit_count': 100, 'unit_name': '', 'pack_units': 1, 'from_title': True})
        self.assertFalse(r.data['is_pack'])
