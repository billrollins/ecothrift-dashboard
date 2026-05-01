import csv
import io
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
    PreprocessingOrder,
    PreprocessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.views import (
    PurchaseOrderViewSet,
    default_column_mappings,
    ensure_manifest_products_and_items,
    header_signature,
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

    def _create_preprocessing_rows_for_review(self):
        prep = PreprocessingOrder.objects.create(
            purchase_order=self.order,
            workflow_status='ai_imported',
            row_count=2,
        )
        first = PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            category='Kitchen & dining',
            condition='unknown',
            retail_value=Decimal('50.00'),
            notes='low confidence',
            pricing_stage='unpriced',
        )
        second = PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Bright LED Lamp',
            title='LED Lamp',
            brand='BrightCo',
            category='Home décor & lighting',
            condition='unknown',
            retail_value=Decimal('25.00'),
            proposed_price=Decimal('12.50'),
            pricing_stage='draft',
        )
        return prep, first, second

    def _create_manifest_rows(self):
        first = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            category='Kitchen & dining',
            condition='unknown',
            retail_value=Decimal('50.00'),
            notes='keep this note',
            search_tags='keep-tag',
            pricing_stage='unpriced',
        )
        second = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Bright LED Lamp',
            title='LED Lamp',
            brand='BrightCo',
            category='Home décor & lighting',
            condition='unknown',
            retail_value=Decimal('25.00'),
            pricing_stage='unpriced',
        )
        return first, second

    def test_default_column_mappings_prefers_unit_retail_header(self):
        headers = ['Qty', 'Unit Retail', 'Ext. Retail', 'Item Description']
        mappings = default_column_mappings(headers)
        by_target = {m['target']: m for m in mappings}
        self.assertEqual(by_target['retail_value']['source'], 'Unit Retail')

    def test_default_column_mappings_maps_lean_cleanup_csv_headers(self):
        """download-cleanup-csv shape: title/condition/sku columns map to standard fields."""
        headers = [
            'row_id',
            'row_number',
            'description',
            'title',
            'brand',
            'model',
            'category',
            'condition',
            'sku',
            'upc',
            'quantity',
            'retail_value',
            'notes',
            'base_cost',
            'ideal_price',
        ]
        mappings = default_column_mappings(headers)
        by_target = {m['target']: m for m in mappings}
        self.assertEqual(by_target['title']['source'], 'title')
        self.assertEqual(by_target['condition']['source'], 'condition')
        self.assertEqual(by_target['description']['source'], 'description')
        self.assertEqual(by_target['vendor_item_number']['source'], 'sku')

    def test_ensure_manifest_products_and_items_is_idempotent(self):
        ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=2,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            model='T2',
            category='Kitchen',
            retail_value=Decimal('50.00'),
            proposed_price=Decimal('22.22'),
            pricing_stage='draft',
        )

        first = ensure_manifest_products_and_items(self.order)
        second = ensure_manifest_products_and_items(self.order)

        self.assertEqual(first['items_created'], 2)
        self.assertEqual(second['items_created'], 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(Product.objects.count(), 1)

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
        self.assertEqual(first.ai_suggested_title, 'Acme Two Slice Toaster')

    def test_preprocessing_status_includes_manifest_sample_from_preview(self):
        self.order.manifest_preview = {
            'headers': ['A', 'B'],
            'signature': 'abc123',
            'row_count': 99,
            'rows': [{'row_number': 1, 'raw': {'A': 'x'}}],
            'delimiter': ',',
        }
        self.order.save(update_fields=['manifest_preview'])
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
        self.assertEqual(ms['signature'], 'abc123')
        self.assertEqual(ms['row_count'], 99)
        self.assertEqual(len(ms['rows']), 1)
        self.assertIn('matching_templates', ms)
        self.assertEqual(ms['matching_templates'], [])
        self.assertIn('standard_columns', ms)
        self.assertGreater(len(ms['standard_columns']), 0)
        self.assertIsInstance(ms['template_mappings'], list)
        self.assertEqual(len(ms['template_mappings']), 11)

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
            'signature': sig,
            'row_count': 3,
            'rows': [{'row_number': 1, 'raw': {'Item Desc': 'x'}}],
            'delimiter': ',',
        }
        self.order.save(update_fields=['manifest_preview'])
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        mt = response.data['order']['manifest_sample']['matching_templates']
        self.assertEqual(len(mt), 1)
        self.assertEqual(mt[0]['name'], 'Vendor Sig Match')

    def test_preprocessing_status_manifest_sample_uses_default_mappings_when_template_mappings_null(self):
        self.order.manifest_preview = {
            'headers': ['Qty', 'Unit Retail', 'Item Description'],
            'signature': 'sig1',
            'row_count': 1,
            'rows': [{'row_number': 1, 'raw': {}}],
            'delimiter': ',',
            'template_mappings': None,
        }
        self.order.save(update_fields=['manifest_preview'])
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_status'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-status/',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)
        self.assertEqual(response.status_code, 200)
        tm = response.data['order']['manifest_sample']['template_mappings']
        by_target = {m['target']: m for m in tm}
        self.assertEqual(by_target['retail_value']['source'], 'Unit Retail')

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
        self.assertEqual(first.ai_suggested_title, 'Acme Two Slice Toaster')
        self.assertEqual(first.ai_suggested_brand, 'Acme')
        self.assertEqual(first.ai_suggested_model, 'T2')
        self.assertEqual(first.category, 'Kitchen & dining')
        self.assertEqual(first.condition, 'good')
        self.assertEqual(first.proposed_price, Decimal('19.99'))
        self.assertEqual(first.notes, 'keep this note')
        self.assertEqual(first.search_tags, 'keep-tag')
        self.assertEqual(first.pricing_stage, 'draft')
        self.assertEqual(second.ai_suggested_title, 'BrightCo LED Desk Lamp')

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
        self.assertEqual(first.ai_suggested_title, '')
        self.assertEqual(second.ai_suggested_title, '')

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
        PreprocessingOrder.objects.create(
            purchase_order=po_dash,
            workflow_status='finalized',
            row_count=2,
            finalized_at=timezone.now(),
        )
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_queue'})
        request = APIRequestFactory().get('/api/inventory/orders/preprocessing-queue/')
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data['results']]
        self.assertNotIn(po_dash.pk, ids)

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
        self.assertEqual(first.ai_suggested_title, '')
        self.assertEqual(second.ai_suggested_title, '')

    def test_upload_cleanup_csv_rejects_invalid_category_or_condition(self):
        first, second = self._create_manifest_rows()
        csv_text = (
            'row_id,ai_title,ai_brand,ai_model,category,condition,proposed_price\n'
            f'{first.id},Acme Two Slice Toaster,Acme,T2,Not A Category,good,19.99\n'
            f'{second.id},BrightCo LED Desk Lamp,BrightCo,,Home décor & lighting,used_good,12.50\n'
        )

        response = self._upload_cleanup_csv(csv_text)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'validation_failed')
        reasons = {row['reason'] for row in response.data['rejected_rows']}
        self.assertEqual(reasons, {'invalid_category', 'invalid_condition'})
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.ai_suggested_title, '')
        self.assertEqual(second.ai_suggested_title, '')

    def test_upload_cleanup_csv_writes_staging_rows_without_manifest_rows(self):
        prep = PreprocessingOrder.objects.create(
            purchase_order=self.order,
            workflow_status='standardized',
            row_count=2,
        )
        sr1 = PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='Acme Toaster 2 Slice',
            title='Acme Toaster',
            brand='Acme',
            category='Kitchen & dining',
            condition='unknown',
            retail_value=Decimal('50.00'),
            notes='keep this note',
            search_tags='keep-tag',
            pricing_stage='unpriced',
        )
        sr2 = PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Bright LED Lamp',
            title='LED Lamp',
            brand='BrightCo',
            category='Home décor & lighting',
            condition='unknown',
            retail_value=Decimal('25.00'),
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
        self.assertEqual(sr1.ai_suggested_title, 'Acme Two Slice Toaster')
        self.assertEqual(sr2.ai_suggested_title, 'BrightCo LED Desk Lamp')

    def test_download_cleanup_csv_staging_lean_schema_and_row_order(self):
        _, first, second = self._create_preprocessing_rows_for_review()
        expected_header = (
            'row_id,row_number,description,title,brand,model,category,condition,sku,upc,quantity,'
            'retail_value,notes,base_cost,ideal_price'
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
        self.assertEqual(rows[0]['title'], 'Acme Toaster')
        self.assertEqual(rows[0]['notes'], 'low confidence')
        self.assertEqual(rows[0]['sku'], '')
        hdr = lines[0]
        for legacy in ('item_id', 'current_title', 'ai_title', 'proposed_price'):
            self.assertNotIn(legacy, hdr)
        bc = Decimal(rows[0]['base_cost'])
        self.assertEqual(bc, self.order.compute_item_cost(Decimal('50.00')))
        ideal = Decimal(rows[0]['ideal_price'])
        self.assertEqual(ideal, (bc * Decimal('2')).quantize(Decimal('0.01')))

    def test_preprocessing_review_lists_staging_rows_without_canonical_side_effects(self):
        self._create_preprocessing_rows_for_review()

        response = self._preprocessing_review_get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['summary']['missing_price'], 1)
        self.assertEqual(response.data['summary']['low_confidence'], 1)
        self.assertNotIn('first_item_sku', response.data['rows'][0])
        self.assertNotIn('item_count', response.data['rows'][0])
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Product.objects.count(), 0)
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
        prep, first, _second = self._create_preprocessing_rows_for_review()

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
        prep.refresh_from_db()
        self.assertEqual(first.title, 'Acme Two Slice Toaster')
        self.assertEqual(first.brand, 'Acme Co')
        self.assertEqual(first.condition, 'good')
        self.assertEqual(first.final_price, Decimal('19.99'))
        self.assertIsNone(first.proposed_price)
        self.assertEqual(first.pricing_stage, 'final')
        self.assertTrue(first.batch_flag)
        self.assertEqual(prep.workflow_status, 'review')
        self.assertEqual(prep.current_step, 2)
        self.assertIsNotNone(prep.review_saved_at)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)

    def test_preprocessing_review_patch_rejects_finalized_session(self):
        prep, first, _second = self._create_preprocessing_rows_for_review()
        prep.finalized_at = timezone.now()
        prep.workflow_status = 'finalized'
        prep.save(update_fields=['finalized_at', 'workflow_status', 'updated_at'])

        response = self._preprocessing_review_patch([
            {'id': first.id, 'title': 'Should Not Save'},
        ])

        self.assertEqual(response.status_code, 409)
        first.refresh_from_db()
        self.assertEqual(first.title, 'Acme Toaster')

    def test_finalize_preprocessing_promotes_staging_to_manifest_and_items(self):
        prep = PreprocessingOrder.objects.create(
            purchase_order=self.order,
            workflow_status='review',
            row_count=2,
        )
        PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=1,
            quantity=2,
            description='Widget A',
            title='Widget A',
            brand='BrandA',
            category='Kitchen & dining',
            condition='good',
            retail_value=Decimal('40.00'),
            proposed_price=Decimal('15.00'),
            final_price=Decimal('15.00'),
            pricing_stage='final',
        )
        PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=2,
            quantity=1,
            description='Gadget B',
            title='Gadget B',
            brand='BrandB',
            category='Home décor & lighting',
            condition='good',
            retail_value=Decimal('30.00'),
            proposed_price=Decimal('12.00'),
            final_price=Decimal('12.00'),
            pricing_stage='final',
        )

        view = PurchaseOrderViewSet.as_view({'post': 'finalize_preprocessing'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/finalize-preprocessing/',
            {},
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 2)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 3)
        prep.refresh_from_db()
        self.assertIsNotNone(prep.finalized_at)
        self.assertEqual(prep.workflow_status, 'finalized')

    def test_preprocessing_review_full_mode_returns_all_rows(self):
        self._create_preprocessing_rows_for_review()
        response = self._preprocessing_review_get({'full': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('full'))
        self.assertEqual(len(response.data['rows']), 2)

    def test_finalize_preprocessing_applies_rows_payload_before_promotion(self):
        prep = PreprocessingOrder.objects.create(
            purchase_order=self.order,
            workflow_status='review',
            row_count=1,
        )
        row = PreprocessingRow.objects.create(
            preprocessing_order=prep,
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='Widget',
            title='',
            brand='',
            category='Kitchen & dining',
            condition='good',
            retail_value=Decimal('40.00'),
            proposed_price=None,
            final_price=None,
            pricing_stage='unpriced',
            ai_suggested_title='AI Widget Title',
        )

        view = PurchaseOrderViewSet.as_view({'post': 'finalize_preprocessing'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/finalize-preprocessing/',
            {'rows': [{'id': row.id, 'patch': {'final_price': '15.00'}}]},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = view(request, pk=self.order.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 1)

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
        new_maps = []
        for m in old_maps:
            entry = dict(m)
            if entry['target'] == 'description':
                entry['transforms'] = [{'type': 'upper'}]
            new_maps.append(entry)

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

