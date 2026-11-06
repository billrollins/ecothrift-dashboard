"""Dash #78: AI routing. No AI in the estimate; Spark for volume; Opus 5.5 medium for the monthly miss review."""

from __future__ import annotations

import importlib
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.apps import apps as django_apps
from django.test import TestCase
from django.utils import timezone

from apps.buying.models import Auction, Marketplace, MissReview, RecoveryFit
from apps.buying.services import estimate_profit as ep
from apps.buying.services import miss_review as mr
from apps.buying.tests.test_recovery_fit import _fit_row
from apps.core.models import AiAction, AiModel


def _no_ai(*args, **kwargs):
    raise AssertionError('the fast path called the AI router')


class FastPathTests(TestCase):
    def test_estimate_profit_and_the_lightweight_valuation_never_call_the_ai(self):
        mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        auction = Auction.objects.create(
            marketplace=mp, external_id='ai1', url='https://bstock.com/buy/listings/details/ai1', title='x',
            total_retail_value=Decimal('50000'), current_price=Decimal('5000'),
            end_time=timezone.make_aware(datetime(2099, 1, 1)), pallet_count=20,
        )
        _fit_row()
        from apps.buying.services.valuation import recompute_active_auctions_lightweight

        # Every provider call goes through these three: patching them catches any import style.
        with patch('apps.core.services.llm_router._anthropic_complete', side_effect=_no_ai), \
                patch('apps.core.services.llm_router._openai_compatible_complete', side_effect=_no_ai), \
                patch('apps.core.services.llm_router._google_complete', side_effect=_no_ai):
            r = ep.build_estimate(auction=auction, freight=1000.0)
            ep.build_estimate(auction=auction, lines=[ep.Line('TOYS', 1, 100, 'Doll')], manifest_source='your CSV')
            recompute_active_auctions_lightweight()
        self.assertTrue(r['supported'])


class RoutingMigrationTests(TestCase):
    def _run(self):
        mod = importlib.import_module('apps.buying.migrations.0042_ai_routing')
        mod.forward(django_apps, None)

    def test_volume_purposes_go_to_spark_low_only_when_unpicked_and_the_review_to_opus_medium(self):
        spark = AiModel.objects.update_or_create(slug='muse-spark-1.3-contributor', defaults={'status': 'active'})[0]
        opus = AiModel.objects.update_or_create(slug='claude-opus-5-5', defaults={'status': 'active'})[0]
        gem = AiModel.objects.update_or_create(slug='gemini-3.8-flash', defaults={'status': 'active'})[0]
        AiAction.objects.filter(purpose__in=['KEY_MAPPING', 'CATEGORY_AI', 'TITLE_CATEGORY_ESTIMATE',
                                             'BUYING_MISS_REVIEW']).delete()
        AiAction.objects.create(purpose='CATEGORY_AI', label='x', model=gem, effort='high')  # someone picked it
        self._run()
        km = AiAction.objects.get(purpose='KEY_MAPPING')
        self.assertEqual((km.model_id, km.effort), (spark.pk, 'low'))
        self.assertIn('volume: Spark', km.label)
        kept = AiAction.objects.get(purpose='CATEGORY_AI')
        self.assertEqual((kept.model_id, kept.effort), (gem.pk, 'high'))
        review = AiAction.objects.get(purpose='BUYING_MISS_REVIEW')
        self.assertEqual((review.model_id, review.effort), (opus.pk, 'medium'))


class MissReviewTests(TestCase):
    def _tool_reply(self, **kw):
        return ({'review': 'Target runs even; too thin to split bedding.', 'proposals': [
            {'seller': 'target', 'category': 'whole truck', 'rate_now': 0.28, 'proposed': 0.27, 'why': 'x', 'trucks': [999]},
        ] * 7}, 'claude-opus-5-5')

    def test_no_fit_no_review(self):
        self.assertFalse(mr.status()['due'])
        self.assertIsNone(mr.run())

    def test_due_with_something_new_then_stored_as_advice_and_waits_28_days(self):
        _fit_row()
        st = mr.status()
        self.assertTrue(st['due'])
        self.assertIn('target: 1 new truck', st['why'])
        with patch('apps.core.services.llm_router.llm_chat_tool_input', side_effect=self._tool_reply) as call:
            review = mr.run()
        self.assertEqual(call.call_args.kwargs['purpose'], 'BUYING_MISS_REVIEW')
        prompt = call.call_args.kwargs['user']
        self.assertIn('"miss_points":-2.0', prompt)
        self.assertEqual(review.error, '')
        self.assertEqual(len(review.proposals), mr.MAX_PROPOSALS)  # capped at 5
        self.assertEqual(review.seen['target']['trucks'], [999])
        # A fit never changes from a review: rates stay what the trucks say.
        self.assertEqual(RecoveryFit.objects.get().sellers['target']['rates']['whole']['likely'], 0.28)
        self.assertIn('Next review on or after', mr.status()['why'])
        self.assertIsNone(mr.run())

    def test_after_28_days_nothing_new_means_no_call(self):
        _fit_row()
        with patch('apps.core.services.llm_router.llm_chat_tool_input', side_effect=self._tool_reply):
            first = mr.run()
        MissReview.objects.filter(pk=first.pk).update(created_at=timezone.now() - timedelta(days=30))
        st = mr.status()
        self.assertFalse(st['due'])
        self.assertIn('Waiting for something new', st['why'])

    def test_a_failed_call_is_stored_and_tried_again_the_next_night(self):
        _fit_row()
        with patch('apps.core.services.llm_router.llm_chat_tool_input', side_effect=RuntimeError('overloaded')):
            failed = mr.run()
        self.assertIn('overloaded', failed.error)
        self.assertTrue(mr.status()['due'])
        payload = mr.payload()
        self.assertIsNone(payload['review'])
        self.assertIn('Due with the next nightly run', payload['next'])

    def test_scores_endpoint_carries_the_latest_review(self):
        from django.contrib.auth.models import Group
        from rest_framework.test import APIClient

        from apps.accounts.models import User

        _fit_row()
        with patch('apps.core.services.llm_router.llm_chat_tool_input', side_effect=self._tool_reply):
            mr.run()
        user = User.objects.create_user('buyer78@example.com', 'T', 'U', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        client = APIClient()
        client.force_authenticate(user)
        data = client.get('/api/buying/estimate-scores/?seller=target').json()
        self.assertIn('too thin', data['review']['review']['text'])
        self.assertEqual(data['review']['review']['model'], 'claude-opus-5-5')
