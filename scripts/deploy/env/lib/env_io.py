"""Parse .env-style files for deploy scripts."""

from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    # scripts/deploy/env/lib/env_io.py → repo root
    return Path(__file__).resolve().parents[4]


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[7:].strip()
        if '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        out[key] = value
    return out


def mask_value(key: str, value: str) -> str:
    upper = key.upper()
    if upper.startswith('AI_MODEL'):  # model ids are not secrets ('KEY_MAPPING' false-positive)
        return value
    if any(token in upper for token in ('KEY', 'SECRET', 'PASSWORD', 'TOKEN')):
        return '***' if value else '(empty)'
    if len(value) > 60:
        return value[:20] + '…'
    return value
