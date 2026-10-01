"""AI cleanup as a background job: start, progress, stop, gaps, undo, self-healing, effort.

The job's threads use their own database connections, which can't see a TestCase's uncommitted
rows, so these tests run the same code in the test's own thread: ``_spawn`` runs the job at once
(or is held back), the batch pool is a same-thread stand-in, and the connection clean-up is off.
"""

import datetime
import json
from concurrent.futures import Future
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AiAction, AiModel
from apps.core.services.llm_router import LLMResult
from apps.inventory.models import ManifestRow, PreprocessingRow, PurchaseOrder, Vendor
from apps.inventory.services import ai_cleanup_job as job

MODEL = 'muse-spark-1.3-contributor'


class _InlinePool:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def submit(self, fn, *args, **kwargs):
        f = Future()
        f.set_result(fn(*args, **kwargs))
        return f


def _answer(row_ids):
    return [{
        'row_id': i, 'title': f'Clean Title {i}', 'brand': 'Acme', 'model': 'X1',
        'category': 'Mixed lots & uncategorized', 'condition': 'good', 'retail_suspect': False,
        'retail_suspect_reason': '', 'm_resale': 0.5, 'm_saleability': 1.0, 'search_tags': ['acme'],
        'low_confidence': False, 'low_confidence_reason': '',
    } for i in row_ids]


@override_settings(META_API_KEY='meta-test-key', AI_PROVIDER='auto')
class AiCleanupJobTests(TestCase):
    def setUp(self):
        AiModel.objects.update_or_create(slug=MODEL, defaults={'provider': 'meta', 'status': 'active', 'modality': 'text'})
        self.order = PurchaseOrder.objects.create(
            vendor=Vendor.objects.create(name='Vendor', code='VJB'), order_number='PO-JOB-1', ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'), retail_value=Decimal('500.00'), receiving_status='done',
            receiving_done_at=timezone.now(),
        )
        self.rows = []
        for n in range(1, 8):
            mr = ManifestRow.objects.create(
                purchase_order=self.order, row_number=n, quantity=1, title=f'vendor title {n}', brand='vendorbrand',
                unit_retail=Decimal('20.00'),
            )
            self.rows.append(PreprocessingRow.objects.create(purchase_order=self.order, row_number=n, manifest_row=mr))
        self.user = get_user_model().objects.create_user(email='job@example.com', first_name='Jo', last_name='B', password='pw')
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = f'/api/inventory/orders/{self.order.id}/ai-cleanup-job/'
        self.calls = []
        for target, value in (
            ('_executor', lambda concurrency, order_id: _InlinePool()),
            ('_fresh_db', lambda: None),
            ('_release_db', lambda: None),
            ('_spawn', lambda order_id, token: job._run(order_id, token)),
        ):
            patcher = mock.patch.object(job, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _llm(self, responder=None):
        def side_effect(**kwargs):
            self.calls.append(kwargs)
            ids = [r['row_id'] for r in json.loads(kwargs['user'])]
            out = responder(ids, kwargs) if responder else _answer(ids)
            return LLMResult(text=json.dumps(out), model_used=kwargs['model_id'], input_tokens=10, output_tokens=10)

        return mock.patch('apps.core.services.llm_router.llm_complete', side_effect=side_effect)

    def _start(self, **body):
        body = {'action': 'start', 'model': MODEL, 'effort': 'low', 'batch_size': 3, 'concurrency': 2, **body}
        return self.client.post(self.url, body, format='json')

    def test_job_cleans_every_row_in_batches_with_the_chosen_effort(self):
        with self._llm():
            resp = self._start()
        self.assertEqual(resp.status_code, 202, resp.data)
        state = self.client.get(self.url).data
        self.assertEqual((state['status'], state['total_rows'], state['cleaned_rows'], state['remaining_rows']), ('done', 7, 7, 0))
        self.assertEqual((state['batches_done'], state['rows_saved'], state['failed_batches']), (3, 7, 0))
        self.assertEqual((state['model'], state['effort'], state['started_by']), (MODEL, 'low', 'Jo'))
        self.assertNotIn('token', state)
        self.assertIsNotNone(state['match_candidates'])
        # every call carried the effort and the long background timeout, never the 45 s web one
        self.assertEqual({c['effort'] for c in self.calls}, {'low'})
        self.assertEqual({c['timeout'] for c in self.calls}, {job.JOB_CALL_TIMEOUT_SECONDS})
        self.assertEqual({c['api_key'] for c in self.calls}, {'meta-test-key'})
        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'cleaned')

    def test_up_to_48_workers_and_no_database_connection_is_held_during_the_model_call(self):
        released = []
        with mock.patch.object(job, '_release_db', lambda: released.append(len(self.calls))), self._llm():
            self._start(concurrency=48)
            state = self.client.get(self.url).data
            self.assertEqual((state['status'], state['concurrency']), ('done', 48))
            # each batch let go of its connection before its own model call (and again when it ended)
            self.assertEqual(released[0], 0)
            self.assertGreaterEqual(len(released), 2 * len(self.calls))
            self._start(concurrency=500)
            self.assertEqual(job.read(self.order.pk)['concurrency'], 48)

    def test_a_rate_limited_batch_waits_and_asks_again_instead_of_failing(self):
        from apps.core.services.llm_router import LLMAPIError

        seen = []

        def responder(ids, kwargs):
            seen.append(tuple(ids))
            if seen.count(tuple(ids)) == 1:
                raise LLMAPIError('too many requests', kind='rate_limit', status_code=429)
            return _answer(ids)

        with mock.patch.object(job, 'RATE_LIMIT_WAITS', (0, 0)), self._llm(responder):
            self._start()
        state = self.client.get(self.url).data
        self.assertEqual((state['status'], state['cleaned_rows'], state['failed_batches'], state['rate_limited']), ('done', 7, 0, 3))

    def test_effort_defaults_to_the_settings_action_and_bad_values_are_refused(self):
        AiAction.objects.update_or_create(purpose='INVENTORY_CLEANUP', defaults={'label': 'Inventory cleanup', 'effort': 'medium'})
        with self._llm():
            self.assertEqual(self._start(effort='').status_code, 202)
        self.assertEqual({c['effort'] for c in self.calls}, {'medium'})
        self.assertEqual(self._start(effort='turbo').data['code'], 'invalid_effort')
        self.assertEqual(self._start(model='made-up-model').data['code'], 'invalid_model')
        models = self.client.get(f'/api/inventory/orders/{self.order.id}/ai-cleanup-models/').data
        self.assertEqual((models['default_effort'], models['efforts']), ('medium', ['off', 'low', 'medium', 'high', 'max']))

    def test_a_failing_batch_is_retried_then_left_as_a_gap(self):
        bad = self.rows[0].id

        def responder(ids, kwargs):
            if bad in ids:
                raise RuntimeError('model timed out')
            return _answer(ids)

        with self._llm(responder):
            self._start()
        state = self.client.get(self.url).data
        self.assertEqual(state['status'], 'done_with_gaps')
        self.assertEqual((state['cleaned_rows'], state['remaining_rows'], state['failed_batches']), (4, 3, 2))
        self.assertIn('model timed out', state['last_error'])
        # a second run takes only what is left
        self.calls.clear()
        with self._llm():
            self._start()
        self.assertEqual(sorted(i for c in self.calls for i in [r['row_id'] for r in json.loads(c['user'])]),
                         sorted(r.id for r in self.rows[:3]))
        self.assertEqual(self.client.get(self.url).data['status'], 'done')

    def test_stop_ends_the_job_after_the_batch_in_flight(self):
        def responder(ids, kwargs):
            if len(self.calls) == 1:  # the owner presses Stop while the first batch is with the model
                self.client.post(self.url, {'action': 'stop'}, format='json')
            return _answer(ids)

        with self._llm(responder):
            self._start()
        state = self.client.get(self.url).data
        self.assertEqual((state['status'], state['cleaned_rows'], len(self.calls)), ('stopped', 3, 1))

    def test_undo_while_running_stops_the_job_and_saves_nothing_more(self):
        def responder(ids, kwargs):
            PurchaseOrder.objects.filter(pk=self.order.pk).update(ai_cleanup_generation=99)
            return _answer(ids)

        with self._llm(responder):
            self._start()
        state = self.client.get(self.url).data
        self.assertEqual((state['status'], state['cleaned_rows']), ('cancelled', 0))

    def test_a_running_job_is_not_started_twice_and_a_dead_one_heals_on_a_poll(self):
        spawned = []
        with mock.patch.object(job, '_spawn', lambda order_id, token: spawned.append(token)):
            self.assertEqual(self._start().status_code, 202)
            self.assertEqual(self._start().status_code, 202)
            self.assertEqual(len(spawned), 1)  # the second start found it running
            self.assertEqual(self.client.get(self.url).data['status'], 'running')
            self.assertEqual(len(spawned), 1)  # a fresh heartbeat: the poll leaves it alone
            # the web process is recycled: the thread is gone and the heartbeat goes stale
            old = (timezone.now() - datetime.timedelta(seconds=job.STALE_SECONDS + 5)).isoformat()
            job._update(self.order.pk, None, heartbeat_at=old)
            polled = self.client.get(self.url).data
            self.assertEqual((polled['status'], polled['restarts'], len(spawned)), ('running', 1, 2))
            self.assertNotEqual(spawned[0], spawned[1])
        # the restarted thread finishes the work; the dead one's token no longer owns the job
        with self._llm():
            job._run(self.order.pk, spawned[0])
            self.assertEqual(len(self.calls), 0)
            job._run(self.order.pk, spawned[1])
        self.assertEqual(self.client.get(self.url).data['status'], 'done')

    def test_missing_api_key_is_reported_before_anything_starts(self):
        with override_settings(META_API_KEY=''):
            resp = self._start()
        self.assertEqual((resp.status_code, resp.data['code']), (503, 'ai_key_missing'))
        self.assertEqual(self.client.get(self.url).data['status'], 'idle')
