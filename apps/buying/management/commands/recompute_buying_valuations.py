"""Management command: recompute Phase 5 auction valuations."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services.valuation import recompute_all_open_auctions


class Command(BaseCommand):
    help = (
        "Recompute stored valuation fields for all open/closing auctions. "
        "Run after seed_pricing_rules or when PricingRule / inventory need data changes. "
        "(seed_pricing_rules does not auto-recompute; use this command or rely on manifest/AI hooks.)"
    )

    def handle(self, *args, **options) -> None:
        n = recompute_all_open_auctions()
        self.stdout.write(self.style.SUCCESS(f"Recomputed {n} auctions."))
