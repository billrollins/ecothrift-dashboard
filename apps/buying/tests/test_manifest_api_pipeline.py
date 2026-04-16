"""Tests for the two-worker API manifest pipeline (Phase: API parity)."""

from __future__ import annotations

from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings

from apps.buying.models import (
    Auction,
    CategoryMapping,
    ManifestRow,
    ManifestTemplate,
    Marketplace,
)
from apps.buying.services import manifest_api_pipeline as api_pipeline
from apps.buying.services.manifest_template import compute_header_signature


def _fake_page(rows: list[dict]) -> list[dict]:
    """B-Stock-ish shape: ``attributes`` holds product fields, ``_id`` per row."""
    return [
        {
            '_id': f'row-{i}',
            'status': 'active',
            'attributes': {
                'description': r['title'],
                'brand': r['brand'],
                'Category': r['category'],
                'Qty': r['qty'],
                'unitRetail': r['retail'],
            },
        }
        for i, r in enumerate(rows, start=1)
    ]


def _make_iter_pages_stub(all_rows: list[dict], page_size: int = 10):
    """Return a generator compatible with ``scraper.iter_manifest_pages``."""

    def stub(lot_id=None, *, auction_id=None, page_limit=10, max_rows=10000):
        api_calls = 0
        total = len(all_rows)
        for start in range(0, total, page_size):
            page = _fake_page(all_rows[start : start + page_size])
            api_calls += 1
            yield page, api_calls, total

    return stub


class ApiManifestPipelineTests(TestCase):
    def setUp(self) -> None:
        self.marketplace = Marketplace.objects.create(name='TestMP', slug='test-mp')
        self.auction = Auction.objects.create(
            marketplace=self.marketplace,
            external_id='listing-api-1',
            lot_id='lot-abc',
        )
        # Template whose signature matches the flattened first-page keys used in the fake rows.
        # ``_flatten_bstock_manifest_row`` also synthesizes ``title`` from ``attributes.description``.
        flat_cols = [
            'Category',
            'Qty',
            '_id',
            'brand',
            'description',
            'status',
            'title',
            'unitRetail',
        ]
        self.template = ManifestTemplate.objects.create(
            marketplace=self.marketplace,
            header_signature=compute_header_signature(flat_cols),
            display_name='API test template',
            column_map={
                'title': ['description'],
                'brand': ['brand'],
                'quantity': ['Qty'],
                'retail_value': ['unitRetail'],
                'notes': [],
            },
            category_fields=['Category'],
            category_field_transforms={},
            is_reviewed=True,
            min_fill_threshold=0,
        )
        # ``marketplace_fast_prefix`` strips non-alnum and truncates the slug to 4 chars,
        # so ``test-mp`` -> ``test`` -> key ``test-kitchen`` (not ``test-mp-kitchen``).
        CategoryMapping.objects.create(
            source_key='test-kitchen',
            canonical_category='Kitchen & dining',
            rule_origin=CategoryMapping.RULE_SEEDED,
        )

    def _rows(self, n: int = 12, category: str = 'Kitchen') -> list[dict]:
        return [
            {
                'title': f'Thing {i}',
                'brand': f'Brand-{i % 3}',
                'category': category,
                'qty': 1,
                'retail': '12.00',
            }
            for i in range(n)
        ]

    def test_columns_and_signature_from_first_batch(self) -> None:
        flat_rows = [
            api_pipeline.flatten_api_row(r) for r in _fake_page(self._rows(3))
        ]
        cols = api_pipeline.columns_from_flat_rows(flat_rows)
        self.assertIn('description', cols)
        self.assertIn('unitRetail', cols)
        self.assertIn('brand', cols)
        # Flattened `attributes` keys are promoted; the envelope `attributes` itself is filtered out.
        self.assertNotIn('attributes', cols)

    def test_run_api_pull_creates_rows_with_fast_cat(self) -> None:
        rows = self._rows(12, category='Kitchen')
        with mock.patch.object(
            api_pipeline.scraper,
            'iter_manifest_pages',
            side_effect=_make_iter_pages_stub(rows, page_size=10),
        ):
            body, status = api_pipeline.run_api_manifest_pull(
                self.auction,
                force=True,
                run_ai_key_mapping=False,
            )
        self.assertEqual(status, 200)
        self.assertEqual(body['rows_saved'], 12)
        self.assertEqual(body['template_source'], 'existing')
        self.assertEqual(body['manifest_template_id'], self.template.pk)
        saved = list(ManifestRow.objects.filter(auction=self.auction).order_by('row_number'))
        self.assertEqual(len(saved), 12)
        # Every row should have a populated fast_cat_key built via the template.
        self.assertTrue(all(r.fast_cat_key for r in saved))
        # The seeded mapping should have filled fast_cat_value for all "Kitchen" rows.
        self.assertTrue(all(r.fast_cat_value == 'Kitchen & dining' for r in saved))
        # Row numbering is global and contiguous across batches.
        self.assertEqual([r.row_number for r in saved], list(range(1, 13)))

    def test_run_api_pull_invokes_ai_mapping_hook_for_unknown_keys(self) -> None:
        rows = self._rows(3, category='Pets')
        with mock.patch.object(
            api_pipeline.scraper,
            'iter_manifest_pages',
            side_effect=_make_iter_pages_stub(rows, page_size=10),
        ), mock.patch.object(
            api_pipeline,
            'map_one_fast_cat_batch',
            return_value={
                'keys_mapped': 1,
                'keys_remaining': 0,
                'has_more': False,
                'error': None,
            },
        ) as mapping_mock:
            body, status = api_pipeline.run_api_manifest_pull(
                self.auction,
                force=True,
                run_ai_key_mapping=True,
            )
        self.assertEqual(status, 200)
        self.assertEqual(body['rows_saved'], 3)
        # AI hook was called because "pets" key was not in CategoryMapping.
        self.assertEqual(mapping_mock.call_count, 1)

    def test_retail_value_preserved_when_template_column_map_is_wrong(self) -> None:
        """
        Regression: a CSV-trained template (``retail_value`` → ``['Unit Retail']``)
        applied to API-flattened rows (which expose ``unitRetail``) used to drop the
        retail_value entirely because ``standardize_row`` could not find the column.
        The pipeline now falls back to ``normalize_manifest_row`` for scalars.
        """
        self.template.column_map = {
            'title': ['description'],
            'brand': ['brand'],
            'quantity': ['Quantity'],
            'retail_value': ['Unit Retail'],
            'notes': [],
        }
        self.template.save(update_fields=['column_map'])

        raw_rows = [
            {
                '_id': f'row-{i}',
                'status': 'active',
                'attributes': {
                    'description': f'Kitchen widget {i}',
                    'brand': 'Acme',
                    'Category': 'Kitchen',
                    'Qty': 1,
                    'unitRetail': 1299,  # cents → normalize converts to $12.99
                },
            }
            for i in range(3)
        ]

        def stub(lot_id=None, *, auction_id=None, page_limit=10, max_rows=10000):
            yield raw_rows, 1, 3

        with mock.patch.object(
            api_pipeline.scraper, 'iter_manifest_pages', side_effect=stub
        ):
            body, status = api_pipeline.run_api_manifest_pull(
                self.auction,
                force=True,
                run_ai_key_mapping=False,
            )
        self.assertEqual(status, 200)
        self.assertEqual(body['rows_saved'], 3)
        saved = list(ManifestRow.objects.filter(auction=self.auction).order_by('row_number'))
        self.assertEqual(len(saved), 3)
        for r in saved:
            self.assertEqual(r.retail_value, Decimal('12.99'))
            self.assertEqual(r.brand, 'Acme')
            self.assertEqual(r.title, 'Kitchen widget 0' if r.row_number == 1 else r.title)

    @override_settings(ANTHROPIC_API_KEY='')
    def test_unknown_template_returns_400_and_saves_no_rows(self) -> None:
        # Delete the matching template so the pipeline has to stub + require AI.
        ManifestTemplate.objects.all().delete()
        rows = self._rows(3)
        with mock.patch.object(
            api_pipeline.scraper,
            'iter_manifest_pages',
            side_effect=_make_iter_pages_stub(rows, page_size=10),
        ):
            body, status = api_pipeline.run_api_manifest_pull(
                self.auction,
                force=True,
                run_ai_key_mapping=False,
            )
        self.assertEqual(status, 400)
        self.assertEqual(body.get('code'), 'unknown_template')
        self.assertIn('manifest_template_id', body)
        self.assertEqual(ManifestRow.objects.filter(auction=self.auction).count(), 0)
