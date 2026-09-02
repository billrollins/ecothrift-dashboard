import csv
import io
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.inventory.models import (
    CSVTemplate,
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingBatch,
    ProcessingDataBuild,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.manifest_standard_fields import validate_mapping_target
from apps.inventory.services.intake_gates import raise_if_processing_blocked_by_intake
from apps.inventory.views import (
    PurchaseOrderViewSet,
    default_column_mappings,
    ensure_manifest_products_and_items,
    header_signature,
    normalize_row,
    parse_ai_cleanup_suggestions,
)


class PreprocessingRedesignTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-PRE-1',
            ordered_date='2026-04-28',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            est_shrink=Decimal('0.10'),
            receiving_status='done',
            receiving_done_at=timezone.now(),
        )
        self.user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='Staff',
            last_name='User',
            password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])

    def _upload_cleanup_csv(self, csv_text):
        view = PurchaseOrderViewSet.as_view({'post': 'upload_cleanup_csv'})
        upload = SimpleUploadedFile(
            'cleanup.csv',
            csv_text.encode('utf-8'),
            content_type='text/csv',
        )
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/upload-cleanup-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _download_cleanup_csv(self):
        view = PurchaseOrderViewSet.as_view({'get': 'download_cleanup_csv'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/download-cleanup-csv/',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _preprocessing_review_get(self, params=None):
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_review'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review/',
            params or {},
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _preprocessing_review_patch(self, rows):
        view = PurchaseOrderViewSet.as_view({'patch': 'preprocessing_review'})
        request = APIRequestFactory().patch(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review/',
            {'rows': rows},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _finalize_preprocessing_fast(self):
        view = PurchaseOrderViewSet.as_view({'post': 'finalize_preprocessing'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/finalize-preprocessing/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _post_build_processing_data_start(self, *, reset: bool = False):
        view = PurchaseOrderViewSet.as_view({'post': 'build_processing_data'})
        body = {'reset': True} if reset else {}
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/build-processing-data/',
            body,
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _post_build_processing_data_chunk(self):
        view = PurchaseOrderViewSet.as_view({'post': 'processing_data_build_chunk'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/processing-data-build/chunk/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _post_clear_processing_data(self):
        view = PurchaseOrderViewSet.as_view({'post': 'clear_processing_data'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/clear-processing-data/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _build_processing_data(self, *, until_done: bool = True, reset: bool = False):
        """POST ``build-processing-data`` then SPA-style chunk POSTs until ``done`` / ``blocked``."""
        resp = self._post_build_processing_data_start(reset=reset)
        if not until_done:
            return resp
        guard = 0
        max_guard = 10_000
        while resp.status_code == 200 and guard < max_guard:
            data = getattr(resp, 'data', None) or {}
            if data.get('done') or data.get('blocked'):
                break
            resp = self._post_build_processing_data_chunk()
            guard += 1
        self.assertLess(
            guard,
            max_guard,
            msg=f'build chunk loop exceeded {max_guard} (last resp={getattr(resp, "data", resp)})',
        )
        return resp

    def test_processing_gate_allows_receiving_not_done(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-GATE-RECV',
            ordered_date='2026-04-28',
            purchase_cost=Decimal('1'),
            retail_value=Decimal('5'),
            finalized_at=timezone.now(),
            preprocess_status='finalized',
            receiving_status='not_started',
        )
        raise_if_processing_blocked_by_intake(order)

    def test_build_processing_data_allows_receiving_not_done(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.receiving_status = 'active'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'receiving_status', 'updated_at'])
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            final_price=Decimal('12.00'),
            title='Ready after receiving',
            description='Processing gate regression',
        )

        resp = self._post_build_processing_data_start()

        self.assertEqual(resp.status_code, 200, resp.data)

    def _preprocessing_review_reset_final(self, row_ids):
        view = PurchaseOrderViewSet.as_view({'post': 'preprocessing_review_reset_final'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review-reset-final/',
            {'row_ids': row_ids},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _create_preprocessing_rows_for_review(self):
        first = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Acme Toaster 2 Slice',
            ai_title='Acme Toaster',
            standard_brand='Acme',
            standard_taxonomy={'category': 'Kitchen & dining'},
            standard_identifiers={'sku': 'SKU-AAA', 'upc': '100'},
            standard_specifications={'origin': 'US'},
            standard_tracking={'lot_id': 'L42'},
            standard_search_tags=['x', 'y'],
            standard_condition='unknown',
            unit_retail=Decimal('50.00'),
            standard_notes='low confidence',
            pricing_stage='unpriced',
        )
        second = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            standard_description='Bright LED Lamp',
            ai_title='LED Lamp',
            standard_brand='BrightCo',
            standard_taxonomy={'category': 'Home décor & lighting'},
            standard_condition='unknown',
            unit_retail=Decimal('25.00'),
            proposed_price=Decimal('12.50'),
            pricing_stage='draft',
        )
        return first, second

    def _create_manifest_rows(self):
        first = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            taxonomy={'category': 'Kitchen & dining'},
            condition='unknown',
            unit_retail=Decimal('50.00'),
            notes='keep this note',
            search_tags=['keep-tag'],
            pricing_stage='unpriced',
        )
        second = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Bright LED Lamp',
            title='LED Lamp',
            brand='BrightCo',
            taxonomy={'category': 'Home décor & lighting'},
            condition='unknown',
            unit_retail=Decimal('25.00'),
            pricing_stage='unpriced',
        )
        return first, second

    def test_default_column_mappings_prefers_unit_retail_header(self):
        headers = ['Qty', 'Unit Retail', 'Ext. Retail', 'Item Description']
        mappings = default_column_mappings(headers)
        by_target = {m['target']: m for m in mappings}
        self.assertEqual(by_target['unit_retail']['source'], 'Unit Retail')

    def test_default_column_mappings_maps_lean_cleanup_csv_headers(self):
        """download-cleanup-csv heuristic: overlapping flat targets map by column name."""
        headers = [
            'row_id',
            'row_number',
            'quantity',
            'unit_retail',
            'base_cost',
            'ideal_price',
            'description',
            'brand',
            'model',
            'condition',
            'notes',
            'identifiers_json',
            'taxonomy_json',
            'specifications_json',
            'tracking_json',
            'search_tags_json',
        ]
        mappings = default_column_mappings(headers)
        by_target = {m['target']: m for m in mappings}
        self.assertEqual(by_target['taxonomy.category']['source'], '')
        self.assertEqual(by_target['identifiers.upc']['source'], '')
        self.assertEqual(by_target['identifiers.sku']['source'], '')
        self.assertEqual(by_target['condition']['source'], 'condition')
        self.assertEqual(by_target['description']['source'], 'description')
        self.assertEqual(by_target['brand']['source'], 'brand')
        self.assertEqual(by_target['quantity']['source'], 'quantity')
        self.assertEqual(by_target['notes']['source'], 'notes')
        self.assertEqual(by_target['unit_retail']['source'], 'unit_retail')

    def test_preview_standardize_manifest_preview_does_not_open_storage(self):
        from apps.core.models import S3File

        s3 = S3File.objects.create(key='manifests/preview-only.csv', filename='p.csv')
        self.order.manifest = s3
        self.order.manifest_preview = {
            'headers': ['Item Desc', 'Qty'],
            'rows': [
                {'row_number': 1, 'raw': {'Item Desc': 'Thing', 'Qty': '2'}},
            ],
            'delimiter': ',',
        }
        self.order.manifest_row_count = 5000
        self.order.save(
            update_fields=['manifest', 'manifest_preview', 'manifest_row_count', 'updated_at'],
        )

        view = PurchaseOrderViewSet.as_view({'post': 'preview_standardize'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/preview-standardize/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.user)
        with patch('django.core.files.storage.default_storage.open') as mock_open:
            mock_open.side_effect = AssertionError('storage open should not be called')
            response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        self.assertEqual(response.data['row_count_in_file'], 5000)
        self.assertGreater(len(response.data['normalized_preview']), 0)
        mock_open.assert_not_called()

    def test_ensure_manifest_products_and_items_is_idempotent(self):
        ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=2,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            model='T2',
            taxonomy={'category': 'Kitchen & dining'},
            unit_retail=Decimal('50.00'),
            proposed_price=Decimal('22.22'),
            pricing_stage='draft',
        )

        first = ensure_manifest_products_and_items(self.order)
        second = ensure_manifest_products_and_items(self.order)

        self.assertEqual(first['items_created'], 2)
        self.assertEqual(second['items_created'], 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(Product.objects.filter(items__purchase_order=self.order).distinct().count(), 1)

    def test_ensure_manifest_prefers_processing_row_match_over_manifest_legacy(self):
        """P6: ProcessingRow hint wins when ManifestRow still has a legacy matched_product."""
        legacy = Product.objects.create(title='Legacy MR Product', brand='Old')
        decided = Product.objects.create(title='Decided PR Product', brand='New')
        mr = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=5,
            quantity=1,
            title='Widget',
            brand='Acme',
            unit_retail=Decimal('10.00'),
            matched_product=legacy,
        )
        ProcessingRow.objects.create(
            purchase_order=self.order,
            manifest_row=mr,
            row_number=5,
            quantity=1,
            title='Widget',
            brand='Acme',
            unit_retail=Decimal('10.00'),
            matched_product=decided,
        )

        ensure_manifest_products_and_items(self.order)

        item = Item.objects.get(purchase_order=self.order, manifest_row=mr)
        self.assertEqual(item.product_id, decided.id)
        mr.refresh_from_db()
        self.assertEqual(mr.matched_product_id, legacy.id)

    def test_parse_ai_cleanup_suggestions_accepts_json_fence(self):
        parsed = parse_ai_cleanup_suggestions(
            '```json\n[{"row_id": 1, "row_number": 10, "item_id": 99, "title": "Clean"}]\n```',
        )

        self.assertEqual(parsed[0]['row_id'], 1)
        self.assertEqual(parsed[0]['row_number'], 10)
        self.assertEqual(parsed[0]['item_id'], 99)

    def test_upload_cleanup_csv_accepts_json_rows_body(self):
        first, second = self._create_manifest_rows()
        view = PurchaseOrderViewSet.as_view({'post': 'upload_cleanup_csv'})
        rows = [
            {
                'row_id': first.id,
                'ai_title': 'Acme Two Slice Toaster',
                'ai_brand': 'Acme',
                'ai_model': 'T2',
                'category': 'Kitchen & dining',
                'condition': 'good',
                'proposed_price': '19.99',
            },
            {
                'row_id': second.id,
                'ai_title': 'BrightCo LED Desk Lamp',
                'ai_brand': 'BrightCo',
                'ai_model': '',
                'category': 'Home décor & lighting',
                'condition': 'good',
                'proposed_price': '12.50',
            },
        ]
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/upload-cleanup-csv/',
            {'rows': rows},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows_updated'], 2)
        first.refresh_from_db()
        self.assertEqual(first.title, 'Acme Two Slice Toaster')
        self.assertEqual(first.category, 'Kitchen & dining')

    def test_upload_cleanup_json_rows_accepts_ai_status_dict_staging_wide(self):
        sr = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Coffee grinder thing',
            ai_title='Grinder',
            standard_brand='Acme',
            standard_taxonomy={'category': 'Kitchen & dining'},
            standard_condition='good',
            unit_retail=Decimal('20.00'),
            pricing_stage='unpriced',
        )
        view = PurchaseOrderViewSet.as_view({'post': 'upload_cleanup_csv'})
        rows = [
            {
                'row_id': sr.id,
                'row_number': 1,
                'title': 'Acme Coffee Grinder Pro',
                'brand': 'Acme',
                'model': 'CG-1',
                'category': 'Kitchen & dining',
                'condition': 'good',
                'proposed_price': '9.99',
                'description': 'Electric burr grinder with multiple grind settings for home use.',
                'notes': '',
                'specifications_json': '{"wattage":"120W"}',
                'search_tags_json': '["grinder","coffee"]',
                'ai_status': {
                    'state': 'soft_flagged',
                    'issues': [{'rule': 'SOFT_DESC_NO_BRAND', 'column': 'description', 'reason': 'test'}],
                },
            },
        ]
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/upload-cleanup-csv/',
            {'rows': rows},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows_updated'], 1)
        sr.refresh_from_db()
        self.assertEqual(sr.ai_title, 'Acme Coffee Grinder Pro')
        self.assertEqual(sr.ai_status.get('state'), 'soft_flagged')
        self.assertEqual(len(sr.ai_status.get('issues', [])), 1)

    def test_upload_cleanup_csv_malformed_ai_status_defaults_empty_staging_wide(self):
        sr = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Coffee grinder thing',
            ai_title='Grinder',
            standard_brand='Acme',
            standard_taxonomy={'category': 'Kitchen & dining'},
            standard_condition='good',
            unit_retail=Decimal('20.00'),
            pricing_stage='unpriced',
        )
        bad_status = '{not valid json'
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow([
            'row_id', 'row_number', 'title', 'brand', 'model', 'category', 'condition', 'proposed_price',
            'description', 'notes', 'specifications_json', 'search_tags_json', 'ai_status',
        ])
        w.writerow([
            sr.id, 1, 'New Title', 'Acme', 'M', 'Kitchen & dining', 'good', '9.99',
            'Short description here.',
            '',
            '{"wattage":"1"}',
            '["a"]',
            bad_status,
        ])
        csv_text = out.getvalue()
        response = self._upload_cleanup_csv(csv_text)
        self.assertEqual(response.status_code, 200)
        sr.refresh_from_db()
        self.assertEqual(sr.ai_title, 'New Title')
        self.assertEqual(sr.ai_status, {})

    def test_preprocessing_review_patch_clears_ai_status_when_title_edited(self):
        first, _second = self._create_preprocessing_rows_for_review()
        first.ai_status = {
            'state': 'soft_flagged',
            'issues': [{'rule': 'SOFT_X', 'reason': 'needs fix'}],
        }
        first.save(update_fields=['ai_status'])

        response = self._preprocessing_review_patch([
            {'id': first.id, 'patch': {'title': 'Edited Toaster Title'}},
        ])

        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        self.assertEqual(first.final_title, 'Edited Toaster Title')
        self.assertEqual(first.ai_title, 'Acme Toaster')
        self.assertEqual(first.ai_status, {})

    def test_preprocessing_review_patch_keeps_ai_status_when_only_batch_flag(self):
        first, _second = self._create_preprocessing_rows_for_review()
        status = {'state': 'soft_flagged', 'issues': [{'rule': 'R'}]}
        first.ai_status = status
        first.save(update_fields=['ai_status'])

        response = self._preprocessing_review_patch([
            {'id': first.id, 'patch': {'batch_flag': True}},
        ])

        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        self.assertTrue(first.batch_flag)
        self.assertEqual(first.ai_status, status)

    def test_preprocessing_review_lists_ai_status_on_row(self):
        first, _second = self._create_preprocessing_rows_for_review()
        first.ai_status = {'state': 'hard_flagged', 'issues': [{'rule': 'HARD_X', 'reason': 'check'}]}
        first.save(update_fields=['ai_status'])

        response = self._preprocessing_review_get({'fields': 'full'})

        self.assertEqual(response.status_code, 200)
        row = next(r for r in response.data['rows'] if r['id'] == first.id)
        self.assertEqual(row['ai_status']['state'], 'hard_flagged')
        self.assertEqual(len(row['ai_status']['issues']), 1)
        self.order.manifest_preview = {
            'headers': ['A', 'B'],
            'rows': [{'row_number': 1, 'raw': {'A': 'x'}}],
            'delimiter': ',',
        }
        self.order.manifest_signature = 'abc123'
        self.order.manifest_row_count = 99
        self.order.template_column_mappings_cache = list(default_column_mappings(['A', 'B']))
        self.order.save(
            update_fields=[
                'manifest_preview',
                'manifest_signature',
                'manifest_row_count',
                'template_column_mappings_cache',
            ],
        )
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        ms = response.data['order']['manifest_sample']
        self.assertIsNotNone(ms)
        self.assertEqual(ms['headers'], ['A', 'B'])
        self.assertEqual(ms['delimiter'], ',')
        self.assertEqual(len(ms['rows']), 1)
        self.assertNotIn('signature', ms)
        self.assertNotIn('matching_templates', ms)
        self.assertEqual(response.data['order']['manifest_row_count'], 99)
        self.assertEqual(response.data['order']['manifest_signature'], 'abc123')
        self.assertEqual(response.data['matching_templates'], [])
        self.assertGreater(len(response.data['standard_columns']), 0)
        tmc = response.data['order']['template_column_mappings_cache']
        self.assertIsInstance(tmc, list)
        self.assertEqual(len(tmc), len(default_column_mappings(['A', 'B'])))

    def test_preprocessing_status_manifest_sample_matching_templates_by_signature(self):
        sig = 'abc123'
        CSVTemplate.objects.create(
            vendor=self.vendor,
            name='Vendor Sig Match',
            header_signature=sig,
            column_mappings=[{'target': 'description', 'source': 'Item Desc', 'transforms': []}],
        )
        self.order.manifest_preview = {
            'headers': ['Item Desc'],
            'rows': [{'row_number': 1, 'raw': {'Item Desc': 'x'}}],
            'delimiter': ',',
        }
        self.order.manifest_signature = sig
        self.order.save(update_fields=['manifest_preview', 'manifest_signature'])
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        mt = response.data['matching_templates']
        self.assertEqual(len(mt), 1)
        self.assertEqual(mt[0]['name'], 'Vendor Sig Match')

    def test_preprocessing_status_order_template_mappings_cache_may_be_empty_before_standardize(self):
        self.order.manifest_preview = {
            'headers': ['Qty', 'Unit Retail', 'Item Description'],
            'rows': [{'row_number': 1, 'raw': {}}],
            'delimiter': ',',
        }
        self.order.manifest_signature = 'sig1'
        self.order.template_column_mappings_cache = []
        self.order.save(
            update_fields=['manifest_preview', 'manifest_signature', 'template_column_mappings_cache'],
        )
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['order']['template_column_mappings_cache'], [])
        self.assertGreater(len(response.data['standard_columns']), 0)

    def test_suggest_formulas_returns_400_without_manifest_preview_headers(self):
        view = PurchaseOrderViewSet.as_view({'post': 'suggest_formulas'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/suggest-formulas/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('manifest_preview', str(response.data.get('error', '')))

    def test_upload_cleanup_csv_accepts_strict_narrow_file(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Kitchen & dining,good,19.99\n'
            f'{second.id},BrightCo LED Desk Lamp,BrightCo,,Home décor & lighting,good,12.50\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows_updated'], 2)
        self.assertEqual(response.data['rows_rejected'], 0)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.title, 'Acme Two Slice Toaster')
        self.assertEqual(first.brand, 'Acme')
        self.assertEqual(first.model, 'T2')
        self.assertEqual(first.category, 'Kitchen & dining')
        self.assertEqual((first.taxonomy or {}).get('category'), 'Kitchen & dining')
        self.assertEqual(first.condition, 'good')
        self.assertEqual(first.proposed_price, Decimal('19.99'))
        self.assertEqual(first.notes, 'keep this note')
        self.assertEqual(first.search_tags, ['keep-tag'])
        self.assertEqual(first.pricing_stage, 'draft')
        self.assertEqual(second.title, 'BrightCo LED Desk Lamp')

    def test_upload_cleanup_csv_normalizes_grok_style_conditions(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Kitchen & dining,used_good,19.99\n'
            f'{second.id},BrightCo LED Desk Lamp,BrightCo,,Home décor & lighting,USED_FAIR,12.50\n'
        )
        response = self._upload_cleanup_csv(csv_text)
        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.condition, 'good')
        self.assertEqual(second.condition, 'fair')

    def test_upload_cleanup_csv_rejects_missing_row_without_partial_changes(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Kitchen & dining,good,19.99\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'row_count_mismatch')
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.title, 'Acme Toaster')
        self.assertEqual(second.title, 'LED Lamp')

    def test_preprocessing_queue_includes_manifest_orders_without_finalized_prep(self):
        from apps.core.models import S3File
        from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES

        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        vendor_dash = Vendor.objects.create(name=dash_name, code='PQ')
        s3 = S3File.objects.create(key='manifests/preprocessing-queue-1.csv', filename='m.csv')
        po_dash = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-1',
            ordered_date='2026-04-28',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3,
        )
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_queue'})
        request = APIRequestFactory().get('/api/inventory/orders/preprocessing-queue/')
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data['results']]
        self.assertIn(po_dash.pk, ids)

    def test_preprocessing_queue_excludes_finalized_prep_sessions(self):
        from apps.core.models import S3File
        from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES

        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        vendor_dash = Vendor.objects.create(name=dash_name, code='PQ2')
        s3 = S3File.objects.create(key='manifests/preprocessing-queue-2.csv', filename='m2.csv')
        po_dash = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-F',
            ordered_date='2026-04-28',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3,
        )
        now = timezone.now()
        po_dash.preprocess_status = 'finalized'
        po_dash.finalized_at = now
        po_dash.save(update_fields=['preprocess_status', 'finalized_at'])
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_queue'})
        request = APIRequestFactory().get('/api/inventory/orders/preprocessing-queue/')
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data['results']]
        self.assertNotIn(po_dash.pk, ids)

    def test_preprocessing_queue_orders_by_preprocess_status_rank_then_updated_at(self):
        from apps.core.models import S3File
        from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES

        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        vendor_dash = Vendor.objects.create(name=dash_name, code='PQ3')
        s3a = S3File.objects.create(key='manifests/preprocessing-queue-3a.csv', filename='a.csv')
        s3b = S3File.objects.create(key='manifests/preprocessing-queue-3b.csv', filename='b.csv')
        older = timezone.now() - timedelta(days=2)
        newer = timezone.now() - timedelta(days=1)
        po_cleaned = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-CLEAN',
            ordered_date='2026-04-27',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3a,
            preprocess_status='cleaned',
        )
        po_std_newer = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-STD-N',
            ordered_date='2026-04-26',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3b,
            preprocess_status='standardized',
        )
        PurchaseOrder.objects.filter(pk=po_std_newer.pk).update(updated_at=newer)
        PurchaseOrder.objects.filter(pk=po_cleaned.pk).update(updated_at=older)

        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_queue'})
        request = APIRequestFactory().get('/api/inventory/orders/preprocessing-queue/')
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data['results']]
        self.assertIn(po_cleaned.pk, ids)
        self.assertIn(po_std_newer.pk, ids)
        self.assertLess(ids.index(po_cleaned.pk), ids.index(po_std_newer.pk))

        s3c = S3File.objects.create(key='manifests/preprocessing-queue-3c.csv', filename='c.csv')
        s3d = S3File.objects.create(key='manifests/preprocessing-queue-3d.csv', filename='d.csv')
        po_std_old = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-STD-O',
            ordered_date='2026-04-25',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3c,
            preprocess_status='standardized',
        )
        po_std_mid = PurchaseOrder.objects.create(
            vendor=vendor_dash,
            order_number='PO-PQ-STD-M',
            ordered_date='2026-04-24',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            manifest=s3d,
            preprocess_status='standardized',
        )
        PurchaseOrder.objects.filter(pk=po_std_old.pk).update(updated_at=older)
        PurchaseOrder.objects.filter(pk=po_std_mid.pk).update(updated_at=newer)
        response2 = view(request)
        self.assertEqual(response2.status_code, 200)
        ids2 = [row['id'] for row in response2.data['results']]
        self.assertLess(ids2.index(po_std_mid.pk), ids2.index(po_std_old.pk))

    def test_preprocessing_status_staging_payload_matches_po_status(self):
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='x',
            ai_title='y',
            unit_retail=Decimal('10.00'),
            proposed_price=Decimal('5.00'),
            pricing_stage='draft',
        )
        self.order.preprocess_status = 'cleaned'
        self.order.save(update_fields=['preprocess_status'])

        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['completed_step'], 1)
        self.assertEqual(response.data['order']['preprocess_status'], 'cleaned')
        prepr = response.data['preprocessing']
        self.assertIsNotNone(prepr)
        self.assertEqual(prepr['row_count'], 1)
        self.assertNotIn('workflow_status', prepr)
        self.assertNotIn('current_step', prepr)

    def test_preprocessing_status_completed_step_table_per_preprocess_status(self):
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        specs = [
            ('not_started', -1),
            ('standardized', 0),
            ('cleaned', 1),
            ('reviewing', 1),
            ('finalized', 2),
        ]
        for st, exp_step in specs:
            with self.subTest(status=st):
                PreprocessingRow.objects.filter(purchase_order=self.order).delete()
                self.order.preprocess_status = st
                self.order.finalized_at = timezone.now() if st == 'finalized' else None
                self.order.save(update_fields=['preprocess_status', 'finalized_at', 'updated_at'])
                PreprocessingRow.objects.create(
                    purchase_order=self.order,
                    row_number=1,
                    quantity=1,
                    standard_description='x',
                )
                request = APIRequestFactory().get(
                    f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
                )
                force_authenticate(request, user=self.user)
                response = view(request, pk=self.order.pk)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['completed_step'], exp_step)
                self.assertEqual(response.data['order']['preprocess_status'], st)
                prepr = response.data['preprocessing']
                self.assertIsNotNone(prepr)
                self.assertEqual(set(prepr.keys()), {'finalized_at', 'row_count'})
                self.assertEqual(prepr['row_count'], 1)

    def test_preprocessing_status_query_count_reasonable_with_staging_rows(self):
        self._create_preprocessing_rows_for_review()
        self.order.preprocess_status = 'cleaned'
        self.order.save(update_fields=['preprocess_status'])
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        with self.assertNumQueries(12):
            response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)

    def test_upload_cleanup_csv_rejects_unknown_row_without_partial_changes(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Kitchen & dining,good,19.99\n'
            '999999,Unknown Row,Brand,,Tools & hardware,good,9.99\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_failed')
        self.assertEqual(response.data['rejected_rows'][0]['reason'], 'unknown_row_id')
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.title, 'Acme Toaster')
        self.assertEqual(second.title, 'LED Lamp')

    def test_upload_cleanup_csv_rejects_invalid_category_or_condition(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Not A Category,good,19.99\n'
            f'{second.id},BrightCo LED Desk Lamp,BrightCo,,Home décor & lighting,bogus_condition_xyz,12.50\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_failed')
        reasons = {row.get('rule') or row.get('reason') for row in response.data['rejected_rows']}
        self.assertEqual(reasons, {'HARD_CATEGORY_VALID', 'HARD_CONDITION_VALID'})
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.title, 'Acme Toaster')
        self.assertEqual(second.title, 'LED Lamp')

    def test_upload_cleanup_csv_writes_staging_rows_without_manifest_rows(self):
        sr1 = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Acme Toaster 2 Slice',
            ai_title='Acme Toaster',
            standard_brand='Acme',
            standard_taxonomy={'category': 'Kitchen & dining'},
            standard_condition='unknown',
            unit_retail=Decimal('50.00'),
            standard_notes='keep this note',
            standard_search_tags=['keep-tag'],
            pricing_stage='unpriced',
        )
        sr2 = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            standard_description='Bright LED Lamp',
            ai_title='LED Lamp',
            standard_brand='BrightCo',
            standard_taxonomy={'category': 'Home décor & lighting'},
            standard_condition='unknown',
            unit_retail=Decimal('25.00'),
            pricing_stage='unpriced',
        )
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{sr1.id},Acme Two Slice Toaster,Acme,T2,Kitchen & dining,good,19.99\n'
            f'{sr2.id},BrightCo LED Desk Lamp,BrightCo,,Home décor & lighting,good,12.50\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows_updated'], 2)
        sr1.refresh_from_db()
        sr2.refresh_from_db()
        self.assertEqual(sr1.ai_title, 'Acme Two Slice Toaster')
        self.assertEqual(sr2.ai_title, 'BrightCo LED Desk Lamp')
        self.assertEqual(sr1.ai_category, 'Kitchen & dining')
        self.assertEqual(sr2.ai_category, 'Home décor & lighting')
        self.assertEqual(sr1.ai_taxonomy, sr1.standard_taxonomy)
        self.assertEqual(sr2.ai_taxonomy, sr2.standard_taxonomy)
        self.assertEqual(sr1.final_title, 'Acme Two Slice Toaster')
        self.assertEqual(sr2.final_title, 'BrightCo LED Desk Lamp')
        self.assertEqual(sr1.final_description, 'Acme Toaster 2 Slice')
        self.assertEqual(sr2.final_description, 'Bright LED Lamp')
        self.assertEqual(sr1.final_brand, 'Acme')
        self.assertEqual(sr2.final_brand, 'BrightCo')
        self.assertEqual(sr1.final_category, 'Kitchen & dining')
        self.assertEqual(sr2.final_category, 'Home décor & lighting')
        self.assertEqual(sr1.final_condition, 'good')
        self.assertEqual(sr2.final_condition, 'good')

    def test_upload_cleanup_csv_staging_ignores_spoofed_locked_json_cells(self):
        sr = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Thing',
            ai_title='Thing',
            standard_brand='B',
            standard_identifiers={'sku': 'REAL-SKU', 'upc': '111'},
            standard_taxonomy={'category': 'VENDOR_CAT', 'subcategory': 'sub'},
            standard_tracking={'lot_id': 'LOT-A'},
            standard_condition='good',
            unit_retail=Decimal('10.00'),
            pricing_stage='unpriced',
        )
        spoof_ids = json.dumps({'sku': 'FAKE', 'upc': '999'})
        spoof_tx = json.dumps({'category': 'Electronics', 'subcategory': 'tampered'})
        spoof_tr = json.dumps({'lot_id': 'OTHER'})
        spec_cell = json.dumps({'finish': 'matte'})
        tags_cell = json.dumps(['clearance'])
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow([
            'row_id',
            'ai_title',
            'ai_brand',
            'ai_model',
            'category',
            'condition',
            'proposed_price',
            'description',
            'identifiers_json',
            'taxonomy_json',
            'tracking_json',
            'specifications_json',
            'search_tags_json',
        ])
        w.writerow([
            sr.id,
            'Brand New Title Here',
            'B',
            'M',
            'Kitchen & dining',
            'good',
            '5.00',
            'Short vendor note.',
            spoof_ids,
            spoof_tx,
            spoof_tr,
            spec_cell,
            tags_cell,
        ])
        csv_text = out.getvalue()
        response = self._upload_cleanup_csv(csv_text)
        self.assertEqual(response.status_code, 200)
        sr.refresh_from_db()
        self.assertEqual(sr.ai_title, 'Brand New Title Here')
        self.assertEqual(sr.ai_specifications, {'finish': 'matte'})
        self.assertEqual(sr.ai_search_tags, ['clearance'])
        self.assertEqual(sr.ai_category, 'Kitchen & dining')
        self.assertEqual(sr.ai_identifiers, {'sku': 'REAL-SKU', 'upc': '111'})
        self.assertEqual(sr.ai_taxonomy, {'category': 'VENDOR_CAT', 'subcategory': 'sub'})
        self.assertEqual(sr.ai_tracking, {'lot_id': 'LOT-A'})

    def test_download_cleanup_csv_staging_lean_schema_and_row_order(self):
        first, second = self._create_preprocessing_rows_for_review()
        expected_header = (
            'row_id,row_number,quantity,unit_retail,base_cost,ideal_price,description,brand,model,'
            'condition,notes,identifiers_json,taxonomy_json,specifications_json,tracking_json,'
            'search_tags_json'
        )

        response = self._download_cleanup_csv()

        self.assertEqual(response.status_code, 200)
        body = response.content.decode('utf-8')
        lines = body.strip().split('\n')
        self.assertGreaterEqual(len(lines), 3)
        self.assertEqual(lines[0].strip(), expected_header)
        reader = csv.DictReader(io.StringIO(body))
        rows = list(reader)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['row_id'], str(first.id))
        self.assertEqual(rows[0]['row_number'], '1')
        self.assertEqual(rows[1]['row_id'], str(second.id))
        self.assertEqual(rows[1]['row_number'], '2')
        self.assertEqual(rows[0]['description'], 'Acme Toaster 2 Slice')
        self.assertEqual(rows[0]['brand'], 'Acme')
        self.assertEqual(rows[0]['notes'], 'low confidence')
        self.assertEqual(json.loads(rows[0]['taxonomy_json']), {'category': 'Kitchen & dining'})
        self.assertEqual(json.loads(rows[0]['identifiers_json']), {'sku': 'SKU-AAA', 'upc': '100'})
        self.assertEqual(json.loads(rows[0]['specifications_json']), {'origin': 'US'})
        self.assertEqual(json.loads(rows[0]['tracking_json']), {'lot_id': 'L42'})
        self.assertEqual(json.loads(rows[0]['search_tags_json']), ['x', 'y'])
        hdr = lines[0]
        for omit in (
            'item_id',
            'current_title',
            'ai_title',
            'title',
            'category',
            'sku',
            'upc',
            'proposed_price',
            'final_price',
            'pricing_stage',
        ):
            self.assertNotIn(omit, hdr)
        bc = Decimal(rows[0]['base_cost'])
        self.assertEqual(bc, self.order.compute_item_cost(Decimal(rows[0]['unit_retail'])))
        ideal = Decimal(rows[0]['ideal_price'])
        self.assertEqual(ideal, (bc * Decimal('2')).quantize(Decimal('0.01')))

    def test_preprocessing_review_lists_staging_rows_without_canonical_side_effects(self):
        self._create_preprocessing_rows_for_review()

        response = self._preprocessing_review_get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['summary']['missing_price'], 1)
        self.assertEqual(response.data['summary']['low_confidence'], 0)
        self.assertNotIn('first_item_sku', response.data['rows'][0])
        self.assertNotIn('item_count', response.data['rows'][0])
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Product.objects.filter(items__purchase_order=self.order).distinct().count(), 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)

    def test_preprocessing_review_filters_search_and_missing_price(self):
        self._create_preprocessing_rows_for_review()

        search_response = self._preprocessing_review_get({'search': 'lamp'})
        missing_response = self._preprocessing_review_get({'missing_price': 'true'})

        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(search_response.data['count'], 1)
        self.assertEqual(search_response.data['rows'][0]['description'], 'Bright LED Lamp')
        self.assertEqual(missing_response.status_code, 200)
        self.assertEqual(missing_response.data['count'], 1)
        self.assertEqual(missing_response.data['rows'][0]['description'], 'Acme Toaster 2 Slice')

    def test_preprocessing_review_patch_updates_only_staging_fields_and_status(self):
        first, _second = self._create_preprocessing_rows_for_review()

        response = self._preprocessing_review_patch([
            {
                'id': first.id,
                'patch': {
                    'title': 'Acme Two Slice Toaster',
                    'brand': 'Acme Co',
                    'condition': 'good',
                    'final_price': '19.99',
                    'pricing_notes': 'Manual review set price',
                    'batch_flag': True,
                },
            },
        ])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows_updated'], 1)
        first.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(first.final_title, 'Acme Two Slice Toaster')
        self.assertEqual(first.final_brand, 'Acme Co')
        self.assertEqual(first.final_condition, 'good')
        self.assertEqual(first.ai_title, 'Acme Toaster')
        self.assertEqual(first.standard_brand, 'Acme')
        self.assertEqual(first.final_price, Decimal('19.99'))
        self.assertIsNone(first.proposed_price)
        self.assertEqual(first.pricing_stage, 'final')
        self.assertTrue(first.batch_flag)
        self.assertEqual(self.order.preprocess_status, 'reviewing')
        self.assertIsNotNone(self.order.review_saved_at)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)

    def test_preprocessing_review_patch_rejects_finalized_session(self):
        first, _second = self._create_preprocessing_rows_for_review()
        self.order.finalized_at = timezone.now()
        self.order.save(update_fields=['finalized_at', 'updated_at'])

        response = self._preprocessing_review_patch([
            {'id': first.id, 'patch': {'title': 'Should Not Save'}},
        ])

        self.assertEqual(response.status_code, 409)
        first.refresh_from_db()
        self.assertEqual(first.ai_title, 'Acme Toaster')

    def test_preprocessing_review_reset_final_restores_ai_standard_layers_keeps_prices(self):
        first, _second = self._create_preprocessing_rows_for_review()

        patch_resp = self._preprocessing_review_patch([
            {
                'id': first.id,
                'patch': {
                    'title': 'Acme Two Slice Toaster',
                    'brand': 'Acme Co',
                    'condition': 'good',
                    'final_price': '19.99',
                    'pricing_notes': 'Manual review set price',
                },
            },
        ])
        self.assertEqual(patch_resp.status_code, 200)
        first.refresh_from_db()
        self.assertEqual(first.final_brand, 'Acme Co')
        self.assertEqual(first.final_price, Decimal('19.99'))

        reset_resp = self._preprocessing_review_reset_final([first.id])
        self.assertEqual(reset_resp.status_code, 200)
        self.assertEqual(reset_resp.data['rows_reset'], 1)

        first.refresh_from_db()
        self.assertEqual(first.final_title, 'Acme Toaster')
        self.assertEqual(first.final_brand, 'Acme')
        self.assertEqual(first.final_condition, 'unknown')
        self.assertEqual(first.final_price, Decimal('19.99'))
        self.assertEqual(first.pricing_stage, 'final')
        self.assertEqual(first.ai_title, 'Acme Toaster')

    def test_preprocessing_review_reset_final_rejects_unknown_row_id(self):
        self._create_preprocessing_rows_for_review()
        response = self._preprocessing_review_reset_final([999999])
        self.assertEqual(response.status_code, 400)

    def test_preprocessing_review_reset_final_rejects_finalized_session(self):
        first, _second = self._create_preprocessing_rows_for_review()
        self.order.finalized_at = timezone.now()
        self.order.save(update_fields=['finalized_at', 'updated_at'])

        response = self._preprocessing_review_reset_final([first.id])
        self.assertEqual(response.status_code, 409)

    def test_finalize_preprocessing_promotes_staging_to_manifest_and_items(self):
        mr1 = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=2,
            description='Widget A standard',
            title='Widget A standard',
            brand='BrandA',
            category='Kitchen & dining',
            condition='good',
            unit_retail=Decimal('40.00'),
            proposed_price=Decimal('15.00'),
            pricing_stage='final',
        )
        mr2 = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Gadget B standard',
            title='Gadget B standard',
            brand='BrandB',
            category='Home décor & lighting',
            condition='good',
            unit_retail=Decimal('30.00'),
            proposed_price=Decimal('12.00'),
            pricing_stage='final',
        )
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            manifest_row=mr1,
            row_number=1,
            quantity=2,
            standard_description='Widget A',
            ai_title='Widget A',
            final_title='Widget A',
            final_description='Full widget A desc',
            standard_brand='BrandA',
            standard_taxonomy={'category': 'Kitchen & dining'},
            ai_category='Kitchen & dining',
            final_category='Kitchen & dining',
            ai_condition='good',
            standard_condition='good',
            unit_retail=Decimal('40.00'),
            proposed_price=Decimal('15.00'),
            final_price=Decimal('15.00'),
            pricing_stage='final',
        )
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            manifest_row=mr2,
            row_number=2,
            quantity=1,
            standard_description='Gadget B',
            ai_title='Gadget B',
            final_title='Gadget B',
            final_description='Gadget detail',
            standard_brand='BrandB',
            standard_taxonomy={'category': 'Home décor & lighting'},
            ai_category='Home décor & lighting',
            final_category='Home décor & lighting',
            ai_condition='good',
            standard_condition='good',
            unit_retail=Decimal('30.00'),
            proposed_price=Decimal('12.00'),
            final_price=Decimal('12.00'),
            pricing_stage='final',
        )

        fin = self._finalize_preprocessing_fast()
        self.assertEqual(fin.status_code, 200, fin.data if hasattr(fin, 'data') else fin.content)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)
        bookmarks = list(ProcessingRow.objects.filter(purchase_order=self.order).order_by('row_number'))
        self.assertEqual(bookmarks[0].manifest_row_id, mr1.id)
        self.assertEqual(bookmarks[0].category, 'Kitchen & dining')
        self.assertEqual(bookmarks[1].manifest_row_id, mr2.id)
        self.assertEqual(bookmarks[1].category, 'Home décor & lighting')
        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.finalized_at)
        self.assertEqual(self.order.preprocess_status, 'finalized')

    def test_preprocessing_review_full_mode_returns_all_rows(self):
        self._create_preprocessing_rows_for_review()
        response = self._preprocessing_review_get({'full': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('full'))
        self.assertEqual(len(response.data['rows']), 2)

    def test_preprocessing_review_default_uses_minimal_row_shape(self):
        self._create_preprocessing_rows_for_review()
        response = self._preprocessing_review_get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('fields'), 'minimal')
        row = response.data['rows'][0]
        # Heavy JSON triples + final_* stay excluded; scalar ai_*/standard_* layer
        # fields ARE included (2026-06-10 - table hover tooltips + AI condition reset).
        self.assertNotIn('final_title', row)
        self.assertNotIn('ai_status', row)
        self.assertNotIn('identifiers', row)
        self.assertNotIn('ai_identifiers', row)
        self.assertIn('description', row)
        self.assertIn('title', row)
        self.assertIn('ai_brand', row)
        self.assertIn('ai_condition', row)
        self.assertIn('standard_description', row)

    def test_finalize_preprocessing_rejects_inline_rows_payload(self):
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            final_title='T',
            final_description='D',
            unit_retail=Decimal('40.00'),
            final_price=Decimal('15.00'),
            pricing_stage='final',
        )
        view = PurchaseOrderViewSet.as_view({'post': 'finalize_preprocessing'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/finalize-preprocessing/',
            {'rows': []},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 400)

    def test_finalize_after_review_patch_then_build_creates_manifest(self):
        row = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Widget',
            ai_title='AI Widget Title',
            final_title='AI Widget Title',
            final_description='Widget body',
            standard_brand='',
            ai_brand='',
            standard_model='',
            ai_model='',
            standard_taxonomy={'category': 'Kitchen & dining'},
            ai_condition='good',
            standard_condition='good',
            unit_retail=Decimal('40.00'),
            proposed_price=None,
            final_price=None,
            pricing_stage='unpriced',
        )

        patch_resp = self._preprocessing_review_patch([{'id': row.id, 'patch': {'final_price': '15.00'}}])
        self.assertEqual(patch_resp.status_code, 200, patch_resp.data)

        fin = self._finalize_preprocessing_fast()
        self.assertEqual(fin.status_code, 200, fin.data)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.order).count(), 1)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)

    def test_finalize_preprocessing_preserves_staff_final_review_on_bookmarks_then_manifest(self):
        row = PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            standard_description='Standard widget body copy',
            ai_title='AI Listing Title',
            ai_description='',
            standard_brand='VendorBrand',
            ai_brand='VendorBrand',
            standard_taxonomy={'category': 'Kitchen & dining'},
            ai_category='Kitchen & dining',
            ai_condition='good',
            standard_condition='good',
            unit_retail=Decimal('40.00'),
            proposed_price=Decimal('15.00'),
            final_price=Decimal('15.00'),
            pricing_stage='final',
            final_title='Staff Final Title',
            final_category='Kitchen & dining',
            final_description='Standard widget body copy',
            final_brand='Staff Brand',
        )

        fin = self._finalize_preprocessing_fast()
        self.assertEqual(fin.status_code, 200)

        row.refresh_from_db()
        self.assertEqual(row.final_title, 'Staff Final Title')
        self.assertEqual(row.final_category, 'Kitchen & dining')
        self.assertEqual(row.final_description, 'Standard widget body copy')
        self.assertEqual(row.final_brand, 'Staff Brand')

        bm = ProcessingRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(bm.title, 'Staff Final Title')
        self.assertEqual(bm.description, 'Standard widget body copy')
        self.assertEqual(bm.brand, 'Staff Brand')

        build_resp = self._build_processing_data()
        self.assertEqual(build_resp.status_code, 200, build_resp.data)
        m = ManifestRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(m.title, 'Staff Final Title')
        self.assertEqual(m.description, 'Standard widget body copy')
        self.assertEqual(m.brand, 'Staff Brand')

    def test_processing_workspace_shows_bookmarks_before_build(self):
        from apps.inventory.services.processing_workspace import build_processing_workspace

        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            final_title='T',
            final_description='D',
            final_category='Cat',
            unit_retail=Decimal('10.00'),
            final_price=Decimal('5.00'),
            pricing_stage='final',
        )
        self.assertEqual(self._finalize_preprocessing_fast().status_code, 200)
        self.order.refresh_from_db()
        ws = build_processing_workspace(self.order)
        self.assertTrue(ws.get('processingBookmarkOnly'))
        self.assertIsNotNone(ws.get('preprocessing_finalized_at'))
        self.assertEqual(len(ws['rows']), 1)
        self.assertIsNone(ws['rows'][0]['manifest_row_id'])
        self.assertIn('processing_row_id', ws['rows'][0])

        self.assertEqual(self._build_processing_data().status_code, 200)
        ws2 = build_processing_workspace(self.order)
        self.assertFalse(ws2.get('processingBookmarkOnly'))
        self.assertIsNotNone(ws2.get('preprocessing_finalized_at'))
        self.assertIsNotNone(ws2['rows'][0]['manifest_row_id'])

    def test_processing_data_build_three_chunks_counters(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.bulk_create([
            ProcessingRow(
                purchase_order=self.order,
                preprocessing_row=None,
                row_number=i,
                quantity=1,
                unit_retail=Decimal('10.00'),
                final_price=Decimal('5.00'),
                pricing_stage='final',
                title=f'Title {i}',
                description=f'Body {i}',
                condition='good',
            )
            for i in range(1, 251)
        ])

        resp1 = self._build_processing_data(until_done=False)
        self.assertEqual(resp1.status_code, 200, resp1.data)
        self.assertFalse(resp1.data['done'])
        self.assertEqual(resp1.data['processed_rows'], 100)

        resp2 = self._post_build_processing_data_chunk()
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.data['done'])
        self.assertEqual(resp2.data['processed_rows'], 200)

        resp3 = self._post_build_processing_data_chunk()
        self.assertEqual(resp3.status_code, 200)
        self.assertTrue(resp3.data['done'])
        self.assertEqual(resp3.data['processed_rows'], 250)

        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 250)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 250)
        self.assertEqual(
            ProcessingDataBuild.objects.filter(
                purchase_order=self.order,
                status=ProcessingDataBuild.STATUS_COMPLETE,
            ).count(),
            1,
        )

    def test_chunk_endpoint_idempotent_when_build_complete(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            unit_retail=Decimal('10.00'),
            final_price=Decimal('5.00'),
            pricing_stage='final',
            title='T',
            description='D',
            condition='good',
        )
        done = self._build_processing_data()
        self.assertTrue(done.data['done'])

        again = self._post_build_processing_data_chunk()
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.data['done'])
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 1)

    def test_clear_processing_data_returns_to_bookmarks_only(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            unit_retail=Decimal('10.00'),
            final_price=Decimal('5.00'),
            pricing_stage='final',
            title='A',
            description='Aa',
            condition='good',
        )
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            unit_retail=Decimal('11.00'),
            final_price=Decimal('6.00'),
            pricing_stage='final',
            title='B',
            description='Bb',
            condition='good',
        )

        build = self._build_processing_data()
        self.assertEqual(build.status_code, 200)
        self.assertTrue(build.data['done'])
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 2)
        self.assertTrue(ProcessingBatch.objects.filter(purchase_order=self.order).exists())

        clear = self._post_clear_processing_data()
        self.assertEqual(clear.status_code, 200, clear.data)
        self.assertEqual(clear.data.get('code'), 'processing_data_cleared')
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.order).count(), 2)
        self.assertFalse(
            ProcessingRow.objects.filter(purchase_order=self.order, manifest_row_id__isnull=False).exists(),
        )
        self.assertFalse(ProcessingDataBuild.objects.filter(purchase_order=self.order).exists())
        self.assertFalse(ProcessingBatch.objects.filter(purchase_order=self.order).exists())

        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.finalized_at)

    def test_get_processing_data_build_status_idle_then_running(self):
        from apps.inventory.services.processing_workspace import build_processing_workspace

        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.bulk_create([
            ProcessingRow(
                purchase_order=self.order,
                preprocessing_row=None,
                row_number=i,
                quantity=1,
                unit_retail=Decimal('10.00'),
                final_price=Decimal('5.00'),
                pricing_stage='final',
                title=f'Title {i}',
                description=f'Desc {i}',
                condition='good',
            )
            for i in range(1, 102)
        ])

        st_view = PurchaseOrderViewSet.as_view({'get': 'processing_data_build'})
        rq = APIRequestFactory().get(f'/api/inventory/orders/{self.order.pk}/processing-data-build/')
        force_authenticate(rq, user=self.user)
        idle = st_view(rq, pk=self.order.pk)
        self.assertEqual(idle.status_code, 200)
        self.assertEqual(idle.data.get('status'), 'none')

        self.assertEqual(self._build_processing_data(until_done=False).status_code, 200)
        rq2 = APIRequestFactory().get(f'/api/inventory/orders/{self.order.pk}/processing-data-build/')
        force_authenticate(rq2, user=self.user)
        running = st_view(rq2, pk=self.order.pk)
        self.assertEqual(running.status_code, 200)
        self.assertFalse(running.data['done'])
        self.assertEqual(running.data['processed_rows'], 100)

        self.assertEqual(self._post_build_processing_data_chunk().status_code, 200)
        rq3 = APIRequestFactory().get(f'/api/inventory/orders/{self.order.pk}/processing-data-build/')
        force_authenticate(rq3, user=self.user)
        complete_st = st_view(rq3, pk=self.order.pk)
        self.assertTrue(complete_st.data['done'])

        ws = build_processing_workspace(self.order)
        self.assertFalse(ws.get('processingBookmarkOnly'))

    def test_build_processing_data_fast_path_handles_large_bookmark_set(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.bulk_create([
            ProcessingRow(
                purchase_order=self.order,
                preprocessing_row=None,
                row_number=i,
                quantity=1,
                unit_retail=Decimal('10.00'),
                final_price=Decimal('5.00'),
                pricing_stage='final',
                title=f'Fast row {i}',
                description=f'Fast row body {i}',
                condition='good',
            )
            for i in range(1, 201)
        ])

        build_resp = self._build_processing_data()
        self.assertEqual(build_resp.status_code, 200, build_resp.data)
        self.assertEqual(build_resp.data['manifest_rows'], 200)
        self.assertEqual(build_resp.data['items_created'], 200)
        self.assertEqual(build_resp.data['products_created'], 200)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 200)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 200)
        self.assertEqual(Product.objects.filter(items__purchase_order=self.order).distinct().count(), 200)
        self.assertEqual(
            ProcessingRow.objects.filter(purchase_order=self.order, manifest_row__isnull=False).count(),
            200,
        )

    def test_build_processing_data_uses_placeholder_for_missing_listing_text(self):
        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=5,
            quantity=1,
            unit_retail=Decimal('10.00'),
            final_price=Decimal('5.00'),
            pricing_stage='final',
            condition='not-a-real-condition',
        )

        build_resp = self._build_processing_data()
        self.assertEqual(build_resp.status_code, 200, build_resp.data)
        item = Item.objects.select_related('product').get(purchase_order=self.order)
        self.assertEqual(item.product.title, 'Review raw manifest row 5')
        self.assertEqual(item.condition, 'unknown')
        self.assertIsNotNone(item.product_id)
        rules = {w.get('rule') for w in (build_resp.data.get('warnings') or [])}
        self.assertIn('missing_listing_text', rules)
        self.assertIn('invalid_condition', rules)

    def test_processing_check_in_works_with_fast_path_productless_items(self):
        from apps.inventory.processing_ops import processing_print_and_check_in

        self.order.finalized_at = timezone.now()
        self.order.preprocess_status = 'finalized'
        self.order.save(update_fields=['finalized_at', 'preprocess_status', 'updated_at'])
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            unit_retail=Decimal('10.00'),
            final_price=Decimal('5.00'),
            pricing_stage='final',
            title='Productless item',
            description='Productless item body',
            condition='good',
        )
        self.assertEqual(self._build_processing_data().status_code, 200)
        item = Item.objects.get(purchase_order=self.order)
        self.assertIsNotNone(item.product_id)

        out = processing_print_and_check_in(
            self.user,
            item,
            {'condition': 'Used Good', 'price': '5.00', 'dispatch': 'on_shelf'},
        )
        item.refresh_from_db()
        self.assertTrue(out['item']['checked_in'])
        self.assertEqual(item.status, 'on_shelf')

    def test_preview_manifest_formulas_requires_manifest_file(self):
        view = PurchaseOrderViewSet.as_view({'post': 'preview_manifest_formulas'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/preview-manifest-formulas/',
            {'raw_row': {'Description': 'Widget'}, 'formulas': {'description': '[Description]'}},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 400)

    def test_process_manifest_save_template_as_new_creates_without_overwriting_prior(self):
        from apps.core.models import S3File

        csv_content = 'Qty,Item Desc,Unit Retail\n1,Widget A,10.00\n'
        reader_headers = ['Qty', 'Item Desc', 'Unit Retail']
        sig = header_signature(reader_headers)

        old_maps = default_column_mappings(reader_headers)
        new_maps = [
            {'target': 'quantity', 'source': 'Qty'},
            {'target': 'description', 'source': 'Item Desc', 'transforms': [{'type': 'upper'}]},
            {'target': 'unit_retail', 'source': 'Unit Retail'},
        ]

        tpl_old = CSVTemplate.objects.create(
            vendor=self.vendor,
            name='Original Template',
            header_signature=sig,
            column_mappings=old_maps,
            is_default=False,
        )

        s3 = S3File.objects.create(
            key=f'manifests/process-manifest-{self.order.pk}.csv',
            filename='m.csv',
        )
        self.order.manifest = s3
        self.order.save(update_fields=['manifest'])

        class _FakeCtx:
            def __init__(self, raw: bytes):
                self._raw = raw

            def __enter__(self):
                return io.BytesIO(self._raw)

            def __exit__(self, *args):
                return False

        payload = {
            'column_mappings': new_maps,
            'save_template': True,
            'save_template_as_new': True,
            'template_name': 'Derived From Original',
            'template_id': tpl_old.id,
        }

        view = PurchaseOrderViewSet.as_view({'post': 'process_manifest'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/process-manifest/',
            payload,
            format='json',
        )
        force_authenticate(request, user=self.user)

        opener = lambda key, mode='rb': _FakeCtx(csv_content.encode('utf-8'))

        with patch('apps.inventory.views.default_storage.open', side_effect=opener):
            response = view(request, pk=self.order.pk)

        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        self.assertEqual(CSVTemplate.objects.filter(vendor=self.vendor).count(), 2)
        tpl_old.refresh_from_db()
        self.assertEqual(tpl_old.column_mappings, old_maps)
        created = CSVTemplate.objects.get(vendor=self.vendor, name='Derived From Original')
        self.assertEqual(created.header_signature, sig)
        self.assertEqual(response.data['manifest_rows_upserted'], 1)
        manifest_row = ManifestRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(manifest_row.description, 'WIDGET A')
        staging_row = PreprocessingRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(staging_row.manifest_row_id, manifest_row.id)
        self.assertEqual(staging_row.standard_description, 'WIDGET A')

        download = self._download_cleanup_csv()
        downloaded_rows = list(csv.DictReader(io.StringIO(download.content.decode('utf-8'))))
        self.assertEqual(downloaded_rows[0]['row_id'], str(manifest_row.id))
        self.assertEqual(downloaded_rows[0]['description'], 'WIDGET A')

        cleanup_csv = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{manifest_row.id},Widget A Final,Acme,W1,Kitchen & dining,good,12.99\n'
        )
        cleanup_response = self._upload_cleanup_csv(cleanup_csv)
        self.assertEqual(cleanup_response.status_code, 200, cleanup_response.data)
        staging_row.refresh_from_db()
        self.assertEqual(staging_row.ai_title, 'Widget A Final')
        self.assertEqual(staging_row.ai_category, 'Kitchen & dining')

    def test_validate_mapping_target_tracking_custom_subkey(self):
        self.assertIsNone(validate_mapping_target('tracking.warehouse_zone'))

    def test_validate_mapping_target_rejects_unknown_bucket_prefix(self):
        self.assertIsNotNone(validate_mapping_target('bogus.foo'))

    def test_validate_mapping_target_subkey_regex(self):
        self.assertIsNotNone(validate_mapping_target('identifiers.UPC'))
        self.assertIsNone(validate_mapping_target('identifiers.upc'))

    def test_normalize_row_prunes_empty_bucket_values(self):
        raw = {'UPC': '  ', 'Category': ''}
        mappings = [
            {'target': 'identifiers.upc', 'formula': 'TRIM([UPC])'},
            {'target': 'taxonomy.category', 'formula': 'TRIM([Category])'},
        ]
        out = normalize_row(raw, 1, mappings)
        self.assertEqual(out['identifiers'], {})
        self.assertEqual(out['taxonomy'], {})

    def test_normalize_row_costco_description_title_formula(self):
        raw = {'Item Description': 'BRIO 740 BOTTOM LOAD'}
        mappings = [{'target': 'description', 'formula': 'TITLE(TRIM([Item Description]))'}]
        out = normalize_row(raw, 1, mappings)
        self.assertEqual(out['description'], 'Brio 740 Bottom Load')

    def test_normalize_row_target_department_title_formula(self):
        raw = {'Department': 'KITCHEN'}
        mappings = [{'target': 'taxonomy.department', 'formula': 'TITLE(TRIM([Department]))'}]
        out = normalize_row(raw, 1, mappings)
        self.assertEqual(out['taxonomy']['department'], 'Kitchen')

    def test_seed_basic_bucket_templates_exist(self):
        names = ['Target Basic', 'Costco Basic', 'Amazon Basic']
        templates = list(CSVTemplate.objects.filter(name__in=names))
        self.assertEqual(len(templates), 3)
        for tpl in templates:
            mappings = tpl.column_mappings or []
            self.assertTrue(
                any((m.get('target') or '').startswith('tracking.') for m in mappings),
                msg=f'Template {tpl.name!r} missing tracking.* mapping',
            )
