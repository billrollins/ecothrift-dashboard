"""AI suggest-item example retrieval — must not reference nonexistent Item.category."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.inventory.models import Item, Product
from apps.inventory.services.ai_listing_context import retrieve_listing_examples_for_prompt


class RetrieveListingExamplesTests(TestCase):
    def test_does_not_query_item_category_column(self):
        product = Product.objects.create(
            title='Old Spice Captain Body Wash',
            brand='Old Spice',
            category='Health & Beauty',
        )
        Item.objects.create(
            product=product,
            status='sold',
            sold_for=Decimal('4.99'),
            sold_at=timezone.now(),
            price=Decimal('4.99'),
        )
        examples, count = retrieve_listing_examples_for_prompt(
            'old spice captain body wash 24 fl oz',
            brand='Old Spice',
            category_name='Health & Beauty',
        )
        self.assertGreaterEqual(count, 1)
        self.assertTrue(any('Old Spice' in (ex.get('title') or '') for ex in examples))
