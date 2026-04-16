"""Seed PricingRule from workspace/data/sell_through_by_category.csv (and default AppSetting factors)."""

from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.models import PricingRule
from apps.core.models import AppSetting


class Command(BaseCommand):
    help = (
        "Load sell-through rates into PricingRule from sell_through_by_category.csv. "
        "Ensures AppSetting keys: pricing_shrinkage_factor, pricing_profit_factor, "
        "pricing_need_window_days."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--input",
            type=str,
            default=None,
            help="Path to sell_through_by_category.csv (default: workspace/data/ under BASE_DIR).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow running when DEBUG is False.",
        )

    def handle(self, *args, **options) -> None:
        force = options["force"]
        if not getattr(settings, "DEBUG", False) and not force:
            raise CommandError(
                "Refusing to seed: DEBUG is False. Run with DEBUG=True or pass --force."
            )

        base = Path(settings.BASE_DIR)
        input_path = (
            Path(options["input"]).resolve()
            if options["input"]
            else base / "workspace" / "data" / "sell_through_by_category.csv"
        )
        if not input_path.is_file():
            raise CommandError(
                f"Input CSV not found: {input_path}. Run scripts/data/build_sell_through_rates.py first."
            )

        self._ensure_global_settings()
        version_date = date.today()
        created = 0
        updated = 0

        with input_path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            required = {
                "canonical_category",
                "sell_through_rate",
                "line_count",
                "avg_retail",
                "avg_sold_price",
            }
            if not required.issubset(set(reader.fieldnames or [])):
                raise CommandError(f"CSV missing columns. Need at least {sorted(required)}.")

            for row in reader:
                cat = (row.get("canonical_category") or "").strip()
                if not cat:
                    continue
                try:
                    rate = Decimal((row.get("sell_through_rate") or "0").strip())
                except InvalidOperation as e:
                    raise CommandError(f"Bad sell_through_rate for {cat!r}") from e
                try:
                    sample = int((row.get("line_count") or "0").strip())
                except ValueError as e:
                    raise CommandError(f"Bad line_count for {cat!r}") from e
                avg_r = self._dec_or_none(row.get("avg_retail"))
                avg_s = self._dec_or_none(row.get("avg_sold_price"))

                _obj, was_created = PricingRule.objects.update_or_create(
                    category=cat,
                    defaults={
                        "sell_through_rate": rate,
                        "avg_retail": avg_r,
                        "avg_sold_price": avg_s,
                        "sample_size": sample,
                        "version_date": version_date,
                        "notes": "",
                    },
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"PricingRule: {created} created, {updated} updated (version_date={version_date}). "
                f"Source: {input_path}"
            )
        )

    def _dec_or_none(self, raw: str | None) -> Decimal | None:
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            return None
        try:
            return Decimal(str(raw).strip())
        except InvalidOperation:
            return None

    def _ensure_global_settings(self) -> None:
        defaults = [
            (
                "pricing_shrinkage_factor",
                0.15,
                "Shrinkage factor applied to estimated revenue (Phase 5 auction valuation).",
            ),
            (
                "pricing_profit_factor",
                2.0,
                "Target profit / cost recovery multiplier for max bid heuristics.",
            ),
            (
                "pricing_need_window_days",
                90,
                "Sold-items window (days) for category need panel and sell-through column.",
            ),
        ]
        for key, value, description in defaults:
            _obj, created = AppSetting.objects.get_or_create(
                key=key,
                defaults={"value": value, "description": description},
            )
            if created:
                self.stdout.write(f"  AppSetting created: {key}={value}")
