"""Create or regenerate listing photo slots (main / grid / thumb).

Usage:
    python manage.py backfill_listing_image_variants
    python manage.py backfill_listing_image_variants --listing 12
    python manage.py backfill_listing_image_variants --regenerate
    python manage.py backfill_listing_image_variants --dry-run
"""

from django.core.management.base import BaseCommand

from apps.webstore.models import WebListingImage
from apps.webstore.services.listing_photos import SLOTS, backfill_listing_image


class Command(BaseCommand):
    help = 'Create missing listing photo slots; --regenerate rebuilds every slot.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--listing',
            type=int,
            default=None,
            help='Only backfill images on this listing id.',
        )
        parser.add_argument(
            '--regenerate',
            action='store_true',
            help='Rebuild every slot (letterbox defaults, keep staff frames).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count images that would be processed.',
        )

    def handle(self, *args, **options):
        qs = (
            WebListingImage.objects.select_related('s3_file')
            .prefetch_related('variants')
            .order_by('id')
        )
        listing_id = options.get('listing')
        if listing_id:
            qs = qs.filter(listing_id=listing_id)
        regenerate = options['regenerate']
        to_run = []
        for image in qs:
            slots = {v.slot: v for v in image.variants.all()}
            missing = any(slot not in slots for slot in SLOTS)
            if missing or regenerate:
                to_run.append(image)
        if options['dry_run']:
            self.stdout.write(f'Would backfill {len(to_run)} listing image(s).')
            return
        done = 0
        skipped = 0
        for image in to_run:
            result = backfill_listing_image(image, regenerate=regenerate)
            if result is None:
                skipped += 1
            else:
                done += 1
        self.stdout.write(f'Backfilled {done} listing image(s); skipped {skipped}.')
