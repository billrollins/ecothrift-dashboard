"""ThriftBucks expiring by day (Dash Update #188, owner 2026-11-19): what is still unused, by the day it expires
(the day after the lot's use-by), on real memberships; the ThriftBucks tab shows the next 21 days."""
from datetime import date, datetime, timezone as dt_tz
from decimal import Decimal as D
from unittest import mock

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services import ledger

TODAY = date(2026, 11, 19)


def _at(day):
    return mock.patch('django.utils.timezone.now', return_value=datetime(day.year, day.month, day.day, 18, tzinfo=dt_tz.utc))


def _row(account, amount, day, reason='sale', **extra):
    with _at(day):
        return LedgerEntry.objects.create(account=account, kind=LedgerEntry.KIND_BANK, amount=D(amount), reason=reason, **extra)


def _setup_lots():
    ana, ben = Account.objects.create(), Account.objects.create()
    _row(ana, '10.00', date(2026, 10, 21))                      # use by Nov 20: expires Sat Nov 21
    voided = _row(ana, '5.00', date(2026, 10, 22))
    _row(ana, '-5.00', date(2026, 10, 23), reason='void', reverses=voided)  # its sale voided: nothing left
    _row(ana, '-4.00', date(2026, 11, 1), reason='spend')         # partly spent: 6.00 left of the first lot
    _row(ana, '7.00', date(2026, 11, 10), reason='adjust', use_by=date(2026, 11, 19))  # its own use-by: expires tomorrow
    _row(ana, '3.00', date(2026, 10, 1))                          # past its date (Oct 31), nightly run not in: gone
    _row(ana, '20.00', date(2026, 11, 18))                        # expires Dec 19: past the 21 days, in the total
    _row(ben, '2.00', date(2026, 10, 21))                         # expires Nov 21 too
    practice = Account.objects.create(is_practice=True)
    _row(practice, '50.00', date(2026, 10, 21))                   # a practice membership: never counted


class ExpiringByDayTests(TestCase):
    def test_unused_thriftbucks_by_expiry_day(self):
        _setup_lots()
        got = ledger.expiring_by_day(TODAY)
        self.assertEqual(got['today'], '2026-11-19')
        self.assertEqual(got['days'], 21)
        self.assertEqual(got['rows'], [
            {'day': '2026-11-20', 'amount': '7.00', 'members': 1},
            {'day': '2026-11-21', 'amount': '8.00', 'members': 2},
        ])
        self.assertEqual(got['total'], '35.00')  # 6 + 7 + 20 + 2: the voided, past-date and practice lots left out
        self.assertEqual(got['members'], 2)

    def test_days_limits_the_rows_not_the_total(self):
        _setup_lots()
        got = ledger.expiring_by_day(TODAY, days=1)
        self.assertEqual([r['day'] for r in got['rows']], ['2026-11-20'])
        self.assertEqual(got['total'], '35.00')
        later = ledger.expiring_by_day(TODAY, days=30)
        self.assertEqual(later['rows'][-1], {'day': '2026-12-19', 'amount': '20.00', 'members': 1})

    def test_nothing_unused(self):
        got = ledger.expiring_by_day(TODAY)
        self.assertEqual((got['rows'], got['total'], got['members']), ([], '0.00', 0))


class ExpiringApiTests(APITestCase):
    URL = '/api/thriftplus/rewards/expiring/'

    def test_managers_only(self):
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(self.URL).status_code, 403)

    def test_today_by_day(self):
        _setup_lots()
        self.client.force_authenticate(User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123'))
        with _at(TODAY):
            data = self.client.get(self.URL).data
            self.assertEqual(self.client.get(self.URL, {'days': 'soon'}).status_code, 400)
        self.assertEqual(data['today'], '2026-11-19')
        self.assertEqual([(r['day'], r['amount'], r['members']) for r in data['rows']],
                         [('2026-11-20', '7.00', 1), ('2026-11-21', '8.00', 2)])
        self.assertEqual((data['total'], data['members']), ('35.00', 2))
