"""Photos for the pieces on the floor now (Dash Update #185). Daily, from materialize_routines.

    python manage.py storefront_stock_photos              # manifest pass, then the web search if it is on
    python manage.py storefront_stock_photos --limit 5    # at most 5 web look-ups (default storefront.stock_photos_daily)
    python manage.py storefront_stock_photos --dry-run    # what it would do; no download, no AI call
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Save the seller's manifest photos of floor pieces (free), then the AI web search when it is on."

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=None,
                            help='at most this many web look-ups (default: the setting)')
        parser.add_argument('--dry-run', action='store_true', help='list what it would do; no download, no AI call')

    def handle(self, *args, **opts):
        from apps.storefront.services import stock_photos as S

        if not opts['dry_run'] and not S.is_on():
            self.stdout.write(f'Stock photos: off ({S.SWITCH_KEY}).')
            return
        done = S.daily(opts['limit'], dry_run=opts['dry_run'], say=self.stdout.write)
        if opts['dry_run']:
            self.stdout.write(
                f"{done['manifest_candidates']} manifest photos to take; "
                + (f"{done['planned']} web look-ups of {done['candidates']} candidates" if done['web'] else 'web search off')
                + f" ({done['sheet']} use a photo sheet, {done['have']} have a stock photo, "
                f"{done['waiting']} wait for their retry date).")
            return
        self.stdout.write(S.summary(done))
        if done['looked_up']:
            self.stdout.write(f"Cost per web look-up: ${done['cost_usd'] / done['looked_up']:.4f}")
