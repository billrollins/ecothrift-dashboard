"""est_retail: AI-estimated MSRP for staging rows whose manifest has no unit_retail.

Owner decision (2026-07): when a manifest row arrives with a blank unit_retail, the
web cleanup model may output ``est_retail`` (a retail CLAIM, not a resale price).
Invariants under test:
- Blank-retail row + valid est_retail → PreprocessingRow.unit_retail is set, the
  leashed formula prices the row exactly like a retail-bearing one, ai_reasoning
  notes the estimate. The ManifestRow spine keeps its original blank (audit).
- Rows that already carry unit_retail ignore est_retail entirely.
- Garbage/absurd est_retail is clamped or dropped without crashing.
- retail_suspect cannot fire on a blank-retail row (nothing to suspect).
"""

import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.core.services.llm_router import LLMResult
from apps.inventory.models import ManifestRow, PreprocessingRow, PurchaseOrder, Vendor
from apps.inventory.services.ai_cleanup import run_ai_cleanup_batch
from apps.inventory.services.intake_undo import _apply_ai_cleanup
from apps.inventory.views import PurchaseOrderViewSet

MODEL_ID = 'claude-haiku-4-5'


def _llm_result(payload):
    return LLMResult(
        text=json.dumps(payload),
        model_used=MODEL_ID,
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
        'retail_suspect': False,
        'retail_suspect_reason': '',
        'est_retail': '',
        'm_resale': 0.5,
        'm_saleability': 1.0,
        'search_tags': ['acme', 'widget'],
        'low_confidence': False,
        'low_confidence_reason': '',
    }
    base.update(overrides)
    return base


class EstRetailCleanupTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-EST-1',
            ordered_date='2026-07-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            est_shrink=Decimal('0.10'),
            receiving_status='done',
            receiving_done_at=timezone.now(),
        )

    def _staging_row(self, row_number, unit_retail=None):
        mr = ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=row_number,
            quantity=1,
            title=f'vendor title {row_number}',
            brand='vendorbrand',
            unit_retail=unit_retail,
        )
        return PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=row_number,
            manifest_row=mr,
        )

    def _run_batch(self, rows, suggestions):
        with mock.patch(
            'apps.core.services.llm_router.llm_complete',
            return_value=_llm_result(suggestions),
        ):
            return run_ai_cleanup_batch(
                self.order,
                [r.id for r in rows],
                model_id=MODEL_ID,
                api_key='test-key',
            )

    def test_blank_retail_row_gets_estimated_retail_and_leashed_price(self):
        r1 = self._staging_row(1, unit_retail=None)
        result = self._run_batch([r1], [_suggestion(r1, est_retail='29.99')])

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        self.assertEqual(r1.unit_retail, Decimal('29.99'))
        # 29.99 × m_resale 0.5 × m_saleability 1.0 × qty(1)=1.0 × cond(good)=0.85
        self.assertEqual(r1.proposed_price, Decimal('12.75'))
        self.assertEqual(r1.pricing_stage, 'draft')
        self.assertIn('est. retail $29.99', r1.ai_reasoning)
        self.assertIn('manifest had none', r1.ai_reasoning)
        self.assertEqual(r1.ai_status['pricing']['est_retail'], '29.99')
        # Audit spine: the ManifestRow keeps its original blank retail.
        r1.manifest_row.refresh_from_db()
        self.assertIsNone(r1.manifest_row.unit_retail)

    def test_est_retail_ignored_when_row_already_has_retail(self):
        r1 = self._staging_row(1, unit_retail=Decimal('20.00'))
        result = self._run_batch([r1], [_suggestion(r1, est_retail='999.00')])

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        # Staging unit_retail untouched (was never copied from manifest by cleanup).
        self.assertIsNone(r1.unit_retail)
        r1.manifest_row.refresh_from_db()
        self.assertEqual(r1.manifest_row.unit_retail, Decimal('20.00'))
        # Priced off the REAL retail: 20.00 × 0.5 × 1.0 × 1.0 × 0.85
        self.assertEqual(r1.proposed_price, Decimal('8.50'))
        self.assertNotIn('est. retail', r1.ai_reasoning)
        self.assertNotIn('est_retail', r1.ai_status.get('pricing', {}))

    def test_garbage_est_retail_is_ignored_without_crash(self):
        r1 = self._staging_row(1, unit_retail=None)
        result = self._run_batch([r1], [_suggestion(r1, est_retail='n/a')])

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        self.assertIsNone(r1.unit_retail)
        self.assertIsNone(r1.proposed_price)  # no retail base → leashed formula skips
        self.assertEqual(r1.pricing_stage, 'unpriced')
        self.assertNotIn('est. retail', r1.ai_reasoning)
        # Row is still cleaned (title etc. applied); only pricing is absent.
        self.assertEqual(r1.ai_title, 'Clean Title 1')

    def test_absurd_est_retail_is_clamped_to_band(self):
        r_high = self._staging_row(1, unit_retail=None)
        r_low = self._staging_row(2, unit_retail=None)
        result = self._run_batch(
            [r_high, r_low],
            [
                _suggestion(r_high, est_retail='999999'),
                _suggestion(r_low, est_retail='0.01'),
            ],
        )

        self.assertEqual(result['rows_saved'], 2, result)
        r_high.refresh_from_db()
        r_low.refresh_from_db()
        self.assertEqual(r_high.unit_retail, Decimal('10000'))
        self.assertEqual(r_low.unit_retail, Decimal('0.25'))
        # 10000 × 0.5 × 1.0 × 1.0 × 0.85 = 4250.00
        self.assertEqual(r_high.proposed_price, Decimal('4250.00'))
        # 0.25 × 0.5 × 0.85 = 0.10625 → floored at the 0.25 price minimum
        self.assertEqual(r_low.proposed_price, Decimal('0.25'))

    def test_negative_est_retail_is_ignored(self):
        r1 = self._staging_row(1, unit_retail=None)
        result = self._run_batch([r1], [_suggestion(r1, est_retail='-5.00')])

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        self.assertIsNone(r1.unit_retail)
        self.assertIsNone(r1.proposed_price)

    def test_retail_suspect_cannot_fire_on_blank_retail_row(self):
        r1 = self._staging_row(1, unit_retail=None)
        result = self._run_batch(
            [r1],
            [_suggestion(
                r1,
                est_retail='29.99',
                retail_suspect=True,
                retail_suspect_reason='model confused itself',
            )],
        )

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        # Blank retail → nothing to suspect: the flag is dropped, pricing proceeds.
        rules = [i.get('rule') for i in r1.ai_status.get('issues', [])]
        self.assertNotIn('RETAIL_SUSPECT', rules)
        self.assertFalse(r1.ai_status['pricing']['retail_suspect'])
        self.assertEqual(r1.unit_retail, Decimal('29.99'))
        self.assertEqual(r1.proposed_price, Decimal('12.75'))

    def test_retail_suspect_still_blocks_pricing_on_retail_bearing_row(self):
        """Regression: the blank-retail guard must not weaken the existing suspect path."""
        r1 = self._staging_row(1, unit_retail=Decimal('699.00'))
        result = self._run_batch(
            [r1],
            [_suggestion(r1, retail_suspect=True, retail_suspect_reason='x100 typo')],
        )

        self.assertEqual(result['rows_saved'], 1, result)
        r1.refresh_from_db()
        self.assertIsNone(r1.proposed_price)
        rules = [i.get('rule') for i in r1.ai_status.get('issues', [])]
        self.assertIn('RETAIL_SUSPECT', rules)
