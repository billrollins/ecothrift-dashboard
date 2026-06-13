"""P1 matching backend: candidate generation, decisions, finalize carry, denorm preservation.

Design: `.ai/reference/product_identity/product_identity_design.md` §2/§8.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.inventory.models import (
    ManifestRow,
    PreprocessingRow,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
    VendorProductRef,
)
from apps.inventory.services.processing_finalize import finalize_preprocessing_to_bookmarks
from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm
from apps.inventory.services.product_matching import generate_match_candidates_for_order
from apps.inventory.views import PurchaseOrderViewSet


class ProductMatchingTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-MATCH-1',
            ordered_date='2026-06-01',
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

    def _staging_row(self, row_number=1, **kwargs):
        return PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=row_number,
            **kwargs,
        )


class GenerateMatchCandidatesTests(ProductMatchingTestBase):
    def test_upc_exact_match_creates_candidate_and_auto_selects(self):
        product = Product.objects.create(
            title='Red Headband',
            brand='Acme',
            identifiers={'upc': '012345678905'},
        )
        row = self._staging_row(
            ai_title='hdbnd red',
            ai_identifiers={'upc': '012345678905'},
        )

        summary = generate_match_candidates_for_order(self.order)
        row.refresh_from_db()

        self.assertEqual(summary['rows_scanned'], 1)
        self.assertEqual(summary['rows_with_candidates'], 1)
        self.assertEqual(summary['auto_selected'], 1)
        self.assertEqual(row.final_matched_product_id, product.id)
        self.assertEqual(row.match_source, 'auto')
        self.assertEqual(row.match_candidates[0]['product_id'], product.id)
        self.assertEqual(row.match_candidates[0]['source'], 'upc')
        self.assertEqual(row.match_candidates[0]['score'], 100)
        self.assertEqual(row.match_candidates[0]['snapshot']['title'], 'Red Headband')

    def test_vendor_ref_match_creates_candidate_without_auto_select(self):
        product = Product.objects.create(title='Blue Widget', brand='Acme')
        VendorProductRef.objects.create(
            vendor=self.vendor,
            product=product,
            vendor_item_number='V-123',
        )
        row = self._staging_row(ai_title='widget', ai_identifiers={'sku': 'V-123'})

        summary = generate_match_candidates_for_order(self.order)
        row.refresh_from_db()

        self.assertEqual(summary['auto_selected'], 0)
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, '')
        sources = [c['source'] for c in row.match_candidates]
        self.assertIn('vendor_ref', sources)
        self.assertEqual(row.match_candidates[0]['product_id'], product.id)

    def test_exact_title_brand_match_creates_candidate(self):
        product = Product.objects.create(title='Xbox Controller', brand='Microsoft')
        row = self._staging_row(ai_title='xbox controller', ai_brand='microsoft')

        generate_match_candidates_for_order(self.order)
        row.refresh_from_db()

        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_candidates[0]['product_id'], product.id)
        self.assertEqual(row.match_candidates[0]['source'], 'text')
        self.assertEqual(row.match_candidates[0]['score'], 80)

    def test_no_match_leaves_row_undecided_with_no_candidates(self):
        row = self._staging_row(ai_title='never seen before item')

        summary = generate_match_candidates_for_order(self.order)
        row.refresh_from_db()

        self.assertEqual(summary['rows_with_candidates'], 0)
        self.assertEqual(row.match_candidates, [])
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, '')

    def test_staff_decision_never_overridden_on_regenerate(self):
        upc_product = Product.objects.create(title='Red Headband', identifiers={'upc': '012345678905'})
        staff_product = Product.objects.create(title='Other Product')
        row = self._staging_row(
            ai_title='hdbnd red',
            ai_identifiers={'upc': '012345678905'},
            final_matched_product=staff_product,
            match_source='staff',
        )
        cleared = self._staging_row(
            row_number=2,
            ai_title='hdbnd red 2',
            ai_identifiers={'upc': '012345678905'},
            final_matched_product=None,
            match_source='staff',
        )

        generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        cleared.refresh_from_db()

        # Candidates still refresh, but the staff decision stands.
        self.assertEqual(row.match_candidates[0]['product_id'], upc_product.id)
        self.assertEqual(row.final_matched_product_id, staff_product.id)
        self.assertEqual(row.match_source, 'staff')
        # Explicit staff "this is new" (null) also stands.
        self.assertIsNone(cleared.final_matched_product_id)
        self.assertEqual(cleared.match_source, 'staff')

    def test_auto_selection_updates_when_rerun_and_still_undecided(self):
        row = self._staging_row(ai_title='thing', ai_identifiers={'upc': '999'})
        generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)

        product = Product.objects.create(title='Thing', identifiers={'upc': '999'})
        generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        self.assertEqual(row.final_matched_product_id, product.id)
        self.assertEqual(row.match_source, 'auto')


class ReviewMatchDecisionApiTests(ProductMatchingTestBase):
    def _patch_review(self, rows):
        view = PurchaseOrderViewSet.as_view({'patch': 'preprocessing_review'})
        request = APIRequestFactory().patch(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review/',
            {'rows': rows},
            format='json',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def _get_review(self, params=None):
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_review'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review/',
            params or {},
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def test_patch_sets_final_matched_product_as_staff(self):
        product = Product.objects.create(title='Red Headband')
        row = self._staging_row(ai_title='hdbnd red')

        resp = self._patch_review([{'id': row.id, 'final_matched_product': product.id}])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['rows_updated'], 1)

        row.refresh_from_db()
        self.assertEqual(row.final_matched_product_id, product.id)
        self.assertEqual(row.match_source, 'staff')

    def test_patch_clears_match_as_staff_decision(self):
        product = Product.objects.create(title='Red Headband')
        row = self._staging_row(
            ai_title='hdbnd red',
            final_matched_product=product,
            match_source='auto',
        )

        resp = self._patch_review([{'id': row.id, 'final_matched_product': None}])
        self.assertEqual(resp.status_code, 200)

        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, 'staff')

    def test_patch_unset_removes_decision_entirely(self):
        """match_source '' + null = REMOVE match (back to undecided), not staff "new"."""
        product = Product.objects.create(title='Red Headband', identifiers={'upc': '012345678905'})
        row = self._staging_row(
            ai_title='hdbnd red',
            ai_identifiers={'upc': '012345678905'},
            final_matched_product=product,
            match_source='staff',
        )

        resp = self._patch_review([{'id': row.id, 'final_matched_product': None, 'match_source': ''}])
        self.assertEqual(resp.status_code, 200)

        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, '')

        # Undecided again → regenerate may auto-select (UPC exact), unlike staff-null.
        generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        self.assertEqual(row.final_matched_product_id, product.id)
        self.assertEqual(row.match_source, 'auto')

    def test_patch_rejects_unknown_product(self):
        row = self._staging_row(ai_title='hdbnd red')
        resp = self._patch_review([{'id': row.id, 'final_matched_product': 999999}])
        self.assertEqual(resp.status_code, 400)
        self.assertIn('not found', str(resp.data.get('detail', '')).lower())
        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, '')

    def test_patch_bulk_match_uses_single_product_query(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        products = [Product.objects.create(title=f'Product {i}') for i in range(3)]
        rows = [
            self._staging_row(row_number=i + 1, ai_title=f'row {i}')
            for i in range(3)
        ]
        payload = [
            {'id': row.id, 'final_matched_product': product.id}
            for row, product in zip(rows, products)
        ]

        with CaptureQueriesContext(connection) as ctx:
            resp = self._patch_review(payload)

        self.assertEqual(resp.status_code, 200)
        product_queries = [
            q for q in ctx.captured_queries if 'inventory_product' in q['sql'].lower()
        ]
        self.assertEqual(len(product_queries), 1)
        for row, product in zip(rows, products):
            row.refresh_from_db()
            self.assertEqual(row.final_matched_product_id, product.id)
            self.assertEqual(row.match_source, 'staff')

    def test_review_get_exposes_match_fields(self):
        product = Product.objects.create(title='Red Headband')
        self._staging_row(
            ai_title='hdbnd red',
            match_candidates=[{'product_id': product.id, 'score': 100, 'source': 'upc', 'snapshot': {}}],
            final_matched_product=product,
            match_source='auto',
        )

        resp = self._get_review()
        self.assertEqual(resp.status_code, 200)
        row_payload = resp.data['rows'][0]
        self.assertEqual(row_payload['final_matched_product'], product.id)
        self.assertEqual(row_payload['match_source'], 'auto')
        self.assertEqual(row_payload['match_candidates'][0]['product_id'], product.id)


class RegenerateMatchCandidatesApiTests(ProductMatchingTestBase):
    def _post_regen(self):
        view = PurchaseOrderViewSet.as_view({'post': 'regenerate_match_candidates'})
        request = APIRequestFactory().post(
            f'/api/inventory/orders/{self.order.pk}/regenerate-match-candidates/',
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def test_regenerate_returns_summary(self):
        Product.objects.create(title='Red Headband', identifiers={'upc': '012345678905'})
        self._staging_row(
            ai_title='hdbnd red',
            ai_identifiers={'upc': '012345678905'},
        )

        resp = self._post_regen()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['rows_scanned'], 1)
        self.assertEqual(resp.data['rows_with_candidates'], 1)
        self.assertEqual(resp.data['auto_selected'], 1)

    def test_regenerate_respects_staff_null(self):
        Product.objects.create(title='Red Headband', identifiers={'upc': '012345678905'})
        row = self._staging_row(
            ai_title='hdbnd red',
            ai_identifiers={'upc': '012345678905'},
            final_matched_product=None,
            match_source='staff',
        )

        resp = self._post_regen()
        self.assertEqual(resp.status_code, 200)
        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_source, 'staff')


class ReviewSerializerHydrationTests(ProductMatchingTestBase):
    def _get_review(self, params=None):
        view = PurchaseOrderViewSet.as_view({'get': 'preprocessing_review'})
        request = APIRequestFactory().get(
            f'/api/inventory/orders/{self.order.pk}/preprocessing-review/',
            params or {},
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=self.order.pk)

    def test_matched_product_detail_hydrated(self):
        product = Product.objects.create(
            title='Red Headband',
            brand='Acme',
            identifiers={'upc': '012345678905'},
            product_number='PRD-1042',
        )
        self._staging_row(
            ai_title='hdbnd red',
            final_matched_product=product,
            match_source='staff',
        )

        resp = self._get_review()
        self.assertEqual(resp.status_code, 200)
        detail = resp.data['rows'][0]['matched_product_detail']
        self.assertEqual(detail['id'], product.id)
        self.assertEqual(detail['product_number'], 'PRD-1042')
        self.assertEqual(detail['title'], 'Red Headband')
        self.assertEqual(detail['brand'], 'Acme')
        self.assertEqual(detail['identifiers'], {'upc': '012345678905'})

    def test_same_product_row_numbers(self):
        product = Product.objects.create(title='Shared Widget')
        self._staging_row(
            row_number=12,
            ai_title='widget a',
            final_matched_product=product,
            match_source='staff',
        )
        self._staging_row(
            row_number=40,
            ai_title='widget b',
            final_matched_product=product,
            match_source='staff',
        )

        resp = self._get_review({'page_size': 50})
        self.assertEqual(resp.status_code, 200)
        by_num = {r['row_number']: r for r in resp.data['rows']}
        self.assertEqual(by_num[12]['same_product_row_numbers'], [40])
        self.assertEqual(by_num[40]['same_product_row_numbers'], [12])


class ProcessingRowDetailMatchTests(ProductMatchingTestBase):
    def test_detail_uses_processing_row_match_over_manifest(self):
        from apps.inventory.services.processing_workspace import build_processing_row_detail

        product = Product.objects.create(title='Processing Match')
        mr = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            title='manifest line',
            matched_product=None,
        )
        pr = ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            manifest_row=mr,
            matched_product=product,
            title='Processing Match',
            quantity=1,
        )

        payload = build_processing_row_detail(self.order, processing_row_id=pr.pk)
        self.assertEqual(payload['row']['productId'], product.id)


class FinalizeCarriesMatchTests(ProductMatchingTestBase):
    def test_finalize_copies_decided_match_to_processing_row(self):
        product = Product.objects.create(title='Red Headband')
        matched = self._staging_row(
            row_number=1,
            final_title='Red Headband',
            final_price=Decimal('4.99'),
            final_matched_product=product,
            match_source='staff',
        )
        unmatched = self._staging_row(
            row_number=2,
            final_title='Mystery Item',
            final_price=Decimal('9.99'),
        )

        created = finalize_preprocessing_to_bookmarks(self.order)
        self.assertEqual(created, 2)

        pr_matched = ProcessingRow.objects.get(purchase_order=self.order, row_number=1)
        pr_unmatched = ProcessingRow.objects.get(purchase_order=self.order, row_number=2)
        self.assertEqual(pr_matched.matched_product_id, product.id)
        self.assertEqual(pr_matched.preprocessing_row_id, matched.id)
        self.assertIsNone(pr_unmatched.matched_product_id)
        self.assertEqual(pr_unmatched.preprocessing_row_id, unmatched.id)

    def test_finalize_search_string_includes_product_tokens(self):
        product = Product.objects.create(title='Catalog Product Name')
        self._staging_row(
            row_number=1,
            final_title='Manifest Title',
            final_price=Decimal('4.99'),
            final_matched_product=product,
            match_source='staff',
        )

        finalize_preprocessing_to_bookmarks(self.order)
        pr = ProcessingRow.objects.get(purchase_order=self.order, row_number=1)
        search = pr.search_string.lower()
        self.assertIn('catalog product name', search)
        self.assertIn('manifest title', search)


class DenormPreservesMatchTests(ProductMatchingTestBase):
    def test_refresh_preserves_match_on_linked_row_without_items(self):
        product = Product.objects.create(title='Red Headband')
        mr = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            title='hdbnd red',
        )
        pr = ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            manifest_row=mr,
            matched_product=product,
            title='Red Headband',
            quantity=1,
        )

        refresh_processing_rows_denorm(self.order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        self.assertEqual(pr.matched_product_id, product.id)

    def test_refresh_preserves_match_on_unlinked_bookmark(self):
        product = Product.objects.create(title='Red Headband')
        pr = ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            manifest_row=None,
            matched_product=product,
            title='Red Headband',
            quantity=1,
        )

        refresh_processing_rows_denorm(self.order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        self.assertEqual(pr.matched_product_id, product.id)
