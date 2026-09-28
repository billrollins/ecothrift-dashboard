"""
Stage routine data work for the owner's approval (Superuser → Requests). Nothing is applied.

    python manage.py stage_request inventory.load_profile_proposals \
        --title "Load the Mixed-lots backfill" --params '{"batch": "spark-mixed-2026-09-23"}'
    python manage.py stage_request --list

Run it in production (``heroku run``): the preview is built from production data, and the owner
approves there. Every kind is in ``apps/<app>/approval_kinds.py``.
"""
import json

from django.core.management.base import BaseCommand, CommandError

from apps.core.services.approval_requests import RequestError, kinds, stage


class Command(BaseCommand):
    help = 'Stage a request for the owner to approve on Superuser → Requests. Applies nothing.'

    def add_arguments(self, parser):
        parser.add_argument('kind', nargs='?', default='')
        parser.add_argument('--title', default='')
        parser.add_argument('--summary', default='')
        parser.add_argument('--params', default='{}', help='JSON object for the kind.')
        parser.add_argument('--requested-by', default='claude')
        parser.add_argument('--list', action='store_true', dest='list_kinds', help='List the kinds.')

    def handle(self, *args, kind, title, summary, params, requested_by, list_kinds, **options):
        if list_kinds or not kind:
            for k in kinds():
                self.stdout.write(f'{k.kind:40} {k.label}{"" if k.undo else "  (no undo)"}')
            return
        try:
            parsed = json.loads(params or '{}')
        except json.JSONDecodeError as exc:
            raise CommandError(f'--params is not JSON: {exc}') from exc
        try:
            request = stage(kind, title=title or kind, summary=summary, params=parsed, requested_by=requested_by)
        except RequestError as exc:
            raise CommandError(str(exc)) from exc
        counts = ', '.join(f'{k}: {v:,}' if isinstance(v, int) else f'{k}: {v}' for k, v in (request.preview.get('counts') or {}).items())
        self.stdout.write(self.style.SUCCESS(f'Staged request #{request.pk} ({kind}). {counts}'))
