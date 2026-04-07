"""Save B-Stock JWT to workspace/.bstock_token for the buying scraper."""

from __future__ import annotations

import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


def bstock_token_path() -> Path:
    return Path(settings.BASE_DIR) / 'workspace' / '.bstock_token'


class Command(BaseCommand):
    help = (
        'Save the B-Stock JWT to workspace/.bstock_token (preferred by scraper over '
        'BSTOCK_AUTH_TOKEN). Use --token or paste when prompted / pipe on stdin.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--token',
            type=str,
            default=None,
            help='JWT string. If omitted, reads one line from TTY or full stdin from a pipe.',
        )

    def handle(self, *args, **options):
        raw = options.get('token')
        if raw is None:
            if sys.stdin.isatty():
                self.stdout.write('Paste JWT and press Enter:\n')
                raw = input()
            else:
                raw = sys.stdin.read()

        token = (raw or '').strip()
        if not token:
            raise CommandError('No token provided. Use --token, paste when prompted, or pipe stdin.')

        if token.lower().startswith('bearer '):
            token = token[7:].strip()

        if not token.startswith('eyJ'):
            raise CommandError(
                'Token must look like a JWT (starts with eyJ). '
                'Paste the value from the Authorization header or the bookmarklet.'
            )
        if token.startswith('eyJhbGciOiJSU0EtT0FF'):
            raise CommandError(
                'This looks like a JWE from the elt cookie, not the API JWT. '
                'Use the bookmarklet that reads __NEXT_DATA__.props.pageProps.accessToken, '
                'or copy the Bearer token from DevTools Network.'
            )

        path = bstock_token_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(token + '\n', encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f'Saved token to {path}'))
