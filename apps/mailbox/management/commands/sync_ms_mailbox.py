from django.core.management.base import BaseCommand, CommandError

from apps.mailbox.auth import GraphConfigurationError, graph_enabled
from apps.mailbox.graph import GraphMailError
from apps.mailbox.services import sync_mailbox


class Command(BaseCommand):
    help = 'Synchronize the Microsoft 365 inbox into MailMessage records.'

    def handle(self, *args, **options):
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
