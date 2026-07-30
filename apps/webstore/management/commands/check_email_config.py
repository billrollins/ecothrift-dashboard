"""Print Online Sales email settings; optionally send a test message."""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.webstore.emails import send_sign_in_link


class Command(BaseCommand):
    help = 'Validate Online Sales email settings; optional --to sends one test message.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--to',
            default='',
            help='If set, send one test message to this address (uses current EMAIL_BACKEND).',
        )

    def handle(self, *args, **options):
        backend = getattr(settings, 'EMAIL_BACKEND', '')
        from_addr = getattr(settings, 'ONLINE_SALES_EMAIL_FROM', '')
        display = getattr(settings, 'ONLINE_SALES_EMAIL_DISPLAY_NAME', '')
        reply = getattr(settings, 'ONLINE_SALES_EMAIL_REPLY_TO', '')
        public_base = getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '')
        formatted_from = f'{display} <{from_addr}>' if display and from_addr else from_addr

        self.stdout.write('Online Sales email config')
        self.stdout.write(f'  EMAIL_BACKEND: {backend}')
        self.stdout.write(f'  ONLINE_SALES_EMAIL_FROM: {from_addr}')
        self.stdout.write(f'  ONLINE_SALES_EMAIL_DISPLAY_NAME: {display}')
        self.stdout.write(f'  ONLINE_SALES_EMAIL_REPLY_TO: {reply}')
        self.stdout.write(f'  ONLINE_SALES_PUBLIC_BASE_URL: {public_base}')
        self.stdout.write(f'  Effective From: {formatted_from}')
        self.stdout.write(f'  Effective Reply-To: {reply}')

        errors = []
        if not from_addr:
            errors.append('ONLINE_SALES_EMAIL_FROM is empty')
        if not display:
            errors.append('ONLINE_SALES_EMAIL_DISPLAY_NAME is empty')
        if not reply:
            errors.append('ONLINE_SALES_EMAIL_REPLY_TO is empty')
        if not backend:
            errors.append('EMAIL_BACKEND is empty')

        if errors:
            for err in errors:
                self.stderr.write(self.style.ERROR(err))
            raise CommandError('Email config incomplete.')

        self.stdout.write(self.style.SUCCESS('Config looks set.'))

        to = (options.get('to') or '').strip()
        if not to:
            self.stdout.write('No --to given; skipped send.')
            return

        ok = send_sign_in_link(
            email=to,
            magic_link=f'{public_base.rstrip("/")}/account/sign-in?test=1',
        )
        if ok:
            self.stdout.write(self.style.SUCCESS(f'Test message accepted by backend for {to}.'))
        else:
            raise CommandError(f'Test message failed for {to} (see logs).')
