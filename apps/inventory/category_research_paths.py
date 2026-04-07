"""Filesystem layout for category research under workspace/notebooks/category-research/."""

from __future__ import annotations

from pathlib import Path


def category_research_root(base: Path) -> Path:
    return base / 'workspace' / 'notebooks' / 'category-research'


def category_research_exports(base: Path) -> Path:
    return category_research_root(base) / 'exports'


def category_research_logs(base: Path) -> Path:
    return category_research_root(base) / 'logs'


def category_research_categorization_logs(base: Path) -> Path:
    """Per-run JSONL from categorize_category_bins (categorize_<bin>_<stamp>.jsonl)."""
    return category_research_logs(base) / 'categorization'


def category_research_categorized_exports(base: Path) -> Path:
    return category_research_root(base) / 'categorized_exports'


def chunks_root(base: Path) -> Path:
    return category_research_categorized_exports(base) / '_chunks'


def chunk_run_dir(base: Path, bin_label: str, stamp: str) -> Path:
    return chunks_root(base) / f'{bin_label}_{stamp}'


def category_research_reports(base: Path) -> Path:
    return category_research_root(base) / 'reports'


def category_research_model_compare(base: Path) -> Path:
    return category_research_root(base) / 'model_compare'
