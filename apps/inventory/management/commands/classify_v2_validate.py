"""Validate taxonomy_v1_category values in v2 classify CSVs against taxonomy_v1."""

from __future__ import annotations

import csv
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.management.command_db import (
    add_database_argument,
    add_no_input_argument,
    confirm_production_write,
    resolve_database_alias,
)


def _repo_root() -> Path:
    return Path(settings.BASE_DIR)


def _v2_classify_dir() -> Path:
    return _repo_root() / "workspace" / "data" / "v2_classify"


def _detect_encoding(path: Path) -> str:
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return "utf-16"
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig"
    return "utf-8"


def _validate_file(path: Path, valid: frozenset[str]) -> tuple[int, int, list[tuple[int, str, str]]]:
    """Returns (total_rows, nonempty_count, list of (line_no_1based, product_id, bad_value))."""
    enc = _detect_encoding(path)
    bad: list[tuple[int, str, str]] = []
    n = 0
    nonempty = 0
    with path.open(encoding=enc, newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or "taxonomy_v1_category" not in reader.fieldnames:
            raise CommandError(f"{path}: missing taxonomy_v1_category column")
        for i, row in enumerate(reader, start=2):
            n += 1
            raw_val = row.get("taxonomy_v1_category")
            if raw_val is None or str(raw_val).strip() == "":
                continue
            nonempty += 1
            val = str(raw_val).strip()
            if val not in valid:
                pid = (row.get("product_id") or "").strip()
                bad.append((i, pid, val))
    return n, nonempty, bad


class Command(BaseCommand):
    help = (
        "Validate non-empty taxonomy_v1_category in workspace/data/v2_classify CSVs "
        "against TAXONOMY_V1_CATEGORY_NAMES."
    )

    def add_arguments(self, parser):
        add_database_argument(parser)
        add_no_input_argument(parser)
        parser.add_argument(
            "filename",
            nargs="?",
            default="",
            help="CSV filename under workspace/data/v2_classify/ (e.g. v2_products_001.csv), "
            "or omit to validate all v2_products_*.csv files.",
        )

    def handle(self, *args, **options):
        db = resolve_database_alias(options["database"])
        confirm_production_write(
            stdout=self.stdout,
            stderr=self.stderr,
            db_alias=db,
            no_input=options["no_input"],
            dry_run=False,
        )

        arg = (options.get("filename") or "").strip()
        base = _v2_classify_dir()
        if not base.is_dir():
            raise CommandError(f"Missing directory: {base}")

        valid = frozenset(TAXONOMY_V1_CATEGORY_NAMES)

        if arg:
            path = Path(arg)
            repo_root = Path(settings.BASE_DIR)
            if not path.is_absolute():
                candidates = [
                    base / path.name,
                    repo_root / arg,
                    path,
                ]
                path = next((c for c in candidates if c.is_file()), None)
                if path is None:
                    path = base / Path(arg).name
            if not path.is_file():
                raise CommandError(f"File not found: {path}")
            paths = [path]
        else:
            paths = sorted(base.glob("v2_products_*.csv"), key=lambda p: p.name)

        if not paths:
            raise CommandError(f"No files to validate under {base}")

        any_fail = False
        for path in paths:
            try:
                n, nonempty, bad = _validate_file(path, valid)
            except CommandError as e:
                self.stdout.write(self.style.ERROR(str(e)))
                any_fail = True
                continue
            try:
                rel = path.relative_to(base)
            except ValueError:
                rel = path
            if not bad:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"PASS {rel} ({n} rows, {nonempty} non-empty taxonomy validated)"
                    )
                )
            else:
                any_fail = True
                self.stdout.write(
                    self.style.ERROR(
                        f"FAIL {rel}: {len(bad)} invalid value(s) ({n} rows, {nonempty} non-empty)"
                    )
                )
                for line_no, pid, val in bad[:50]:
                    self.stdout.write(f"  line {line_no} product_id={pid!r} value={val!r}")
                if len(bad) > 50:
                    self.stdout.write(f"  ... and {len(bad) - 50} more")

        if any_fail:
            raise CommandError("Validation failed.")
