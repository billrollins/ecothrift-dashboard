"""The AI picks the manifest formulas on upload (intake_updates Phase 5): the job starts on each upload path, stores
its result on the order, retries, falls back, and heals after a restart."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import PurchaseOrder, Vendor
from apps.inventory.services import formula_job

User = get_user_model()
MAPPINGS = [{'target': 'description', 'formula': 'TRIM([Item])', 'reasoning': 'Item is the name', 'confidence': 'high'}]


def _no_db_handoff():
    """Run the job in the test's own connection (the thread helpers would close it)."""
    return patch.multiple(formula_job, _fresh_db=lambda: None, _release_db=lambda: None)


class FormulaJobRunTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Formula Vendor', code='QFORM')
        self.po = PurchaseOrder.objects.create(
            vendor=vendor, order_number='QFORM-1', ordered_date=timezone.localdate(),
            manifest_preview={'headers': ['Item', 'Qty'], 'rows': [{'row_number': 1, 'raw': {'Item': 'Lamp', 'Qty': '1'}}]},
        )

    def _start_and_run(self):
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            state = formula_job.start(self.po.pk)
        self.assertEqual(len(callbacks), 1)        # the thread starts only after the upload commits
        with _no_db_handoff():
            formula_job._run(self.po.pk, state['token'])
        self.po.refresh_from_db()
        return self.po.ai_formulas

    def test_success_stores_formulas_model_and_time(self):
        with patch.object(formula_job, 'suggest', return_value=(MAPPINGS, 'model-x')):
            state = self._start_and_run()
        self.assertEqual(state['status'], 'done')
        self.assertEqual(state['mappings'], MAPPINGS)
        self.assertEqual(state['model'], 'model-x')
        self.assertTrue(state['finished_at'])
        self.assertEqual(formula_job.done_mappings(self.po), [{'target': 'description', 'formula': 'TRIM([Item])'}])

    def test_a_failed_call_is_retried(self):
        calls = iter([RuntimeError('timeout'), RuntimeError('timeout'), (MAPPINGS, 'model-x')])

        def flaky(order):
            nxt = next(calls)
            if isinstance(nxt, Exception):
                raise nxt
            return nxt

        with patch.object(formula_job, 'suggest', side_effect=flaky), patch.object(formula_job.time, 'sleep') as sleep:
            state = self._start_and_run()
        self.assertEqual((state['status'], state['attempts']), ('done', 3))
        self.assertEqual(sleep.call_count, 2)

    def test_failure_after_the_retries_is_reported(self):
        with patch.object(formula_job, 'suggest', side_effect=RuntimeError('provider down')), \
                patch.object(formula_job.time, 'sleep'):
            state = self._start_and_run()
        self.assertEqual(state['status'], 'failed')
        self.assertEqual(state['attempts'], formula_job.ATTEMPTS)
        self.assertIn('provider down', state['error'])
        self.assertEqual(formula_job.done_mappings(self.po), [])

    def test_a_newer_upload_takes_over(self):
        old = formula_job.start(self.po.pk)
        formula_job.start(self.po.pk)                 # a second upload
        with patch.object(formula_job, 'suggest', return_value=(MAPPINGS, 'model-x')) as suggest, _no_db_handoff():
            formula_job._run(self.po.pk, old['token'])
        suggest.assert_not_called()
        self.po.refresh_from_db()
        self.assertEqual(self.po.ai_formulas['status'], 'running')

    def test_a_dead_job_heals_on_the_next_poll(self):
        stale = (timezone.now() - timedelta(seconds=formula_job.STALE_SECONDS + 5)).isoformat()
        self.po.ai_formulas = {'status': 'running', 'token': 'old', 'heartbeat_at': stale, 'restarts': 0}
        self.po.save(update_fields=['ai_formulas'])
        with patch.object(formula_job, '_spawn') as spawn, self.captureOnCommitCallbacks(execute=True):
            out = formula_job.status(self.po)
        spawn.assert_called_once()
        self.assertEqual(out['restarts'], 1)
        self.assertNotIn('token', out)

    def test_suggest_sends_headers_and_rows_and_keeps_only_formulas(self):
        reply = {'suggestions': [
            {'target': 'description', 'formula': 'TRIM([Item])', 'reasoning': 'r', 'confidence': 'high'},
            {'target': 'quantity', 'formula': ''},           # no formula: dropped
        ]}
        with patch('apps.core.services.llm_router.llm_chat_tool_input', return_value=(reply, 'model-y')) as call:
            out, model = formula_job.suggest(self.po)
        self.assertEqual(model, 'model-y')
        self.assertEqual(out, [{'target': 'description', 'formula': 'TRIM([Item])', 'reasoning': 'r', 'confidence': 'high'}])
        kwargs = call.call_args.kwargs
        self.assertEqual(kwargs['purpose'], 'PREPROCESSING_SUGGEST')
        self.assertIn('CSV Headers: ["Item", "Qty"]', kwargs['user'])
        self.assertNotIn('template', kwargs['user'].lower())

    def test_suggest_needs_headers(self):
        self.po.manifest_preview = {}
        with self.assertRaises(ValueError):
            formula_job.suggest(self.po)


@override_settings(DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage')
class FormulaJobUploadPathTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(email='formula@test.example', first_name='F', last_name='J', password='x')
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)
        vendor = Vendor.objects.create(name='Formula Upload', code='QFUP')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='QFUP-1', ordered_date=timezone.localdate(),
                                               purchase_cost=Decimal('10.00'))

    def test_upload_on_the_order_starts_the_job(self):
        with patch.object(formula_job, '_spawn') as spawn, self.captureOnCommitCallbacks(execute=True):
            res = self.client.post(
                f'/api/inventory/orders/{self.po.pk}/upload-manifest/',
                {'file': SimpleUploadedFile('m.csv', b'Item,Qty\nLamp,1\n', content_type='text/csv')},
                format='multipart',
            )
        self.assertEqual(res.status_code, 200, res.data)
        spawn.assert_called_once()
        self.po.refresh_from_db()
        self.assertEqual(self.po.ai_formulas['status'], 'running')

    def test_upload_from_bytes_starts_the_job(self):
        """The path Buying's won → PO and the intake test reset both use."""
        from apps.inventory.services.intake_test_reset import upload_manifest_from_bytes

        with patch.object(formula_job, '_spawn') as spawn, self.captureOnCommitCallbacks(execute=True):
            upload_manifest_from_bytes(self.po, filename='won.csv', raw=b'Item,Qty\nMug,2\n', uploaded_by=self.user)
        spawn.assert_called_once()
        self.po.refresh_from_db()
        self.assertEqual(self.po.ai_formulas['status'], 'running')

    def test_won_to_po_uploads_through_upload_from_bytes(self):
        import inspect

        from apps.buying.services import won_to_po

        self.assertIn('upload_manifest_from_bytes(', inspect.getsource(won_to_po.mark_won))

    def test_retry_endpoint_starts_the_job_again(self):
        self.po.manifest_preview = {'headers': ['Item'], 'rows': []}
        self.po.save(update_fields=['manifest_preview'])
        with patch.object(formula_job, '_spawn') as spawn, self.captureOnCommitCallbacks(execute=True):
            res = self.client.post(f'/api/inventory/orders/{self.po.pk}/suggest-formulas/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'running')
        self.assertNotIn('token', res.data)
        spawn.assert_called_once()
