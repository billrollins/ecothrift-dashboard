"""Product vectors in pgvector and similar-product lookups (product_intelligence Phase 2, step 6).

The embedding model is replaced by a tiny keyword embedder, so tests never download it.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, Product, ProductVector
from apps.inventory.services import product_vectors as pv
from apps.inventory.services.product_profile import set_field

WORDS = ['bottle', 'tumbler', 'mallet', 'hammer', 'kitchen', 'tools']


def fake_embed(texts, batch_size=256):
    out = []
    for t in texts:
        low = t.lower()
        vec = [1.0 if w in low else 0.0 for w in WORDS] + [0.01] * (384 - len(WORDS))
        norm = sum(x * x for x in vec) ** 0.5
        out.append([x / norm for x in vec])
    return out


@mock.patch.object(pv, 'embed_texts', side_effect=fake_embed)
class ProductVectorTests(TestCase):
    def setUp(self):
        self.bottle = Product.objects.create(title='Owala FreeSip water bottle')
        self.tumbler = Product.objects.create(title='Stanley tumbler bottle')
        self.mallet = Product.objects.create(title='Husky rubber mallet hammer')
        # Only these three: the test database also holds products seeded by data migrations.
        self.mine = Product.objects.filter(pk__in=[self.bottle.pk, self.tumbler.pk, self.mallet.pk])

    def test_embed_skips_unchanged_and_refreshes_on_profile_change(self, _embed):
        counts = pv.embed_products(self.mine)
        self.assertEqual(counts, {'created': 3, 'updated': 0, 'skipped': 0})
        self.assertEqual(pv.embed_products(self.mine), {'created': 0, 'updated': 0, 'skipped': 3})
        set_field(self.bottle, 'category', 'Kitchen & dining', source='human')
        self.assertEqual(pv.embed_products(self.mine), {'created': 0, 'updated': 1, 'skipped': 2})
        self.assertEqual(ProductVector.objects.get(product=self.bottle).model_name, pv.MODEL_NAME)

    def test_similar_by_product_and_by_text(self, _embed):
        pv.embed_products(self.mine)
        near = pv.similar_products(product=self.bottle, limit=2)
        self.assertEqual([r['product_id'] for r in near], [self.tumbler.pk, self.mallet.pk])
        self.assertGreater(near[0]['similarity'], near[1]['similarity'])
        by_text = pv.similar_products(text='claw hammer', limit=1)
        self.assertEqual(by_text[0]['product_id'], self.mallet.pk)

    def test_sold_only_and_category_filters(self, _embed):
        Item.objects.create(product=self.mallet, sku='ITMVEC00001', sold_for=5)
        set_field(self.tumbler, 'category', 'Kitchen & dining', source='human')
        pv.embed_products(self.mine)
        self.assertEqual([r['product_id'] for r in pv.similar_products(product=self.bottle, sold_only=True)], [self.mallet.pk])
        self.assertEqual(
            [r['product_id'] for r in pv.similar_products(product=self.bottle, category='Kitchen & dining')],
            [self.tumbler.pk],
        )

    def test_command_runs_in_chunks(self, _embed):
        call_command('embed_products', '--chunk', '2', stdout=mock.MagicMock())
        self.assertEqual(ProductVector.objects.filter(product__in=self.mine).count(), 3)
        self.assertEqual(ProductVector.objects.count(), Product.objects.count())

    def test_api(self, _embed):
        pv.embed_products(self.mine)
        user = get_user_model().objects.create_user(email='v@test.local', password='x', first_name='V', last_name='T')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        client = APIClient()
        client.force_authenticate(user=user)
        r = client.get('/api/inventory/similar-products/', {'product': self.bottle.pk, 'limit': 1})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['results'][0]['product_id'], self.tumbler.pk)
        self.assertEqual(client.get('/api/inventory/similar-products/').status_code, 400)
        self.assertEqual(client.get('/api/inventory/similar-products/', {'product': 999999}).status_code, 404)
