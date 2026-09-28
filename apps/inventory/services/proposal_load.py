"""
Turn a profile backfill file (JSONL, or JSONL.gz, one line per normalized-title group) into
ProductProposal rows. It is shared by the ``load_profile_proposals`` command and the Requests
kind ``inventory.load_profile_proposals``.

Each line: {group, product_ids, sold, category, subcategory, short_name, confidence, flags, source, rules}.

Accept policy (workspace/gold/AUDITION.md):
- Spark ``high`` → auto;
- not high, but the second opinion names the same category → auto;
- otherwise pending (the review queue, sorted by dollars).

Idempotent per (product, field, batch). It writes proposals only, never profiles or products.
"""
from __future__ import annotations

import gzip
import json
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Iterator

from django.conf import settings

from apps.inventory.models import Product, ProductProposal

FIELDS = ('category', 'subcategory', 'short_name', 'flags')
DATA_DIR = Path(__file__).resolve().parents[1] / 'data' / 'backfill'

# The two backfills made on 2026-09-23 (product_intelligence), shipped compressed in the repo.
BACKFILLS = {
    'spark-mixed-2026-09-23': ('pilot_out.jsonl.gz', 'pilot_out.second.jsonl.gz'),
    'spark-v1v2-2026-09-23': ('pilot_out_v1v2_placed.jsonl.gz', 'pilot_out_v1v2_placed.second.jsonl.gz'),
}


def resolve(path: str) -> Path:
    """A path relative to the repo or to ``data/backfill``, or absolute."""
    p = Path(path)
    if p.is_absolute() and p.exists():
        return p
    for base in (DATA_DIR, Path(settings.BASE_DIR)):
        if (base / p).exists():
            return base / p
    return p


def read_rows(path: str | Path) -> Iterator[dict[str, Any]]:
    p = resolve(str(path))
    opener = gzip.open if p.suffix == '.gz' else open
    with opener(p, 'rt', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def status_for(row: dict[str, Any], second: dict[str, Any] | None) -> str:
    if row.get('confidence') == 'high':
        return ProductProposal.STATUS_AUTO
    if second and second.get('category') == row.get('category'):
        return ProductProposal.STATUS_AUTO
    return ProductProposal.STATUS_PENDING


def summarize(path: str, second: str = '') -> dict[str, Any]:
    """Groups, auto vs pending, products named, and a sample: what a load would add."""
    seconds = {r['group']: r for r in read_rows(second)} if second else {}
    groups = auto = products = 0
    sold = Decimal('0')
    sample = []
    for row in read_rows(path):
        groups += 1
        status = status_for(row, seconds.get(row['group']))
        auto += status == ProductProposal.STATUS_AUTO
        products += len(row.get('product_ids') or [])
        sold += Decimal(str(row.get('sold') or 0))
        if len(sample) < 20:
            sample.append({
                'group': row.get('group'), 'products': len(row.get('product_ids') or []),
                'category': row.get('category'), 'subcategory': row.get('subcategory'),
                'short_name': row.get('short_name'), 'confidence': row.get('confidence'), 'status': status,
            })
    return {'groups': groups, 'auto': auto, 'pending': groups - auto, 'products': products, 'sold': str(sold), 'sample': sample}


def load(
    path: str, *, batch: str, second: str = '', start: int = 0, chunk: int = 2000,
    on_chunk: Callable[[int, int, int], None] | None = None,
) -> dict[str, int]:
    """
    Add the proposals, ``chunk`` groups at a time, from group index ``start``. After each chunk it
    calls ``on_chunk(next_index, groups_total, added_so_far)``, so a caller can save a cursor and
    resume. Existing (product, field) proposals in the batch are skipped.
    """
    seconds = {r['group']: r for r in read_rows(second)} if second else {}
    # Streamed, a chunk at a time: the Mixed backfill is 52 MB of JSON, too much to hold on a web
    # dyno (the Requests apply runs there).
    total = sum(1 for _ in read_rows(path))
    counts = {'added': 0, 'missing_products': 0, 'groups': total}

    def chunks():
        part, index = [], 0
        for index, row in enumerate(read_rows(path)):
            if index < start:
                continue
            part.append(row)
            if len(part) >= chunk:
                yield index + 1, part
                part = []
        if part:
            yield total, part

    for next_index, part in chunks():
        ids = {pid for r in part for pid in r.get('product_ids') or []}
        live = set(Product.objects.filter(pk__in=ids).values_list('pk', flat=True))
        done = set(
            ProductProposal.objects.filter(batch=batch, product_id__in=ids).values_list('product_id', 'field')
        )
        new = []
        for r in part:
            sec = seconds.get(r['group'])
            status = status_for(r, sec)
            pids = [pid for pid in r.get('product_ids') or [] if pid in live]
            counts['missing_products'] += len(r.get('product_ids') or []) - len(pids)
            if not pids:
                continue
            share = (Decimal(str(r.get('sold') or 0)) / len(pids)).quantize(Decimal('0.01'))
            for pid in pids:
                for field in FIELDS:
                    value = r.get(field)
                    if field == 'flags':
                        value = [f.strip() for f in str(value or '').split(',') if f.strip()]
                        if not value:
                            continue
                    if value in (None, '') or (pid, field) in done:
                        continue
                    new.append(ProductProposal(
                        product_id=pid, field=field, value=value, source=r.get('source') or 'ai',
                        confidence=r.get('confidence') or '',
                        second_opinion={'category': sec.get('category'), 'source': sec.get('source')} if sec else {},
                        dollars=share, status=status, batch=batch, rules_version=r.get('rules') or '',
                    ))
        ProductProposal.objects.bulk_create(new, batch_size=2000)
        counts['added'] += len(new)
        if on_chunk:
            on_chunk(next_index, total, counts["added"])
    return counts
