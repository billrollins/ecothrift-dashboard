"""Management command: AI category mix from titles (Tier 1)."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.buying.models import Auction
from apps.buying.services.ai_title_category_estimate import estimate_batch


class Command(BaseCommand):
    help = (
        "Run Claude (AI_MODEL_FAST) title category estimates for auction PKs, "
        "or --missing-both for open/closing auctions without AI or manifest mix."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "auction_ids",
            nargs="*",
            type=int,
            help="Auction primary keys (space-separated).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max auctions to process (default 50, or 500 with --missing-both).",
        )
        parser.add_argument(
            "--missing-both",
            action="store_true",
            help=(
                "Target open/closing, non-archived auctions that have neither "
                "ai_category_estimates nor manifest_category_distribution."
            ),
        )

    def handle(self, *args, **options) -> None:
        raw_ids = options["auction_ids"] or []
        missing_both = options["missing_both"]
        lim = options["limit"]
        if lim is None:
            lim = 500 if missing_both else 50

        if raw_ids:
            ids = raw_ids[:lim]
        elif missing_both:
            ids = list(
                Auction.objects.filter(
                    status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
                    archived_at__isnull=True,
                )
                .filter(
                    Q(ai_category_estimates__isnull=True) | Q(ai_category_estimates={})
                )
                .filter(
                    Q(manifest_category_distribution__isnull=True)
                    | Q(manifest_category_distribution={})
                )
                .order_by("marketplace_id", "pk")
                .values_list("pk", flat=True)[:lim]
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    "No auction ids provided. Pass PKs or use --missing-both."
                )
            )
            return

        if not ids:
            self.stdout.write(self.style.WARNING("No auctions matched."))
            return

        result = estimate_batch(ids)
        self.stdout.write(str(result))
