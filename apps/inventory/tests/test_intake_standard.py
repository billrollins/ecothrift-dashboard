"""The product standard at intake: preprocessing writes it, matching uses it, check-in applies it (no model calls)."""
import json
from concurrent.futures import Future
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.core.models import AiModel, AppSetting
from apps.core.services.llm_router import LLMResult
from apps.inventory.models import (
    ManifestRow, PreprocessingRow, Product, ProductProfile, ProductVector, PurchaseOrder, Vendor,
)
from apps.inventory.services import ai_cleanup_job as job
from apps.inventory.services import intake_standard as ist
from apps.inventory.services.product_matching import generate_match_candidates_for_order
from apps.inventory.services.product_vectors import MODEL_NAME

MODEL = 'muse-spark-1.3-contributor'


def _vec(second: float = 0.0) -> list[float]:
    """A unit vector whose cosine similarity to `_vec()` is sqrt(1 - second^2)."""
    v = [0.0] * ProductVector.DIMENSIONS
    v[0], v[1] = (1 - second ** 2) ** 0.5, second
    return v


def _standard(**over):
    return {'display_title': 'Lego City Police Station', 'short_name': 'Lego Police Station',
            'vector_text': 'lego city police station building set', 'brand': 'Lego', 'model_number': '60316',
            'category': 'Toys & games', 'subcategory': 'Building sets', 'key_specs': {'piece_count': '668pc', 'toy_type': 'police station set'},
            'item_details': {}, 'confidence': 'high', 'flags': '', 'problems': [], 'rules_version': 'spec-test',
            'source': f'ai:{MODEL}', **over}


def _switch(on: bool):
    AppSetting.objects.update_or_create(key=ist.SWITCH_KEY, defaults={'value': on})


class _Base(TestCase):
    def setUp(self):
        self.order = PurchaseOrder.objects.create(
            vendor=Vendor.objects.create(name='Vendor', code='VIS'), order_number='PO-STD-1', ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'), retail_value=Decimal('500.00'), receiving_status='done',
            receiving_done_at=timezone.now(),
        )

    def _row(self, n=1, standard=None, **kwargs):
        mr = ManifestRow.objects.create(purchase_order=self.order, row_number=n, quantity=1,
                                        title=f'lego police station {n}', brand='lego', unit_retail=Decimal('20.00'))
        return PreprocessingRow.objects.create(
            purchase_order=self.order, row_number=n, manifest_row=mr, ai_title='Lego Police Station', ai_brand='Lego',
            ai_reasoning='cleaned', ai_status={'standard': standard} if standard else {}, **kwargs)

    def _product(self, vector, **profile):
        p = Product.objects.create(title='LEGO City Police Station 60316', brand='LEGO')
        ProductProfile.objects.create(product=p, **{
            'vector_text': 'lego city police station building set', 'category': 'Toys & games',
            'subcategory': 'Building sets', 'key_specs': {'piece_count': '668pc', 'toy_type': 'building set'}, **profile})
        ProductVector.objects.create(product=p, model_name=MODEL_NAME, embedding=vector, text_hash='x')
        return p

    def _embed(self, vector=None):
        return mock.patch('apps.inventory.services.product_vectors.embed_texts',
                          side_effect=lambda texts, batch_size=256: [vector or _vec() for _ in texts])


class _InlinePool:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def submit(self, fn, *args, **kwargs):
        f = Future()
        f.set_result(fn(*args, **kwargs))
        return f


@override_settings(META_API_KEY='meta-test-key', AI_PROVIDER='auto')
class PreprocessingTests(_Base):
    def setUp(self):
        super().setUp()
        AiModel.objects.update_or_create(slug=MODEL, defaults={'provider': 'meta', 'status': 'active', 'modality': 'text'})
        self.rows = [self._row(n) for n in (1, 2, 3)]
        for target, value in (('_executor', lambda concurrency, order_id: _InlinePool()), ('_fresh_db', lambda: None),
                              ('_release_db', lambda: None)):
            patcher = mock.patch.object(job, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.calls = []

    def _llm(self):
        def side_effect(**kwargs):
            self.calls.append(kwargs)
            items = json.loads(kwargs['user'])
            out = [{**_standard(), 'id': i['id'], 'key_specs': {}} for i in items]
            return LLMResult(text=json.dumps(out), model_used=kwargs['model_id'], input_tokens=10, output_tokens=10)

        return mock.patch('apps.core.services.llm_router.llm_complete', side_effect=side_effect)

    def _run_job(self):
        self._seed()
        with self._llm(), self._embed():
            job._run(self.order.pk, 't')
        return job.read(self.order.pk)

    def _seed(self):
        AppSetting.objects.update_or_create(key=job._key(self.order.pk), defaults={'value': {
            'token': 't', 'status': 'running', 'model': MODEL, 'effort': 'low', 'batch_size': 3, 'concurrency': 2,
            'heartbeat_at': job._now(), 'generation': self.order.ai_cleanup_generation}})

    def test_switch_off_means_no_standard_and_no_extra_model_call(self):
        state = self._run_job()
        self.assertEqual(state['status'], 'done')
        self.assertEqual(self.calls, [])
        self.assertFalse(any(ist.standard_of(r) for r in PreprocessingRow.objects.all()))

    def test_switch_on_writes_a_checked_standard_on_every_cleaned_row(self):
        _switch(True)
        state = self._run_job()
        self.assertEqual((state['status'], state['standard_rows']), ('done', 3))
        self.assertEqual({c['log_source'] for c in self.calls}, {'intake_standard'})
        s = ist.standard_of(PreprocessingRow.objects.get(pk=self.rows[0].pk))
        self.assertEqual((s['category'], s['subcategory'], s['brand']), ('Toys & games', 'Building sets', 'Lego'))
        self.assertTrue(s['vector_text'])
        self.assertEqual(self._run_job()['status'], 'done')   # a second run asks for nothing more
        self.assertEqual(len(self.calls), 1)

    def test_a_model_failure_never_fails_the_cleanup(self):
        _switch(True)
        self._seed()
        with mock.patch('apps.core.services.llm_router.llm_complete', side_effect=RuntimeError('provider down')):
            job._run(self.order.pk, 't')
        state = job.read(self.order.pk)
        self.assertEqual(state['status'], 'done')
        self.assertIn('provider down', state['standard_error'])

    def test_an_answer_off_the_canon_is_never_used(self):
        row = self._row(9, standard=_standard(category='Gadgets', problems=["category not canon: 'Gadgets'"]))
        self.assertEqual(ist.standard_of(row), {})


class MatchingTests(_Base):
    def test_a_same_product_is_matched_automatically_and_a_near_one_is_only_offered(self):
        _switch(True)
        same = self._product(_vec())
        near = self._product(_vec(0.35))                    # similarity about 0.94
        self._product(_vec(0.8))                            # about 0.60: not a candidate
        row = self._row(1, standard=_standard())
        with self._embed():
            summary = generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        self.assertEqual((row.final_matched_product_id, row.match_source, summary['auto_selected']), (same.id, 'auto', 1))
        self.assertEqual([(c['product_id'], c['source'], c['score']) for c in row.match_candidates],
                         [(same.id, 'vector', ist.SCORE_VECTOR_SAME), (near.id, 'vector', ist.SCORE_VECTOR_NEAR)])

    def test_a_hard_spec_conflict_is_offered_but_never_auto_matched(self):
        _switch(True)
        other_size = self._product(_vec(), key_specs={'piece_count': '1200pc'})
        row = self._row(1, standard=_standard())
        with self._embed():
            generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        self.assertIsNone(row.final_matched_product_id)
        self.assertEqual(row.match_candidates[0]['product_id'], other_size.id)

    def test_a_merged_away_product_stands_for_its_survivor_and_staff_decisions_stay(self):
        _switch(True)
        survivor = self._product(_vec(0.8))
        gone = self._product(_vec())
        ProductProfile.objects.filter(product=gone).update(merged_into=survivor)
        row = self._row(1, standard=_standard())
        staff = self._row(2, standard=_standard(), match_source='staff')
        with self._embed():
            generate_match_candidates_for_order(self.order)
        row.refresh_from_db()
        staff.refresh_from_db()
        self.assertEqual(row.final_matched_product_id, survivor.id)
        self.assertIsNone(staff.final_matched_product_id)

    def test_switch_off_or_an_unstandardized_catalog_changes_nothing(self):
        self._product(_vec())
        row = self._row(1, standard=_standard())
        with self._embed():
            generate_match_candidates_for_order(self.order)          # switch off
            _switch(True)
            ProductProfile.objects.update(vector_text='')
            generate_match_candidates_for_order(self.order)          # nothing standardized to compare with
        row.refresh_from_db()
        self.assertEqual((row.match_candidates, row.final_matched_product_id), ([], None))


class CheckInTests(_Base):
    def test_a_new_product_takes_the_lines_standard_and_gets_its_vector(self):
        row = self._row(1, standard=_standard())
        product = Product.objects.create(title='Lego Police Station', brand='Lego')
        with self._embed():
            out = ist.apply_to_product(product.id, row.id)
        profile = ProductProfile.objects.get(product=product)
        self.assertEqual(out['applied'], len(ist.PROFILE_FIELDS))
        self.assertEqual((profile.category, profile.subcategory, profile.short_name, profile.model_number),
                         ('Toys & games', 'Building sets', 'Lego Police Station', '60316'))
        self.assertEqual(profile.field_meta['category']['source'], f'ai:{MODEL}')
        self.assertTrue(ProductVector.objects.filter(product=product, model_name=MODEL_NAME).exists())

    def test_a_standardized_product_and_a_different_product_are_left_alone(self):
        row = self._row(1, standard=_standard())
        done = self._product(_vec(), short_name='Kept Name')
        unrelated = Product.objects.create(title='Ninja Blender 1000W', brand='Ninja')
        with self._embed():
            self.assertEqual(ist.apply_to_product(done.id, row.id)['applied'], 0)
            self.assertEqual(ist.apply_to_product(unrelated.id, row.id)['applied'], 0)
        self.assertEqual(ProductProfile.objects.get(product=done).short_name, 'Kept Name')
        self.assertFalse(ProductProfile.objects.filter(product=unrelated).exists())

    def test_check_in_schedules_nothing_with_the_switch_off_and_never_raises(self):
        row = self._row(1, standard=_standard())
        product = Product.objects.create(title='Lego Police Station', brand='Lego')
        with self.captureOnCommitCallbacks(execute=True) as off:
            ist.on_check_in(product.id, row.id)
        _switch(True)
        with mock.patch.object(ist, 'apply_to_product', side_effect=RuntimeError('boom')), \
                self.captureOnCommitCallbacks(execute=True) as on:
            ist.on_check_in(product.id, row.id)
        self.assertEqual((len(off), len(on)), (0, 1))
