"""The buyer's nags: bid on watched lots ending under the max, and record ended ones."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, Marketplace, Outcome, WatchlistEntry
from apps.buying.services.buying_nags import buying_nags


def _watched(mp, ext, *, minutes, price='100', max_bid=None, target='500', status=WatchlistEntry.STATUS_WATCHING):
    auction = Auction.objects.create(
        marketplace=mp, external_id=ext, title=f'Lot {ext}', status=Auction.STATUS_OPEN,
        end_time=timezone.now() + timedelta(minutes=minutes), current_price=Decimal(price),
        max_bid=Decimal(max_bid) if max_bid else None, price_target=Decimal(target) if target else None,
    )
    WatchlistEntry.objects.create(auction=auction, status=status)
    return auction


class BuyingNagTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]

    def test_ending_soon_under_the_max(self):
        _watched(self.mp, 'soon', minutes=40)
        _watched(self.mp, 'urgent', minutes=10, max_bid='150')
        _watched(self.mp, 'over', minutes=20, price='600')
        _watched(self.mp, 'later', minutes=180)
        _watched(self.mp, 'no-max', minutes=50, target=None)
        Auction.objects.create(marketplace=self.mp, external_id='unwatched', end_time=timezone.now() + timedelta(minutes=5),
                               current_price=Decimal('1'), price_target=Decimal('500'))
        nags = buying_nags()
        self.assertEqual([row['title'] for row in nags['ending']], ['Lot urgent', 'Lot soon', 'Lot no-max'])
        urgent = nags['ending'][0]
        self.assertEqual((urgent['tone'], urgent['max_bid'], urgent['max_is_buyer'], urgent['room']), ('red', '150.00', True, '50.00'))
        self.assertEqual(nags['ending'][1]['tone'], 'amber')
        self.assertIsNone(nags['ending'][2]['room'])
        self.assertEqual(nags['tone'], 'red')

    def test_ended_without_a_result(self):
        _watched(self.mp, 'ended', minutes=-120)
        recorded = _watched(self.mp, 'recorded', minutes=-60)
        Outcome.objects.create(auction=recorded, hammer_price=Decimal('100'), win=False)
        _watched(self.mp, 'lost', minutes=-30, status=WatchlistEntry.STATUS_LOST)
        _watched(self.mp, 'old', minutes=-60 * 24 * 8)
        nags = buying_nags()
        self.assertEqual([row['title'] for row in nags['unrecorded']], ['Lot ended'])
        self.assertEqual((nags['count'], nags['tone']), (1, 'amber'))

    def test_nothing_to_nag(self):
        self.assertEqual(buying_nags(), {'ending': [], 'unrecorded': [], 'count': 0, 'tone': 'none'})


class BuyingNagApiTests(APITestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        _watched(mp, 'soon', minutes=30)

    def test_only_superusers_are_nagged(self):
        boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='T', password='x-pass-123')
        self.client.force_authenticate(boss)
        self.assertEqual(self.client.get('/api/buying/nags/').data['count'], 1)
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/buying/nags/').data['count'], 0)
