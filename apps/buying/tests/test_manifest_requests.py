"""Get manifest, on request (Dash #76): the request, requests first, the ceiling, login hand-over."""

from __future__ import annotations

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.buying.models import (
    Auction,
    ManifestPullJob,
    ManifestPullLog,
    ManifestRequest,
    ManifestRow,
)
from apps.buying.services import bstock_calls, manifest_pull, manifest_requests, scraper
from apps.buying.services.bstock_token_store import current_token, save_token
from apps.buying.tests.test_manifest_pull import _auction, _jwt, _no_page_delay, _owner, _target
from apps.core.models import AppSetting


def _login() -> str:
    token = _jwt(timedelta(minutes=50))
    save_token(token)
    return token


def _ok(auction, **kwargs):
    ManifestRow.objects.create(auction=auction, row_number=1, title='x')
    return manifest_pull.PullResult(auction_id=auction.pk, ok=True, rows=1)


class _Base(TestCase):
    def setUp(self):
        _no_page_delay()
        self.mp = _target()
        self.owner = _owner()
        # Far outside the 36 h window: only a request can get it pulled.
        self.lot = _auction(self.mp, 'req', hours=100)
        patcher = patch.object(manifest_pull, '_start_thread')
        self.thread = patcher.start()
        self.addCleanup(patcher.stop)

    def _run_live(self):
        job = ManifestPullJob.objects.filter(status__in=ManifestPullJob.LIVE_STATUSES).first()
        return manifest_pull.run_job(job.pk)

    def _req(self, auction=None) -> ManifestRequest:
        return ManifestRequest.objects.filter(auction=auction or self.lot).order_by('-pk').first()


class RequestTests(_Base):
    def test_a_tap_with_a_live_login_starts_a_requests_job_off_the_request_thread(self):
        _login()
        with self.captureOnCommitCallbacks(execute=True):
            req, why = manifest_requests.request_manifest(self.lot, user=self.owner)
        self.assertEqual(why, '')
        self.assertEqual(req.status, ManifestRequest.STATUS_REQUESTED)
        job = ManifestPullJob.objects.get()
        self.assertEqual(job.kind, ManifestPullJob.KIND_REQUESTS)
        self.thread.assert_called_once_with(job.pk)

    def test_the_requests_job_pulls_only_requested_lots_and_closes_the_request(self):
        _login()
        _auction(self.mp, 'short', hours=5)  # on the shortlist, not requested
        manifest_requests.request_manifest(self.lot, user=self.owner)
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=_ok) as pull:
            job = self._run_live()
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)
        self.assertEqual([c.args[0].pk for c in pull.call_args_list], [self.lot.pk])
        self.assertTrue(pull.call_args.kwargs['requested'])
        req = self._req()
        self.assertEqual(req.status, ManifestRequest.STATUS_PULLED)
        self.assertEqual(req.job_id, job.pk)

    def test_a_tap_during_the_daily_pull_is_pulled_next(self):
        _login()
        a1 = _auction(self.mp, 'a1', priority=90)
        a2 = _auction(self.mp, 'a2', priority=10)
        order = []

        def pull(auction, **kwargs):
            order.append(auction.pk)
            if auction.pk == a1.pk:
                manifest_requests.request_manifest(self.lot, user=self.owner)
            return _ok(auction)

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=pull):
            manifest_pull.run_job(manifest_pull.start_job(background=False).pk)
        self.assertEqual(order, [a1.pk, self.lot.pk, a2.pk])
        self.assertEqual(self._req().status, ManifestRequest.STATUS_PULLED)

    def test_a_requested_lot_skips_the_retry_wait_but_not_the_hard_checks(self):
        now = timezone.now()
        Auction.objects.filter(pk=self.lot.pk).update(manifest_pull_attempted_at=now, manifest_pull_error='x')
        q = Auction.objects.filter(pk=self.lot.pk)
        self.assertFalse(q.filter(manifest_pull._needs_pull_q(now)).exists())
        self.assertTrue(q.filter(manifest_pull._needs_pull_q(now, requested=True)).exists())
        Auction.objects.filter(pk=self.lot.pk).update(manifest_pull_blocked=True)
        self.assertFalse(q.filter(manifest_pull._needs_pull_q(now, requested=True)).exists())

    def test_lots_that_can_never_be_pulled_are_refused_with_the_reason(self):
        contract = _auction(self.mp, 'c', listing_type='CONTRACT')
        _, why = manifest_requests.request_manifest(contract)
        self.assertIn('Contract', why)
        ManifestRow.objects.create(auction=self.lot, row_number=1, title='x')
        _, why = manifest_requests.request_manifest(self.lot)
        self.assertIn('already has', why)
        self.assertFalse(ManifestRequest.objects.exists())

    def test_one_open_request_per_lot(self):
        manifest_requests.request_manifest(self.lot)
        manifest_requests.request_manifest(self.lot)
        self.assertEqual(ManifestRequest.objects.count(), 1)

    def test_without_a_login_it_waits_and_says_so(self):
        req, _ = manifest_requests.request_manifest(self.lot)
        self.assertEqual(req.status, ManifestRequest.STATUS_REQUESTED)
        self.assertFalse(ManifestPullJob.objects.exists())
        self.assertEqual(manifest_requests.payload(self.lot)['note'], manifest_requests.NO_LOGIN)

    def test_a_login_hand_over_starts_waiting_requests(self):
        manifest_requests.request_manifest(self.lot)
        client = APIClient()
        client.force_authenticate(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            res = client.post('/api/buying/bstock-login/', {'token': _jwt(timedelta(minutes=50))}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(ManifestPullJob.objects.get().kind, ManifestPullJob.KIND_REQUESTS)
        self.thread.assert_called_once()


class CeilingTests(_Base):
    def test_the_hourly_ceiling_holds_requests_and_says_why(self):
        _login()
        ManifestPullLog.objects.create(auction=self.lot, started_at=timezone.now(), api_calls=200)
        req, _ = manifest_requests.request_manifest(self.lot)
        self.assertFalse(ManifestPullJob.objects.exists())
        self.assertIn('hourly', manifest_requests.payload(self.lot)['note'])
        self.assertEqual(req.status, ManifestRequest.STATUS_REQUESTED)

    def test_the_daily_ceiling_also_holds(self):
        _login()
        AppSetting.objects.update_or_create(key=manifest_requests.KEY_CALLS_PER_DAY, defaults={'value': 5})
        ManifestPullLog.objects.create(auction=self.lot, started_at=timezone.now() - timedelta(hours=3), api_calls=5)
        self.assertIn('daily', manifest_requests.paused_reason())

    def test_a_running_job_stops_at_the_ceiling_and_the_request_keeps_waiting(self):
        _login()
        manifest_requests.request_manifest(self.lot)
        ManifestPullLog.objects.create(auction=self.lot, started_at=timezone.now(), api_calls=200)
        with patch.object(manifest_pull, 'pull_manifest_for_auction') as pull:
            job = self._run_live()
        pull.assert_not_called()
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)
        self.assertIn('hourly', job.error)
        self.assertEqual(self._req().status, ManifestRequest.STATUS_REQUESTED)

    def test_the_kill_switch_also_stops_signed_in_pulls(self):
        _login()
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_OFF, defaults={'value': True})
        manifest_requests.request_manifest(self.lot)
        self.assertFalse(ManifestPullJob.objects.exists())
        self.assertIn('switched off', manifest_requests.payload(self.lot)['note'])

    def test_a_429_on_the_manifest_host_starts_the_back_off(self):
        _login()
        manifest_requests.request_manifest(self.lot)
        boom = scraper.BStockUnavailable('B-Stock is rate limiting right now.')
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=boom):
            self._run_live()
        self.assertIsNotNone(bstock_calls.backoff_until())
        req = self._req()
        self.assertEqual(req.status, ManifestRequest.STATUS_FAILED)
        self.assertIn('Retry', req.error)


class OutcomeTests(_Base):
    def test_a_login_that_ran_out_puts_the_request_back_to_waiting(self):
        _login()
        manifest_requests.request_manifest(self.lot)
        with patch.object(
            manifest_pull, 'pull_manifest_for_auction',
            side_effect=scraper.BStockAuthError(manifest_pull.LOGIN_EXPIRED),
        ):
            self._run_live()
        self.assertEqual(self._req().status, ManifestRequest.STATUS_REQUESTED)
        self.assertEqual(current_token(), '')

    def test_a_lot_b_stock_has_no_manifest_for_fails_with_the_reason(self):
        _login()
        manifest_requests.request_manifest(self.lot)
        res = manifest_pull.PullResult(auction_id=self.lot.pk, ok=False, blocked=True,
                                       error='B-Stock has no manifest for this lot (HTTP 404).')
        with patch.object(manifest_pull, 'pull_manifest_for_auction', return_value=res):
            self._run_live()
        req = self._req()
        self.assertEqual(req.status, ManifestRequest.STATUS_FAILED)
        self.assertIn('no manifest', req.error)

    def test_two_refused_requests_mean_the_login_and_both_wait_again(self):
        _login()
        other = _auction(self.mp, 'req2', hours=100)
        manifest_requests.request_manifest(self.lot)
        manifest_requests.request_manifest(other)
        refuse = lambda a, **k: manifest_pull.PullResult(auction_id=a.pk, ok=False, refused=True, error='403')  # noqa: E731
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=refuse):
            job = self._run_live()
        self.assertEqual(job.error, manifest_pull.LOGIN_REFUSED)
        for a in (self.lot, other):
            self.assertEqual(self._req(a).status, ManifestRequest.STATUS_REQUESTED)

    def test_a_request_stuck_under_a_dead_job_waits_again_and_ended_lots_fail(self):
        job = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_FAILED, kind=ManifestPullJob.KIND_REQUESTS)
        ManifestRequest.objects.create(auction=self.lot, status=ManifestRequest.STATUS_PULLING, job=job)
        ended = _auction(self.mp, 'gone', hours=1)
        ManifestRequest.objects.create(auction=ended)
        Auction.objects.filter(pk=ended.pk).update(end_time=timezone.now() - timedelta(minutes=1))
        manifest_requests.tidy()
        self.assertEqual(self._req().status, ManifestRequest.STATUS_REQUESTED)
        self.assertEqual(self._req(ended).status, ManifestRequest.STATUS_FAILED)
        self.assertEqual(self._req(ended).error, manifest_requests.ENDED)

    def test_a_silent_requests_job_is_taken_over_after_three_minutes(self):
        now = timezone.now()
        job = ManifestPullJob.objects.create(
            status=ManifestPullJob.STATUS_RUNNING, kind=ManifestPullJob.KIND_REQUESTS,
            heartbeat_at=now - timedelta(minutes=4),
        )
        self.assertTrue(ManifestPullJob.objects.filter(pk=job.pk).filter(manifest_pull._claimable_q(now)).exists())
        ManifestPullJob.objects.filter(pk=job.pk).update(kind=ManifestPullJob.KIND_SHORTLIST)
        self.assertFalse(ManifestPullJob.objects.filter(pk=job.pk).filter(manifest_pull._claimable_q(now)).exists())

    def test_the_scheduler_pulls_waiting_requests_when_the_login_is_live(self):
        _login()
        ManifestRequest.objects.create(auction=self.lot)  # tapped, but its thread died
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=_ok):
            call_command('pull_shortlist_manifests', stdout=StringIO())
        self.assertEqual(self._req().status, ManifestRequest.STATUS_PULLED)

    def test_a_request_tapped_as_a_job_ends_is_started_by_that_job(self):
        _login()
        job = manifest_pull.start_job(background=False)

        def run_then_tap(runner, session, deadline):
            runner.finish(ManifestPullJob.STATUS_DONE)
            # The tap lands after this job found nothing left; its start_job saw the live job.
            ManifestRequest.objects.create(auction=self.lot)

        with patch.object(manifest_pull, '_run_claimed', side_effect=run_then_tap),                 self.captureOnCommitCallbacks(execute=True):
            manifest_pull.run_job(job.pk)
        nxt = ManifestPullJob.objects.exclude(pk=job.pk).get()
        self.assertEqual((nxt.kind, nxt.status), (ManifestPullJob.KIND_REQUESTS, ManifestPullJob.STATUS_QUEUED))
        self.thread.assert_called_once_with(nxt.pk)


class ApiTests(_Base):
    def test_superuser_only_and_reasons_are_400(self):
        from apps.buying.tests.test_manifest_pull import User

        client = APIClient()
        staff = User.objects.create_user('staff@x.test', 'S', 'T', password='x', is_staff=True)
        client.force_authenticate(staff)
        url = f'/api/buying/auctions/{self.lot.pk}/manifest-request/'
        self.assertEqual(client.post(url).status_code, 403)
        client.force_authenticate(self.owner)
        self.assertEqual(client.get(url).json(), {'request': None})
        res = client.post(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['request']['status'], 'requested')
        self.assertFalse(res.json()['request']['login_live'])
        contract = _auction(self.mp, 'c2', listing_type='CONTRACT')
        res = client.post(f'/api/buying/auctions/{contract.pk}/manifest-request/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Contract', res.json()['detail'])
