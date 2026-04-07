"""Paths for category-research package (notebook + helpers)."""

from __future__ import annotations

from pathlib import Path


def category_research_package_root() -> Path:
    """Directory containing this package (`.../category-research`)."""
    return Path(__file__).resolve().parent.parent


def repo_root() -> Path:
    """Repo root (`ecothrift-dashboard/`) — `category-research/cr` is 4 levels deep."""
    return Path(__file__).resolve().parents[4]


def sql_dir() -> Path:
    return repo_root() / 'scripts' / 'sql'


def cache_dir() -> Path:
    p = category_research_package_root() / 'cache'
    p.mkdir(parents=True, exist_ok=True)
    return p


def categorized_exports_dir() -> Path:
    """AI categorization outputs (`*_categorized.csv`, `chunks/`, summaries). Often gitignored."""
    p = category_research_package_root() / 'categorized_exports'
    p.mkdir(parents=True, exist_ok=True)
    return p


def categorized_chunks_dir() -> Path:
    p = categorized_exports_dir() / 'chunks'
    p.mkdir(parents=True, exist_ok=True)
    return p
