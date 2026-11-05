"""Get manifest, on request (Dash #76, design ship 7).

The owner taps Get manifest on an auction: a ``ManifestRequest`` is saved, and while his handed-over
B-Stock login is live a pull starts within seconds. Every running pull job takes waiting requests
before its own list, so a tap during the daily Pull waits for one auction, not forty. With no login,
the request waits; the next login hand-over starts it.

What starts a requests job (``kick``): the tap and a login hand-over (the two moments work appears),
and the 10-minute Scheduler as the backstop after a dyno restart. Each one goes through ``manifest_pull.start_job``'s lock, so there is never more
than one live job.

Ban safety (both job kinds, checked before each auction in ``manifest_pull``): a job stops when B-Stock
calls are switched off, #75's back-off is active, or the signed-in manifest calls reach
``buying_manifest_calls_per_hour`` in the last hour or ``buying_manifest_calls_per_day`` in the last day.
The requests stay waiting and say why. Nothing here ever signs in to B-Stock or holds a password: the
only login is the one the owner handed over.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.buying.models import Auction, ManifestPullJob, ManifestPullLog, ManifestRequest, ManifestRow
from apps.buying.services import bstock_calls
from apps.buying.services.bstock_token_store import current_token

logger = logging.getLogger(__name__)

KEY_CALLS_PER_HOUR = 'buying_manifest_calls_per_hour'
KEY_CALLS_PER_DAY = 'buying_manifest_calls_per_day'
# A manifest is 1-3 calls of up to 1,000 lines plus 1 quote call: the daily Pull of 40 lots is
# about 100 calls, which leaves room for 30+ requests an hour.
DEFAULT_CALLS_PER_HOUR = 200
DEFAULT_CALLS_PER_DAY = 600

NO_LOGIN = 'Waiting for your B-Stock login.'
ENDED = 'Ended before it was pulled.'


def _cap(key: str, default: int) -> int:
    from apps.core.models import AppSetting

    try:
        return max(1, int(AppSetting.objects.get(key=key).value))
    except (AppSetting.DoesNotExist, TypeError, ValueError):
        return default


def calls_per_hour_cap() -> int:
    return _cap(KEY_CALLS_PER_HOUR, DEFAULT_CALLS_PER_HOUR)


def calls_per_day_cap() -> int:
    return _cap(KEY_CALLS_PER_DAY, DEFAULT_CALLS_PER_DAY)


def signed_in_calls_since(since) -> int:
    """Signed-in manifest calls (pages and quotes are logged per attempt) since ``since``."""
    return int(ManifestPullLog.objects.filter(started_at__gte=since).aggregate(n=Sum('api_calls'))['n'] or 0)


def paused_reason(now=None) -> str:
    """Why request pulls may not call B-Stock right now ('' when they may)."""
    now = now or timezone.now()
    if bstock_calls.calls_off():
        return 'Paused: B-Stock calls are switched off (Admin, Assumptions).'
    until = bstock_calls.backoff_until(now)
    if until is not None:
        return f'Paused: B-Stock asked us to slow down. Resumes by itself at {timezone.localtime(until):%H:%M}.'
    if signed_in_calls_since(now - timedelta(hours=1)) >= calls_per_hour_cap():
        return 'Paused: the hourly B-Stock limit is reached. Resumes by itself within the hour.'
    if signed_in_calls_since(now - timedelta(days=1)) >= calls_per_day_cap():
        return 'Paused: the daily B-Stock limit is reached. Resumes by itself tomorrow.'
    return ''


def refusal(auction: Auction) -> str:
    """Why this lot can never be requested ('' when it can)."""
    from apps.buying.services.manifest_pull import pull_eligible

    if ManifestRow.objects.filter(auction_id=auction.pk).exists():
        return 'This lot already has its manifest.'
    if not (auction.lot_id or '').strip():
        return 'B-Stock gave no lot id for this listing. Upload the CSV instead.'
    if (auction.listing_type or '').strip().upper() == Auction.LISTING_TYPE_CONTRACT:
        return 'Contract listings have no manifest to pull.'
    if auction.manifest_pull_blocked:
        return (auction.manifest_pull_error or 'B-Stock will not give this manifest.') + ' Upload the CSV instead.'
    if not pull_eligible(auction):
        if auction.end_time is not None and auction.end_time <= timezone.now():
            return 'This auction has ended.'
        return 'This lot is not open, or its seller is switched off.'
    return ''


def open_request(auction_id: int) -> ManifestRequest | None:
    return ManifestRequest.objects.filter(
        auction_id=auction_id, status__in=ManifestRequest.OPEN_STATUSES
    ).first()


def request_manifest(auction: Auction, *, user=None) -> tuple[ManifestRequest | None, str]:
    """Save a request (or return the open one) and start a pull if the login is live."""
    why = refusal(auction)
    if why:
        return None, why
    existing = open_request(auction.pk)
    if existing is None:
        try:
            with transaction.atomic():
                existing = ManifestRequest.objects.create(auction=auction, requested_by=user)
        except IntegrityError:
            existing = open_request(auction.pk)
    kick(user=user)
    if existing is not None:
        existing.refresh_from_db()
    return existing, ''


def next_request_auction(skip: set[int]) -> int | None:
    """The oldest waiting request's auction, not yet tried by this job."""
    return (
        ManifestRequest.objects.filter(status=ManifestRequest.STATUS_REQUESTED)
        .exclude(auction_id__in=skip)
        .order_by('requested_at', 'pk')
        .values_list('auction_id', flat=True)
        .first()
    )


def waiting_count() -> int:
    return ManifestRequest.objects.filter(status=ManifestRequest.STATUS_REQUESTED).count()


def mark_pulling(auction_id: int, job_id: int) -> None:
    ManifestRequest.objects.filter(
        auction_id=auction_id, status=ManifestRequest.STATUS_REQUESTED
    ).update(status=ManifestRequest.STATUS_PULLING, job_id=job_id, error='')


def back_to_waiting(auction_ids, error: str = '') -> None:
    """Not the lot's fault (login ran out, paused, job stopped): it waits for the next pull."""
    ManifestRequest.objects.filter(
        auction_id__in=list(auction_ids), status=ManifestRequest.STATUS_PULLING
    ).update(status=ManifestRequest.STATUS_REQUESTED, error=error[:300])


def record_result(auction_id: int, result) -> None:
    """Close the open request on this auction from one pull result."""
    has_rows = ManifestRow.objects.filter(auction_id=auction_id).exists()
    if result.ok or has_rows:
        status, error = ManifestRequest.STATUS_PULLED, ''
    else:
        status, error = ManifestRequest.STATUS_FAILED, result.error or 'The pull did not get it.'
    ManifestRequest.objects.filter(
        auction_id=auction_id, status__in=ManifestRequest.OPEN_STATUSES
    ).update(status=status, error=error[:300], finished_at=timezone.now())


def reopen(auction_ids, error: str = '') -> None:
    """The job decided these refusals were the login, not the lots: they wait for the next login."""
    recent = timezone.now() - timedelta(hours=1)
    for req in ManifestRequest.objects.filter(
        auction_id__in=list(auction_ids), status=ManifestRequest.STATUS_FAILED, finished_at__gte=recent
    ):
        if open_request(req.auction_id) is not None:
            continue  # a new tap already waits
        ManifestRequest.objects.filter(pk=req.pk).update(
            status=ManifestRequest.STATUS_REQUESTED, error=error[:300], finished_at=None
        )


def fail_open(auction_id: int, error: str) -> None:
    ManifestRequest.objects.filter(
        auction_id=auction_id, status__in=ManifestRequest.OPEN_STATUSES
    ).update(status=ManifestRequest.STATUS_FAILED, error=error[:300], finished_at=timezone.now())


def tidy(now=None) -> None:
    """Ended lots fail; a request stuck in 'pulling' under a job that is no longer live waits again."""
    now = now or timezone.now()
    ManifestRequest.objects.filter(
        status__in=ManifestRequest.OPEN_STATUSES, auction__end_time__lte=now
    ).update(status=ManifestRequest.STATUS_FAILED, error=ENDED, finished_at=now)
    ManifestRequest.objects.filter(status=ManifestRequest.STATUS_PULLING).exclude(
        job__status__in=ManifestPullJob.LIVE_STATUSES
    ).update(status=ManifestRequest.STATUS_REQUESTED)


def kick(*, user=None, background: bool = True) -> ManifestPullJob | None:
    """
    Start (or resume) a requests job when requests wait, the login is live and calls may go out.
    A live job already takes requests first, so it is simply returned.
    """
    from apps.buying.services.manifest_pull import start_job

    tidy()
    if not waiting_count() or not current_token() or paused_reason():
        return None
    try:
        return start_job(user=user, background=background, kind=ManifestPullJob.KIND_REQUESTS)
    except Exception:
        logger.exception('could not start a requests pull')
        return None


def payload(auction: Auction) -> dict | None:
    """The newest request on this auction, with what the page should say now."""
    req = ManifestRequest.objects.filter(auction_id=auction.pk).order_by('-requested_at', '-pk').first()
    if req is None:
        return None
    note = req.error
    if req.status == ManifestRequest.STATUS_REQUESTED:
        note = ('' if current_token() else NO_LOGIN) or paused_reason() or req.error
    return {
        'id': req.pk,
        'status': req.status,
        'requested_at': req.requested_at.isoformat(),
        'finished_at': req.finished_at.isoformat() if req.finished_at else None,
        'note': note,
        'login_live': bool(current_token()),
    }
