"""Signed-in-only sellers (Costco): searched with the owner's handed-over login, never anonymously."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from apps.buying.models import Auction, ManifestPullJob, Marketplace
from apps.buying.services import manifest_pull, pipeline, scraper
from apps.buying.services.bstock_token_store import save_token
from apps.buying.tests.test_manifest_pull import _auction, _jwt, _no_page_delay, _target


def _costco() -> Marketplace:
    mp, _ = Marketplace.objects.get_or_create(
        slug='costco', defaults={'name': 'Costco', 'external_id': 'sf-costco', 'is_active': True}
    )
    mp.requires_login = True
    mp.is_active = True
    mp.save()
    return mp


class CostcoMigrationTests(TestCase):
    def test_costco_is_signed_in_only(self):
        mp = Marketplace.objects.filter(slug='costco').first()
        if mp is None:
            self.skipTest('No seeded Costco marketplace in this database.')
        self.assertTrue(mp.requires_login)
        self.assertFalse(Marketplace.objects.filter(requires_login=True).exclude(slug='costco').exists())


class SignedInSearchTests(TestCase):
    def setUp(self):
        self.costco = _costco()

    def test_no_login_skips_the_search(self):
        with patch.object(scraper, '_search_post_paginate') as search:
            batches = scraper.discover_auctions_parallel(marketplace_slug='costco')
        search.assert_not_called()
        self.assertEqual([b.error for b in batches], [scraper.LOGIN_NEEDED_FOR_SEARCH])
        self.assertEqual(batches[0].rows, [])

    def test_a_login_searches_as_the_owner(self):
        with patch.object(scraper, 'login_for_signed_in_sellers', return_value='owner-token'), patch.object(
            scraper, '_search_post_paginate', return_value=([{'listingId': 'L1'}], None, 5.0)
        ) as search:
            batches = scraper.discover_auctions_parallel(marketplace_slug='costco')
        self.assertEqual(search.call_args.kwargs['bearer'], 'owner-token')
        self.assertEqual((len(batches[0].rows), batches[0].error), (1, None))

    def test_anonymous_sellers_never_get_the_login(self):
        target = _target()
        if not (target.external_id or '').strip():
            target.external_id = 'sf-target'
            target.save()
        with patch.object(scraper, 'login_for_signed_in_sellers', return_value='owner-token'), patch.object(
            scraper, '_search_post_paginate', return_value=([], None, 1.0)
        ) as search:
            scraper.discover_auctions_parallel(marketplace_slug='target')
        self.assertIsNone(search.call_args.kwargs['bearer'])

    def test_single_seller_search_needs_the_login_too(self):
        with patch.object(scraper, '_search_post_paginate') as search:
            self.assertEqual(scraper.discover_auctions('costco'), [])
        search.assert_not_called()

    def test_search_pages_go_direct_with_the_login(self):
        kw = dict(page_limit=200, max_pages=1, log_full_first_response=False)
        with patch.object(scraper, '_request_json', return_value={'listings': [], 'total': 0}) as req:
            scraper._search_post_paginate('sf', bearer='owner-token', **kw)
        self.assertEqual((req.call_args.kwargs['bearer'], req.call_args.kwargs['proxies']), ('owner-token', {}))
        with patch.object(scraper, '_request_json', return_value={'listings': [], 'total': 0}) as req:
            scraper._search_post_paginate('sf', **kw)
        self.assertEqual((req.call_args.kwargs['bearer'], req.call_args.kwargs['proxies']), (None, None))
        with patch.object(scraper, '_request_json', side_effect=scraper.BStockAuthError('401')):
            rows, err, _ = scraper._search_post_paginate('sf', bearer='owner-token', **kw)
        self.assertEqual((rows, err), ([], 'B-Stock refused the login for this search.'))


class PullRefreshesSignedInSellersTests(TestCase):
    def setUp(self):
        _no_page_delay()
        self.costco = _costco()
        Marketplace.objects.filter(requires_login=True).exclude(pk=self.costco.pk).update(requires_login=False)
        self.lot = _auction(_target(), 'a1', priority=90)
        patcher = patch.object(manifest_pull, 'map_one_fast_cat_batch', return_value={'error': 'ai_not_configured'})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_refresh_searches_each_signed_in_seller_and_never_raises(self):
        runner = SimpleNamespace(touch=lambda: None)
        with patch.object(pipeline, 'run_discovery', side_effect=RuntimeError('B-Stock down')) as discover:
            manifest_pull._refresh_signed_in_sellers(runner)
        discover.assert_called_once_with('costco')

    def _ok(self, auction, **kwargs):
        return manifest_pull.PullResult(auction_id=auction.pk, ok=True, rows=1)

    def test_first_run_refreshes_before_the_shortlist_and_a_resume_does_not(self):
        save_token(_jwt(timedelta(minutes=50)))
        with patch.object(manifest_pull, '_refresh_signed_in_sellers') as refresh, patch.object(
            manifest_pull, 'pull_manifest_for_auction', side_effect=self._ok
        ):
            job = manifest_pull.run_job(manifest_pull.start_job(background=False).pk)
            self.assertEqual(job.status, ManifestPullJob.STATUS_DONE)
            self.assertEqual(refresh.call_count, 1)

            resumed = ManifestPullJob.objects.create(auction_ids=[self.lot.pk], total=1)
            Auction.objects.filter(pk=self.lot.pk).update(manifest_pull_attempted_at=None, has_manifest=False)
            manifest_pull.run_job(resumed.pk)
            self.assertEqual(refresh.call_count, 1)
