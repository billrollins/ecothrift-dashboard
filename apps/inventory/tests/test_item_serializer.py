"""ItemSerializer - category + retail_value for Add Item / item detail panel."""

from decimal import Decimal

from django.test import TestCase

from apps.inventory.models import Category, Item, Product, PurchaseOrder, Vendor
from apps.inventory.serializers import ItemSerializer


class ItemSerializerCategoryRetailTests(TestCase):
    def _category(self, name):
        category, _ = Category.objects.get_or_create(name=name)
        return category

    def test_retrieve_includes_purchase_order_number(self):
        vendor = Vendor.objects.create(name='Acme Liquidators', code='ACME')
        order = PurchaseOrder.objects.create(
            vendor=vendor,
            order_number='PO-2026-0042',
            ordered_date='2026-06-01',
            status='received',
        )
        item = Item.objects.create(
            product=Product.objects.create(title='Widget', brand='Generic'),
            purchase_order=order,
            price=Decimal('3.50'),
        )
        data = ItemSerializer(item).data
        self.assertEqual(data['purchase_order'], order.id)
        self.assertEqual(data['purchase_order_number'], 'PO-2026-0042')

    def test_retrieve_includes_category_and_retail_value_alias(self):
        product = Product.objects.create(
            title='Bubble Toy',
            brand='Generic',
            category=self._category('Toys & games'),
        )
        item = Item.objects.create(
            product=product,
            price=Decimal('3.50'),
            retail=Decimal('5.99'),
        )
        data = ItemSerializer(item).data
        self.assertEqual(data['category'], 'Toys & games')
        self.assertEqual(data['retail_value'], '5.99')
        self.assertEqual(data['retail'], '5.99')

    def test_create_persists_category_on_new_product_and_retail_value(self):
        ser = ItemSerializer(
            data={
                'title': 'Gazillion Bubbles',
                'brand': 'Generic',
                'category': 'Toys & Games',
                'model': 'BUB-24',
                'upc': '123456789012',
                'price': '3.50',
                'retail_value': '4.99',
                'source': 'purchased',
                'condition': 'new',
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        item = ser.save()
        item.refresh_from_db()
        self.assertIsNotNone(item.product_id)
        self.assertEqual(item.product.category.name, 'Toys & games')
        self.assertEqual(item.product.model, 'BUB-24')
        self.assertEqual(item.product.identifiers.get('upc'), '123456789012')
        self.assertEqual(item.retail, Decimal('4.99'))
        self.assertEqual(ItemSerializer(item).data['category'], 'Toys & games')

    def test_create_reuses_product_by_upc_without_rewriting_identity(self):
        product = Product.objects.create(
            title='Old Spice Body Wash',
            brand='Old Spice',
            model='Captain 24 oz',
            category=self._category('Health, beauty & personal care'),
            identifiers={'upc': '012345678905'},
        )
        ser = ItemSerializer(
            data={
                'title': 'old spice captain body wash 24 fl oz',
                'brand': 'Old Spice',
                'category': 'Health & Beauty',
                'model': 'Captain 24 fl oz',
                'upc': '012345678905',
                'price': '5.99',
                'retail_value': '8.99',
                'source': 'purchased',
                'condition': 'new',
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        item = ser.save()
        item.refresh_from_db()
        product.refresh_from_db()
        self.assertEqual(item.product_id, product.id)
        self.assertEqual(product.title, 'Old Spice Body Wash')
        self.assertEqual(product.model, 'Captain 24 oz')

    def test_update_routes_category_model_upc_to_linked_product(self):
        product = Product.objects.create(title='Old Title', brand='Generic')
        item = Item.objects.create(
            product=product,
            price=Decimal('3.50'),
            retail=Decimal('5.99'),
        )
        ser = ItemSerializer(
            item,
            data={
                'category': 'Toys & Games',
                'model': 'NERF-1',
                'upc': '999999999999',
                'title': 'New Title',
                'brand': 'New Brand',
            },
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        updated = ser.save()
        updated.product.refresh_from_db()
        self.assertEqual(updated.product.title, 'New Title')
        self.assertEqual(updated.product.brand, 'New Brand')
        self.assertEqual(updated.product.category.name, 'Toys & games')
        self.assertEqual(updated.product.model, 'NERF-1')
        self.assertEqual(updated.product.identifiers.get('upc'), '999999999999')

    def test_create_persists_search_tags_on_product_specifications(self):
        ser = ItemSerializer(
            data={
                'title': 'Old Spice Captain Body Wash',
                'brand': 'Old Spice',
                'category': 'Health & Beauty',
                'model': 'Captain 24 oz',
                'price': '5.99',
                'retail_value': '8.99',
                'search_tags': ['24 fl oz', 'body wash'],
                'source': 'purchased',
                'condition': 'new',
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        item = ser.save()
        item.refresh_from_db()
        self.assertEqual(item.retail, Decimal('8.99'))
        self.assertEqual(item.product.tags, ['24 fl oz', 'body wash'])

    def test_create_merges_search_tags_without_overwriting_existing_product_specs(self):
        product = Product.objects.create(
            title='Old Spice Captain Body Wash',
            brand='Old Spice',
            identifiers={'upc': '012345678905'},
            specifications={'scent': 'Captain'},
            tags=['body wash'],
        )
        ser = ItemSerializer(
            data={
                'title': 'Old Spice Captain Body Wash',
                'brand': 'Old Spice',
                'category': 'Health & Beauty',
                'price': '5.99',
                'retail_value': '8.99',
                'search_tags': ['24 fl oz', 'body wash'],
                'upc': '012345678905',
                'source': 'purchased',
                'condition': 'new',
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        item = ser.save()
        item.refresh_from_db()
        product.refresh_from_db()
        self.assertEqual(item.product_id, product.id)
        self.assertEqual(product.specifications.get('scent'), 'Captain')
        self.assertEqual(product.tags, ['body wash', '24 fl oz'])
