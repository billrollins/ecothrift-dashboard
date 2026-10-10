"""Test ThriftBucks on a staff or practice membership (owner 2026-10-10), so the scanner shows a real-looking balance.

    python manage.py seed_test_thriftbucks --account 1

Adds two ThriftBucks lots collected last month (one used by tomorrow, one in 14 days) and brings this month's
cover to $6.50. Run it again to put them back as they were. Refuses a real customer's membership.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services import ledger, members

NOTE = 'Test ThriftBucks (seed_test_thriftbucks)'
# (amount, days until its use-by date): collected REWARD_DAYS minus that many days ago, so last month.
LOTS = [(Decimal('4.25'), 1), (Decimal('12.80'), 14)]
COVER = Decimal('6.50')


class Command(BaseCommand):
    help = 'Test ThriftBucks lots (use by tomorrow and in 14 days) and a $6.50 cover on a staff or practice membership.'

    def add_arguments(self, parser):
        parser.add_argument('--account', type=int, required=True, help='Thrift+ membership number.')

    def handle(self, *args, **opts):
        account = Account.objects.filter(pk=opts['account']).first()
        if account is None:
            raise CommandError('No such membership.')
        if not members.is_tester(account):
            raise CommandError('Only a staff or practice membership gets test ThriftBucks.')
        today = timezone.localdate()
        month = ledger.month_of(today)
        with transaction.atomic():
            account.ledger.filter(note=NOTE).delete()
            for amount, days_left in LOTS:
                collected = today - timedelta(days=ledger.REWARD_DAYS - days_left)
                entry = ledger.record(account, LedgerEntry.KIND_BANK, amount, 'adjust', note=NOTE)
                at = timezone.make_aware(timezone.datetime(collected.year, collected.month, collected.day, 12))
                LedgerEntry.objects.filter(pk=entry.pk).update(created_at=at)
            have = sum((e.amount for e in account.ledger.filter(kind=LedgerEntry.KIND_COVER, month=month)), Decimal('0'))
            if COVER - have:
                ledger.record(account, LedgerEntry.KIND_COVER, COVER - have, 'adjust', note=NOTE)
        lots = ledger.reward_lots(account)
        self.stdout.write(f'Membership {account.pk}: cover {ledger.cover(account)["covered"]} of '
                          f'{ledger.cover(account)["amount"]}; lots ' + ', '.join(f'{x["amount"]} use by {x["use_by"]}' for x in lots))
