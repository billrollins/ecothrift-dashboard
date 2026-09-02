"""Web AI cleanup batches: ai-cleanup-batch / status / complete, partial apply, legacy 410.

Architecture: workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md
§ Fable 5 verdict. Invariants under test:
- Batch writes PreprocessingRow.ai_* + final_* snapshot only; ManifestRow stays frozen;
  no Product/Item rows are created by cleanup.
- ai_cleanup_generation guard discards in-flight saves after undo/cancel.
- Status drives the pool: uncleaned_row_ids shrinks as batches land (resume contract).
- complete is fast/idempotent and owns match candidates + order flags.
- apply-cleanup-csv partial:true applies a subset without the row-count gate.
- Legacy ai-cleanup-rows returns 410 on staging-active orders.
"""

import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.services.llm_router import LLMResult
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)


def _llm_result(payload, *, model_used='claude-haiku-4-5'):
    return LLMResult(
        text=json.dumps(payload),
        model_used=model_used,
        input_tokens=100,
        output_tokens=100,
    )


def _suggestion(row, **overrides):
    base = {
        'row_id': row.id,
        'title': f'Clean Title {row.row_number}',
        'brand': 'Acme',
        'model': 'X1',
        'category': 'Mixed lots & uncategorized',
        'condition': 'good',
        # Leashed pricing: model outputs scalers, server computes the price.
        'retail_suspect': False,
        'retail_suspect_reason': '',
        'm_resale': 0.5,
        'm_saleability': 1.0,
        'search_tags': ['acme', 'widget'],
        'low_confidence': False,
        'low_confidence_reason': '',
    }
    base.update(overrides)
    return base


@override_settings(ANTHROPIC_API_KEY='test-key', AI_MODEL_INVENTORY_CLEANUP='claude-haiku-4-5', AI_PROVIDER='auto')
class AiCleanupBatchTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CLEAN-1',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            est_shrink=Decimal('0.10'),
            receiving_status='done',
            receiving_done_at=timezone.now(),
        )
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='Staff',
            last_name='User',
            password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

    def _staging_row(self, row_number, with_manifest=True, **kwargs):
        mr = None
        if with_manifest:
            mr = ManifestRow.objects.create(
                purchase_order=self.order,
                row_number=row_number,
                quantity=1,
                description=f'vendor desc {row_number}',
                title=f'vendor title {row_number}',
                brand='vendorbrand',
                unit_retail=Decimal('20.00'),
            )
        return PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=row_number,
            manifest_row=mr,
            standard_description=f'std desc {row_number}',
            **kwargs,
        )

    def _patch_llm(self, responder):
        def side_effect(**kwargs):
            out = responder(kwargs)
            if isinstance(out, LLMResult):
                return out
            if isinstance(out, list):
                return _llm_result(out)
            raise TypeError(f'unexpected mock llm response: {type(out)!r}')

        return mock.patch(
            'apps.core.services.llm_router.llm_complete',
            side_effect=side_effect,
        )

    def _post_batch(self, row_ids, **extra):
        extra.setdefault('model', 'claude-haiku-4-5')
        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/ai-cleanup-batch/',
            {'row_ids': row_ids, **extra},
            format='json',
        )


class AiCleanupBatchTests(AiCleanupBatchTestBase):
    def test_batch_merges_ai_fields_and_snapshots_final(self):
        r1 = self._staging_row(1)
        r2 = self._staging_row(2)

        def responder(kwargs):
            payload = json.loads(kwargs['user'])
            self.assertEqual([p['row_id'] for p in payload], [r1.id, r2.id])
            return [
                _suggestion(r1),
                _suggestion(r2, low_confidence=True, low_confidence_reason='vague row'),
            ]

        with self._patch_llm(responder):
            resp = self._post_batch([r1.id, r2.id])

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['rows_saved'], 2)
        self.assertFalse(resp.data['cancelled'])
        self.assertEqual(resp.data['discarded_rows'], [])

        r1.refresh_from_db()
        r2.refresh_from_db()
        self.assertEqual(r1.ai_title, 'Clean Title 1')
        self.assertEqual(r1.ai_brand, 'Acme')
        self.assertEqual(r1.ai_condition, 'good')
        # retail 20.00 × m_resale 0.5 × m_saleability 1.0 × qty(1)=1.0 × cond(good)=0.85
        self.assertEqual(r1.proposed_price, Decimal('8.50'))
        self.assertEqual(r1.pricing_stage, 'draft')
        self.assertEqual(r1.ai_status.get('pricing', {}).get('m_resale'), '0.50')
        self.assertNotEqual(r1.ai_reasoning, '')
        self.assertEqual(r1.final_title, 'Clean Title 1')
        self.assertEqual(r2.ai_status.get('state'), 'soft_flagged')

    def test_retail_suspect_flags_row_without_pricing(self):
        """A flagged retail typo must not produce a price - it would skew everything."""
        r1 = self._staging_row(1)
        with self._patch_llm(lambda kwargs: [
            _suggestion(r1, retail_suspect=True, retail_suspect_reason='looks x100 off'),
        ]):
            resp = self._post_batch([r1.id])
        self.assertEqual(resp.status_code, 200, resp.data)
        r1.refresh_from_db()
        self.assertIsNone(r1.proposed_price)
        self.assertEqual(r1.ai_status.get('state'), 'soft_flagged')
        rules = [i.get('rule') for i in r1.ai_status.get('issues', [])]
        self.assertIn('RETAIL_SUSPECT', rules)
        self.assertTrue(r1.ai_status.get('pricing', {}).get('retail_suspect'))

    def test_batch_never_touches_manifest_or_creates_products_items(self):
        r1 = self._staging_row(1)
        mr_title_before = r1.manifest_row.title
        mr_brand_before = r1.manifest_row.brand

        with self._patch_llm(lambda kwargs: [_suggestion(r1)]):
            resp = self._post_batch([r1.id])

        self.assertEqual(resp.status_code, 200, resp.data)
        mr = ManifestRow.objects.get(pk=r1.manifest_row_id)
        self.assertEqual(mr.title, mr_title_before)
        self.assertEqual(mr.brand, mr_brand_before)
        self.assertEqual(Product.objects.exclude(title='Generic Product', brand='Generic').count(), 0)
        self.assertEqual(Item.objects.count(), 0)

    def test_generation_guard_discards_save(self):
        r1 = self._staging_row(1)

        def responder(kwargs):
            PurchaseOrder.objects.filter(pk=self.order.pk).update(
                ai_cleanup_generation=self.order.ai_cleanup_generation + 1,
            )
            return [_suggestion(r1)]

        with self._patch_llm(responder):
            resp = self._post_batch([r1.id])

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['cancelled'])
        self.assertEqual(resp.data['rows_saved'], 0)
        r1.refresh_from_db()
        self.assertEqual(r1.ai_title, '')
        self.assertEqual(r1.ai_reasoning, '')

    def test_discards_missing_echo_and_empty_title(self):
        r1 = self._staging_row(1)
        r2 = self._staging_row(2)
        r3 = self._staging_row(3)

        with self._patch_llm(lambda kwargs: [
            _suggestion(r1),
            _suggestion(r2, title=''),
            # r3 missing entirely
        ]):
            resp = self._post_batch([r1.id, r2.id, r3.id])

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['rows_saved'], 1)
        reasons = {d['row_id']: d['reason'] for d in resp.data['discarded_rows']}
        self.assertEqual(reasons[r2.id], 'empty_title')
        self.assertEqual(reasons[r3.id], 'missing')
        r2.refresh_from_db()
        self.assertEqual(r2.ai_reasoning, '')  # still uncleaned → pool retries it

    def test_invalid_category_and_condition_fall_back_clean(self):
        r1 = self._staging_row(1)
        with self._patch_llm(lambda kwargs: [
            _suggestion(r1, category='Not A Real Category', condition='sparkly'),
        ]):
            resp = self._post_batch([r1.id])
        self.assertEqual(resp.status_code, 200, resp.data)
        r1.refresh_from_db()
        self.assertEqual(r1.ai_category, '')
        self.assertEqual(r1.ai_condition, '')
        self.assertEqual(r1.ai_title, 'Clean Title 1')

    def test_rejects_bad_row_ids_and_oversize_batch(self):
        r1 = self._staging_row(1)
        resp = self._post_batch([r1.id + 9999])
        self.assertEqual(resp.status_code, 400)

        resp = self._post_batch([])
        self.assertEqual(resp.status_code, 400)

        # Oversize: 61 ids exceeds MAX_BATCH_ROW_IDS (60); checked before DB lookup.
        resp = self._post_batch([r1.id + i for i in range(61)])
        self.assertEqual(resp.status_code, 400)

    def test_requires_active_staging(self):
        order2 = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CLEAN-2',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('50.00'),
        )
        resp = self.client.post(
            f'/api/inventory/orders/{order2.id}/ai-cleanup-batch/',
            {'row_ids': [1]},
            format='json',
        )
        self.assertEqual(resp.status_code, 409)

    def test_unsupported_cleanup_model_returns_400(self):
        """Only the canonical cleanup models are accepted on ai-cleanup-batch."""
        r1 = self._staging_row(1)
        resp = self.client.post(
            f'/api/inventory/orders/{self.order.id}/ai-cleanup-batch/',
            {'row_ids': [r1.id], 'model': 'grok-4.3'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(resp.data['code'], 'invalid_model')

    @override_settings(GOOGLE_API_KEY='google-test-key', AI_MODEL_INVENTORY_CLEANUP='gemini-3.1-flash-lite')
    def test_gemini_model_routes_to_google_provider(self):
        """gemini-3.1-flash-lite is passed through llm_complete with the Google API key."""
        r1 = self._staging_row(1)
        with mock.patch(
            'apps.core.services.llm_router.llm_complete',
            return_value=_llm_result([_suggestion(r1)], model_used='gemini-3.1-flash-lite'),
        ) as llm_call:
            resp = self.client.post(
                f'/api/inventory/orders/{self.order.id}/ai-cleanup-batch/',
                {'row_ids': [r1.id]},
                format='json',
            )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['rows_saved'], 1)
        self.assertEqual(resp.data['model_used'], 'gemini-3.1-flash-lite')
        llm_call.assert_called_once()
        self.assertEqual(llm_call.call_args.kwargs['model_id'], 'gemini-3.1-flash-lite')
        self.assertEqual(llm_call.call_args.kwargs['api_key'], 'google-test-key')
        self.assertEqual(llm_call.call_args.kwargs['log_source'], 'ai_cleanup_batch')

    @override_settings(GOOGLE_API_KEY='google-test-key')
    def test_gemini_batch_logs_usage(self):
        """Gemini cleanup batches append ai_cleanup_batch lines via llm_complete logging."""
        r1 = self._staging_row(1)
        google_stub = lambda **kwargs: _llm_result(
            [_suggestion(r1)], model_used='gemini-3.1-flash-lite',
        )
        with mock.patch.dict(
            'apps.core.services.llm_router._PROVIDER_CALLS',
            {'google': google_stub},
        ):
            with mock.patch('apps.core.services.ai_usage_log.log_ai_usage') as log_mock:
                resp = self.client.post(
                    f'/api/inventory/orders/{self.order.id}/ai-cleanup-batch/',
                    {'row_ids': [r1.id], 'model': 'gemini-3.1-flash-lite'},
                    format='json',
                )
        self.assertEqual(resp.status_code, 200, resp.data)
        log_mock.assert_called_once()
        self.assertEqual(log_mock.call_args[0][0], 'ai_cleanup_batch')
        self.assertEqual(log_mock.call_args[0][1], 'gemini-3.1-flash-lite')
        self.assertIn('requested_model=gemini-3.1-flash-lite', log_mock.call_args.kwargs['detail'])

    def test_cleanup_models_lists_canonical_choices(self):
        resp = self.client.get(f'/api/inventory/orders/{self.order.id}/ai-cleanup-models/')
        self.assertEqual(resp.status_code, 200)
        ids = [m['id'] for m in resp.data['models']]
        self.assertEqual(ids, ['gemini-3.1-flash-lite', 'claude-haiku-4-5'])
        self.assertEqual(resp.data['default'], 'claude-haiku-4-5')

    def test_ai_failure_returns_retryable_502(self):
        r1 = self._staging_row(1)

        def responder(kwargs):
            raise RuntimeError('connection reset')

        with self._patch_llm(responder):
            resp = self._post_batch([r1.id])
        self.assertEqual(resp.status_code, 502)
        self.assertTrue(resp.data['retryable'])


class AiCleanupStatusAndCompleteTests(AiCleanupBatchTestBase):
    def test_status_reports_uncleaned_ids_and_shrinks_after_batch(self):
        r1 = self._staging_row(1)
        r2 = self._staging_row(2)

        resp = self.client.get(f'/api/inventory/orders/{self.order.id}/ai-cleanup-status/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_rows'], 2)
        self.assertEqual(resp.data['cleaned_rows'], 0)
        self.assertEqual(resp.data['uncleaned_row_ids'], [r1.id, r2.id])
        self.assertIn('generation', resp.data)

        with self._patch_llm(lambda kwargs: [_suggestion(r1)]):
            self._post_batch([r1.id])

        resp = self.client.get(f'/api/inventory/orders/{self.order.id}/ai-cleanup-status/')
        self.assertEqual(resp.data['cleaned_rows'], 1)
        self.assertEqual(resp.data['uncleaned_row_ids'], [r2.id])

    def test_complete_sets_flags_and_generates_candidates(self):
        product = Product.objects.create(title='Known Widget', identifiers={'upc': '012345678905'})
        r1 = self._staging_row(1, ai_identifiers={'upc': '012345678905'}, ai_title='Known Widget')
        PreprocessingRow.objects.filter(pk=r1.pk).update(ai_reasoning='AI cleanup (web batch)')

        resp = self.client.post(f'/api/inventory/orders/{self.order.id}/ai-cleanup-complete/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['match_candidates']['rows_scanned'], 1)
        self.assertEqual(resp.data['match_candidates']['auto_selected'], 1)

        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.ai_cleaned_at)
        self.assertEqual(self.order.preprocess_status, 'cleaned')
        r1.refresh_from_db()
        self.assertEqual(r1.final_matched_product_id, product.id)

        # Idempotent second call.
        resp = self.client.post(f'/api/inventory/orders/{self.order.id}/ai-cleanup-complete/')
        self.assertEqual(resp.status_code, 200, resp.data)


class CancelAiCleanupTests(AiCleanupBatchTestBase):
    def test_cancel_clears_final_snapshot_match_fields_and_flags(self):
        """Cancel must clear the WHOLE cleaned state (ai_* + final_* + matches), not just ai_*."""
        product = Product.objects.create(title='Known Widget', identifiers={'upc': '012345678905'})
        r1 = self._staging_row(1)
        PreprocessingRow.objects.filter(pk=r1.pk).update(
            ai_title='Clean Title',
            ai_reasoning='AI cleanup (web batch)',
            final_title='Clean Title',
            final_matched_product=product,
            match_source='auto',
            match_candidates=[{'product_id': product.id, 'score': 100, 'source': 'upc', 'snapshot': {}}],
        )
        PurchaseOrder.objects.filter(pk=self.order.pk).update(
            ai_cleaned_at=timezone.now(), preprocess_status='cleaned',
        )
        gen_before = PurchaseOrder.objects.values_list(
            'ai_cleanup_generation', flat=True,
        ).get(pk=self.order.pk)

        resp = self.client.post(f'/api/inventory/orders/{self.order.id}/cancel-ai-cleanup/')
        self.assertEqual(resp.status_code, 200, resp.data)

        r1.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(r1.ai_title, '')
        self.assertEqual(r1.ai_reasoning, '')
        self.assertIsNone(r1.final_title)
        self.assertIsNone(r1.final_matched_product_id)
        self.assertEqual(r1.match_source, '')
        self.assertEqual(r1.match_candidates, [])
        self.assertIsNone(self.order.ai_cleaned_at)
        self.assertEqual(self.order.preprocess_status, 'standardized')
        self.assertEqual(self.order.ai_cleanup_generation, gen_before + 1)


class PartialApplyTests(AiCleanupBatchTestBase):
    def _apply_rows(self, rows_payload, partial=True):
        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/apply-cleanup-csv/',
            {'rows': rows_payload, 'partial': partial},
            format='json',
        )

    def test_partial_apply_subset_without_row_count_gate(self):
        r1 = self._staging_row(1)
        self._staging_row(2)

        resp = self._apply_rows([
            {
                'row_id': r1.manifest_row_id,
                'row_number': r1.row_number,
                'ai_title': 'Chunked Title',
                'ai_brand': 'Acme',
                'ai_model': '',
                'category': 'Mixed lots & uncategorized',
                'condition': 'good',
                'proposed_price': '9.99',
            },
        ])
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['rows_updated'], 1)
        self.assertTrue(resp.data['partial'])

        r1.refresh_from_db()
        self.assertEqual(r1.ai_title, 'Chunked Title')
        self.assertEqual(r1.final_title, 'Chunked Title')
        # Completion deferred: order flags untouched until ai-cleanup-complete.
        self.order.refresh_from_db()
        self.assertIsNone(self.order.ai_cleaned_at)

    def test_full_apply_still_requires_exact_coverage(self):
        r1 = self._staging_row(1)
        self._staging_row(2)
        resp = self._apply_rows(
            [{
                'row_id': r1.manifest_row_id,
                'row_number': r1.row_number,
                'ai_title': 'T',
                'ai_brand': '',
                'ai_model': '',
                'category': '',
                'condition': '',
                'proposed_price': '',
            }],
            partial=False,
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'row_count_mismatch')


_TEST_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


@override_settings(STORAGES=_TEST_STORAGES)
class UploadManifestStateResetTests(AiCleanupBatchTestBase):
    def _upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            f'/api/inventory/orders/{self.order.id}/upload-manifest/',
            {'file': SimpleUploadedFile('m.csv', b'SKU,Title\nA1,Widget\n', content_type='text/csv')},
            format='multipart',
        )

    def test_reupload_blocked_when_finalized(self):
        self._staging_row(1)
        PurchaseOrder.objects.filter(pk=self.order.pk).update(finalized_at=timezone.now())
        resp = self._upload()
        self.assertEqual(resp.status_code, 409)

    def test_reupload_resets_flow_flags(self):
        """New manifest restarts the pipeline - flags must not claim cleaned with no staging."""
        self._staging_row(1)
        PurchaseOrder.objects.filter(pk=self.order.pk).update(
            preprocess_status='cleaned',
            standardized_at=timezone.now(),
            ai_cleaned_at=timezone.now(),
        )
        resp = self._upload()
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', resp))
        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'not_started')
        self.assertIsNone(self.order.standardized_at)
        self.assertIsNone(self.order.ai_cleaned_at)
        self.assertEqual(PreprocessingRow.objects.filter(purchase_order=self.order).count(), 0)


class LegacyEndpointDeprecationTests(AiCleanupBatchTestBase):
    def test_ai_cleanup_rows_410_when_staging_active(self):
        self._staging_row(1)
        resp = self.client.post(
            f'/api/inventory/orders/{self.order.id}/ai-cleanup-rows/',
            {'offset': 0, 'batch_size': 5},
            format='json',
        )
        self.assertEqual(resp.status_code, 410)
