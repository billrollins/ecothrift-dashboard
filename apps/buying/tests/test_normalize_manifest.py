"""Unit tests for B-Stock manifest normalization (order-process JSON shape)."""

from decimal import Decimal

from django.test import SimpleTestCase

from apps.buying.services.normalize import normalize_manifest_row

# Minimal rows shaped like audit samples (Target / Amazon / Walmart).


TARGET_LIKE = {
    '_id': 't1',
    'status': 'active',
    'groupId': 'g1',
    'palletId': 'PAL99',
    'quantity': 2,
    'accountId': 'a1',
    'uniqueIds': {'itemNumber': 'LPJY383340'},
    'attributes': {
        'ids': {'upc': ['194735235797'], 'tcin': ['89960128']},
        'item': {'countryOfOrigin': 'China'},
        'brandName': 'Acme Toys',
        'extRetail': '100.00',
        'unitRetail': '49.99',
        'description': 'Example product title',
        'currencyCode': 'USD',
    },
    'categories': ['TOYS'],
    'itemCondition': 'new',
}

AMAZON_LIKE = {
    '_id': 'a1',
    'quantity': 1,
    'attributes': {
        'ids': {'asin': ['B0DZ6HYYLT']},
        'brandName': 'Amazon Basics',
        'unitRetail': '19.99',
        'description': 'Claw hammer',
        'currencyCode': 'USD',
    },
    'categories': ['BUILDING_AND_HARDWARE'],
    'itemCondition': 'used',
}

WALMART_LIKE = {
    '_id': 'w1',
    'quantity': 3,
    'uniqueIds': {'itemNumber': '930837711-100010'},
    'attributes': {
        'ids': {'upc': ['76611962486']},
        'item': {'modelNumber': 'Samsung Galaxy S8'},
        'description': 'Phone case',
        'unitRetail': '12.50',
        'brandName': 'WM Vendor',
        'dimensions': {'w': 1},
    },
    'categories': ['CELL_PHONE_ACCESSORIES'],
    'itemCondition': 'like_new',
}


class NormalizeManifestRowTests(SimpleTestCase):
    def test_target_brand_title_retail_category_ids(self) -> None:
        out = normalize_manifest_row(TARGET_LIKE)
        self.assertEqual(out['brand'], 'Acme Toys')
        self.assertEqual(out['title'], 'Example product title')
        self.assertEqual(out['retail_value'], Decimal('49.99'))
        self.assertEqual(out['category'], 'TOYS')
        self.assertEqual(out['quantity'], 2)
        self.assertEqual(out['condition'], 'new')
        self.assertEqual(out['upc'], '194735235797')
        self.assertEqual(out['sku'], '89960128')
        self.assertIn('Pallet: PAL99', out['notes'])

    def test_amazon_asin_sku_and_brand(self) -> None:
        out = normalize_manifest_row(AMAZON_LIKE)
        self.assertEqual(out['sku'], 'B0DZ6HYYLT')
        self.assertEqual(out['brand'], 'Amazon Basics')
        self.assertEqual(out['retail_value'], Decimal('19.99'))
        self.assertEqual(out['category'], 'BUILDING_AND_HARDWARE')

    def test_walmart_model_and_unique_ids_sku(self) -> None:
        out = normalize_manifest_row(WALMART_LIKE)
        self.assertEqual(out['model'], 'Samsung Galaxy S8')
        self.assertEqual(out['sku'], '930837711-100010')
        self.assertEqual(out['upc'], '76611962486')
        self.assertEqual(out['brand'], 'WM Vendor')
        self.assertEqual(out['category'], 'CELL_PHONE_ACCESSORIES')

    def test_custom_attributes_subcategory_when_no_categories_list(self) -> None:
        raw = {
            'quantity': 1,
            'attributes': {
                'brandName': 'Lamp Co',
                'description': 'Pendant light',
                'unitRetail': '40',
            },
            'customAttributes': {'subCategory': 'Pendant Lights'},
        }
        out = normalize_manifest_row(raw)
        self.assertEqual(out['category'], 'Pendant Lights')

    def test_unit_retail_integer_cents(self) -> None:
        """B-Stock often sends minor units as integers (e.g. 6000 = $60.00)."""
        raw = {
            'quantity': 1,
            'attributes': {
                'description': 'Item',
                'unitRetail': 6000,
            },
        }
        out = normalize_manifest_row(raw)
        self.assertEqual(out['retail_value'], Decimal('60.00'))

    def test_unit_retail_digit_string_cents(self) -> None:
        raw = {
            'quantity': 1,
            'attributes': {
                'description': 'Item',
                'unitRetail': '4999',
            },
        }
        out = normalize_manifest_row(raw)
        self.assertEqual(out['retail_value'], Decimal('49.99'))

    def test_small_whole_number_still_dollars(self) -> None:
        """Whole numbers under 1000 are treated as dollars (e.g. $40 from '40')."""
        raw = {
            'quantity': 1,
            'attributes': {
                'description': 'Item',
                'unitRetail': 40,
            },
        }
        out = normalize_manifest_row(raw)
        self.assertEqual(out['retail_value'], Decimal('40'))
