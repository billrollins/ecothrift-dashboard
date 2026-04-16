"""Development-only manifest API timing logs (ENVIRONMENT=development)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings

CHICAGO = ZoneInfo('America/Chicago')

# Bump when changing anonymous manifest pull / post-processing.
MANIFEST_API_PULL_VERSION = '2026-04-16-B2'


def _b_manifest_dir() -> Path:
    return settings.BASE_DIR / 'workspace' / 'b-manifest-api'


def _timelogs_dir() -> Path:
    d = _b_manifest_dir() / '.timelogs'
    d.mkdir(parents=True, exist_ok=True)
    return d


def _should_log() -> bool:
    return (getattr(settings, 'ENVIRONMENT', '') or '').strip().lower() == 'development'


def log_manifest_api_pull(
    *,
    auction_id: int,
    rows_saved: int,
    duration_seconds: float,
    success: bool,
) -> None:
    """Append JSON line + time_summary.md row when ENVIRONMENT=development."""
    if not _should_log():
        return
    try:
        ts = datetime.now(tz=CHICAGO).isoformat()
        ts_key = ts.replace(':', '-').replace('+', '_')
        rec = {
            'ts': ts,
            'version': MANIFEST_API_PULL_VERSION,
            'auction_id': auction_id,
            'rows_saved': rows_saved,
            'duration_seconds': round(duration_seconds, 4),
            'success': success,
        }
        log_path = _timelogs_dir() / f'{ts_key}_auction{auction_id}.jsonl'
        log_path.write_text(json.dumps(rec) + '\n', encoding='utf-8')

        summary_path = _b_manifest_dir() / 'time_summary.md'
        line = (
            f'| {ts} | {MANIFEST_API_PULL_VERSION} | {auction_id} | {rows_saved} | '
            f'{duration_seconds:.2f}s | {"ok" if success else "fail"} |\n'
        )
        if not summary_path.is_file():
            summary_path.write_text(
                '# Manifest API pull timings (development)\n\n'
                '| When (Chicago) | Code version | Auction | Rows | Duration | Result |\n'
                '|----------------|--------------|---------|------|----------|--------|\n',
                encoding='utf-8',
            )
        with summary_path.open('a', encoding='utf-8') as f:
            f.write(line)
    except OSError:
        pass
