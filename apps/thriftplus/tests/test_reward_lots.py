"""Kept ThriftBucks as lots (B5, the 10-12 policy): usable from the day after the sale through day 30, spent soonest
use-by first, then expired by the nightly run (expired ThriftBucks are Thrift+ income, F4)."""
from datetime import date, datetime, timezone as dt_tz
from decimal import Decimal as D
from unittest import mock

from django.test import TestCase

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services import ledger, overview


def _at(day):
    return mock.patch('django.utils.timezone.now', return_value=datetime(day.year, day.month, day.day, 18, tzinfo=dt_tz.utc))


class RewardLotsTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create()

    def _row(self, amount, day, reason='sale', **extra):
        with _at(day):
            return LedgerEntry.objects.create(account=self.account, kind=LedgerEntry.KIND_BANK, amount=D(amount),
                                              reason=reason, **extra)

    def test_a_lot_is_usable_from_the_next_day_through_day_30(self):
        self._row('35.00', date(2026, 10, 20))  # F3: bought Oct 20, usable Oct 21 to Nov 19
        self.assertEqual(ledger.available_bucks(self.account, date(2026, 10, 20)), D('0.00'))
        self.assertEqual(ledger.available_bucks(self.account, date(2026, 10, 21)), D('35.00'))
        self.assertEqual(ledger.available_bucks(self.account, date(2026, 11, 19)), D('35.00'))
        self.assertEqual(ledger.available_bucks(self.account, date(2026, 11, 20)), D('0.00'))
        self.assertEqual(ledger.bucks_total(self.account, date(2026, 11, 20)), D('0.00'))  # past its date: gone
        lots = ledger.reward_lots(self.account, on=date(2026, 10, 20))
        self.assertEqual([(l['amount'], l['usable_from'], l['use_by'], l['usable']) for l in lots],
                         [('35.00', '2026-10-21', '2026-11-19', False)])
        self.assertEqual(ledger.reward_lots(self.account, on=date(2026, 11, 20)), [])

    def test_spends_take_the_soonest_usable_lot_and_never_an_expired_one(self):
        self._row('5.00', date(2026, 10, 1))   # use by Oct 31
        self._row('3.00', date(2026, 10, 5))   # use by Nov 4
        self._row('4.00', date(2026, 11, 2))   # collected today: not usable yet
        self._row('-2.00', date(2026, 11, 2), reason='spend')
        lots = ledger.reward_lots(self.account, on=date(2026, 11, 2))
        self.assertEqual([(l['amount'], l['use_by']) for l in lots], [('1.00', '2026-11-04'), ('4.00', '2026-12-02')])

    def test_a_return_take_back_takes_unspent_thriftbucks_soonest_first_today_too(self):
        self._row('35.00', date(2026, 10, 20))
        self._row('-28.00', date(2026, 10, 20), reason='return')
        self.assertEqual(ledger.bucks_total(self.account, date(2026, 10, 20)), D('7.00'))

    def test_expiry_writes_one_row_per_lot_past_its_date_and_is_safe_to_run_again(self):
        first = self._row('5.00', date(2026, 10, 1))
        self._row('3.00', date(2026, 10, 5))
        self._row('-1.50', date(2026, 10, 10), reason='spend')
        self.assertEqual(ledger.owed_bucks(date(2026, 11, 1)), D('3.00'))  # what is past its date is not owed
        with _at(date(2026, 11, 1)):  # the nightly run, early on Nov 1
            result = ledger.expire_lots(date(2026, 11, 1))
            again = ledger.expire_lots(date(2026, 11, 1))
        self.assertEqual(result, {'lots': 1, 'amount': '3.50'})
        row = LedgerEntry.objects.get(reason='expire')
        self.assertEqual((row.amount, row.reverses_id), (D('-3.50'), first.pk))
        self.assertEqual(again, {'lots': 0, 'amount': '0.00'})
        self.assertEqual(ledger.balance(self.account, LedgerEntry.KIND_BANK), D('3.00'))
        self.assertEqual(ledger.owed_bucks(date(2026, 11, 1)), D('3.00'))

    def test_the_nightly_run_expires_them_and_the_overview_counts_them_as_income(self):
        from django.utils import timezone

        from apps.thriftplus.services import rewards

        today = timezone.localdate()
        self._row('4.00', today.replace(day=1) if today.day > 1 else today)  # noise: still good
        old = self._row('6.00', date.fromordinal(today.toordinal() - 40))
        run = rewards.recompute()
        self.assertEqual(run.counts.get('bucks_lots_expired'), 1, run.error)
        self.assertTrue(LedgerEntry.objects.filter(reverses=old, reason='expire').exists())
        o = overview.overview()
        self.assertEqual(o['rewards']['expired'], '6.00')
        self.assertNotIn('to_cover', o['rewards'])
