"""Shared --database / --no-input handling for inventory management commands."""

from __future__ import annotations

import sys

from django.conf import settings
from django.core.management.base import CommandError


def add_database_argument(parser) -> None:
    parser.add_argument(
        '--database',
        default='default',
        choices=['default', 'production'],
        help='Django database alias to use (default or production).',
    )


def add_no_input_argument(parser) -> None:
    parser.add_argument(
        '--no-input',
        action='store_true',
        help='Non-interactive: skip production confirmation prompt (for scripts).',
    )


def resolve_database_alias(alias: str) -> str:
    if alias == 'production' and 'production' not in settings.DATABASES:
        raise CommandError(
            'Production database is not configured. Set PROD_DATABASE_NAME (and other '
            'PROD_DATABASE_* vars as needed) in your environment.',
        )
    return alias


def confirm_production_write(
    *,
    stdout,
    stderr,
    db_alias: str,
    no_input: bool,
    dry_run: bool = False,
) -> None:
    """Warn before targeting production; skip if --no-input or --dry-run."""
    if db_alias != 'production' or no_input or dry_run:
        return
    stdout.write(
        'WARNING: This will write to the PRODUCTION database. Type "yes" to continue: ',
    )
    stdout.flush()
    line = sys.stdin.readline()
    if (line or '').strip().lower() != 'yes':
        stderr.write('Aborted.\n')
        raise SystemExit(1)
