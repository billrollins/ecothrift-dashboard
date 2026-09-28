"""Superuser → Requests: stage, approve, apply in the background (resumable), reject, undo."""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import ApprovalRequest
from apps.core.services import approval_requests as ar

CALLS: dict[str, list] = {'apply': [], 'undo': []}


def _preview(params):
    return {'counts': {'Rows': params.get('n', 3)}, 'changes': ['Adds rows.'], 'sample': [{'row': 1}], 'params': {'frozen': True}}


def _apply(request, progress):
    start = int(progress.cursor or 0)
    for i in range(start, request.params.get('n', 3)):
        if request.params.get('fail_at') == i and not CALLS.get('failed_once'):
            CALLS['failed_once'] = True
            raise RuntimeError('boom')
        CALLS['apply'].append(i)
        progress.update(done=i + 1, total=request.params.get('n', 3), cursor=i + 1, log=f'row {i}')
    return {'rows': request.params.get('n', 3)}


def _undo(request):
    CALLS['undo'].append(request.pk)
    return {'undone': True}


ar.register(ar.Kind(kind='test.rows', label='Test rows', preview=_preview, apply=_apply, undo=_undo))
ar.register(ar.Kind(kind='test.no_undo', label='No undo', preview=_preview, apply=_apply))


class ApprovalRequestFlowTests(TestCase):
    def setUp(self):
        CALLS['apply'], CALLS['undo'] = [], []
        CALLS.pop('failed_once', None)
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')

    def test_staging_builds_the_preview_and_changes_nothing(self):
        req = ar.stage('test.rows', title='Rows', params={'n': 3}, requested_by='claude:test')
        self.assertEqual(req.status, ApprovalRequest.STATUS_PENDING)
        self.assertEqual(req.preview['counts'], {'Rows': 3})
        self.assertTrue(req.params['frozen'])  # the preview can freeze a plan into params
        self.assertEqual(CALLS['apply'], [])

    def test_approve_then_run_applies_and_logs(self):
        req = ar.stage('test.rows', title='Rows', params={'n': 3})
        ar.approve(req, self.boss, 'go', start=False)
        req = ar.run(req.pk)
        self.assertEqual(req.status, ApprovalRequest.STATUS_APPLIED)
        self.assertEqual(CALLS['apply'], [0, 1, 2])
        self.assertEqual(req.result, {'rows': 3})
        self.assertEqual((req.decided_by, req.decision_note), (self.boss, 'go'))
        self.assertIn('row 2', req.log)
        self.assertEqual(req.progress['done'], 3)

    def test_a_failed_run_resumes_from_its_cursor(self):
        req = ar.stage('test.rows', title='Rows', params={'n': 4, 'fail_at': 2})
        ar.approve(req, self.boss, start=False)
        req = ar.run(req.pk)
        self.assertEqual(req.status, ApprovalRequest.STATUS_FAILED)
        self.assertIn('boom', req.error)
        self.assertEqual(req.progress['cursor'], 2)
        ApprovalRequest.objects.filter(pk=req.pk).update(status=ApprovalRequest.STATUS_APPROVED)
        req = ar.run(req.pk)
        self.assertEqual(req.status, ApprovalRequest.STATUS_APPLIED)
        self.assertEqual(CALLS['apply'], [0, 1, 2, 3])  # rows 0 and 1 were not redone

    def test_a_live_run_is_not_started_twice_but_a_stale_one_is(self):
        req = ar.stage('test.rows', title='Rows')
        ApprovalRequest.objects.filter(pk=req.pk).update(status=ApprovalRequest.STATUS_RUNNING, heartbeat_at=timezone.now())
        ar.run(req.pk)
        self.assertEqual(CALLS['apply'], [])
        ApprovalRequest.objects.filter(pk=req.pk).update(heartbeat_at=timezone.now() - timedelta(minutes=10))
        self.assertTrue(ar.is_stale(ApprovalRequest.objects.get(pk=req.pk)))
        self.assertEqual(ar.run(req.pk).status, ApprovalRequest.STATUS_APPLIED)

    def test_reject_and_undo_rules(self):
        req = ar.stage('test.rows', title='Rows')
        ar.reject(req, self.boss, 'not now')
        with self.assertRaises(ar.RequestError):
            ar.approve(req, self.boss)
        req = ar.stage('test.rows', title='Rows')
        ar.approve(req, self.boss, start=False)
        req = ar.run(req.pk)
        ar.undo(req, self.boss)
        req.refresh_from_db()
        self.assertEqual((req.status, CALLS['undo']), (ApprovalRequest.STATUS_UNDONE, [req.pk]))
        other = ar.stage('test.no_undo', title='No undo')
        ar.approve(other, self.boss, start=False)
        other = ar.run(other.pk)
        with self.assertRaises(ar.RequestError):
            ar.undo(other, self.boss)
        with self.assertRaises(ar.RequestError):
            ar.stage('test.nope', title='x')


class ApprovalRequestApiTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.req = ar.stage('test.rows', title='Rows', params={'n': 2})

    def test_superuser_only(self):
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/core/requests/').status_code, 403)

    def test_list_approve_and_reject(self):
        self.client.force_authenticate(self.boss)
        rows = self.client.get('/api/core/requests/', {'status': 'pending'}).data
        self.assertEqual([r['id'] for r in rows], [self.req.pk])
        self.assertEqual((rows[0]['kind_label'], rows[0]['can_undo']), ('Test rows', False))
        data = self.client.post(f'/api/core/requests/{self.req.pk}/approve/', {'note': 'ok'}, format='json').data
        self.assertEqual((data['status'], data['decision_note']), ('approved', 'ok'))
        again = self.client.post(f'/api/core/requests/{self.req.pk}/reject/', {}, format='json')
        self.assertEqual(again.status_code, 400)
