"""The Rewards Balance as lots with use-by dates, soonest first (owner, 2026-10-09; form 5)."""
from datetime import date, datetime, timezone as dt_tz
from decimal import Decimal as D
from unittest import mock

from django.test import TestCase

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services import ledger


def _at(day):
    return mock.patch('django.utils.timezone.now', return_value=datetime(day.year, day.month, day.day, 18, tzinfo=dt_tz.utc))


class RewardLotsTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create()

    def _bank(self, amount, day, **extra):
        with _at(day):
            return LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D(amount),
                                              reason=extra.pop('reason', 'sale'), **extra)

    def test_lots_come_soonest_first_spends_take_the_soonest_and_a_return_takes_its_own(self):
        first = self._bank('5.00', date(2026, 10, 1))
        self._bank('3.00', date(2026, 10, 5))
        third = self._bank('4.00', date(2026, 10, 8))
        self._bank('-2.00', date(2026, 10, 9), reason='spend')
        self._bank('-4.00', date(2026, 10, 9), reason='return', reverses=third)
        lots = ledger.reward_lots(self.account, on=date(2026, 10, 9))
        self.assertEqual([(l['amount'], l['use_by']) for l in lots], [('3.00', '2026-10-31'), ('3.00', '2026-11-04')])
        self.assertFalse(lots[0]['past_due'])
        self.assertTrue(ledger.reward_lots(self.account, on=date(2026, 11, 2))[0]['past_due'])
        self.assertEqual(first.amount, D('5.00'))
