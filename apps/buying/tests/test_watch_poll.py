"""Tests for watch poll merge and closed inference."""

from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.buying.models import Auction
from apps.buying.services.pipeline import (
    apply_closed_inference,
    merge_auction_state_into_fields,
)


class WatchPollMergeTests(TestCase):
    def test_merge_sets_status_from_auction_state(self):
        fields: dict = {
            'status': Auction.STATUS_OPEN,
            'current_price': None,
            'bid_count': None,
            'time_remaining_seconds': None,
            'end_time': None,
        }
        merge_auction_state_into_fields(
            fields,
            {'status': 'closed', 'winningBidAmount': 5000},
        )
        self.assertEqual(fields['status'], Auction.STATUS_CLOSED)

    def test_apply_closed_inference_end_time_in_past(self):
        now = timezone.now()
        fields = {'status': Auction.STATUS_OPEN, 'end_time': now - timedelta(minutes=1)}
        apply_closed_inference(fields, now)
        self.assertEqual(fields['status'], Auction.STATUS_CLOSED)
