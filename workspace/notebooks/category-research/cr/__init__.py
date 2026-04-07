"""
Category research notebook helpers: unified bin extracts, review, pickles.

Usage (after ``django.setup()`` and with ``pandas`` installed):

    from cr import run_extract, summarize, sample_df, CACHE_DIR

    df = run_extract("bin1")
    print(summarize(df))
"""

from __future__ import annotations

from .categorize import (
    CategorizationSummary,
    ai_categorize,
    ai_categorize_full,
    build_summary,
    get_sample,
)
from .extract import load_extract_pickle, load_pickle, run_extract, run_extract_all, save_pickle
from .paths import cache_dir, category_research_package_root, repo_root, sql_dir
from .review import TIER_A_COLUMNS, print_tier_a_review, sample_df, summarize, top_values
from .sql_loader import SQL_FILES, load_sql, sql_for_bin
from .taxonomy_estimate import (
    MANIFEST_TO_PROPOSED,
    manifest_mapping_audit_table,
    map_manifest_to_proposed,
    proposed_category_names,
    proposed_distribution,
)

BIN_NAMES = ('bin1', 'bin2', 'bin3')

CACHE_DIR = cache_dir()

__all__ = [
    'BIN_NAMES',
    'CACHE_DIR',
    'CategorizationSummary',
    'TIER_A_COLUMNS',
    'ai_categorize',
    'ai_categorize_full',
    'build_summary',
    'get_sample',
    'SQL_FILES',
    'category_research_package_root',
    'load_extract_pickle',
    'load_pickle',
    'load_sql',
    'MANIFEST_TO_PROPOSED',
    'manifest_mapping_audit_table',
    'map_manifest_to_proposed',
    'proposed_category_names',
    'proposed_distribution',
    'repo_root',
    'run_extract',
    'print_tier_a_review',
    'run_extract_all',
    'sample_df',
    'save_pickle',
    'sql_dir',
    'sql_for_bin',
    'summarize',
    'top_values',
]
