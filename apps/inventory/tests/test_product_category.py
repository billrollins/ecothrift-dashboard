"""Edit category: staff set a product's category and subcategory from the taxonomy (Bill, 2026-10-28)."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Category, Product, ProductProfile
from apps.inventory.services.product_profile import set_field


def _user(email, role=None):
    user = get_user_model().objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='Tester',
                                                password='pw')
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


class EditCategoryTests(TestCase):
    def setUp(self):
        self.cat = Category.objects.get_or_create(name='Electronics', defaults={'slug': 'electronics-ec'})[0]
        self.client = APIClient()
        self.client.force_authenticate(user=_user('dana@example.com', 'Employee'))
        self.phone = Product.objects.create(title='Samsung Galaxy A12, 32GB, Black, Unlocked', brand='Samsung',
                                            category=self.cat)
        ProductProfile.objects.create(product=self.phone, category='Electronics', subcategory='Phone & tablet cases')
        self.url = f'/api/inventory/products/{self.phone.pk}/category/'

    def test_get_shows_the_standard(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {'product_id': self.phone.pk, 'category': 'Electronics',
                                    'subcategory': 'Phone & tablet cases'})

    def test_post_sets_both_by_hand(self):
        res = self.client.post(self.url, {'category': 'Electronics', 'subcategory': 'Phones & tablets'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['subcategory'], 'Phones & tablets')
        profile = ProductProfile.objects.get(product=self.phone)
        self.assertEqual(profile.subcategory, 'Phones & tablets')
        self.assertEqual(profile.field_meta['subcategory']['source'], 'human')
        self.assertEqual(profile.field_meta['category']['source'], 'human')
        # A machine pass can't undo the hand-set value.
        self.assertFalse(set_field(self.phone, 'subcategory', 'Audio', source='ai:test'))

    def test_new_category_moves_the_product_row_too(self):
        res = self.client.post(self.url, {'category': 'Toys & games', 'subcategory': 'Figures'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.phone.refresh_from_db()
        self.assertEqual(self.phone.category.name, 'Toys & games')

    def test_a_product_with_no_standard_gets_one(self):
        bare = Product.objects.create(title='Old Flip Phone', category=self.cat)
        res = self.client.post(f'/api/inventory/products/{bare.pk}/category/',
                               {'category': 'Electronics', 'subcategory': 'Phones & tablets'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(ProductProfile.objects.get(product=bare).category, 'Electronics')

    def test_refuses_names_outside_the_taxonomy(self):
        bad = [
            {'category': 'Phones', 'subcategory': 'Phones & tablets'},
            {'category': 'Electronics', 'subcategory': 'Figures'},
            {'category': 'Electronics', 'subcategory': ''},
        ]
        for body in bad:
            res = self.client.post(self.url, body, format='json')
            self.assertEqual(res.status_code, 400, body)
        self.assertEqual(ProductProfile.objects.get(product=self.phone).subcategory, 'Phone & tablet cases')

    def test_mixed_lots_has_no_subcategory(self):
        res = self.client.post(self.url, {'category': 'Mixed lots & uncategorized', 'subcategory': 'Audio'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['subcategory'], '')

    def test_staff_only(self):
        outsider = APIClient()
        outsider.force_authenticate(user=_user('shopper@example.com', 'Customer'))
        res = outsider.post(self.url, {'category': 'Electronics', 'subcategory': 'Phones & tablets'}, format='json')
        self.assertIn(res.status_code, (401, 403))
        self.assertEqual(APIClient().get(self.url).status_code, 401)
