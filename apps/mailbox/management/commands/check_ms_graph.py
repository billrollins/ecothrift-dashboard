"""Validate Microsoft Graph auth/mailbox access; optionally send a test."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.mailbox.auth import GraphConfigurationError, graph_enabled, graph_settings
from apps.mailbox.graph import GraphMailClient, GraphMailError


class Command(BaseCommand):
    help = 'Validate Microsoft Graph auth and mailbox access; optional --to sends a test.'

    def add_arguments(self, parser):
        parser.add_argument('--to', default='', help='Optional recipient for a Graph test message.')

    def handle(self, *args, **options):
        self.stdout.write('Microsoft Graph mail config')
        self.stdout.write(f'  MS_GRAPH_ENABLED: {graph_enabled()}')
        self.stdout.write(f'  MS_GRAPH_MAILBOX: {getattr(settings, "MS_GRAPH_MAILBOX", "")}')
        if not graph_enabled():
            self.stdout.write(self.style.WARNING('Graph is disabled; skipped auth and send checks.'))
            return
        try:
            values = graph_settings()
            client = GraphMailClient(mailbox=values['mailbox'])
            mailbox = client.check_mailbox()
            self.stdout.write(
                self.style.SUCCESS(
                    f'Auth and mailbox access OK: '
                    f'{mailbox.get("mail") or mailbox.get("userPrincipalName") or values["mailbox"]}',
                ),
            )
            recipient = str(options.get('to') or '').strip()
            if recipient:
                client.send_mail(
                    subject='Eco-Thrift Microsoft Graph test',
                    body='Microsoft Graph mail is configured correctly.',
                    to=[recipient],
                )
                self.stdout.write(self.style.SUCCESS(f'Test message accepted for {recipient}.'))
            else:
                self.stdout.write('No --to given; skipped send.')
        except (GraphConfigurationError, GraphMailError) as exc:
            raise CommandError(str(exc)) from exc
