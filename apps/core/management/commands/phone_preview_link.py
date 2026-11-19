"""Print a preview link for the phone site (owner only). Opening it on a phone or a computer sets a signed cookie, and
that browser then gets the phone site and the phone scanner for 30 days, whatever the switches say. The link itself can be
opened for a week. ?site=classic on any page goes back.

    python manage.py phone_preview_link
"""
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.middleware import preview_token


class Command(BaseCommand):
    help = 'Print a signed preview link for the phone site.'

    def handle(self, *args, **options):
        host = getattr(settings, 'PUBLIC_SITE_CANONICAL_HOST', '') or 'ecothrift.us'
        self.stdout.write(f'https://{host}/?site=phone&k={preview_token()}')
