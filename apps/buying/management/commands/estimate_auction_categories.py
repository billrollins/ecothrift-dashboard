"""Management command: AI category mix from titles (Tier 1)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services.ai_title_category_estimate import estimate_batch


class Command(BaseCommand):
    help = "Run Claude (AI_MODEL_FAST) title category estimates for auction PKs."

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
            default=50,
            help="Max auctions to process (default 50).",
        )

    def handle(self, *args, **options) -> None:
        raw_ids = options["auction_ids"] or []
        lim = options["limit"]
        ids = raw_ids[:lim] if raw_ids else []
        if not ids:
            self.stdout.write(self.style.WARNING("No auction ids provided."))
            return
        result = estimate_batch(ids)
        self.stdout.write(str(result))
