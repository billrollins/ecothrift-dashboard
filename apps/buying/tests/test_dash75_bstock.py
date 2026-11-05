"""Dash #75: dollars unit, Buy Now capture, fresh status, the call gate and log, quick check, slip fix."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import requests
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.buying.management.commands.fix_bstock_price_slip import find_slips
from apps.buying.models import Auction, AuctionSnapshot, BStockCall, Marketplace, WatchlistEntry
from apps.buying.services import bstock_calls, pipeline, quick_check, scraper, sweep_upsert
from apps.buying.services.listing_mapping import _price_to_dollars, map_listing_raw_to_auction_fields
from apps.core.models import AppSetting


def _iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def _row(lid='L1', *, win=2425, bids=0, buy_now=False, bn_end=None, end=None, sf='sf-t'):
    r = {
        'listingId': lid, 'lotId': f'lot-{lid}', 'storefrontId': sf, 'title': f'Lot {lid}',
        'listingType': 'SPOT', 'retailPrice': 22349.73, 'winningBidAmount': win, 'numberOfBids': bids,
        'endTime': _iso(end or timezone.now() + timedelta(days=1)), 'buyNow': buy_now,
    }
    if bn_end is not None:
        r['buyNowEndTime'] = _iso(bn_end)
    return r


def _mp(slug='target', sf='sf-t', requires_login=False):
    mp, _ = Marketplace.objects.get_or_create(slug=slug, defaults={'name': slug.title(), 'external_id': sf})
    mp.external_id, mp.is_active, mp.requires_login = sf, True, requires_login
    mp.save()
    return mp


class _Resp:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = data if data is not None else {'listings': []}
        self.headers = {}
        self.url = scraper.SEARCH_LISTINGS_URL
        self.content = b'{}'
        self.text = ''

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


def _http(resp):
    return patch('apps.buying.services.scraper.requests.request', return_value=resp)


class DollarsTests(TestCase):
    def test_whole_dollars_are_never_cents(self):
        self.assertEqual(_price_to_dollars(10750), Decimal('10750.00'))
        self.assertEqual(_price_to_dollars(2425), Decimal('2425.00'))
        self.assertEqual(_price_to_dollars(8.5), Decimal('8.50'))
        self.assertIsNone(_price_to_dollars(True))


class BuyNowMappingTests(TestCase):
    def test_inside_the_window_the_shown_price_is_buy_now_not_a_bid(self):
        f = map_listing_raw_to_auction_fields(
            _row(win=10750, buy_now=True, bn_end=timezone.now() + timedelta(hours=3))
        )
        self.assertEqual(f['buy_now_price'], Decimal('10750.00'))
        self.assertIsNone(f['current_price'])
        self.assertIsNotNone(f['buy_now_ends_at'])

    def test_after_the_window_the_price_is_a_bid(self):
        f = map_listing_raw_to_auction_fields(
            _row(win=2825, bids=10, buy_now=True, bn_end=timezone.now() - timedelta(hours=1))
        )
        self.assertIsNone(f['buy_now_price'])
        self.assertEqual(f['current_price'], Decimal('2825.00'))

    def test_bids_inside_the_window_are_bids(self):
        f = map_listing_raw_to_auction_fields(
            _row(win=3000, bids=2, buy_now=True, bn_end=timezone.now() + timedelta(hours=1))
        )
        self.assertIsNone(f['buy_now_price'])
        self.assertEqual(f['current_price'], Decimal('3000.00'))

    def test_auction_state_buy_now_closed_cancelled(self):
        fields = {'status': Auction.STATUS_OPEN, 'buy_now_price': None}
        pipeline.merge_auction_state_into_fields(fields, {'buyNow': {'enabled': True, 'price': 4125}, 'startPrice': 100})
        self.assertEqual((fields['buy_now_price'], fields['starting_price']), (Decimal('4125.00'), Decimal('100.00')))
        pipeline.merge_auction_state_into_fields(fields, {'buyNow': {'enabled': False}, 'closed': True})
        self.assertEqual(fields['status'], Auction.STATUS_CLOSED)
        self.assertEqual(fields['buy_now_price'], Decimal('4125.00'))
        pipeline.merge_auction_state_into_fields(fields, {'canceled': True, 'closed': True})
        self.assertEqual(fields['status'], Auction.STATUS_CANCELLED)


class UpsertAndStatusTests(TestCase):
    def setUp(self):
        self.mp = _mp()

    def _upsert(self, rows, now=None):
        return sweep_upsert.upsert_listings_raw(self.mp.pk, 'sf-t', rows, now or timezone.now())

    def test_listed_stamp_buy_now_kept_and_ended_closed(self):
        now = timezone.now()
        self._upsert([_row('A', win=5000, buy_now=True, bn_end=now + timedelta(hours=2))], now)
        a = Auction.objects.get(external_id='A')
        self.assertEqual((a.buy_now_price, a.current_price, a.last_listed_at), (Decimal('5000.00'), None, now))
        later = now + timedelta(hours=3)
        self._upsert([_row('A', win=900, bids=4)], later)
        a.refresh_from_db()
        self.assertEqual(a.buy_now_price, Decimal('5000.00'))  # the last Buy Now is kept
        self.assertEqual((a.current_price, a.last_listed_at), (Decimal('900.00'), later))
        self._upsert([_row('B', end=now - timedelta(minutes=5)), _row('B2', end=now - timedelta(hours=2))], now)
        self.assertEqual(Auction.objects.get(external_id='B').status, Auction.STATUS_OPEN)  # grace: final poll
        self.assertEqual(Auction.objects.get(external_id='B2').status, Auction.STATUS_CLOSED)

    def test_never_reopens_a_cancelled_lot(self):
        self._upsert([_row('C')])
        Auction.objects.filter(external_id='C').update(status=Auction.STATUS_CANCELLED)
        self._upsert([_row('C')])
        self.assertEqual(Auction.objects.get(external_id='C').status, Auction.STATUS_CANCELLED)

    def test_watch_poll_does_not_stamp_listed(self):
        self._upsert([_row('D')])
        a = Auction.objects.get(external_id='D')
        Auction.objects.filter(pk=a.pk).update(last_listed_at=None)
        WatchlistEntry.objects.create(auction=a)
        with patch.object(scraper, 'get_auction_states_batch', return_value={'D': {'listingId': 'D', 'closed': True}}):
            pipeline.run_watch_poll(force=True)
        a.refresh_from_db()
        self.assertIsNone(a.last_listed_at)
        self.assertEqual(a.status, Auction.STATUS_CLOSED)

    def test_close_ended_auctions_after_an_hours_grace(self):
        now = timezone.now()
        for ext, end in (('E1', now - timedelta(days=3)), ('E2', now - timedelta(minutes=20)),
                         ('E3', now + timedelta(days=1)), ('E4', None)):
            Auction.objects.create(marketplace=self.mp, external_id=ext, title='x', end_time=end)
        self.assertEqual(pipeline.close_ended_auctions(now), 1)
        self.assertEqual(
            dict(Auction.objects.values_list('external_id', 'status')),
            {'E1': 'closed', 'E2': 'open', 'E3': 'open', 'E4': 'open'},
        )


class GateTests(TestCase):
    def _call(self, status=200):
        with _http(_Resp(status)) as req:
            data = scraper._request_json('POST', scraper.SEARCH_LISTINGS_URL, json_body={}, proxies={}, call_kind='sweep')
        return data, req

    def test_every_call_is_logged(self):
        self._call(200)
        c = BStockCall.objects.get()
        self.assertEqual((c.kind, c.status), ('sweep', '200'))
        self.assertEqual(bstock_calls.daily_totals()[0]['calls'], 1)

    def test_kill_switch_stops_the_call(self):
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_OFF, defaults={'value': True})
        data, req = self._call()
        self.assertIsNone(data)
        req.assert_not_called()
        self.assertFalse(BStockCall.objects.exists())

    def test_429_is_not_retried_and_pauses_everything(self):
        _, req = self._call(429)
        self.assertEqual(req.call_count, 1)
        self.assertIsNotNone(bstock_calls.backoff_until())
        _, req = self._call(200)
        req.assert_not_called()

    def test_back_off_doubles_then_a_clean_call_clears_it(self):
        bstock_calls.record('sweep', 429)
        bstock_calls.record('sweep', 403)
        self.assertEqual(AppSetting.objects.get(key=bstock_calls.KEY_BACKOFF).value['step'], 2)
        self.assertGreater(bstock_calls.backoff_until(), timezone.now() + timedelta(minutes=9))
        bstock_calls.record('state', 200)
        self.assertIsNone(bstock_calls.backoff_until())

    def test_hourly_cap(self):
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_PER_HOUR, defaults={'value': 2})
        self._call()
        self._call()
        _, req = self._call()
        req.assert_not_called()
        BStockCall.objects.update(at=timezone.now() - timedelta(hours=2))
        _, req = self._call()
        req.assert_called_once()

    def test_slot_waits_a_random_gap_after_the_last_call(self):
        bstock_calls.record('sweep', 200)
        waits = []
        with patch.object(bstock_calls, 'GAP_SECONDS', (5.0, 5.0)):
            with bstock_calls.slot('quick', sleep=waits.append):
                pass
        self.assertEqual(len(waits), 1)
        self.assertGreater(waits[0], 4.0)

    def test_paused_search_ends_with_the_reason(self):
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_OFF, defaults={'value': True})
        rows, err, _ = scraper._search_post_paginate('sf', page_limit=200, max_pages=None, log_full_first_response=False)
        self.assertEqual(rows, [])
        self.assertIn('kill switch', err)

    def test_background_state_call_goes_through_the_slot(self):
        state = {'auctions': [{'listingId': 'X1', 'closed': False}]}
        with _http(_Resp(200, state)):
            out = scraper.get_auction_states_batch(['X1'], background=True)
        self.assertIn('X1', out)
        self.assertEqual(BStockCall.objects.get().kind, 'state')

    def test_refresh_says_paused(self):
        a = Auction.objects.create(marketplace=_mp(), external_id='R1', title='x')
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_OFF, defaults={'value': True})
        self.assertEqual(pipeline.refresh_auction_from_bstock(a)['code'], 'bstock_calls_paused')


class QuickCheckTests(TestCase):
    def setUp(self):
        Marketplace.objects.update(is_active=False)
        self.t = _mp('target', 'sf-t')
        self.w = _mp('walmart', 'sf-w')
        _mp('costco', 'sf-c', requires_login=True)

    def test_one_search_of_public_sellers_newest_first(self):
        now = timezone.now()
        page = {'listings': [
            _row('N1', sf='sf-t', win=10750, buy_now=True, bn_end=now + timedelta(hours=5)),
            _row('N2', sf='sf-w'),
        ], 'total': 2}
        with _http(_Resp(200, page)) as req:
            out = quick_check.run_tick()
        body = req.call_args.kwargs['json']
        self.assertEqual(sorted(body['storeFrontId']), ['sf-t', 'sf-w'])  # never the signed-in seller
        self.assertEqual((body['sortBy'], body['sortOrder']), ('startTime', 'desc'))
        self.assertEqual(req.call_count, 1)  # nothing watched: no state call
        self.assertEqual((out['inserted'], len(out['new_ids']), out['buy_now_live']), (2, 2, 1))
        n1 = Auction.objects.get(external_id='N1')
        self.assertEqual((n1.marketplace_id, n1.buy_now_price), (self.t.pk, Decimal('10750.00')))
        self.assertEqual(Auction.objects.get(external_id='N2').marketplace_id, self.w.pk)
        self.assertEqual(BStockCall.objects.get().kind, 'quick')

    def test_watched_lots_get_one_state_call(self):
        a = Auction.objects.create(marketplace=self.t, external_id='W1', title='x', end_time=timezone.now() + timedelta(hours=1))
        WatchlistEntry.objects.create(auction=a)
        responses = [_Resp(200, {'listings': [], 'total': 0}), _Resp(200, {'auctions': [{'listingId': 'W1', 'closed': True}]})]
        with patch('apps.buying.services.scraper.requests.request', side_effect=responses):
            out = quick_check.run_tick()
        self.assertEqual(out['watch_polled'], 1)
        a.refresh_from_db()
        self.assertEqual(a.status, Auction.STATUS_CLOSED)
        self.assertEqual(sorted(BStockCall.objects.values_list('kind', flat=True)), ['quick', 'state'])

    def test_paused_tick_sends_nothing(self):
        AppSetting.objects.update_or_create(key=bstock_calls.KEY_OFF, defaults={'value': True})
        with patch('apps.buying.services.scraper.requests.request') as req:
            out = quick_check.run_tick()
        req.assert_not_called()
        self.assertIn('kill switch', out['paused'])

    def test_command_runs_one_tick(self):
        with patch.object(quick_check, 'run_tick', return_value={'listings': 0}) as tick:
            call_command('bstock_quick_check', stdout=StringIO())
        tick.assert_called_once()

    def test_burst_ticks_through_the_listing_window_then_stops(self):
        from apps.buying.management.commands import bstock_quick_check as cmd

        with patch.object(quick_check, 'run_tick', return_value={'listings': 0}) as tick,                 patch.object(cmd.Command, '_wait'),                 patch.object(cmd, 'in_listing_window', side_effect=[True, True, True, True, False]):
            call_command('bstock_quick_check', '--burst', stdout=StringIO())
        self.assertEqual(tick.call_count, 3)

    def test_burst_outside_the_window_is_one_tick(self):
        from apps.buying.management.commands import bstock_quick_check as cmd

        with patch.object(quick_check, 'run_tick', return_value={'listings': 0}) as tick,                 patch.object(cmd, 'in_listing_window', return_value=False):
            call_command('bstock_quick_check', '--burst', stdout=StringIO())
        tick.assert_called_once()

    def test_listing_windows(self):
        from datetime import datetime, timezone as tz

        from apps.buying.management.commands.bstock_quick_check import in_listing_window

        at = lambda m: datetime(2026, 11, 5, 18, m, tzinfo=tz.utc)  # noqa: E731
        self.assertEqual([in_listing_window(at(m)) for m in (0, 4, 5, 29, 30, 34, 35)],
                         [True, True, False, False, True, True, False])


class SlipFixTests(TestCase):
    def _snaps(self, *pairs):
        return [SimpleNamespace(pk=i, price=Decimal(str(p)), bid_count=b) for i, (p, b) in enumerate(pairs)]

    def test_a_climb_past_ten_thousand_is_fixed(self):
        slips = find_slips(self._snaps((9500, 30), (102.5, 31), (110, 33)))
        self.assertEqual([(s.pk, f) for s, f in slips], [(1, Decimal('10250.0')), (2, Decimal('11000'))])

    def test_a_real_bid_after_a_buy_now_window_is_left_alone(self):
        # $9,800 shown with no bids is a Buy Now price; then a real $150 bid.
        self.assertEqual(find_slips(self._snaps((9800, 0), (150, 1))), [])

    def test_a_real_drop_is_left_alone(self):
        self.assertEqual(find_slips(self._snaps((9500, 30), (40, 31))), [])

    def test_command_dry_run_then_apply(self):
        a = Auction.objects.create(marketplace=_mp(), external_id='S1', title='x', current_price=Decimal('104.00'))
        t = timezone.now()
        for i, (p, b) in enumerate(((9500, 30), (104, 32))):
            s = AuctionSnapshot.objects.create(auction=a, price=Decimal(str(p)), bid_count=b)
            AuctionSnapshot.objects.filter(pk=s.pk).update(captured_at=t + timedelta(minutes=i))
        out = StringIO()
        call_command('fix_bstock_price_slip', stdout=out)
        self.assertIn('dry run', out.getvalue())
        a.refresh_from_db()
        self.assertEqual(a.current_price, Decimal('104.00'))
        call_command('fix_bstock_price_slip', '--apply', stdout=StringIO())
        a.refresh_from_db()
        self.assertEqual(a.current_price, Decimal('10400.00'))
        self.assertEqual(AuctionSnapshot.objects.filter(auction=a).order_by('captured_at').last().price, Decimal('10400.00'))


class CallsEndpointTests(TestCase):
    def test_superuser_only(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient

        User = get_user_model()
        client = APIClient()
        client.force_authenticate(User.objects.create_user('s75@example.com', 'S', 'T', password='x-pass-123'))
        self.assertIn(client.get('/api/buying/bstock-calls/').status_code, (401, 403))
        client.force_authenticate(User.objects.create_superuser(
            email='b75@example.com', first_name='B', last_name='T', password='x-pass-123'))
        r = client.get('/api/buying/bstock-calls/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('per_hour_cap', r.json())
