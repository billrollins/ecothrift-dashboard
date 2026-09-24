"""Manifest pulls with the handed-over B-Stock login (bstock_daily_buying Phase 1)."""

from __future__ import annotations

import base64
import json
import time
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.buying.api_views import annotate_auction_list_extras
from apps.buying.models import (
    Auction,
    AuctionThumbsVote,
    BStockToken,
    CategoryMapping,
    CategoryStats,
    ManifestPullJob,
    ManifestPullLog,
    ManifestRow,
    ManifestTemplate,
    Marketplace,
    Outcome,
    WatchlistEntry,
)
from apps.buying.services import manifest_pull, scraper
from apps.buying.services.bstock_token_store import (
    TokenRejected,
    clear_token,
    current_token,
    save_token,
    token_status,
)
from apps.buying.services.category_stats_sql import upsert_category_stats_from_sql
from apps.buying.services.manifest_template import compute_header_signature
from apps.buying.services.manifest_upload import process_manifest_upload
from apps.buying.services.normalize import normalize_manifest_row
from apps.buying.services.sweep_upsert import upsert_listings_raw
from apps.core.models import AppSetting
from apps.pos.services.dashboard_metrics import _retail_submissions_by_day
from apps.routines.kinds import merge_incoming, outcome, submit_blockers
from apps.routines.models import Routine, RoutineRun, RoutineSubmission
from apps.routines.schedule import materialize_routines

User = get_user_model()


def _jwt(expires_in: timedelta, **claims) -> str:
    def seg(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')

    exp = claims.pop('exp', None)
    if exp is None:
        exp = int((timezone.now() + expires_in).timestamp())
    return f"{seg({'alg': 'RS256', 'typ': 'JWT'})}.{seg({'exp': exp, **claims})}.sig"


def _api_row(n: int) -> dict:
    return {
        '_id': f'row{n}',
        'quantity': 2,
        'categories': ['PET_SUPPLIES'],
        'customAttributes': {'subCategory': 'APPAREL'},
        'itemCondition': 'NEW',
        'attributes': {
            'description': f'Dog sweater {n}',
            'brandName': 'Boots & Barkley',
            'unitRetail': 999,
            'extRetail': 1998,
            'ids': {'upc': [f'0001{n}'], 'tcin': [f'9{n}']},
        },
    }


def _page(offset: int, rows: list[dict], total: int | None, limit: int = 1000) -> dict:
    return {'items': rows, 'total': total, 'limit': limit, 'offset': offset}


def _target() -> Marketplace:
    return Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'is_active': True})[0]


def _auction(mp: Marketplace, ext: str, *, hours: float = 5, priority: int | None = 50, **fields) -> Auction:
    fields.setdefault('lot_id', f'lot-{ext}')
    fields.setdefault('last_updated_at', timezone.now())
    fields.setdefault('status', Auction.STATUS_OPEN)
    return Auction.objects.create(
        marketplace=mp,
        external_id=ext,
        title=f'Lot {ext}',
        end_time=timezone.now() + timedelta(hours=hours),
        priority=priority,
        **fields,
    )


def _no_page_delay() -> None:
    AppSetting.objects.update_or_create(key='buying_manifest_pull_page_delay_ms', defaults={'value': 0})


def _owner(email='owner@x.test') -> User:
    admin, _ = Group.objects.get_or_create(name='Admin')
    user = User.objects.create_user(email, 'Own', 'Er', password='x', is_superuser=True)
    user.groups.add(admin)
    return user


class _FakeResponse:
    def __init__(self, status: int, body=None, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.url = 'https://order-process.bstock.com/v1/manifests/x'
        self.text = json.dumps(body) if body is not None else ''
        self.content = self.text.encode()

    def json(self):
        return self._body

    def raise_for_status(self):
        import requests

        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


URL = 'https://order-process.bstock.com/v1/x'


class RequestJsonTests(TestCase):
    def test_server_error_is_unavailable_and_bad_request_is_http_error(self):
        with patch.object(scraper.requests, 'request', return_value=_FakeResponse(503, {'x': 1})):
            with self.assertRaises(scraper.BStockUnavailable):
                scraper._request_json('GET', URL, proxies={}, raise_errors=True)
        with patch.object(scraper.requests, 'request', return_value=_FakeResponse(400, {'x': 1})):
            with self.assertRaises(scraper.BStockHTTPError) as ctx:
                scraper._request_json('GET', URL, proxies={}, raise_errors=True)
        self.assertEqual(ctx.exception.status_code, 400)
        # Without raise_errors the old contract holds: None.
        with patch.object(scraper.requests, 'request', return_value=_FakeResponse(400, {'x': 1})):
            self.assertIsNone(scraper._request_json('GET', URL, proxies={}))

    def test_network_error_is_unavailable(self):
        import requests

        with patch.object(scraper.requests, 'request', side_effect=requests.exceptions.ConnectTimeout('boom')):
            with self.assertRaises(scraper.BStockUnavailable):
                scraper._request_json('GET', URL, proxies={}, raise_errors=True)

    def test_retry_after_is_capped(self):
        limited = _FakeResponse(429, {'x': 1}, headers={'Retry-After': '1800'})
        sleeps: list[float] = []
        with patch.object(scraper.requests, 'request', return_value=limited), patch.object(
            scraper.time, 'sleep', side_effect=sleeps.append
        ), self.settings(BSTOCK_MAX_RETRIES=1):
            with self.assertRaises(scraper.BStockUnavailable):
                scraper._request_json('GET', URL, proxies={}, raise_errors=True)
        self.assertEqual(sleeps, [scraper.RETRY_AFTER_CAP_SECONDS])

    def test_a_401_with_the_owners_login_is_a_refused_login(self):
        with patch.object(scraper.requests, 'request', return_value=_FakeResponse(401, {'x': 1})) as req:
            with self.assertRaises(scraper.BStockAuthError):
                scraper._request_json('GET', URL, proxies={}, bearer='owner-token', raise_errors=True)
        self.assertEqual(req.call_count, 1)  # no retry

    def test_bearer_is_sent_as_given_and_never_from_the_file(self):
        with patch.object(scraper.requests, 'request', return_value=_FakeResponse(200, {'ok': 1})) as req, patch.object(
            scraper, '_auth_token_value', return_value='file-token'
        ):
            scraper._request_json('GET', URL, proxies={}, bearer='owner-token')
        self.assertEqual(req.call_args.kwargs['headers']['Authorization'], 'Bearer owner-token')


class FetchManifestTests(TestCase):
    def _fetch(self, pages, **kw):
        kw.setdefault('bearer', 'owner-token')
        with patch.object(scraper, '_request_json', side_effect=pages) as req:
            return scraper.fetch_manifest_items('lot', page_delay_seconds=0, **kw), req

    def test_logged_in_pages_by_id_until_total_and_goes_direct(self):
        pages = [_page(0, [_api_row(i) for i in range(3)], 5), _page(3, [_api_row(3), _api_row(4)], 5)]
        fetch, req = self._fetch(pages)
        self.assertTrue(fetch.complete)
        self.assertEqual([r['_id'] for r in fetch.items], [f'row{i}' for i in range(5)])
        kwargs = req.call_args.kwargs
        self.assertEqual(kwargs['bearer'], 'owner-token')
        self.assertEqual(kwargs['proxies'], {})  # never through the SOCKS5 pool
        self.assertEqual(kwargs['params']['sortBy'], '_id')
        self.assertEqual(req.call_args_list[1].kwargs['params']['offset'], 3)

    def test_without_total_pages_until_a_short_page(self):
        pages = [_page(0, [_api_row(0), _api_row(1)], None, limit=2), _page(2, [_api_row(2)], None, limit=2)]
        fetch, req = self._fetch(pages)
        self.assertTrue(fetch.complete)
        self.assertEqual(len(fetch.items), 3)
        self.assertEqual(req.call_count, 2)

    def test_anonymous_preview_is_incomplete(self):
        rows = [_api_row(i) for i in range(10)]
        fetch, _ = self._fetch([_page(0, rows, 25, limit=10)], auth=False, bearer=None)
        self.assertFalse(fetch.complete)
        self.assertEqual(fetch.reason, 'preview')

    def test_logged_in_preview_is_a_refused_lot(self):
        rows = [_api_row(i) for i in range(10)]
        with self.assertRaises(scraper.BStockLotRefused):
            self._fetch([_page(0, rows, 25, limit=10)])
        # An echoed offset of 0 on page two is the other preview tell.
        with self.assertRaises(scraper.BStockLotRefused) as ctx:
            self._fetch([_page(0, rows[:5], 25), _page(0, rows[:5], 25)])
        self.assertEqual(ctx.exception.api_calls, 2)

    def test_status_classification(self):
        cases = (
            (scraper.BStockHTTPError(401), scraper.BStockAuthError),
            (scraper.BStockHTTPError(400), scraper.BStockLotRefused),
            (scraper.BStockHTTPError(403), scraper.BStockLotRefused),
            (scraper.BStockHTTPError(404), scraper.BStockLotError),
            (scraper.BStockHTTPError(422), scraper.BStockLotError),
            (scraper.BStockUnavailable('down'), scraper.BStockUnavailable),
            (None, scraper.BStockUnavailable),
        )
        for exc, expected in cases:
            with self.subTest(exc=repr(exc)), self.assertRaises(expected) as ctx:
                self._fetch([exc])
            self.assertEqual(ctx.exception.api_calls, 1)
        with self.assertRaises(scraper.BStockLotError) as ctx:
            self._fetch([scraper.BStockHTTPError(404)])
        self.assertTrue(ctx.exception.permanent)

    def test_overlapping_pages_are_deduped_and_refused_when_short(self):
        pages = [_page(0, [_api_row(0), _api_row(1)], 3), _page(2, [_api_row(1)], 3)]
        fetch, _ = self._fetch(pages)
        self.assertFalse(fetch.complete)
        self.assertEqual(fetch.reason, 'unstable')
        self.assertEqual(len(fetch.items), 2)

    def test_too_large_stops_after_one_request(self):
        fetch, req = self._fetch([_page(0, [_api_row(0)], 20_000)], max_rows=10_000)
        self.assertFalse(fetch.complete)
        self.assertEqual(fetch.reason, 'too_large')
        self.assertEqual(req.call_count, 1)

    def test_calls_are_capped(self):
        pages = [_page(i, [_api_row(i)], 1_000, limit=11) for i in range(scraper.MAX_MANIFEST_CALLS + 5)]
        fetch, req = self._fetch(pages)
        self.assertFalse(fetch.complete)
        self.assertEqual(fetch.reason, 'too_many_calls')
        self.assertEqual(req.call_count, scraper.MAX_MANIFEST_CALLS)

    def test_on_page_runs_after_every_page(self):
        ticks = []
        pages = [_page(0, [_api_row(0)], 2, limit=11), _page(1, [_api_row(1)], 2, limit=11)]
        with patch.object(scraper, '_request_json', side_effect=pages):
            scraper.fetch_manifest_items('lot', bearer='t', page_delay_seconds=0, on_page=lambda: ticks.append(1))
        self.assertEqual(len(ticks), 2)

    def test_api_retail_is_cents(self):
        std = normalize_manifest_row(_api_row(1), whole_numbers_are_cents=True)
        self.assertEqual(std['retail_value'], Decimal('9.99'))
        self.assertEqual(std['sku'], '91')
        self.assertEqual(std['upc'], '00011')

    def test_jwt_expiry_survives_a_crafted_exp(self):
        self.assertIsNone(scraper.jwt_expiry(_jwt(timedelta(0), exp=10**30)))


class TokenStoreTests(TestCase):
    def test_saves_newest_and_reads_it_back(self):
        save_token(_jwt(timedelta(minutes=30)))
        token = _jwt(timedelta(minutes=50))
        save_token(f'Bearer {token}')
        self.assertEqual(BStockToken.objects.count(), 1)
        self.assertEqual(current_token(), token)
        self.assertEqual(scraper._auth_token_value(), token)

    def test_rejects_what_is_not_a_usable_login(self):
        bad = [
            'eyJhbGciOiJSU0EtT0FFUCJ9.x.y',  # the elt cookie JWE
            _jwt(timedelta(minutes=-1)),  # expired
            _jwt(timedelta(seconds=90)),  # inside the 2-minute margin
            _jwt(timedelta(hours=3)),  # far longer than a B-Stock login
            _jwt(timedelta(minutes=50)) + '\nX-Injected: 1',  # a header break
            _jwt(timedelta(0), exp=10**30),  # unreadable exp
            'not-a-token',
        ]
        for value in bad:
            with self.subTest(value=value[:30]), self.assertRaises(TokenRejected):
                save_token(value)
        self.assertEqual(BStockToken.objects.count(), 0)

    def test_status_counts_usable_time_and_clear_forgets(self):
        token = _jwt(timedelta(minutes=50))
        save_token(token)
        status = token_status()
        self.assertTrue(status.connected)
        self.assertLessEqual(status.seconds_left, 48 * 60)
        self.assertGreater(status.seconds_left, 47 * 60)
        # Clearing a different (older) token leaves the stored one alone.
        self.assertEqual(clear_token(_jwt(timedelta(minutes=10))), 0)
        self.assertEqual(clear_token(token), 1)
        self.assertEqual(current_token(), '')
        self.assertFalse(token_status().connected)


class ShortlistTests(TestCase):
    def setUp(self):
        self.mp = _target()

    def test_filters_and_order(self):
        later = _auction(self.mp, 'later', hours=20, priority=90)
        soon = _auction(self.mp, 'soon', hours=2, priority=90)
        low = _auction(self.mp, 'low', hours=2, priority=10)
        watched = _auction(self.mp, 'watched', hours=30, priority=5)
        WatchlistEntry.objects.create(auction=watched)
        _auction(self.mp, 'too-far', hours=100)
        _auction(self.mp, 'no-lot', lot_id='')
        _auction(self.mp, 'contract', listing_type='contract')
        _auction(self.mp, 'archived', archived_at=timezone.now())
        _auction(self.mp, 'failed-recently', manifest_pull_attempted_at=timezone.now(), manifest_pull_error='x')
        _auction(self.mp, 'in-flight', manifest_pull_attempted_at=timezone.now())
        _auction(self.mp, 'blocked', manifest_pull_blocked=True, manifest_pull_error='too large')
        _auction(self.mp, 'not-seen-lately', last_updated_at=timezone.now() - timedelta(hours=5))
        _auction(self.mp, 'closed', status=Auction.STATUS_CLOSED)
        has_rows = _auction(self.mp, 'has-rows')
        ManifestRow.objects.create(auction=has_rows, row_number=1)

        ids = [a.external_id for a in manifest_pull.shortlist_queryset()]
        self.assertEqual(ids, [watched.external_id, soon.external_id, later.external_id, low.external_id])
        # Only the failed one waits; the in-flight claim and the blocked lot do not.
        self.assertEqual(manifest_pull.waiting_retry_count(), 1)

    def test_pull_eligible(self):
        self.assertTrue(manifest_pull.pull_eligible(_auction(self.mp, 'far', hours=500)))
        self.assertFalse(manifest_pull.pull_eligible(_auction(self.mp, 'c', listing_type='CONTRACT')))
        self.assertFalse(manifest_pull.pull_eligible(_auction(self.mp, 'ended', hours=-1)))
        self.assertFalse(manifest_pull.pull_eligible(_auction(self.mp, 'b', manifest_pull_blocked=True)))


class PullOneAuctionTests(TestCase):
    def setUp(self):
        _no_page_delay()
        self.mp = _target()
        self.auction = _auction(self.mp, 'a1')
        # No real (paid) AI calls in tests.
        patcher = patch.object(manifest_pull, 'map_one_fast_cat_batch', return_value={'error': 'ai_not_configured'})
        self.mapper = patcher.start()
        self.addCleanup(patcher.stop)
        # No real B-Stock calls: by default the listing has no shipping quote.
        quote_patcher = patch.object(scraper, 'fetch_shipping_quote', return_value=None)
        self.quote = quote_patcher.start()
        self.addCleanup(quote_patcher.stop)

    def _fetch(self, items, total=None, complete=True, reason=''):
        return scraper.ManifestFetch(
            items=items,
            total=len(items) if total is None else total,
            api_calls=1,
            complete=complete,
            reason=reason,
        )

    def _pull(self, **kwargs):
        kwargs.setdefault('token', 'owner-token')
        return manifest_pull.pull_manifest_for_auction(self.auction, page_delay_seconds=0, **kwargs)

    def _state(self):
        self.auction.refresh_from_db()
        return self.auction

    def test_success_saves_rows_maps_and_values(self):
        CategoryMapping.objects.create(
            source_key='tgt-api-pet-supplies-apparel',
            canonical_category='Pet supplies',
            rule_origin=CategoryMapping.RULE_AI,
        )
        CategoryStats.objects.filter(category='Pet supplies').update(recovery_rate=Decimal('0.5'))
        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1), _api_row(2)])) as f:
            result = self._pull()
        self.assertEqual(f.call_args.kwargs['bearer'], 'owner-token')
        a = self._state()
        self.assertTrue(result.ok)
        self.assertEqual(a.manifest_source, Auction.MANIFEST_SOURCE_AUTO)
        self.assertEqual(a.manifest_rows.count(), 2)
        row = a.manifest_rows.order_by('row_number').first()
        self.assertEqual((row.fast_cat_key, row.fast_cat_value), ('tgt-api-pet-supplies-apparel', 'Pet supplies'))
        self.assertEqual((row.quantity, row.retail_value), (2, Decimal('9.99')))
        self.assertEqual(a.manifest_category_distribution, {'Pet supplies': 100.0})
        # 2 lines x 2 units x $9.99 at a 50% recovery rate.
        self.assertAlmostEqual(float(a.estimated_revenue), 19.98, places=2)
        log = ManifestPullLog.objects.get(auction=a)
        self.assertTrue(log.success)
        self.assertFalse(log.used_socks5)

    def test_success_reads_the_shipping_quote_before_valuing(self):
        self.quote.return_value = scraper.ShippingQuote(
            amount_cents=273233, carrier='RXO Logistics', mode='TL', trucks=1, destination_zip='68124'
        )
        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])):
            result = self._pull()
        self.assertTrue(result.ok)
        self.assertTrue(result.shipping_quote)
        self.assertEqual(self.quote.call_args.args[0], 'a1')
        self.assertEqual(self.quote.call_args.kwargs['bearer'], 'owner-token')
        a = self._state()
        self.assertEqual(a.shipping_quote, Decimal('2732.33'))
        self.assertEqual(a.estimated_shipping, Decimal('2732.33'))
        self.assertEqual(a.shipping_quote_info['carrier'], 'RXO Logistics')
        self.assertIsNotNone(a.shipping_quote_at)

    def test_a_failed_shipping_quote_never_fails_the_manifest(self):
        for exc in (scraper.BStockUnavailable('down'), scraper.BStockAuthError('401'), ValueError('odd body')):
            with self.subTest(exc=type(exc).__name__):
                Auction.objects.filter(pk=self.auction.pk).update(
                    has_manifest=False, manifest_source='', manifest_pull_attempted_at=None
                )
                ManifestRow.objects.filter(auction=self.auction).delete()
                self.quote.side_effect = exc
                with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])):
                    result = self._pull()
                self.assertTrue(result.ok)
                self.assertFalse(result.shipping_quote)
                self.assertIsNone(self._state().shipping_quote)

    def test_no_quote_keeps_the_rate_estimate(self):
        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])):
            result = self._pull()
        self.assertTrue(result.ok)
        self.assertFalse(result.shipping_quote)
        self.assertIsNone(self._state().shipping_quote)

    def test_rows_mapped_elsewhere_after_save_are_filled(self):
        def mapped_meanwhile(auction, mapping):
            CategoryMapping.objects.get_or_create(
                source_key='tgt-api-pet-supplies-apparel',
                defaults={'canonical_category': 'Pet supplies', 'rule_origin': CategoryMapping.RULE_AI},
            )
            return {'keys_mapped': 0}

        self.mapper.side_effect = mapped_meanwhile
        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])):
            result = self._pull()
        self.assertEqual(result.unmapped_keys, 0)
        self.assertEqual(self.auction.manifest_rows.get().fast_cat_value, 'Pet supplies')

    def test_partial_download_waits_for_the_retry(self):
        fetch = self._fetch([_api_row(1)], total=40, complete=False, reason='unstable')
        with patch.object(scraper, 'fetch_manifest_items', return_value=fetch):
            result = self._pull()
        a = self._state()
        self.assertFalse(result.ok or result.blocked)
        self.assertEqual(a.manifest_rows.count(), 0)
        self.assertIn('1 unique lines of 40', a.manifest_pull_error)
        self.assertIsNotNone(a.manifest_pull_attempted_at)

    def test_lots_b_stock_will_never_give_are_blocked(self):
        cases = (
            (self._fetch([_api_row(1)], total=20_000, complete=False, reason='too_large'), None),
            (self._fetch([]), None),
            (None, scraper.BStockLotError('404', permanent=True)),
        )
        for fetch, exc in cases:
            with self.subTest(fetch=fetch, exc=exc):
                Auction.objects.filter(pk=self.auction.pk).update(
                    manifest_pull_blocked=False, manifest_pull_attempted_at=None, manifest_pull_error=''
                )
                with patch.object(scraper, 'fetch_manifest_items', return_value=fetch, side_effect=exc):
                    result = self._pull()
                self.assertTrue(result.blocked)
                self.assertTrue(self._state().manifest_pull_blocked)
                self.assertNotIn(self.auction, list(manifest_pull.shortlist_queryset()))

    def test_a_refused_lot_is_recorded_not_raised(self):
        with patch.object(scraper, 'fetch_manifest_items', side_effect=scraper.BStockLotRefused('403')):
            result = self._pull()
        self.assertTrue(result.refused)
        self.assertEqual(self._state().manifest_pull_error, '403')

    def test_login_problems_raise_without_blaming_the_auction(self):
        for exc in (scraper.BStockAuthError('401'), None):
            with self.subTest(exc=exc):
                with patch.object(scraper, 'fetch_manifest_items', side_effect=exc):
                    with self.assertRaises(scraper.BStockAuthError):
                        # None: no login at all.
                        self._pull(token='' if exc is None else 'owner-token')
                a = self._state()
                self.assertIsNone(a.manifest_pull_attempted_at)
                self.assertEqual(a.manifest_pull_error, '')
        self.assertEqual(ManifestPullLog.objects.filter(auction=self.auction, success=False).count(), 2)

    def test_an_outage_raises_and_parks_only_this_lot(self):
        with patch.object(scraper, 'fetch_manifest_items', side_effect=scraper.BStockUnavailable('timeout')):
            with self.assertRaises(scraper.BStockUnavailable):
                self._pull()
        a = self._state()
        self.assertIsNotNone(a.manifest_pull_attempted_at)
        self.assertIn('did not answer', a.manifest_pull_error)

    def test_a_bad_value_while_saving_is_a_crash_not_a_login(self):
        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])), patch.object(
            manifest_pull, 'save_api_manifest', side_effect=ValueError('A string literal cannot contain NUL')
        ):
            result = self._pull()
        a = self._state()
        self.assertFalse(result.ok)
        self.assertIn('Crashed (ValueError)', a.manifest_pull_error)
        self.assertIsNotNone(a.manifest_pull_attempted_at)
        self.assertNotIn(a, list(manifest_pull.shortlist_queryset()))

    def test_a_csv_uploaded_mid_pull_is_kept(self):
        def upload_meanwhile(*args, **kwargs):
            ManifestRow.objects.create(auction=self.auction, row_number=1, title='from the CSV')
            return self._fetch([_api_row(1), _api_row(2)])

        with patch.object(scraper, 'fetch_manifest_items', side_effect=upload_meanwhile):
            result = self._pull()
        self.assertTrue(result.skipped)
        self.assertEqual(list(self.auction.manifest_rows.values_list('title', flat=True)), ['from the CSV'])

    def test_a_stop_during_mapping_still_values_the_saved_rows(self):
        def stop(*args, **kwargs):
            raise manifest_pull.JobLost()

        with patch.object(scraper, 'fetch_manifest_items', return_value=self._fetch([_api_row(1)])), patch.object(
            manifest_pull, 'apply_known_mappings', side_effect=stop
        ), patch.object(manifest_pull, 'recompute_auction_valuation') as value:
            with self.assertRaises(manifest_pull.JobLost):
                self._pull()
        value.assert_called_once()
        self.assertEqual(self.auction.manifest_rows.count(), 1)
        self.assertTrue(ManifestPullLog.objects.get(auction=self.auction).success)

    def test_an_auction_that_no_longer_qualifies_is_skipped(self):
        Auction.objects.filter(pk=self.auction.pk).update(archived_at=timezone.now())
        with patch.object(scraper, 'fetch_manifest_items') as fetch:
            result = self._pull()
        self.assertTrue(result.skipped)
        fetch.assert_not_called()


class PullJobTests(TestCase):
    def setUp(self):
        _no_page_delay()
        self.mp = _target()
        self.a1 = _auction(self.mp, 'a1', priority=90)
        self.a2 = _auction(self.mp, 'a2', priority=10)
        patcher = patch.object(manifest_pull, 'map_one_fast_cat_batch', return_value={'error': 'ai_not_configured'})
        patcher.start()
        self.addCleanup(patcher.stop)

    def _login(self) -> str:
        token = _jwt(timedelta(minutes=50))
        save_token(token)
        return token

    def _result(self, auction, **fields):
        return manifest_pull.PullResult(auction_id=auction.pk, **{'ok': False, **fields})

    def _run(self, **kwargs):
        return manifest_pull.run_job(manifest_pull.start_job(background=False).pk, **kwargs)

    def test_no_login_fails_job(self):
        job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)
        self.assertEqual(job.error, manifest_pull.LOGIN_EXPIRED)

    def test_runs_a_fixed_shortlist_with_the_stored_login(self):
        token = self._login()
        calls = []

        def pull(auction, **kwargs):
            calls.append(kwargs['token'])
            return self._result(auction, ok=auction.pk == self.a1.pk, rows=3)

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=pull):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)
        self.assertEqual(job.auction_ids, [self.a1.pk, self.a2.pk])
        self.assertEqual((job.total, job.done_count, job.ok_count), (2, 2, 1))
        self.assertEqual(calls, [token, token])

    def test_one_refused_lot_does_not_stop_the_job(self):
        self._login()
        results = [lambda a: self._result(a, refused=True, error='403'), lambda a: self._result(a, ok=True)]
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=lambda a, **k: results.pop(0)(a)):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)
        self.assertTrue(token_status().connected)

    def test_two_refused_lots_in_a_row_mean_the_login(self):
        token = self._login()
        _auction(self.mp, 'a3', priority=5)

        def refuse(auction, **kwargs):
            Auction.objects.filter(pk=auction.pk).update(
                manifest_pull_attempted_at=timezone.now(), manifest_pull_error='403'
            )
            return self._result(auction, refused=True, error='403')

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=refuse) as pull:
            job = self._run()
        self.assertEqual(pull.call_count, 2)
        self.assertEqual(job.error, manifest_pull.LOGIN_REFUSED)
        self.assertFalse(BStockToken.objects.filter(token=token).exists())
        # Neither lot is blamed: both are back on the shortlist.
        for a in (self.a1, self.a2):
            a.refresh_from_db()
            self.assertIsNone(a.manifest_pull_attempted_at)
            self.assertEqual(a.manifest_pull_error, '')

    def test_a_401_forgets_only_that_login(self):
        token = self._login()

        def refuse(auction, **kwargs):
            # The owner sends a fresh login while the refused request is in flight.
            BStockToken.objects.update(token=token + 'x')
            raise scraper.BStockAuthError(manifest_pull.LOGIN_REFUSED)

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=refuse):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)
        self.assertEqual(BStockToken.objects.count(), 1)

    def test_outage_stops_but_keeps_the_login(self):
        self._login()
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=scraper.BStockUnavailable('down')):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)
        self.assertIn('not answering', job.error)
        self.assertTrue(token_status().connected)

    def test_three_failures_in_a_row_stop_the_job_unless_the_list_is_done(self):
        self._login()
        for n in range(3):
            _auction(self.mp, f'x{n}', priority=5)
        fail = lambda a, **k: self._result(a, error='B-Stock paging returned 1 unique lines of 40.')  # noqa: E731
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=fail) as pull:
            job = self._run()
        self.assertEqual(pull.call_count, manifest_pull.MAX_CONSECUTIVE_FAILURES)
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)

        ManifestPullJob.objects.all().delete()
        Auction.objects.filter(external_id__startswith='x').delete()
        Auction.objects.create(marketplace=self.mp, external_id='a3', lot_id='lot-a3', status='open',
                               end_time=timezone.now() + timedelta(hours=5), last_updated_at=timezone.now())
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=fail):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)

    def test_blocked_lots_do_not_count_as_failures(self):
        self._login()
        for n in range(3):
            _auction(self.mp, f'big{n}', priority=5)
        _auction(self.mp, 'fine', priority=1)
        blocked = lambda a, **k: self._result(a, blocked=True, error='too large')  # noqa: E731
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=blocked) as pull:
            job = self._run()
        self.assertEqual(pull.call_count, 6)
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)

    def test_owner_stop_keeps_the_result_it_interrupted(self):
        self._login()

        def stop_then_ok(auction, **kwargs):
            manifest_pull.stop_job()
            return self._result(auction, ok=True, rows=3)

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=stop_then_ok) as pull:
            job = self._run()
        self.assertEqual(pull.call_count, 1)
        self.assertEqual(job.status, ManifestPullJob.STATUS_STOPPED)
        self.assertEqual([r['auction_id'] for r in job.results], [self.a1.pk])

    def test_a_stop_during_mapping_keeps_that_result(self):
        self._login()

        def stopped_after_saving(auction, **kwargs):
            manifest_pull.stop_job()
            e = manifest_pull.JobLost()
            e.result = self._result(auction, ok=True, rows=5)
            raise e

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=stopped_after_saving):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_STOPPED)
        self.assertEqual([(r['auction_id'], r['ok']) for r in job.results], [(self.a1.pk, True)])

    def test_deadline_requeues_and_resume_finishes_the_same_list(self):
        self._login()
        job = manifest_pull.start_job(background=False)
        ok = lambda a, **k: self._result(a, ok=True)  # noqa: E731
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=ok):
            job = manifest_pull.run_job(job.pk, deadline=time.monotonic() - 1)
        self.assertEqual(job.status, ManifestPullJob.STATUS_QUEUED)
        self.assertEqual(job.auction_ids, [self.a1.pk, self.a2.pk])
        late = _auction(self.mp, 'late', priority=99)
        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=ok) as pull:
            jobs = manifest_pull.resume_claimable_jobs()
        self.assertEqual([j.status for j in jobs], [ManifestPullJob.STATUS_DONE])
        self.assertEqual([c.args[0].pk for c in pull.call_args_list], [self.a1.pk, self.a2.pk])
        self.assertNotIn(late.pk, jobs[0].auction_ids)

    def test_a_deadline_mid_auction_requeues(self):
        self._login()

        def slow(auction, **kwargs):
            raise manifest_pull.JobDeadline()

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=slow):
            job = self._run()
        self.assertEqual(job.status, ManifestPullJob.STATUS_QUEUED)

    def test_resume_releases_the_auction_a_dead_runner_had_claimed(self):
        self._login()
        job = ManifestPullJob.objects.create(
            status=ManifestPullJob.STATUS_RUNNING,
            heartbeat_at=timezone.now() - timedelta(minutes=30),
            started_at=timezone.now() - timedelta(minutes=40),
            auction_ids=[self.a1.pk, self.a2.pk],
            total=2,
        )
        # The dead runner stamped a1 when it claimed it, then died mid-download.
        Auction.objects.filter(pk=self.a1.pk).update(manifest_pull_attempted_at=timezone.now() - timedelta(minutes=35))
        pulled = []

        def pull(auction, **kwargs):
            claimed, _ = manifest_pull._claim_auction(auction.pk, timezone.now(), force=False)
            pulled.append(bool(claimed))
            return self._result(auction, ok=bool(claimed), skipped=not claimed)

        with patch.object(manifest_pull, 'pull_manifest_for_auction', side_effect=pull):
            job = manifest_pull.run_job(job.pk)
        self.assertEqual(pulled, [True, True])
        self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)

    def test_start_returns_a_live_job_and_resumes_a_dead_one(self):
        running = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_RUNNING, heartbeat_at=timezone.now())
        self.assertEqual(manifest_pull.start_job(background=False).pk, running.pk)
        ManifestPullJob.objects.filter(pk=running.pk).update(heartbeat_at=timezone.now() - timedelta(minutes=30))
        with patch.object(manifest_pull, '_start_thread') as start, self.captureOnCommitCallbacks(execute=True):
            job = manifest_pull.start_job()
        self.assertEqual(job.pk, running.pk)
        start.assert_called_once_with(running.pk)
        self.assertEqual(ManifestPullJob.objects.count(), 1)

    def test_a_fresh_running_job_cannot_be_claimed_twice(self):
        running = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_RUNNING, heartbeat_at=timezone.now())
        with patch.object(manifest_pull, '_run_claimed') as body:
            manifest_pull.run_job(running.pk)
        body.assert_not_called()

    def test_the_thread_runs_the_job_and_closes_its_connections(self):
        with patch.object(manifest_pull, 'run_job') as run, patch.object(manifest_pull.connections, 'close_all') as close:
            manifest_pull._run_job_in_thread(7)
        run.assert_called_once_with(7)
        close.assert_called_once()

    def test_abandoned_jobs_expire(self):
        old = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_QUEUED)
        ManifestPullJob.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=5))
        job = manifest_pull.start_job(background=False)
        self.assertNotEqual(job.pk, old.pk)
        old.refresh_from_db()
        self.assertEqual(old.status, ManifestPullJob.STATUS_FAILED)

    def test_pending_mapping_is_finished_without_a_login(self):
        a = _auction(self.mp, 'pulled', manifest_source=Auction.MANIFEST_SOURCE_AUTO, manifest_pulled_at=timezone.now())
        ManifestRow.objects.create(auction=a, row_number=1, fast_cat_key='tgt-api-x')
        CategoryMapping.objects.create(source_key='tgt-api-x', canonical_category='Pet supplies',
                                       rule_origin=CategoryMapping.RULE_AI)
        job = self._run()
        self.assertEqual(job.error, manifest_pull.LOGIN_EXPIRED)
        self.assertEqual(a.manifest_rows.get().fast_cat_value, 'Pet supplies')

    def test_payload_flags_a_stalled_job(self):
        running = ManifestPullJob.objects.create(
            status=ManifestPullJob.STATUS_RUNNING,
            heartbeat_at=timezone.now() - timedelta(minutes=30),
        )
        queued = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_QUEUED)
        ManifestPullJob.objects.filter(pk=queued.pk).update(created_at=timezone.now() - timedelta(minutes=5))
        queued.refresh_from_db()
        self.assertTrue(manifest_pull.job_payload(running)['stalled'])
        self.assertTrue(manifest_pull.job_payload(queued)['stalled'])


class CommandTests(TestCase):
    def test_resumes_nothing_and_fails_a_dead_job_without_login(self):
        out = StringIO()
        call_command('pull_shortlist_manifests', stdout=out)
        self.assertIn('No pull to resume', out.getvalue())
        job = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_QUEUED)
        call_command('pull_shortlist_manifests', stdout=StringIO())
        job.refresh_from_db()
        self.assertEqual(job.status, ManifestPullJob.STATUS_FAILED)

    def test_never_starts_a_pull(self):
        save_token(_jwt(timedelta(minutes=50)))
        _auction(_target(), 'waiting')
        call_command('pull_shortlist_manifests', stdout=StringIO())
        self.assertEqual(ManifestPullJob.objects.count(), 0)

    def test_dry_run_shows_what_a_pull_would_take(self):
        mp = _target()
        for n in range(3):
            _auction(mp, f'd{n}')
        AppSetting.objects.update_or_create(key='buying_manifest_pull_max_per_run', defaults={'value': 2})
        out = StringIO()
        call_command('pull_shortlist_manifests', '--dry-run', stdout=out)
        self.assertIn('would take 2 of 3', out.getvalue())
        self.assertEqual(out.getvalue().count('Lot d'), 2)

    def test_single_auction_needs_a_login(self):
        a = _auction(_target(), 'one')
        out = StringIO()
        call_command('pull_shortlist_manifests', '--auction-id', str(a.pk), stdout=out)
        self.assertIn('No B-Stock login', out.getvalue())

    def test_prunes_old_auto_rows_but_keeps_watchlisted_and_outcomes(self):
        mp = _target()
        old = _auction(mp, 'old', hours=-24 * 20, manifest_source=Auction.MANIFEST_SOURCE_AUTO, has_manifest=True)
        kept = _auction(mp, 'kept', hours=-24 * 20, manifest_source=Auction.MANIFEST_SOURCE_AUTO, has_manifest=True)
        won = _auction(mp, 'won', hours=-24 * 20, manifest_source=Auction.MANIFEST_SOURCE_AUTO, has_manifest=True)
        WatchlistEntry.objects.create(auction=kept)  # status 'watching': nothing sets won yet
        Outcome.objects.create(auction=won, win=True)  # a recorded win without a watchlist entry
        for a in (old, kept, won):
            ManifestRow.objects.create(auction=a, row_number=1)
        with patch.object(manifest_pull, 'recompute_auction_valuation') as value:
            call_command('pull_shortlist_manifests', stdout=StringIO())
        old.refresh_from_db()
        self.assertEqual((old.manifest_rows.count(), old.manifest_source), (0, ''))
        self.assertEqual(kept.manifest_rows.count(), 1)
        self.assertEqual(won.manifest_rows.count(), 1)
        self.assertEqual(value.call_count, 1)


class ApiTests(TestCase):
    def setUp(self):
        self.owner = _owner()
        admin, _ = Group.objects.get_or_create(name='Admin')
        self.admin = User.objects.create_user('admin@x.test', 'Ad', 'Min', password='x')
        self.admin.groups.add(admin)
        self.client = APIClient()

    def test_superuser_only(self):
        self.client.force_authenticate(self.admin)
        for method, url in (
            ('get', '/api/buying/bstock-login/'),
            ('post', '/api/buying/bstock-login/'),
            ('delete', '/api/buying/bstock-login/'),
            ('get', '/api/buying/manifest-pulls/'),
            ('post', '/api/buying/manifest-pulls/'),
            ('delete', '/api/buying/manifest-pulls/'),
        ):
            with self.subTest(method=method, url=url):
                self.assertEqual(getattr(self.client, method)(url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/buying/manifest-pulls/').status_code, 401)

    def test_login_pull_stop_disconnect(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post('/api/buying/manifest-pulls/').status_code, 409)
        res = self.client.post('/api/buying/bstock-login/', {'token': _jwt(timedelta(minutes=50))}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['connected'])
        self.assertNotIn('eyJ', json.dumps(res.data))
        with patch.object(manifest_pull, '_start_thread') as start, self.captureOnCommitCallbacks(execute=True):
            res = self.client.post('/api/buying/manifest-pulls/')
        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.data['job']['status'], ManifestPullJob.STATUS_QUEUED)
        self.assertFalse(res.data['job']['stalled'])
        start.assert_called_once_with(res.data['job']['id'])
        res = self.client.delete('/api/buying/manifest-pulls/')
        self.assertEqual(res.data['job']['status'], ManifestPullJob.STATUS_STOPPED)
        res = self.client.delete('/api/buying/bstock-login/')
        self.assertFalse(res.data['connected'])
        self.assertEqual(BStockToken.objects.count(), 0)

    def test_disconnect_stops_a_running_pull(self):
        self.client.force_authenticate(self.owner)
        save_token(_jwt(timedelta(minutes=50)))
        job = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_RUNNING, heartbeat_at=timezone.now())
        self.client.delete('/api/buying/bstock-login/')
        job.refresh_from_db()
        self.assertEqual((job.status, job.error), (ManifestPullJob.STATUS_STOPPED, manifest_pull.STOPPED_DISCONNECTED))

    def test_get_a_given_job_and_reject_bad_input(self):
        self.client.force_authenticate(self.owner)
        older = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_DONE)
        ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_DONE)
        self.assertEqual(self.client.get(f'/api/buying/manifest-pulls/?job={older.pk}').data['job']['id'], older.pk)
        self.assertEqual(self.client.get('/api/buying/manifest-pulls/?job=%C2%B2').status_code, 400)
        self.assertEqual(self.client.post('/api/buying/bstock-login/', [1, 2], format='json').status_code, 400)
        self.assertEqual(
            self.client.post('/api/buying/bstock-login/', {'token': 'nope'}, format='json').status_code, 400
        )


class AuctionManifestStateTests(TestCase):
    def setUp(self):
        self.owner = _owner('o2@x.test')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.mp = Marketplace.objects.create(name='Test M', slug='test-m')
        self.auction = _auction(self.mp, 'u1', manifest_source=Auction.MANIFEST_SOURCE_AUTO, manifest_pull_error='old')

    def test_detail_and_list_expose_manifest_state(self):
        data = self.client.get(f'/api/buying/auctions/{self.auction.pk}/').data
        for key in (
            'manifest_source', 'manifest_pulled_at', 'manifest_pull_attempted_at', 'manifest_pull_error',
            'manifest_pull_blocked',
        ):
            self.assertIn(key, data)
        self.assertTrue(data['manifest_pull_eligible'])
        rows = self.client.get('/api/buying/auctions/').data['results']
        row = next(r for r in rows if r['id'] == self.auction.pk)
        self.assertEqual((row['manifest_source'], row['manifest_pull_error']), ('auto', 'old'))

    def test_csv_upload_takes_over_and_delete_clears(self):
        cols = ['Brand', 'Category', 'Item Description', 'Qty', 'Unit Retail']
        ManifestTemplate.objects.create(
            marketplace=self.mp,
            header_signature=compute_header_signature(cols),
            display_name='t',
            column_map={
                'title': ['Item Description'],
                'brand': ['Brand'],
                'quantity': ['Qty'],
                'retail_value': ['Unit Retail'],
            },
            category_fields=['Category'],
            category_field_transforms={},
            is_reviewed=True,
        )
        Auction.objects.filter(pk=self.auction.pk).update(manifest_pull_blocked=True)
        csv_bytes = b'Brand,Category,Item Description,Qty,Unit Retail\nAcme,TOYS,Robot,1,12.00\n'
        with self.settings(ANTHROPIC_API_KEY='', GOOGLE_API_KEY='', GEMINI_API_KEY='', XAI_API_KEY=''):
            body, code = process_manifest_upload(self.auction, csv_bytes, 'm.csv')
        self.assertEqual(code, 200, body)
        self.auction.refresh_from_db()
        self.assertEqual((self.auction.manifest_source, self.auction.manifest_pull_error), ('manual', ''))
        self.assertFalse(self.auction.manifest_pull_blocked)
        Auction.objects.filter(pk=self.auction.pk).update(
            manifest_pull_attempted_at=timezone.now(), manifest_pull_blocked=True
        )
        self.assertEqual(self.client.delete(f'/api/buying/auctions/{self.auction.pk}/manifest/').status_code, 204)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.manifest_source, '')
        self.assertIsNone(self.auction.manifest_pull_attempted_at)
        self.assertFalse(self.auction.manifest_pull_blocked)

    def test_list_retail_is_not_multiplied_by_votes(self):
        ManifestRow.objects.create(auction=self.auction, row_number=1, quantity=2, retail_value=Decimal('10'))
        for n in range(3):
            voter = User.objects.create_user(f'v{n}@x.test', 'V', str(n), password='x')
            AuctionThumbsVote.objects.create(auction=self.auction, user=voter)
        row = annotate_auction_list_extras(Auction.objects.filter(pk=self.auction.pk)).get()
        self.assertEqual(row.retail_sort, Decimal('20'))
        self.assertEqual(row.thumbs_up_count, 3)
        self.assertEqual(row._manifest_row_count, 1)

    def test_sweep_insert_and_update_still_work(self):
        now = timezone.now()
        listing = {'listingId': 'L-new', 'title': 'New lot', 'lotId': 'lot-new'}
        inserted, updated, skipped, errors, ids = upsert_listings_raw(self.mp.pk, 'sf', [listing], now)
        self.assertEqual((inserted, errors), (1, 0))
        inserted, updated, skipped, errors, ids = upsert_listings_raw(self.mp.pk, 'sf', [listing], now)
        self.assertEqual((updated, errors), (1, 0))
        created = Auction.objects.get(pk=ids[0])
        self.assertEqual((created.manifest_source, created.manifest_pull_blocked), ('', False))

    def test_sweep_records_price_history_only_when_it_moves(self):
        from apps.buying.models import AuctionSnapshot

        now = timezone.now()
        listing = {'listingId': 'L-px', 'title': 'Priced lot', 'lotId': 'lot-px', 'currentPrice': 100, 'bidCount': 1}
        _, _, _, _, ids = upsert_listings_raw(self.mp.pk, 'sf', [listing], now)
        upsert_listings_raw(self.mp.pk, 'sf', [listing], now)
        self.assertEqual(AuctionSnapshot.objects.filter(auction_id=ids[0]).count(), 1)
        upsert_listings_raw(self.mp.pk, 'sf', [{**listing, 'currentPrice': 150, 'bidCount': 2}], now)
        self.assertEqual(AuctionSnapshot.objects.filter(auction_id=ids[0]).count(), 2)

    def test_renormalize_reads_api_rows_as_cents_and_revalues(self):
        row = ManifestRow.objects.create(
            auction=self.auction, row_number=1, raw_data=_api_row(1), retail_value=Decimal('999')
        )
        with patch('apps.buying.services.valuation.recompute_auction_valuation') as value:
            call_command('renormalize_manifest_rows', stdout=StringIO())
        row.refresh_from_db()
        self.assertEqual(row.retail_value, Decimal('9.99'))
        value.assert_called_once()

    def test_category_stats_stamp_computed_at(self):
        CategoryStats.objects.update(computed_at=timezone.now() - timedelta(days=100))
        upsert_category_stats_from_sql(since=timezone.now() - timedelta(days=90))
        oldest = CategoryStats.objects.order_by('computed_at').first()
        self.assertGreater(oldest.computed_at, timezone.now() - timedelta(minutes=1))


class BstockPullRoutineTests(TestCase):
    def setUp(self):
        self.owner = _owner('o3@x.test')
        self.routine = Routine.objects.get(kind=Routine.KIND_BSTOCK_PULL)
        self.routine.assigned_users.set([self.owner])

    def _blockers(self, responses, submitter=None):
        submitter = submitter or self.owner
        return submit_blockers(self.routine, merge_incoming(self.routine, None, responses), submitter_id=submitter.pk)

    def test_seed_is_an_ordinary_owner_routine(self):
        self.assertFalse(self.routine.system_key)
        self.assertEqual(self.routine.expire_rule, Routine.EXPIRE_END_OF_DAY)
        self.assertIsNotNone(self.routine.due_time)

    def test_responses_are_cleaned(self):
        cleaned = merge_incoming(
            self.routine, None,
            {'job_id': True, 'job_status': 'nonsense', 'earlier_job_ids': [3, 'x', False, 4], 'nothing_to_pull': 'yes'},
        )
        self.assertEqual(
            cleaned,
            {'job_id': None, 'job_status': None, 'earlier_job_ids': [3, 4], 'nothing_to_pull': False},
        )

    def test_blockers(self):
        _auction(_target(), 'needs-one')
        self.assertEqual(self._blockers({}), ["Pull today's manifests first."])
        job = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_RUNNING)
        self.assertEqual(self._blockers({'job_id': job.pk}), ['Wait for the pull to finish.'])
        job.status, job.error = ManifestPullJob.STATUS_FAILED, 'refused'
        job.save()
        self.assertEqual(self._blockers({'job_id': job.pk}), ['refused'])
        for status in (ManifestPullJob.STATUS_DONE, ManifestPullJob.STATUS_STOPPED):
            job.status = status
            job.save()
            self.assertEqual(self._blockers({'job_id': job.pk}), [])
        self.assertEqual(outcome(self.routine, {'job_id': job.pk}), (0, False))

    def test_a_quiet_day_needs_no_pull(self):
        self.assertEqual(self._blockers({}), [])
        failed = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_FAILED, error='x')
        self.assertEqual(self._blockers({'job_id': failed.pk}), [])

    def test_only_a_superuser_can_submit(self):
        staff = User.objects.create_user('s@x.test', 'S', 'T', password='x')
        self.assertEqual(self._blockers({}, submitter=staff), ['Only the owner can submit the B-Stock pull.'])

    def test_runs_only_for_superusers(self):
        staff = User.objects.create_user('s2@x.test', 'S', 'T', password='x')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.routine.assigned_users.add(staff)
        day = timezone.localdate()
        materialize_routines(day)
        owners = set(RoutineRun.objects.filter(routine=self.routine, period_key=day.isoformat())
                     .values_list('assigned_to_id', flat=True))
        self.assertEqual(owners, {self.owner.pk})

    def test_run_round_trip_and_left_out_of_retail_qa(self):
        day = timezone.localdate()
        materialize_routines(day)
        run = RoutineRun.objects.get(routine=self.routine, assigned_to=self.owner, period_key=day.isoformat())
        client = APIClient()
        client.force_authenticate(self.owner)
        mine = client.get('/api/routines/runs/mine/').json()
        listed = [row['id'] for group in mine.values() if isinstance(group, list) for row in group]
        self.assertIn(run.pk, listed)
        created = client.post('/api/routines/submissions/', {'routine': self.routine.pk, 'run': run.pk}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        _auction(_target(), 'needs-one')
        blocked = client.post(
            f'/api/routines/submissions/{created.data["id"]}/submit/',
            {'responses': created.data['responses']},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)
        job = ManifestPullJob.objects.create(status=ManifestPullJob.STATUS_DONE)
        saved = client.patch(
            f'/api/routines/submissions/{created.data["id"]}/',
            {'responses': {'job_id': job.pk, 'job_status': 'done'}},
            format='json',
        )
        self.assertEqual(saved.data['responses']['job_id'], job.pk)
        done = client.post(
            f'/api/routines/submissions/{created.data["id"]}/submit/',
            {'responses': {'job_id': job.pk, 'job_status': 'done'}},
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        run.refresh_from_db()
        self.assertEqual(run.status, RoutineRun.STATUS_DONE)
        self.assertEqual(run.submission.failed_count, 0)
        # Not floor work: out of the Retail QA week list and the dashboard's retail counts.
        qa = client.get(f'/api/routines/qa/routines/?date={day.isoformat()}').data
        self.assertNotIn(run.pk, [row['id'] for row in qa['routines']])
        by_day = _retail_submissions_by_day(day - timedelta(days=1), day + timedelta(days=1))
        self.assertNotIn(run.pk, [pk for bucket in by_day.values() for pk in bucket['audit_ids']])
