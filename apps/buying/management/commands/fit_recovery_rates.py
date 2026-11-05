"""Fit 90-day recovery rates per seller and seller category, scored blind (Dash #77). Runs nightly too."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services.recovery_fit import fit_all, save_fit


class Command(BaseCommand):
    help = (
        'Fit 90-day recovery rates (sold within 90 days of a truck\'s first sale / its manifest retail) per '
        'seller and seller category, with a blind leave-one-truck-out score, and store it as the newest '
        'RecoveryFit (Estimate Profit reads it). Also runs at the end of compute_daily_category_stats.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Print the fit; store nothing.')

    def handle(self, *args, **options):
        sellers = fit_all() if options['dry_run'] else save_fit().sellers
        for slug, block in sellers.items():
            if block.get('status') != 'ok':
                self.stdout.write(f"{slug:10} not yet: {block.get('scored_trucks', 0)} scored trucks")
                continue
            sm = block['summary']
            w = block['rates']['whole']
            prev = block.get('previous')
            then = (f"; last fit {prev['median_miss_then']:.1f} on the same {prev['trucks']}" if prev else '')
            self.stdout.write(
                f"{slug:10} {sm['trucks']} trucks, whole {w['likely']:.1%} ({w['low']:.1%}-{w['high']:.1%}), "
                f"{len(block['rates']['categories'])} own-rate categories; blind median {sm['median_miss']:.1f} pts, "
                f"within 4 on {sm['within_4']}, worst {sm['worst_miss']:.1f}, mean {sm['mean_signed']:+.1f}{then}"
            )
        if options['dry_run']:
            self.stdout.write('dry run: nothing stored.')
