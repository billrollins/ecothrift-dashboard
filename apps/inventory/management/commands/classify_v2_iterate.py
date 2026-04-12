"""
Iterative V2 taxonomy classification on CSVs (consultant rule JSON + samples).

Only touches workspace/data/v2_classify/v2_products_*.csv (root). Samples go to
workspace/data/v2_sample/sample_for_review.csv. Does not import to DB.
"""

from __future__ import annotations

import csv
import json
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)

SAMPLE_SEED = 42
SAMPLE_SIZE = 1000
SAMPLE_COLUMNS = ["product_id", "title", "brand", "vendor", "po_category_text"]
SAMPLE_FILENAME = "sample_for_review.csv"
RULE_FIELDS = frozenset({"title", "brand", "vendor", "po_category_text", "any"})
TAXONOMY_SET = frozenset(TAXONOMY_V1_CATEGORY_NAMES)
CSV_GLOB = "v2_products_*.csv"


def _v2_dir() -> Path:
    return Path(settings.BASE_DIR) / "workspace" / "data" / "v2_classify"


def _v2_sample_dir() -> Path:
    return Path(settings.BASE_DIR) / "workspace" / "data" / "v2_sample"


def _sample_output_path() -> Path:
    return _v2_sample_dir() / SAMPLE_FILENAME


def _root_batch_csv_paths() -> list[Path]:
    base = _v2_dir()
    if not base.is_dir():
        return []
    pat = re.compile(r"^v2_products_\d+\.csv$", re.IGNORECASE)
    paths = [p for p in base.iterdir() if p.is_file() and pat.match(p.name)]
    return sorted(paths, key=lambda p: p.name.lower())


def _open_read(path: Path):
    return path.open("r", encoding="utf-8", newline="")


def _open_write(path: Path):
    return path.open("w", encoding="utf-8", newline="")


def _is_empty_taxonomy(val: str | None) -> bool:
    return val is None or str(val).strip() == ""


def _collect_unclassified_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in _root_batch_csv_paths():
        with _open_read(path) as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames or "taxonomy_v1_category" not in reader.fieldnames:
                raise CommandError(f"{path}: missing taxonomy_v1_category column")
            for row in reader:
                if _is_empty_taxonomy(row.get("taxonomy_v1_category")):
                    rows.append(dict(row))
    return rows


def _load_all_batch_rows() -> tuple[list[tuple[Path, list[str], list[dict[str, str]]]], int, int]:
    """Returns list of (path, fieldnames, rows), total rows, classified count."""
    batches: list[tuple[Path, list[str], list[dict[str, str]]]] = []
    total = 0
    classified = 0
    for path in _root_batch_csv_paths():
        with _open_read(path) as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames or "taxonomy_v1_category" not in reader.fieldnames:
                raise CommandError(f"{path}: missing taxonomy_v1_category column")
            fieldnames = list(reader.fieldnames)
            rows = list(reader)
        for r in rows:
            total += 1
            if not _is_empty_taxonomy(r.get("taxonomy_v1_category")):
                classified += 1
        batches.append((path, fieldnames, rows))
    return batches, total, classified


def _write_batch(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with _open_write(path) as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def _write_sample(rows: list[dict[str, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with _open_write(out_path) as f:
        w = csv.DictWriter(f, fieldnames=SAMPLE_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: (r.get(k) or "") for k in SAMPLE_COLUMNS})


def _remaining_after_manual_apply(
    batches: list[tuple[Path, list[str], list[dict[str, str]]]],
    mapping: dict[str, str],
) -> int:
    """Rows still unclassified after manual categories applied to mapped product_ids."""
    n = 0
    for _path, _fn, rows in batches:
        for row in rows:
            pid = str((row.get("product_id") or "")).strip()
            if pid in mapping:
                continue
            if _is_empty_taxonomy(row.get("taxonomy_v1_category")):
                n += 1
    return n


def _rule_matches(rule: dict[str, Any], compiled: re.Pattern[str], row: dict[str, str]) -> bool:
    field = rule["field"]
    if field == "any":
        for key in ("title", "brand", "vendor", "po_category_text"):
            val = row.get(key) or ""
            if compiled.search(val):
                return True
        return False
    val = row.get(field) or ""
    return bool(compiled.search(val))


class Command(BaseCommand):
    help = (
        "Sample unclassified V2 rows, apply regex rules or manual overrides to CSVs, or print status."
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "--sample",
            action="store_true",
            help="Write random sample to workspace/data/v2_sample/sample_for_review.csv",
        )
        parser.add_argument(
            "--apply",
            metavar="PATH",
            help="Apply rules JSON (rules[].field, pattern, category)",
        )
        parser.add_argument(
            "--status",
            action="store_true",
            help="Compact fill stats and per-category breakdown",
        )
        parser.add_argument(
            "--apply-manual",
            metavar="PATH",
            dest="apply_manual",
            help="Apply product_id -> category JSON overrides",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="With --apply or --apply-manual: show counts without writing CSVs",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        db = resolve_database_alias(options["database"])
        dry_run = options["dry_run"]
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options["no_input"],
            dry_run=dry_run,
        )

        sample = options["sample"]
        apply_path = options["apply"]
        status = options["status"]
        apply_manual = options["apply_manual"]

        modes = [x for x in (sample, apply_path, status, apply_manual) if x]
        if len(modes) != 1:
            raise CommandError(
                "Specify exactly one of: --sample, --apply PATH, --status, --apply-manual PATH"
            )
        if dry_run and not (apply_path or apply_manual):
            raise CommandError("--dry-run is only valid with --apply or --apply-manual")

        base = _v2_dir()
        if not base.is_dir():
            raise CommandError(f"Missing directory: {base}")

        if sample:
            self._cmd_sample()
        elif apply_path:
            self._cmd_apply(Path(apply_path), dry_run)
        elif status:
            self._cmd_status()
        else:
            self._cmd_apply_manual(Path(apply_manual), dry_run)

    def _cmd_sample(self) -> None:
        unclassified = _collect_unclassified_rows()
        n = len(unclassified)
        if n == 0:
            sample_rows: list[dict[str, str]] = []
            sample_n = 0
        else:
            rng = random.Random(SAMPLE_SEED)
            k = min(SAMPLE_SIZE, n)
            picked = rng.sample(unclassified, k=k)
            picked.sort(key=lambda r: (r.get("title") or "").lower())
            sample_rows = picked
            sample_n = len(sample_rows)

        out = _sample_output_path()
        _write_sample(sample_rows, out)

        self.stdout.write(
            f"Total remaining unclassified: {n}\n"
            f"Sample size written: {sample_n}\n"
            f"File: {out}"
        )
        if n > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    "\nNext step: Review sample_for_review.csv with your consultant, "
                    "produce rules_NNN.json, then run:\n"
                    f"  python manage.py classify_v2_iterate --apply <path/to/rules.json>"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "\nNext step: All products in CSVs have a category. "
                    "When ready to sync the database, run:\n"
                    "  python manage.py backfill_phase5_categories --import-v2"
                )
            )

    def _cmd_apply(self, rules_path: Path, dry_run: bool) -> None:
        if not rules_path.is_file():
            raise CommandError(f"Rules file not found: {rules_path}")

        try:
            data = json.loads(rules_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise CommandError(f"Invalid JSON in {rules_path}: {e}") from e

        rules_raw = data.get("rules")
        if not isinstance(rules_raw, list):
            raise CommandError('JSON must contain a "rules" array')

        compiled_rules: list[tuple[dict[str, Any], re.Pattern[str]]] = []
        invalid_cats: list[str] = []
        for i, rule in enumerate(rules_raw):
            if not isinstance(rule, dict):
                raise CommandError(f"rules[{i}] must be an object")
            field = rule.get("field")
            pattern = rule.get("pattern")
            category = rule.get("category")
            if field not in RULE_FIELDS:
                raise CommandError(
                    f"rules[{i}].field must be one of {sorted(RULE_FIELDS)}, got {field!r}"
                )
            if not isinstance(pattern, str) or not pattern:
                raise CommandError(f"rules[{i}].pattern must be a non-empty string")
            if not isinstance(category, str) or category not in TAXONOMY_SET:
                if isinstance(category, str):
                    invalid_cats.append(category)
                else:
                    raise CommandError(f"rules[{i}].category must be a string")
                continue
            try:
                cre = re.compile(pattern)
            except re.error as e:
                raise CommandError(f"rules[{i}]: invalid regex: {e}") from e
            compiled_rules.append(({"field": field, "category": category}, cre))

        if invalid_cats:
            bad = sorted({c for c in invalid_cats if c not in TAXONOMY_SET})
            raise CommandError(
                f"Invalid category value(s) in rules (not in TAXONOMY_V1_CATEGORY_NAMES): {bad}"
            )

        if not compiled_rules:
            raise CommandError("No valid rules to apply")

        batches, _, _ = _load_all_batch_rows()
        rule_hits = Counter()
        per_cat = Counter()
        classified_this_run = 0

        for path, fieldnames, rows in batches:
            for row in rows:
                if not _is_empty_taxonomy(row.get("taxonomy_v1_category")):
                    continue
                for idx, (meta, cre) in enumerate(compiled_rules):
                    if _rule_matches(meta, cre, row):
                        cat = meta["category"]
                        if not dry_run:
                            row["taxonomy_v1_category"] = cat
                        classified_this_run += 1
                        per_cat[cat] += 1
                        rule_hits[idx] += 1
                        break

        self.stdout.write(f"Rules file: {rules_path}")
        self.stdout.write(f"Rules matched (by rule index): {dict(sorted(rule_hits.items()))}")
        self.stdout.write(f"Total products classified this run: {classified_this_run}")
        if per_cat:
            self.stdout.write("Per-category (this run):")
            for name in sorted(per_cat.keys()):
                self.stdout.write(f"  {name}: {per_cat[name]}")

        if not dry_run:
            for path, fieldnames, rows in batches:
                _write_batch(path, fieldnames, rows)

        remaining = len(_collect_unclassified_rows()) if not dry_run else None
        if dry_run:
            uncl = _collect_unclassified_rows()
            would_remain = len(uncl) - classified_this_run
            self.stdout.write(f"[dry-run] Would remain unclassified (approx.): {max(0, would_remain)}")
            remaining = max(0, would_remain)

        if not dry_run:
            self.stdout.write(f"Total remaining unclassified: {remaining}")
            sample_n = self._regen_sample_after_apply()
            self.stdout.write(f"Wrote new sample: {_sample_output_path()} ({sample_n} rows)")
        else:
            self.stdout.write(self.style.WARNING("Dry-run: no CSV files were modified."))

        self._print_next_step(remaining if remaining is not None else 0)

    def _regen_sample_after_apply(self) -> int:
        out = _sample_output_path()
        unclassified = _collect_unclassified_rows()
        n = len(unclassified)
        if n == 0:
            _write_sample([], out)
            return 0
        rng = random.Random(SAMPLE_SEED)
        k = min(SAMPLE_SIZE, n)
        picked = rng.sample(unclassified, k=k)
        picked.sort(key=lambda r: (r.get("title") or "").lower())
        _write_sample(picked, out)
        return len(picked)

    def _cmd_status(self) -> None:
        batches, total, classified = _load_all_batch_rows()
        remaining = total - classified
        pct = (100.0 * classified / total) if total else 0.0

        per_cat = Counter()
        for _path, _fn, rows in batches:
            for row in rows:
                raw = (row.get("taxonomy_v1_category") or "").strip()
                if raw:
                    per_cat[raw] += 1

        self.stdout.write(
            f"Total rows: {total}\n"
            f"Classified: {classified}\n"
            f"Remaining: {remaining}\n"
            f"Filled: {pct:.1f}%"
        )
        self.stdout.write("Classified per category (counts):")
        for name in TAXONOMY_V1_CATEGORY_NAMES:
            self.stdout.write(f"  {name}: {per_cat.get(name, 0)}")

    def _cmd_apply_manual(self, manual_path: Path, dry_run: bool) -> None:
        if not manual_path.is_file():
            raise CommandError(f"Manual file not found: {manual_path}")

        try:
            data = json.loads(manual_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise CommandError(f"Invalid JSON in {manual_path}: {e}") from e

        if not isinstance(data, dict):
            raise CommandError("Manual JSON must be an object mapping product_id to category")

        invalid_cats: list[str] = []
        mapping: dict[str, str] = {}
        for k, v in data.items():
            ks = str(k).strip()
            if not isinstance(v, str):
                raise CommandError(f"Invalid category for product_id {ks!r}: must be a string")
            if v not in TAXONOMY_SET:
                invalid_cats.append(v)
                continue
            mapping[ks] = v

        if invalid_cats:
            raise CommandError(
                f"Invalid category value(s) (not in TAXONOMY_V1_CATEGORY_NAMES): "
                f"{sorted(set(invalid_cats))}"
            )

        if not mapping:
            raise CommandError("No valid product_id -> category entries")

        batches, _, _ = _load_all_batch_rows()
        updated = 0
        per_cat = Counter()

        for _path, fieldnames, rows in batches:
            for row in rows:
                pid = str((row.get("product_id") or "")).strip()
                if pid in mapping:
                    cat = mapping[pid]
                    if not dry_run:
                        row["taxonomy_v1_category"] = cat
                    updated += 1
                    per_cat[cat] += 1

        self.stdout.write(f"Manual file: {manual_path}")
        self.stdout.write(f"Product rows updated: {updated}")
        if per_cat:
            self.stdout.write("Per-category:")
            for name in sorted(per_cat.keys()):
                self.stdout.write(f"  {name}: {per_cat[name]}")

        if not dry_run:
            for path, fieldnames, rows in batches:
                _write_batch(path, fieldnames, rows)

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run: no CSV files were modified."))
            remaining = _remaining_after_manual_apply(batches, mapping)
            self.stdout.write(f"[dry-run] Total remaining unclassified (after apply): {remaining}")
        else:
            remaining = len(_collect_unclassified_rows())
            self.stdout.write(f"Total remaining unclassified: {remaining}")
            sample_n = self._regen_sample_after_apply()
            self.stdout.write(f"Wrote new sample: {_sample_output_path()} ({sample_n} rows)")

        self._print_next_step(remaining)

    def _print_next_step(self, remaining: int) -> None:
        if remaining > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    "\nNext step: Upload sample_for_review.csv to your consultant for the next rule set, "
                    "then run --apply with the new rules JSON."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "\nNext step: All products classified in CSVs. When ready to sync the database, run:\n"
                    "  python manage.py backfill_phase5_categories --import-v2"
                )
            )
