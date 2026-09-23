"""Automatic manifest pulls for a shortlist of auctions (bstock_daily_buying Phase 1).

B-Stock's order-process manifest API only returns full manifests to a logged-in buyer
(anonymous callers get the same first 10 lines on every page). The superuser hands the app
their ~1-hour login token from the daily "Pull B-Stock manifests" routine and taps Pull; a
``ManifestPullJob`` then walks a shortlist fixed at its first run (ending soon, no manifest
yet, watchlisted and high priority first) and saves rows the same way valuation reads a CSV
upload.

Only a Pull starts a job, and only one job is live at a time. It runs in a background thread
right after the request that asks for it. The ``pull_shortlist_manifests`` command
(Scheduler, every 10 minutes) only resumes a job whose thread died; it never starts one, so a
handed-over login pulls what the owner asked for and no more.

Safety rules, in the order they bite:
- Every write a runner makes is conditional on it still owning the job, so a reclaimed or
  stopped job's old runner stops at its next page instead of racing the new one.
- Each auction is claimed with a row lock that re-checks it still needs a pull, so two
  runners never pull the same lot and a CSV uploaded mid-job is never overwritten.
- What happens to one lot stays on that lot: a 404, another 4xx, a manifest too large, or a
  single refused lot is recorded on that auction. A plain 401, or two different lots refused
  in a row, means the login: that login is forgotten and the job stops, and neither lot is
  blamed. B-Stock not answering stops the job and puts that one lot in the retry wait.
  Three failed manifests in a row also stop the job.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

import requests
from django.db import close_old_connections, connection, connections, transaction
from django.db.models import Exists, F, OuterRef, Q, QuerySet, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.buying.models import (
    Auction,
    CategoryMapping,
    ManifestPullJob,
    ManifestPullLog,
    ManifestRow,
    WatchlistEntry,
)
from apps.buying.services import scraper
from apps.buying.services.ai_key_mapping import (
    count_distinct_unmapped_keys_after_rows,
    map_one_fast_cat_batch,
)
from apps.buying.services.bstock_token_store import clear_token, current_token
from apps.buying.services.buying_settings import (
    get_manifest_pull_max_per_run,
    get_manifest_pull_page_delay_seconds,
    get_manifest_pull_retry_hours,
    get_manifest_pull_window_hours,
)
from apps.buying.services.manifest_template import (
    NO_KEY_SENTINEL,
    marketplace_fast_prefix,
    slugify_segment,
)
from apps.buying.services.normalize import normalize_manifest_row
from apps.buying.services.valuation import (
    compute_and_save_manifest_distribution,
    recompute_auction_valuation,
)

logger = logging.getLogger(__name__)

# One pull never asks the AI to map more than this many batches of 10 keys.
MAX_MAPPING_BATCHES = 20
# Finishing an earlier pull's mapping is cheaper: a few batches, then the next job tries again.
PENDING_MAPPING_BATCHES = 3

# The heartbeat moves after every page, mapping batch (60 s AI timeout, SDK retries), and
# auction; this much silence means the thread or dyno died and the job may be resumed.
STALE_JOB_AFTER = timedelta(minutes=8)
# A queued job should start within seconds; one still queued after this was never picked up.
QUEUED_STALL_AFTER = timedelta(minutes=1)

# A job still live this long after it was asked for is abandoned (the login it needed is gone).
ABANDONED_AFTER = timedelta(hours=3)

# Only auctions a sweep has seen lately (hourly): a lot bought out or pulled early keeps 'open'.
SEEN_WITHIN = timedelta(hours=3)

# This many failed manifests in a row means something systemic; stop instead of burning the list.
MAX_CONSECUTIVE_FAILURES = 3
# This many different lots refused in a row means the login, not the lots.
REFUSALS_MEAN_LOGIN = 2

# Auto-pulled rows for auctions that ended this long ago are pruned (not on the watchlist).
PRUNE_AUTO_AFTER = timedelta(days=14)

LOGIN_EXPIRED = 'The B-Stock login ran out. Reload an auction page on B-Stock, then tap Send to Eco-Thrift.'
LOGIN_REFUSED = 'B-Stock did not accept the login. Reload an auction page on B-Stock, then tap Send to Eco-Thrift.'
STOPPED_BY_OWNER = 'Stopped by owner.'
STOPPED_DISCONNECTED = 'Stopped: the B-Stock login was disconnected.'

_JOB_LOCK_KEY = 804_217_002


class JobLost(Exception):
    """This runner no longer owns the job (stopped by the owner, or reclaimed as stale)."""


class JobDeadline(JobLost):
    """The scheduler's time budget ran out mid-auction; the job goes back to queued."""


class ManifestArrived(Exception):
    """Rows appeared on the auction while this pull was downloading (a CSV upload won)."""


@dataclass
class PullResult:
    auction_id: int
    ok: bool
    rows: int = 0
    total: int | None = None
    api_calls: int = 0
    seconds: float = 0.0
    error: str = ''
    unmapped_keys: int = 0
    # Nothing was attempted: the auction no longer needed a pull when its turn came.
    skipped: bool = False
    # B-Stock will never give this manifest (too large, or none): the pull stops trying.
    blocked: bool = False
    # B-Stock refused this lot (400/403/preview). Two in a row means the login.
    refused: bool = False


def _noop() -> None:
    return None


def _refresh_connection() -> None:
    """Drop a dead or stale DB connection between auctions (a job can outlive one)."""
    if not connection.in_atomic_block:
        close_old_connections()


def _advisory_lock(key: int) -> None:
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])


def _needs_pull_q(now) -> Q:
    """Filters an auction must pass at claim time (the shortlist adds the window and freshness)."""
    retry_before = now - timedelta(hours=get_manifest_pull_retry_hours())
    return (
        Q(
            marketplace__is_active=True,
            archived_at__isnull=True,
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            end_time__gt=now,
            manifest_pull_blocked=False,
        )
        & ~Q(lot_id__isnull=True)
        & ~Q(lot_id='')
        & ~Q(listing_type__iexact=Auction.LISTING_TYPE_CONTRACT)
        & ~Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk')))
        & (Q(manifest_pull_attempted_at__isnull=True) | Q(manifest_pull_attempted_at__lt=retry_before))
    )


def _window_q(now) -> Q:
    return Q(
        end_time__lte=now + timedelta(hours=get_manifest_pull_window_hours()),
        last_updated_at__gte=now - SEEN_WITHIN,
    )


def shortlist_queryset(now=None) -> QuerySet[Auction]:
    """
    Auctions worth a pull right now, best first.

    Open or closing, seen by a sweep in the last few hours, ending inside the window, has a
    lot id, not a contract listing, not archived, marketplace active, no manifest rows yet,
    not blocked, and no failed attempt inside the retry wait. Watchlisted first, then
    priority, then soonest ending.
    """
    now = now or timezone.now()
    return (
        Auction.objects.filter(_needs_pull_q(now) & _window_q(now))
        .annotate(on_watchlist=Exists(WatchlistEntry.objects.filter(auction_id=OuterRef('pk'))))
        .select_related('marketplace')
        .order_by('-on_watchlist', F('priority').desc(nulls_last=True), 'end_time', 'pk')
    )


def waiting_retry_count(now=None) -> int:
    """Auctions in the window whose last pull failed and that wait out the retry window."""
    now = now or timezone.now()
    retry_before = now - timedelta(hours=get_manifest_pull_retry_hours())
    return (
        Auction.objects.filter(
            _window_q(now),
            marketplace__is_active=True,
            archived_at__isnull=True,
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            end_time__gt=now,
            manifest_pull_attempted_at__gte=retry_before,
            manifest_pull_blocked=False,
        )
        # In-flight claims carry a stamp but no error yet: they are not waiting.
        .exclude(manifest_pull_error='')
        .exclude(Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk'))))
        .count()
    )


def pull_eligible(auction: Auction) -> bool:
    """Would the pull ever pick this auction (ignoring the time window and retry wait)?"""
    return bool(
        auction.marketplace.is_active
        and auction.archived_at is None
        and auction.status in (Auction.STATUS_OPEN, Auction.STATUS_CLOSING)
        and auction.end_time is not None
        and auction.end_time > timezone.now()
        and not auction.manifest_pull_blocked
        and (auction.lot_id or '').strip()
        and (auction.listing_type or '').strip().upper() != Auction.LISTING_TYPE_CONTRACT
    )


def api_fast_cat_key(auction: Auction, raw_row: dict) -> str:
    """
    Category key for an API row: vendor prefix, ``api``, top B-Stock category, sub-category.

    The ``api`` segment keeps these apart from CSV keys, which are built from different
    columns; unknown keys go through the same AI mapping as a CSV upload.
    """
    prefix = marketplace_fast_prefix(auction.marketplace)
    cats = raw_row.get('categories')
    top = cats[0] if isinstance(cats, list) and cats else ''
    custom = raw_row.get('customAttributes') if isinstance(raw_row.get('customAttributes'), dict) else {}
    sub = custom.get('subCategory') or raw_row.get('otherCategory') or ''
    segments = [seg for seg in (slugify_segment(str(top)), slugify_segment(str(sub))) if seg]
    if not segments:
        return f'{prefix}-api-{NO_KEY_SENTINEL}'
    return f"{prefix}-api-{'-'.join(segments)}"


def save_api_manifest(auction: Auction, items: list[dict], *, replace: bool = False) -> int:
    """
    Store normalized API rows. Returns rows saved.

    Locks the auction row (CSV upload and manifest delete lock it too); unless ``replace``,
    raises ``ManifestArrived`` when rows appeared since the pull started.
    """
    mapping = dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))
    bulk: list[ManifestRow] = []
    for i, raw in enumerate(items, start=1):
        std = normalize_manifest_row(raw, whole_numbers_are_cents=True)
        key = api_fast_cat_key(auction, raw)
        value = mapping.get(key)
        bulk.append(
            ManifestRow(
                auction=auction,
                row_number=i,
                raw_data=raw,
                title=std['title'],
                brand=std['brand'],
                model=std['model'],
                sku=std['sku'],
                upc=std['upc'],
                quantity=std['quantity'],
                retail_value=std['retail_value'],
                condition=std['condition'],
                notes=std['notes'],
                fast_cat_key=key,
                fast_cat_value=value,
                category_confidence=ManifestRow.CONF_FAST_CAT if value else None,
            )
        )
    with transaction.atomic():
        locked = Auction.objects.select_for_update().get(pk=auction.pk)
        has_rows = ManifestRow.objects.filter(auction_id=locked.pk).exists()
        if has_rows and not replace:
            raise ManifestArrived()
        if has_rows:
            ManifestRow.objects.filter(auction_id=locked.pk).delete()
        ManifestRow.objects.bulk_create(bulk)
        Auction.objects.filter(pk=locked.pk).update(
            has_manifest=bool(bulk),
            manifest_pulled_at=timezone.now(),
            manifest_source=Auction.MANIFEST_SOURCE_AUTO if bulk else '',
            manifest_pull_error='',
            manifest_pull_blocked=False,
        )
    auction.refresh_from_db()
    return len(bulk)


def apply_known_mappings(auction: Auction) -> int:
    """Fill rows whose key another upload or pull has mapped since they were saved."""
    pending = set(
        ManifestRow.objects.filter(auction=auction, fast_cat_value__isnull=True)
        .exclude(fast_cat_key='')
        .values_list('fast_cat_key', flat=True)
    )
    if not pending:
        return 0
    filled = 0
    for key, value in CategoryMapping.objects.filter(source_key__in=pending).values_list(
        'source_key', 'canonical_category'
    ):
        filled += ManifestRow.objects.filter(
            auction=auction, fast_cat_key=key, fast_cat_value__isnull=True
        ).update(fast_cat_value=value, category_confidence=ManifestRow.CONF_FAST_CAT)
    return filled


def _value(auction: Auction) -> None:
    try:
        auction.refresh_from_db()
        compute_and_save_manifest_distribution(auction)
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
    except Exception:
        logger.exception('manifest pull: valuation failed for auction %s', auction.pk)


def map_categories_and_value(
    auction: Auction,
    *,
    touch: Callable[[], None] = _noop,
    deadline: float | None = None,
    max_batches: int = MAX_MAPPING_BATCHES,
) -> int:
    """
    Map category keys (known mappings first, then the AI when configured), then value the
    auction. Mapping trouble never skips the valuation, and neither does a stop mid-mapping
    (the rows are saved; the valuation must match them). Returns keys still unmapped.
    """
    try:
        apply_known_mappings(auction)
        for _ in range(max_batches):
            if deadline is not None and time.monotonic() >= deadline:
                break
            if count_distinct_unmapped_keys_after_rows(auction) == 0:
                break
            body = map_one_fast_cat_batch(auction, mapping={})
            apply_known_mappings(auction)
            touch()
            if body.get('error') or not body.get('keys_mapped'):
                break
    except JobLost:
        _value(auction)
        raise
    except Exception:
        logger.exception('manifest pull: category mapping failed for auction %s', auction.pk)
    _value(auction)
    return count_distinct_unmapped_keys_after_rows(auction)


def _claim_auction(auction_id: int, now, *, force: bool) -> tuple[Auction | None, object]:
    """
    Lock the auction, re-check it still needs a pull, and stamp the attempt. Returns the
    auction (None when it no longer qualifies) and the previous stamp, to restore if the
    attempt ends for a reason that is not the auction's fault.
    """
    with transaction.atomic():
        qs = Auction.objects.select_for_update(of=('self',)).select_related('marketplace').filter(pk=auction_id)
        if not force:
            qs = qs.filter(_needs_pull_q(now))
        auction = qs.first()
        if auction is None:
            return None, None
        previous = auction.manifest_pull_attempted_at
        # A fresh attempt: yesterday's error no longer describes it (failures write their own).
        Auction.objects.filter(pk=auction.pk).update(manifest_pull_attempted_at=now, manifest_pull_error='')
        auction.manifest_pull_attempted_at = now
        auction.manifest_pull_error = ''
        return auction, previous


def _failure_text(fetch: scraper.ManifestFetch) -> str:
    total = fetch.total
    if fetch.reason == 'too_large':
        size = f'{total:,} lines' if total is not None else 'over 10,000 lines'
        return f'Manifest has {size}, more than the pull takes. Upload the CSV instead.'
    if fetch.reason == 'unstable':
        return f'B-Stock paging returned {len(fetch.items):,} unique lines of {total:,}. It will be tried again.'
    if fetch.reason == 'too_many_calls':
        return 'B-Stock sent the manifest in pages too small to finish. It will be tried again.'
    if fetch.reason == 'preview':
        return 'B-Stock sent only the 10-line preview.'
    return 'B-Stock did not send the whole manifest.'


def pull_manifest_for_auction(
    auction: Auction,
    *,
    token: str | None = None,
    page_delay_seconds: float | None = None,
    session: requests.Session | None = None,
    touch: Callable[[], None] = _noop,
    deadline: float | None = None,
    force: bool = False,
) -> PullResult:
    """
    Claim, download, save, map, and value one auction's manifest with the owner's login
    (``token``, default the stored one). Every attempt writes a ``ManifestPullLog``.

    Raises, after undoing the attempt stamp (not the auction's fault):
    - ``scraper.BStockAuthError``: no login, or B-Stock refused it outright (401).
    - ``JobLost`` / ``JobDeadline``: the job was stopped, reclaimed, or out of time.
    Raises ``scraper.BStockUnavailable`` (B-Stock not answering) with the stamp kept, so
    this one lot waits out the retry window and the next Pull starts past it.
    Everything else is recorded on the auction: a refused lot (``refused``), a lot B-Stock
    will never give (``blocked``), or a transient failure that waits for the retry window.

    ``force`` (the command's ``--auction-id``) skips the needs-a-pull check and replaces rows.
    """
    if page_delay_seconds is None:
        page_delay_seconds = get_manifest_pull_page_delay_seconds()
    started = timezone.now()
    claimed, previous = _claim_auction(auction.pk, started, force=force)
    if claimed is None:
        return PullResult(auction_id=auction.pk, ok=False, skipped=True, error='No longer needs a pull.')
    auction = claimed
    result = PullResult(auction_id=auction.pk, ok=False)
    fetch_seconds = 0.0
    bearer = token if token is not None else current_token()

    def restore() -> None:
        Auction.objects.filter(pk=auction.pk).update(manifest_pull_attempted_at=previous)

    def calls(exc: BaseException) -> int:
        return int(getattr(exc, 'api_calls', 0) or 0)

    fetch = None
    t0 = time.perf_counter()
    try:
        if not bearer:
            raise scraper.BStockAuthError(LOGIN_EXPIRED)
        if not (auction.lot_id or '').strip():
            result.error = 'No B-Stock lot id on this auction.'
            result.blocked = True
        else:
            fetch = scraper.fetch_manifest_items(
                auction.lot_id.strip(),
                bearer=bearer,
                page_delay_seconds=page_delay_seconds,
                session=session,
                on_page=touch,
            )
            result.api_calls = fetch.api_calls
            result.total = fetch.total
    except scraper.BStockAuthError as e:
        restore()
        result.api_calls = calls(e)
        _log_attempt(auction, started, result, time.perf_counter() - t0, LOGIN_REFUSED if calls(e) else LOGIN_EXPIRED)
        raise scraper.BStockAuthError(LOGIN_REFUSED if calls(e) else LOGIN_EXPIRED) from e
    except JobLost as e:
        restore()
        result.api_calls = calls(e)
        _log_attempt(auction, started, result, time.perf_counter() - t0, 'Stopped mid-download.')
        raise
    except scraper.BStockUnavailable as e:
        result.api_calls = calls(e)
        result.error = f'B-Stock did not answer ({e}). It will be tried again.'
        _record_failure(auction, result)
        _log_attempt(auction, started, result, time.perf_counter() - t0, result.error)
        raise
    except scraper.BStockLotRefused as e:
        result.api_calls = calls(e)
        result.refused = True
        result.error = str(e)
    except scraper.BStockLotError as e:
        result.api_calls = calls(e)
        result.error = str(e)
        result.blocked = e.permanent
    except Exception as e:
        logger.exception('manifest pull crashed downloading auction %s', auction.pk)
        result.error = f'Crashed ({type(e).__name__}). It will be tried again.'
    fetch_seconds = time.perf_counter() - t0

    if fetch is not None and not result.error:
        if not fetch.complete:
            result.error = _failure_text(fetch)
            result.blocked = fetch.reason == 'too_large'
        elif not fetch.items:
            result.error = 'B-Stock has no manifest lines for this lot.'
            result.blocked = True
        else:
            try:
                result.rows = save_api_manifest(auction, fetch.items, replace=force)
                result.ok = True
                result.unmapped_keys = map_categories_and_value(auction, touch=touch, deadline=deadline)
            except ManifestArrived:
                result.skipped = True
                result.error = 'A manifest was uploaded while this pull ran; kept that one.'
            except JobLost as e:
                # Rows are saved and valued; the job records this success, then stops.
                result.seconds = fetch_seconds
                _log_attempt(auction, started, result, fetch_seconds, '')
                e.result = result  # type: ignore[attr-defined]
                raise
            except Exception as e:
                logger.exception('manifest pull crashed saving auction %s', auction.pk)
                result.ok = False
                result.error = f'Crashed ({type(e).__name__}). It will be tried again.'

    if not result.ok and not result.skipped:
        _record_failure(auction, result)
    result.seconds = fetch_seconds
    _log_attempt(auction, started, result, fetch_seconds, result.error)
    return result


def _record_failure(auction: Auction, result: PullResult) -> None:
    Auction.objects.filter(pk=auction.pk).update(
        manifest_pull_error=result.error[:300],
        manifest_pull_blocked=result.blocked,
    )


def _log_attempt(auction: Auction, started, result: PullResult, fetch_seconds: float, error: str) -> None:
    try:
        ManifestPullLog.objects.create(
            auction=auction,
            started_at=started,
            rows_downloaded=result.rows,
            api_calls=result.api_calls,
            duration_seconds=fetch_seconds,
            # Authenticated manifest calls always go direct (see scraper.fetch_manifest_items).
            used_socks5=False,
            success=result.ok,
            error_message=(error or '')[:1000],
        )
    except Exception:
        logger.exception('could not write ManifestPullLog for auction %s', auction.pk)
    logger.info(
        'manifest pull auction=%s ok=%s rows=%s total=%s calls=%s %.1fs %s',
        auction.pk,
        result.ok,
        result.rows,
        result.total,
        result.api_calls,
        fetch_seconds,
        error,
    )


# --- jobs -----------------------------------------------------------------------------


def _claimable_q(now) -> Q:
    return Q(status=ManifestPullJob.STATUS_QUEUED) | Q(
        status=ManifestPullJob.STATUS_RUNNING,
        heartbeat_at__lt=now - STALE_JOB_AFTER,
    )


def _expire_abandoned_jobs(now) -> None:
    ManifestPullJob.objects.filter(
        status__in=ManifestPullJob.LIVE_STATUSES,
        created_at__lt=now - ABANDONED_AFTER,
    ).filter(Q(heartbeat_at__isnull=True) | Q(heartbeat_at__lt=now - STALE_JOB_AFTER)).update(
        status=ManifestPullJob.STATUS_FAILED,
        error='Abandoned: it never finished while the login lasted. Pull again.',
        finished_at=now,
        runner='',
    )


class _Runner:
    """The claim on one job; every write is conditional on still holding it."""

    def __init__(self, job_id: int, token: str, deadline: float | None):
        self.job_id = job_id
        self.token = token
        self.deadline = deadline

    def _mine(self):
        return ManifestPullJob.objects.filter(pk=self.job_id, runner=self.token)

    def write(self, **fields) -> None:
        fields['heartbeat_at'] = timezone.now()
        if not self._mine().filter(status=ManifestPullJob.STATUS_RUNNING).update(**fields):
            raise JobLost()

    def touch(self) -> None:
        """Heartbeat inside an auction; also where the scheduler's time budget bites."""
        self.write()
        if self.deadline is not None and time.monotonic() >= self.deadline:
            raise JobDeadline()

    def record(self, **fields) -> None:
        """Save an auction's result even if the owner pressed Stop while it ran, then stop."""
        fields['heartbeat_at'] = timezone.now()
        mine = self._mine()
        if not mine.filter(status__in=[ManifestPullJob.STATUS_RUNNING, ManifestPullJob.STATUS_STOPPED]).update(
            **fields
        ):
            raise JobLost()
        if not mine.filter(status=ManifestPullJob.STATUS_RUNNING).exists():
            raise JobLost()

    def finish(self, status: str, error: str = '') -> None:
        now = timezone.now()
        self._mine().filter(status=ManifestPullJob.STATUS_RUNNING).update(
            status=status,
            error=error[:300],
            finished_at=None if status == ManifestPullJob.STATUS_QUEUED else now,
            heartbeat_at=now,
            runner='' if status == ManifestPullJob.STATUS_QUEUED else self.token,
        )


def _finish_pending_mapping(runner: _Runner, deadline: float | None, limit: int = 5) -> None:
    """
    Auto-pulled auctions pulled in the last day and a half whose mapping never finished (AI
    down, dyno killed): a few more batches each. No B-Stock call, so no login needed.
    """
    now = timezone.now()
    unmapped = ManifestRow.objects.filter(
        auction_id=OuterRef('pk'), fast_cat_value__isnull=True
    ).exclude(fast_cat_key='').exclude(fast_cat_key__contains=NO_KEY_SENTINEL)
    for auction in Auction.objects.filter(
        manifest_source=Auction.MANIFEST_SOURCE_AUTO,
        end_time__gt=now,
        manifest_pulled_at__gte=now - timedelta(hours=36),
    ).filter(Exists(unmapped))[:limit]:
        if deadline is not None and time.monotonic() >= deadline:
            return
        map_categories_and_value(
            auction, touch=runner.touch, deadline=deadline, max_batches=PENDING_MAPPING_BATCHES
        )
        runner.touch()


def run_job(job_id: int, *, deadline: float | None = None) -> ManifestPullJob | None:
    """
    Claim the job (queued, or running but silent) and pull its shortlist.

    The shortlist is fixed the first time a job runs; a resumed job works through the rest.
    ``deadline`` (``time.monotonic()`` value) sends the job back to queued, between auctions
    or mid-auction.
    """
    now = timezone.now()
    token = uuid.uuid4().hex
    claimed = ManifestPullJob.objects.filter(pk=job_id).filter(_claimable_q(now)).update(
        status=ManifestPullJob.STATUS_RUNNING,
        runner=token,
        started_at=Coalesce(F('started_at'), Value(now)),
        heartbeat_at=now,
    )
    if not claimed:
        return ManifestPullJob.objects.filter(pk=job_id).first()
    runner = _Runner(job_id, token, deadline)
    session = requests.Session()
    try:
        _run_claimed(runner, session, deadline)
    except JobDeadline:
        runner.finish(ManifestPullJob.STATUS_QUEUED)
    except JobLost:
        pass
    except Exception as e:
        logger.exception('manifest pull job %s crashed', job_id)
        _refresh_connection()
        try:
            runner.finish(ManifestPullJob.STATUS_FAILED, f'Crashed ({type(e).__name__}). Pull again.')
        except Exception:
            logger.exception('could not mark manifest pull job %s failed', job_id)
    finally:
        session.close()
    return ManifestPullJob.objects.filter(pk=job_id).first()


def _release_in_flight(job: ManifestPullJob, remaining: list[int]) -> None:
    """
    A resumed job's first auction may still carry the dead runner's claim stamp: without this
    it would be skipped and sit out the whole retry window for nothing.
    """
    if not job.started_at or not remaining:
        return
    Auction.objects.filter(
        pk__in=remaining,
        manifest_pull_attempted_at__gte=job.started_at,
        manifest_pull_error='',
    ).exclude(Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk')))).update(
        manifest_pull_attempted_at=None
    )


def _unblame(auction_ids: list[int]) -> None:
    """The lots were refused because of the login, not themselves: back on the shortlist."""
    Auction.objects.filter(pk__in=auction_ids).exclude(
        Exists(ManifestRow.objects.filter(auction_id=OuterRef('pk')))
    ).update(manifest_pull_attempted_at=None, manifest_pull_error='', manifest_pull_blocked=False)


def _run_claimed(runner: _Runner, session: requests.Session, deadline: float | None) -> None:
    job = ManifestPullJob.objects.get(pk=runner.job_id)
    _finish_pending_mapping(runner, deadline)
    if not current_token():
        runner.finish(ManifestPullJob.STATUS_FAILED, LOGIN_EXPIRED)
        return
    results = list(job.results)
    finished = {row.get('auction_id') for row in results}
    if job.auction_ids:
        _release_in_flight(job, [pk for pk in job.auction_ids if pk not in finished])
    else:
        ids = list(
            shortlist_queryset().values_list('pk', flat=True)[: get_manifest_pull_max_per_run()]
        )
        runner.write(auction_ids=ids, total=len(ids))
        job.auction_ids, job.total = ids, len(ids)

    remaining = [pk for pk in job.auction_ids if pk not in finished]
    delay = get_manifest_pull_page_delay_seconds()
    failures_in_a_row = 0
    refused_in_a_row: list[int] = []
    for index, auction_id in enumerate(remaining):
        if deadline is not None and time.monotonic() >= deadline:
            runner.finish(ManifestPullJob.STATUS_QUEUED)
            return
        _refresh_connection()
        runner.touch()
        login = current_token()
        if not login:
            runner.finish(ManifestPullJob.STATUS_FAILED, LOGIN_EXPIRED)
            return
        if index and delay > 0:
            time.sleep(delay)
        auction = Auction.objects.select_related('marketplace').filter(pk=auction_id).first()
        if auction is None:
            result = PullResult(auction_id=auction_id, ok=False, skipped=True, error='Auction is gone.')
        else:
            try:
                result = pull_manifest_for_auction(
                    auction,
                    token=login,
                    page_delay_seconds=delay,
                    session=session,
                    touch=runner.touch,
                    deadline=deadline,
                )
            except scraper.BStockAuthError as e:
                _unblame(refused_in_a_row)
                clear_token(login)
                runner.finish(ManifestPullJob.STATUS_FAILED, str(e) or LOGIN_REFUSED)
                return
            except scraper.BStockUnavailable as e:
                runner.finish(
                    ManifestPullJob.STATUS_FAILED,
                    f'B-Stock is not answering ({e}). Pull again in a few minutes.',
                )
                return
            except JobLost as e:
                done = getattr(e, 'result', None)
                if done is not None:
                    results.append(_result_row(auction_id, auction, done))
                    try:
                        runner.record(
                            results=results,
                            done_count=len(results),
                            ok_count=sum(1 for row in results if row.get('ok')),
                        )
                    except JobLost:
                        pass
                raise
        results.append(_result_row(auction_id, auction, result))
        runner.record(
            results=results,
            done_count=len(results),
            ok_count=sum(1 for row in results if row.get('ok')),
        )
        if result.refused:
            refused_in_a_row.append(auction_id)
            if len(refused_in_a_row) >= REFUSALS_MEAN_LOGIN:
                _unblame(refused_in_a_row)
                clear_token(login)
                runner.finish(ManifestPullJob.STATUS_FAILED, LOGIN_REFUSED)
                return
        else:
            refused_in_a_row = []
        counts_as_failure = not (result.ok or result.skipped or result.blocked or result.refused)
        failures_in_a_row = failures_in_a_row + 1 if counts_as_failure else 0
        more_to_go = index < len(remaining) - 1
        if failures_in_a_row >= MAX_CONSECUTIVE_FAILURES and more_to_go:
            runner.finish(
                ManifestPullJob.STATUS_FAILED,
                f'Stopped after {MAX_CONSECUTIVE_FAILURES} manifests in a row failed. '
                'Check one on B-Stock, then pull again.',
            )
            return
    # A list that ends on one refused lot says nothing about the login: that lot keeps its record.
    runner.finish(ManifestPullJob.STATUS_DONE)


def _result_row(auction_id: int, auction: Auction | None, result: PullResult) -> dict:
    return {
        'auction_id': auction_id,
        'title': ((auction.title if auction else '') or '')[:120],
        'ok': result.ok,
        'skipped': result.skipped,
        'blocked': result.blocked,
        'rows': result.rows,
        'unmapped_keys': result.unmapped_keys,
        'error': result.error,
    }


def _run_job_in_thread(job_id: int) -> None:
    try:
        run_job(job_id)
    except Exception:
        logger.exception('manifest pull job %s crashed', job_id)
    finally:
        # CONN_MAX_AGE keeps healthy connections open; a finished thread must close its own.
        connections.close_all()


def _start_thread(job_id: int) -> None:
    threading.Thread(
        target=_run_job_in_thread,
        args=(job_id,),
        daemon=True,
        name=f'manifest-pull-{job_id}',
    ).start()


def start_job(*, user=None, background: bool = True) -> ManifestPullJob:
    """
    Start a pull, resume one whose runner died, or return the one already running.

    Serialized with an advisory lock so two taps (desk and phone) never make two jobs.
    ``background=False`` leaves the job for the caller to ``run_job``.
    """
    with transaction.atomic():
        _advisory_lock(_JOB_LOCK_KEY)
        now = timezone.now()
        _expire_abandoned_jobs(now)
        live = (
            ManifestPullJob.objects.filter(status__in=ManifestPullJob.LIVE_STATUSES)
            .order_by('-created_at')
            .first()
        )
        if live is not None and not ManifestPullJob.objects.filter(pk=live.pk).filter(_claimable_q(now)).exists():
            return live
        job = live or ManifestPullJob.objects.create(requested_by=user)
        if background:
            transaction.on_commit(lambda: _start_thread(job.pk))
    return job


def stop_job(reason: str = STOPPED_BY_OWNER) -> ManifestPullJob | None:
    """Stop the live job now; its runner notices at its next page or auction."""
    live = (
        ManifestPullJob.objects.filter(status__in=ManifestPullJob.LIVE_STATUSES)
        .order_by('-created_at')
        .first()
    )
    if live is None:
        return None
    ManifestPullJob.objects.filter(pk=live.pk, status__in=ManifestPullJob.LIVE_STATUSES).update(
        status=ManifestPullJob.STATUS_STOPPED,
        error=reason,
        finished_at=timezone.now(),
    )
    live.refresh_from_db()
    return live


def resume_claimable_jobs(*, deadline: float | None = None) -> list[ManifestPullJob]:
    """Scheduler entry: expire abandoned jobs, then resume any whose runner died, oldest first."""
    now = timezone.now()
    _expire_abandoned_jobs(now)
    ids = list(
        ManifestPullJob.objects.filter(_claimable_q(now))
        .order_by('created_at')
        .values_list('pk', flat=True)
    )
    jobs: list[ManifestPullJob] = []
    for pk in ids:
        if deadline is not None and time.monotonic() >= deadline:
            break
        try:
            job = run_job(pk, deadline=deadline)
        except Exception:
            logger.exception('could not resume manifest pull job %s', pk)
            continue
        if job is not None:
            jobs.append(job)
    return jobs


def prune_auto_manifests(now=None, *, limit: int = 100) -> int:
    """
    Drop auto-pulled rows for auctions that ended a while ago and were never watchlisted.
    Watchlist anything you bid on or win: until Phase 2 links a win to its PO, that is how
    its manifest is kept. Each pull stores up to 10,000 rows with the raw API line. The pruned
    auctions are re-valued without them. At most ``limit`` per run. Returns auctions pruned.
    """
    now = now or timezone.now()
    ids = list(
        Auction.objects.filter(
            manifest_source=Auction.MANIFEST_SOURCE_AUTO,
            end_time__lt=now - PRUNE_AUTO_AFTER,
        )
        .exclude(Exists(WatchlistEntry.objects.filter(auction_id=OuterRef('pk'))))
        .values_list('pk', flat=True)[:limit]
    )
    if not ids:
        return 0
    with transaction.atomic():
        ManifestRow.objects.filter(auction_id__in=ids).delete()
        Auction.objects.filter(pk__in=ids).update(
            has_manifest=False,
            manifest_source='',
            manifest_category_distribution=None,
        )
    for auction in Auction.objects.filter(pk__in=ids):
        try:
            recompute_auction_valuation(auction)
        except Exception:
            logger.exception('could not re-value pruned auction %s', auction.pk)
    return len(ids)


def job_payload(job: ManifestPullJob | None) -> dict | None:
    if job is None:
        return None
    now = timezone.now()
    if job.status == ManifestPullJob.STATUS_RUNNING:
        stalled = job.heartbeat_at is not None and job.heartbeat_at < now - STALE_JOB_AFTER
    elif job.status == ManifestPullJob.STATUS_QUEUED:
        stalled = (job.heartbeat_at or job.created_at) < now - QUEUED_STALL_AFTER
    else:
        stalled = False
    return {
        'id': job.pk,
        'status': job.status,
        'total': job.total,
        'done': job.done_count,
        'ok': job.ok_count,
        'error': job.error,
        'created_at': job.created_at.isoformat(),
        'finished_at': job.finished_at.isoformat() if job.finished_at else None,
        # Live but nobody working it (its runner died); Pull resumes it.
        'stalled': stalled,
        'results': job.results,
    }
