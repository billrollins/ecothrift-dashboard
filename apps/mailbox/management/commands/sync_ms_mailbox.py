from django.core.management.base import BaseCommand, CommandError

from apps.mailbox.auth import GraphConfigurationError, graph_enabled
from apps.mailbox.graph import GraphMailError
from apps.mailbox.services import sync_mailbox


class Command(BaseCommand):
    help = 'Synchronize the Microsoft 365 inbox into MailMessage records.'

    def handle(self, *args, **options):
        # The 10-minute mail tick also sends hiring's day-before interview reminders (no Scheduler job of its own).
        try:
            from apps.hiring.interviews import send_due_reminders

            reminded = send_due_reminders()
            if reminded:
                self.stdout.write(f'Interview reminders sent: {reminded}')
        except Exception as exc:  # noqa: BLE001 - never let reminders break the mailbox sync
            self.stderr.write(f'Interview reminders failed: {exc}')
        # ...and the day-before first-day reminder texts (held until texting is live).
        try:
            from apps.hiring.texts import send_due_first_day

            first_days = send_due_first_day()
            if first_days:
                self.stdout.write(f'First-day reminder texts: {first_days}')
        except Exception as exc:  # noqa: BLE001
            self.stderr.write(f'First-day reminder texts failed: {exc}')
        if not graph_enabled():
            self.stdout.write(self.style.WARNING('MS_GRAPH_ENABLED=false; sync skipped.'))
            return
        try:
            result = sync_mailbox()
        except (GraphConfigurationError, GraphMailError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f'Sync complete: {result["created"]} created, '
                f'{result["updated"]} updated, {result["skipped"]} skipped.',
            ),
        )
