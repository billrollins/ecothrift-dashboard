"""Tests for manifest template helpers and CSV upload (Phase 4.1A)."""

from __future__ import annotations

from django.test import TestCase, override_settings

from apps.buying.models import Auction, CategoryMapping, ManifestRow, ManifestTemplate, Marketplace
from apps.buying.services.ai_key_mapping import map_one_fast_cat_batch
from apps.buying.services.manifest_template import compute_header_signature
from apps.buying.services.manifest_upload import process_manifest_upload


class ManifestTemplateHelpersTests(TestCase):
    def test_compute_header_signature_sorts_and_normalizes(self) -> None:
        sig = compute_header_signature(['Unit Retail', 'brand', 'Qty'])
        self.assertEqual(sig, 'brand,qty,unit-retail')


class ManifestUploadProcessTests(TestCase):
    def setUp(self) -> None:
        self.marketplace = Marketplace.objects.create(name='Test M', slug='test-m')
        self.auction = Auction.objects.create(marketplace=self.marketplace, external_id='listing-u1')
        cols = ['Brand', 'Category', 'Item Description', 'Qty', 'Unit Retail']
        sig = compute_header_signature(cols)
        self.template = ManifestTemplate.objects.create(
            marketplace=self.marketplace,
            header_signature=sig,
            display_name='Unit test template',
            column_map={
                'title': ['Item Description'],
                'brand': ['Brand'],
                'quantity': ['Qty'],
                'retail_value': ['Unit Retail'],
                'notes': [],
            },
            category_fields=['Category'],
            category_field_transforms={},
            is_reviewed=True,
        )
        CategoryMapping.objects.create(
            source_key='test-toys',
            canonical_category='Toys & games',
            rule_origin=CategoryMapping.RULE_SEEDED,
        )

    def test_process_upload_success(self) -> None:
        csv_text = (
            'Brand,Category,Item Description,Qty,Unit Retail\n'
            'Acme,TOYS,Robot,1,12.00\n'
        )
        body, code = process_manifest_upload(self.auction, csv_text.encode('utf-8'), 'm.csv')
        self.assertEqual(code, 200)
        self.assertEqual(body['rows_saved'], 1)
        self.assertEqual(body['rows_with_fast_cat'], 1)
        self.assertEqual(body['template_source'], 'existing')
        self.assertEqual(body['ai_mappings_created'], 0)
        self.assertEqual(body['unmapped_key_count'], 0)
        self.assertEqual(body['total_batches'], 0)
        row = self.auction.manifest_rows.get(row_number=1)
        self.assertEqual(row.fast_cat_key, 'test-toys')
        self.assertEqual(row.fast_cat_value, 'Toys & games')
        self.assertEqual(row.manifest_template_id, self.template.pk)
        self.assertIsNone(row.canonical_category)

    @override_settings(ANTHROPIC_API_KEY='')
    def test_unknown_header_creates_stub_400(self) -> None:
        csv_text = 'A,B\n1,2\n'
        body, code = process_manifest_upload(self.auction, csv_text.encode('utf-8'), 'x.csv')
        self.assertEqual(code, 400)
        self.assertEqual(body.get('template_status'), 'unknown')
        self.assertIn('manifest_template_id', body)
        self.assertEqual(self.auction.manifest_rows.count(), 0)

    def test_unreviewed_template_400(self) -> None:
        cols = ['X', 'Y']
        sig = compute_header_signature(cols)
        ManifestTemplate.objects.create(
            marketplace=self.marketplace,
            header_signature=sig,
            display_name='Unreviewed',
            column_map={},
            category_fields=[],
            is_reviewed=False,
        )
        csv_text = 'X,Y\na,b\n'
        body, code = process_manifest_upload(self.auction, csv_text.encode('utf-8'), 'u.csv')
        self.assertEqual(code, 400)
        self.assertEqual(body.get('template_status'), 'not_reviewed')
        self.assertEqual(self.auction.manifest_rows.count(), 0)


class MapFastCatBatchTests(TestCase):
    def setUp(self) -> None:
        self.marketplace = Marketplace.objects.create(name='Test M2', slug='test-m2')
        self.auction = Auction.objects.create(marketplace=self.marketplace, external_id='listing-u2')
        cols = ['Brand', 'Category', 'Item Description', 'Qty', 'Unit Retail']
        from apps.buying.services.manifest_template import compute_header_signature

        sig = compute_header_signature(cols)
        self.template = ManifestTemplate.objects.create(
            marketplace=self.marketplace,
            header_signature=sig,
            display_name='Unit test template 2',
            column_map={
                'title': ['Item Description'],
                'brand': ['Brand'],
                'quantity': ['Qty'],
                'retail_value': ['Unit Retail'],
                'notes': [],
            },
            category_fields=['Category'],
            category_field_transforms={},
            is_reviewed=True,
        )

    @override_settings(ANTHROPIC_API_KEY='')
    def test_map_one_batch_no_api_key(self) -> None:
        ManifestRow.objects.create(
            auction=self.auction,
            row_number=1,
            manifest_template=self.template,
            raw_data={},
            fast_cat_key='orphan-key-no-mapping',
            fast_cat_value=None,
        )
        mapping = dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))
        body = map_one_fast_cat_batch(self.auction, mapping=mapping)
        self.assertEqual(body.get('error'), 'ai_not_configured')
        self.assertEqual(body.get('has_more'), False)

    def test_map_one_batch_no_unmapped_rows(self) -> None:
        mapping = dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))
        body = map_one_fast_cat_batch(self.auction, mapping=mapping)
        self.assertEqual(body['keys_mapped'], 0)
        self.assertEqual(body['keys_remaining'], 0)
        self.assertEqual(body['has_more'], False)
