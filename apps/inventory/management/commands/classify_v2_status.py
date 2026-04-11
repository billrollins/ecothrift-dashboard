"""Scan v2_products_*.csv files and report taxonomy_v1_category fill progress."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


def _repo_root() -> Path:
    return Path(settings.BASE_DIR)


def _v2_classify_dir() -> Path:
    return _repo_root() / "workspace" / "data" / "v2_classify"


def _is_filled(val: str | None) -> bool:
    if val is None:
        return False
    return str(val).strip() != ""


class Command(BaseCommand):
    help = (
        "Scan workspace/data/v2_classify/v2_products_*.csv for taxonomy_v1_category "
        "completion; mark NEXT on first incomplete file."
    )

    def handle(self, *args, **options):
        base = _v2_classify_dir()
        if not base.is_dir():
            self.stdout.write(self.style.ERROR(f"Missing directory: {base}"))
            return

        pattern = re.compile(r"^v2_products_(\d+)\.csv$", re.IGNORECASE)
        files: list[tuple[int, Path]] = []
        for p in base.iterdir():
            if not p.is_file():
                continue
            m = pattern.match(p.name)
            if m:
                files.append((int(m.group(1)), p))
        files.sort(key=lambda x: x[0])

        if not files:
            self.stdout.write(self.style.WARNING(f"No v2_products_NNN.csv files under {base}"))
            return

        total_rows = 0
        total_filled = 0
        next_file: str | None = None

        self.stdout.write(f"Directory: {base}\n")
        self.stdout.write(f"Files: {len(files)}\n")

        for num, path in files:
            enc = "utf-8-sig"
            try:
                raw = path.read_bytes()
            except OSError as e:
                self.stdout.write(self.style.ERROR(f"  {path.name}: read error {e}"))
                continue
            if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
                enc = "utf-16"
            elif raw[:3] == b"\xef\xbb\xbf":
                enc = "utf-8-sig"

            filled = 0
            nrows = 0
            try:
                with path.open(encoding=enc, newline="") as f:
                    reader = csv.DictReader(f)
                    if reader.fieldnames is None or "taxonomy_v1_category" not in reader.fieldnames:
                        self.stdout.write(
                            self.style.ERROR(
                                f"  {path.name}: missing taxonomy_v1_category column "
                                f"(fields={reader.fieldnames})"
                            )
                        )
                        continue
                    for row in reader:
                        nrows += 1
                        if _is_filled(row.get("taxonomy_v1_category")):
                            filled += 1
            except OSError as e:
                self.stdout.write(self.style.ERROR(f"  {path.name}: {e}"))
                continue

            empty = nrows - filled
            total_rows += nrows
            total_filled += filled
            pct = (100.0 * filled / nrows) if nrows else 0.0
            line = f"  {path.name}: rows={nrows} filled={filled} empty={empty} ({pct:.1f}%)"
            if empty > 0 and next_file is None:
                next_file = path.name
                line += "  <<< NEXT"
            self.stdout.write(line)

        empty_all = total_rows - total_filled
        pct_all = (100.0 * total_filled / total_rows) if total_rows else 0.0
        self.stdout.write("")
        self.stdout.write(
            f"Overall: rows={total_rows} filled={total_filled} empty={empty_all} ({pct_all:.1f}%)"
        )
        if next_file:
            self.stdout.write(self.style.SUCCESS(f"NEXT (first incomplete): {next_file}"))
        else:
            self.stdout.write(self.style.SUCCESS("All v2_products_*.csv files are complete."))
