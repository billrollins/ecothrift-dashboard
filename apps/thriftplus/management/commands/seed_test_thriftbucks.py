"""Test ThriftBucks on a staff or practice membership (owner 2026-10-10), so the scanner and the register show a
real-looking balance.

    python manage.py seed_test_thriftbucks --account 1

Adds ThriftBucks lots as if collected on earlier sales (the 10-12 policy: usable from the day after the sale through
day 30): one collected yesterday (usable today, use by in 29 days), two from last month (use by tomorrow and in 14
days), and one past its date, which is expired at once (it shows how expiry looks). Run it again to put them back as
they were. Refuses a real customer's membership.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services import ledger, members

NOTE = 'Test ThriftBucks (seed_test_thriftbucks)'
# (amount, days ago it was collected): yesterday's lot, two from last month, and one past its use-by date.
LOTS = [(Decimal('6.40'), 1), (Decimal('4.25'), ledger.REWARD_DAYS - 1), (Decimal('12.80'), ledger.REWARD_DAYS - 14),
        (Decimal('3.10'), ledger.REWARD_DAYS + 2)]


class Command(BaseCommand):
    help = 'Test ThriftBucks lots (yesterday, last month, and one expired) on a staff or practice membership.'

    def add_arguments(self, parser):
        parser.add_argument('--account', type=int, required=True, help='Thrift+ membership number.')

    def handle(self, *args, **opts):
        account = Account.objects.filter(pk=opts['account']).first()
        if account is None:
            raise CommandError('No such membership.')
        if not members.is_tester(account):
            raise CommandError('Only a staff or practice membership gets test ThriftBucks.')
        today = timezone.localdate()
        with transaction.atomic():
            seeded = account.ledger.filter(note=NOTE)
            LedgerEntry.objects.filter(reverses__in=seeded).delete()  # their expiry rows first (they point at them)
            seeded.delete()
            for amount, days_ago in LOTS:
                collected = today - timedelta(days=days_ago)
                entry = ledger.record(account, LedgerEntry.KIND_BANK, amount, 'adjust', note=NOTE)
                at = timezone.make_aware(timezone.datetime(collected.year, collected.month, collected.day, 12))
                LedgerEntry.objects.filter(pk=entry.pk).update(created_at=at)
            for lot in ledger.lots(account):
                if lot.use_by < today and lot.amount > 0 and \
                        account.ledger.filter(pk=lot.id, note=NOTE).exists() and \
                        not LedgerEntry.objects.filter(reverses_id=lot.id).exists():
                    LedgerEntry.objects.create(account=account, kind=LedgerEntry.KIND_BANK, amount=-lot.amount,
                                               reason=ledger.EXPIRE_REASON, reverses_id=lot.id, note=NOTE)
        lots = ledger.reward_lots(account)
        self.stdout.write(f'Membership {account.pk}: ThriftBucks {ledger.bucks_total(account)} '
                          f'(usable today {ledger.available_bucks(account)}); lots '
                          + ', '.join(f'{x["amount"]} use by {x["use_by"]}' for x in lots))
