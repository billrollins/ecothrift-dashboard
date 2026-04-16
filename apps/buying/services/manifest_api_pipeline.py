"""Two-worker API manifest pipeline: fetch raw B-Stock pages + process rows like CSV.

Worker 1 streams pages of 10 rows via :func:`scraper.iter_manifest_pages` onto a
bounded queue. Worker 2 resolves (or AI-creates) a :class:`ManifestTemplate` from
the **flattened header signature** of the first page, then for each batch:

1. Runs :func:`standardize_row` + :func:`build_fast_cat_key` against the template.
2. Maintains running fill rates and refreshes ``effective_category_fields`` as
   more rows arrive (streaming analog of the CSV ``compute_fill_rates`` pass).
3. Looks up ``CategoryMapping`` to fill ``fast_cat_value`` inline; collects any
   new ``fast_cat_key`` values for a batched AI mapping pass at the end.
4. ``bulk_create`` the batch's :class:`ManifestRow` rows.

After both workers drain, the caller loops :func:`map_one_fast_cat_batch` until
all new keys are mapped, then runs categorize / distribution / valuation — same
tail as :func:`process_manifest_upload`.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.buying.models import (
    Auction,
    CategoryMapping,
    ManifestPullLog,
    ManifestRow,
    ManifestTemplate,
    Marketplace,
)
from apps.buying.services import scraper
from apps.buying.services.ai_key_mapping import (
    count_distinct_unmapped_keys,
    map_one_fast_cat_batch,
    total_batches_for_count,
)
from apps.buying.services.ai_manifest_template import propose_manifest_template_with_ai
from apps.buying.services.categorize_manifest import categorize_manifest_rows
from apps.buying.services.manifest_template import (
    build_fast_cat_key,
    compute_fill_rates,
    compute_header_signature,
    create_template_stub,
    detect_template,
    effective_category_fields,
    standardize_row,
)
from apps.buying.services.normalize import (
    _flatten_bstock_manifest_row,
    normalize_manifest_row,
)
from apps.buying.services.valuation import (
    compute_and_save_manifest_distribution,
    recompute_auction_valuation,
)

logger = logging.getLogger(__name__)


# Internal sentinel placed on the queue when Worker 1 is done.
_SENTINEL_DONE = object()


# Phase values written to the live progress cache. UI renders different
# copy/states per phase so the user can tell whether we're still resolving
# the template, actively pulling, or in the AI-categorization tail.
PROGRESS_PHASE_RESOLVING = 'resolving_template'
PROGRESS_PHASE_PULLING = 'pulling'
PROGRESS_PHASE_AI_MAPPING = 'ai_mapping'
PROGRESS_PHASE_FINALIZING = 'finalizing'
PROGRESS_PHASE_COMPLETE = 'complete'
PROGRESS_PHASE_EMPTY = 'empty_manifest'
PROGRESS_PHASE_TEMPLATE_ERROR = 'template_error'

# The fetcher runs on a dedicated thread while Worker 2 runs on the caller's
# thread. :class:`DatabaseCache` writes must run **only on the orchestrator
# thread** (the same thread that holds the request / test transaction). If the
# fetcher thread calls ``cache.set``, PostgreSQL can block waiting on a lock
# held by the main thread while the main thread waits on the queue — a
# deadlock (reproduced by ``test_retail_value_preserved_...`` under pytest).
# Worker 1 only mutates ``fetch_state``; Worker 2 merges it into
# ``update_progress`` on the main thread.
_progress_lock = threading.Lock()

# Progress cache entries outlive any realistic pull (cap at 1h so stale
# entries from crashed dynos self-expire).
_PROGRESS_TTL_SECONDS = 60 * 60


def _progress_cache_key(auction_id: int) -> str:
    return f'manifest_pull_progress:{int(auction_id)}'


def update_progress(auction_id: int, **updates: Any) -> None:
    """Merge ``updates`` into the live progress cache entry for ``auction_id``.

    Call **only from the thread running** :func:`run_api_manifest_pull` (not
    from the fetcher thread). Uses :class:`DatabaseCache` so polling works
    across gunicorn workers.

    The module-level lock protects the read-modify-write cycle since
    :class:`DatabaseCache` does not expose an atomic merge.

    Cache failures are swallowed: progress reporting is best-effort and must
    never crash the pull.
    """
    key = _progress_cache_key(auction_id)
    try:
        with _progress_lock:
            current = cache.get(key) or {}
            current.update(updates)
            current['updated_at'] = timezone.now().isoformat()
            cache.set(key, current, timeout=_PROGRESS_TTL_SECONDS)
    except Exception:
        logger.debug(
            'manifest progress cache update failed auction_id=%s', auction_id,
            exc_info=True,
        )


def get_progress(auction_id: int) -> dict[str, Any] | None:
    """Read the live progress cache entry for ``auction_id`` (or ``None``)."""
    try:
        return cache.get(_progress_cache_key(auction_id))
    except Exception:
        logger.debug(
            'manifest progress cache read failed auction_id=%s', auction_id,
            exc_info=True,
        )
        return None


def clear_progress(auction_id: int) -> None:
    """Delete the live progress cache entry for ``auction_id``."""
    try:
        cache.delete(_progress_cache_key(auction_id))
    except Exception:
        logger.debug(
            'manifest progress cache clear failed auction_id=%s', auction_id,
            exc_info=True,
        )


def flatten_api_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten one raw B-Stock manifest row to a scalar-ish dict for CSV-style picking."""
    if not isinstance(raw, dict):
        return {}
    flat = _flatten_bstock_manifest_row(raw)
    out: dict[str, Any] = {}
    for key, value in flat.items():
        if not isinstance(key, str):
            continue
        if isinstance(value, (dict, list)):
            continue
        if value is None:
            out[key] = ''
        else:
            out[key] = value
    return out


def columns_from_flat_rows(flat_rows: list[dict[str, Any]]) -> list[str]:
    """Deterministic, stable-sorted union of keys across flattened rows (for signature)."""
    cols: set[str] = set()
    for fr in flat_rows:
        if isinstance(fr, dict):
            cols.update(k for k in fr.keys() if isinstance(k, str))
    return sorted(cols)


def resolve_or_create_template(
    auction: Auction,
    marketplace: Marketplace,
    columns: list[str],
    sample_rows: list[dict[str, Any]],
) -> tuple[ManifestTemplate | None, str, dict[str, Any] | None]:
    """
    Mirror CSV ``process_manifest_upload`` template resolution for API pulls.

    Returns ``(template, source, error)`` — ``error`` is a dict (same shape CSV
    path returns for 400) when no usable template can be produced.
    """
    sig = compute_header_signature(columns)
    template = detect_template(marketplace, columns)
    if template is not None and template.is_reviewed:
        return template, 'existing', None

    if template is None:
        template = create_template_stub(marketplace, columns)
        if not getattr(settings, 'ANTHROPIC_API_KEY', None):
            return None, 'stub', {
                'detail': (
                    'Unknown manifest format. A template stub was created; set '
                    'ANTHROPIC_API_KEY or configure the template in admin, then retry.'
                ),
                'code': 'unknown_template',
                'template_status': 'unknown',
                'header_signature': sig,
                'manifest_template_id': template.pk,
            }
        ok = propose_manifest_template_with_ai(
            template, marketplace, columns, sample_rows, auction_id=auction.pk
        )
        if not ok:
            return None, 'stub', {
                'detail': 'AI could not propose a template; admin review required.',
                'code': 'ai_template_failed',
                'template_status': 'unknown',
                'header_signature': sig,
                'manifest_template_id': template.pk,
            }
        template.refresh_from_db()
        return template, 'ai_created', None

    return None, 'not_reviewed', {
        'detail': (
            'This manifest matches a template that is not reviewed yet. '
            'Review it in admin, then retry.'
        ),
        'code': 'template_not_reviewed',
        'template_status': 'not_reviewed',
        'header_signature': sig,
        'manifest_template_id': template.pk,
    }


def _load_mapping_dict() -> dict[str, str]:
    return dict(
        CategoryMapping.objects.values_list('source_key', 'canonical_category')
    )


def _build_row(
    auction: Auction,
    template: ManifestTemplate,
    raw: dict[str, Any],
    flat: dict[str, Any],
    marketplace: Marketplace,
    effective_fields: list[str],
    mapping: dict[str, str],
    row_number: int,
) -> ManifestRow:
    # Scalar fields (title/brand/sku/upc/qty/retail/condition/notes) come from the
    # proven B-Stock JSON parser — the template column_map was originally trained
    # on CSV headers and AI-created API templates are not reliable enough for
    # retail-value extraction (e.g. picking ``extRetail`` instead of ``unitRetail``
    # or missing the cents-heuristic). The template is still used for
    # ``fast_cat_key`` generation (categorization parity with CSV uploads).
    norm = normalize_manifest_row(raw)
    std = standardize_row(template, flat)

    def prefer_norm(key: str):
        nv = norm.get(key)
        if nv not in (None, ''):
            return nv
        return std.get(key)

    fck = build_fast_cat_key(marketplace, template, flat, effective_fields)
    fcv = mapping.get(fck) if fck else None
    conf = ManifestRow.CONF_FAST_CAT if fcv else None
    return ManifestRow(
        auction=auction,
        row_number=row_number,
        manifest_template=template,
        raw_data=raw,
        title=prefer_norm('title') or '',
        brand=prefer_norm('brand') or '',
        model=prefer_norm('model') or '',
        sku=prefer_norm('sku') or '',
        upc=prefer_norm('upc') or '',
        quantity=prefer_norm('quantity'),
        retail_value=prefer_norm('retail_value'),
        condition=prefer_norm('condition') or '',
        notes=prefer_norm('notes') or '',
        fast_cat_key=fck,
        fast_cat_value=fcv,
        category_confidence=conf,
    )


def run_api_manifest_pull(
    auction: Auction,
    *,
    force: bool = False,
    page_limit: int = 10,
    max_rows: int = 10000,
    queue_maxsize: int = 4,
    run_ai_key_mapping: bool = True,
) -> tuple[dict[str, Any], int]:
    """
    Single-auction CSV-equivalent manifest pull over the B-Stock API.

    Returns ``(response_dict, http_status)`` — success 200, template issues 400
    (stub created), or network/empty manifest 502-shaped payload with 200 so the
    view still returns a structured response (mirrors CSV / existing pull path
    that logs errors instead of raising).
    """
    marketplace = auction.marketplace
    used_socks5 = bool(getattr(settings, 'BUYING_SOCKS5_PROXY_ENABLED', False))
    started = timezone.now()
    t0 = time.perf_counter()

    if not (auction.lot_id or '').strip():
        return (
            {
                'detail': 'Auction has no lot_id; cannot fetch manifest from B-Stock.',
                'code': 'missing_lot_id',
            },
            400,
        )

    # Reset any stale entry from a previous (crashed) pull on this auction
    # before seeding the "starting" state the UI polls for.
    clear_progress(auction.pk)
    update_progress(
        auction.pk,
        phase=PROGRESS_PHASE_RESOLVING,
        started_at=started.isoformat(),
        total_rows_hint=None,
        api_calls=0,
        rows_fetched=0,
        rows_saved=0,
        batches_processed=0,
        template_source=None,
        ai_batches_run=0,
        ai_mappings_created=0,
        keys_remaining=None,
    )

    pages_q: queue.Queue = queue.Queue(maxsize=queue_maxsize)
    fetch_state: dict[str, Any] = {
        'api_calls': 0,
        'total_rows_hint': None,
        'rows_fetched': 0,
        'error': None,
    }
    fetch_state_lock = threading.Lock()

    def _publish_pull_progress(
        phase: str,
        *,
        rows_saved: int,
        batches_processed: int,
        template_source_val: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """Merge ``fetch_state`` (Worker 1) + saved row counts (Worker 2) into cache.

        Must run on the orchestrator thread only.
        """
        with fetch_state_lock:
            hint = fetch_state['total_rows_hint']
            total_hint = int(hint) if hint is not None else None
            pl: dict[str, Any] = {
                'phase': phase,
                'api_calls': int(fetch_state['api_calls']),
                'total_rows_hint': total_hint,
                'rows_fetched': int(fetch_state['rows_fetched']),
                'rows_saved': rows_saved,
                'batches_processed': batches_processed,
            }
        if template_source_val is not None:
            pl['template_source'] = template_source_val
        if extra:
            pl.update(extra)
        update_progress(auction.pk, **pl)

    def fetcher() -> None:
        try:
            for items, api_calls, total_hint in scraper.iter_manifest_pages(
                auction.lot_id,
                page_limit=page_limit,
                max_rows=max_rows,
            ):
                with fetch_state_lock:
                    fetch_state['api_calls'] = api_calls
                    fetch_state['total_rows_hint'] = total_hint
                    fetch_state['rows_fetched'] += (
                        len(items) if isinstance(items, list) else 0
                    )
                # Never call ``update_progress`` / DatabaseCache here — only the
                # orchestrator thread may touch the DB cache (see module doc).
                pages_q.put(items)
        except Exception as exc:
            logger.exception('manifest API fetcher failed auction_id=%s', auction.pk)
            with fetch_state_lock:
                fetch_state['error'] = str(exc)
        finally:
            pages_q.put(_SENTINEL_DONE)

    fetcher_thread = threading.Thread(
        target=fetcher, name=f'manifest-fetcher-{auction.pk}', daemon=True
    )
    fetcher_thread.start()

    first_page: list[dict[str, Any]] | None = None
    while True:
        item = pages_q.get()
        if item is _SENTINEL_DONE:
            break
        if isinstance(item, list) and item:
            first_page = item
            break

    # Worker 1 has at least one page; publish its counters from the main thread.
    if first_page:
        _publish_pull_progress(
            PROGRESS_PHASE_RESOLVING,
            rows_saved=0,
            batches_processed=0,
        )

    if not first_page:
        fetcher_thread.join()
        ManifestPullLog.objects.create(
            auction=auction,
            started_at=started,
            rows_downloaded=0,
            api_calls=int(fetch_state['api_calls']),
            duration_seconds=round(time.perf_counter() - t0, 4),
            used_socks5=used_socks5,
            success=False,
            error_message=fetch_state['error'] or 'Manifest API returned no rows.',
        )
        update_progress(auction.pk, phase=PROGRESS_PHASE_EMPTY)
        clear_progress(auction.pk)
        return (
            {
                'detail': fetch_state['error'] or 'Manifest API returned no rows.',
                'code': 'empty_manifest',
                'rows_saved': 0,
                'api_calls': int(fetch_state['api_calls']),
            },
            200,
        )

    flat_first = [flatten_api_row(r) for r in first_page if isinstance(r, dict)]
    columns = columns_from_flat_rows(flat_first)
    sig = compute_header_signature(columns)
    sample_rows: list[dict[str, str]] = [
        {k: str(v) for k, v in fr.items()} for fr in flat_first[:5]
    ]

    template, template_source, err = resolve_or_create_template(
        auction, marketplace, columns, sample_rows
    )
    if template is None:
        fetcher_thread.join()
        ManifestPullLog.objects.create(
            auction=auction,
            started_at=started,
            rows_downloaded=0,
            api_calls=int(fetch_state['api_calls']),
            duration_seconds=round(time.perf_counter() - t0, 4),
            used_socks5=used_socks5,
            success=False,
            error_message=f'template unresolved: {err.get("code") if err else "unknown"}',
        )
        update_progress(auction.pk, phase=PROGRESS_PHASE_TEMPLATE_ERROR)
        clear_progress(auction.pk)
        return (err or {'code': 'unknown_template'}, 400)

    _publish_pull_progress(
        PROGRESS_PHASE_PULLING,
        rows_saved=0,
        batches_processed=0,
        template_source_val=template_source,
    )

    if force:
        auction.manifest_rows.all().delete()

    mapping = _load_mapping_dict()
    accumulated_flat: list[dict[str, Any]] = []
    running_fill: dict[str, float] = {c: 0.0 for c in columns}
    eff_cat = effective_category_fields(template, running_fill)

    rows_saved = 0
    row_counter = 0
    batches_processed = 0

    def process_batch(raw_batch: list[dict[str, Any]]) -> None:
        nonlocal row_counter, rows_saved, batches_processed, eff_cat, running_fill
        flat_batch = [flatten_api_row(r) for r in raw_batch if isinstance(r, dict)]
        if not flat_batch:
            return

        accumulated_flat.extend(flat_batch)
        running_fill = compute_fill_rates(accumulated_flat, columns)
        eff_cat = effective_category_fields(template, running_fill)

        bulk: list[ManifestRow] = []
        for raw, flat in zip(raw_batch, flat_batch):
            row_counter += 1
            bulk.append(
                _build_row(
                    auction=auction,
                    template=template,
                    raw=raw,
                    flat=flat,
                    marketplace=marketplace,
                    effective_fields=eff_cat,
                    mapping=mapping,
                    row_number=row_counter,
                )
            )
        if bulk:
            with transaction.atomic():
                ManifestRow.objects.bulk_create(bulk, batch_size=500)
            rows_saved += len(bulk)
            batches_processed += 1
            _publish_pull_progress(
                PROGRESS_PHASE_PULLING,
                rows_saved=int(rows_saved),
                batches_processed=int(batches_processed),
                template_source_val=template_source,
            )

    process_batch(first_page)

    while True:
        item = pages_q.get()
        if item is _SENTINEL_DONE:
            break
        if isinstance(item, list) and item:
            process_batch(item)

    fetcher_thread.join()
    # Final sync: fetcher is done; ``rows_fetched`` matches B-Stock ``total``.
    _publish_pull_progress(
        PROGRESS_PHASE_PULLING,
        rows_saved=int(rows_saved),
        batches_processed=int(batches_processed),
        template_source_val=template_source,
    )
    duration = time.perf_counter() - t0

    if rows_saved > 0:
        auction.has_manifest = True
        auction.manifest_pulled_at = timezone.now()
        auction.save(update_fields=['has_manifest', 'manifest_pulled_at'])

    ManifestPullLog.objects.create(
        auction=auction,
        started_at=started,
        rows_downloaded=rows_saved,
        api_calls=int(fetch_state['api_calls']),
        duration_seconds=round(duration, 4),
        used_socks5=used_socks5,
        success=rows_saved > 0,
        error_message=fetch_state['error'] or '',
    )

    ai_mappings_created = 0
    ai_batches_run = 0
    ai_error: str | None = None
    if run_ai_key_mapping and rows_saved > 0:
        _publish_pull_progress(
            PROGRESS_PHASE_AI_MAPPING,
            rows_saved=int(rows_saved),
            batches_processed=int(batches_processed),
            template_source_val=template_source,
        )
        while True:
            auction.refresh_from_db()
            mapping = _load_mapping_dict()
            before = count_distinct_unmapped_keys(auction, mapping)
            _publish_pull_progress(
                PROGRESS_PHASE_AI_MAPPING,
                rows_saved=int(rows_saved),
                batches_processed=int(batches_processed),
                template_source_val=template_source,
                extra={'keys_remaining': int(before)},
            )
            if before == 0:
                break
            res = map_one_fast_cat_batch(auction, mapping=mapping)
            ai_batches_run += 1
            if res.get('error') == 'ai_not_configured':
                ai_error = 'ai_not_configured'
                _publish_pull_progress(
                    PROGRESS_PHASE_AI_MAPPING,
                    rows_saved=int(rows_saved),
                    batches_processed=int(batches_processed),
                    template_source_val=template_source,
                    extra={'ai_error': 'ai_not_configured'},
                )
                break
            ai_mappings_created += int(res.get('keys_mapped', 0) or 0)
            _publish_pull_progress(
                PROGRESS_PHASE_AI_MAPPING,
                rows_saved=int(rows_saved),
                batches_processed=int(batches_processed),
                template_source_val=template_source,
                extra={
                    'ai_batches_run': int(ai_batches_run),
                    'ai_mappings_created': int(ai_mappings_created),
                    'keys_remaining': int(res.get('keys_remaining', 0) or 0),
                },
            )
            if not res.get('has_more'):
                break
            if ai_batches_run >= 60:
                break

    _publish_pull_progress(
        PROGRESS_PHASE_FINALIZING,
        rows_saved=int(rows_saved),
        batches_processed=int(batches_processed),
        template_source_val=template_source,
    )
    try:
        auction.refresh_from_db()
        categorize_manifest_rows(auction)
        compute_and_save_manifest_distribution(auction)
        recompute_auction_valuation(auction)
    except Exception:
        logger.exception(
            'post-pull manifest processing failed auction_id=%s', auction.pk
        )

    mapping = _load_mapping_dict()
    unmapped_key_count = count_distinct_unmapped_keys(auction, mapping)
    total_batches = total_batches_for_count(unmapped_key_count)
    rows_with_fast_cat = (
        ManifestRow.objects.filter(auction=auction)
        .filter(fast_cat_value__isnull=False)
        .exclude(fast_cat_value='')
        .count()
    )

    # Clear the live progress cache now that the pull is fully resolved; the
    # client will switch to reading ``last_pull_log`` + the mutation success
    # payload for the "complete" state, so there's no value in lingering
    # phase=PROGRESS_PHASE_COMPLETE here.
    clear_progress(auction.pk)

    return (
        {
            'rows_saved': rows_saved,
            'rows_with_fast_cat': rows_with_fast_cat,
            'template_source': template_source,
            'ai_mappings_created': ai_mappings_created,
            'ai_batches_run': ai_batches_run,
            'ai_error': ai_error,
            'unmapped_key_count': unmapped_key_count,
            'total_batches': total_batches,
            'manifest_template_id': template.pk,
            'template_display_name': template.display_name,
            'header_signature': sig,
            'api_calls': int(fetch_state['api_calls']),
            'duration_seconds': round(duration, 4),
            'batches_processed': batches_processed,
            'used_socks5': used_socks5,
            'warnings': [],
        },
        200,
    )
