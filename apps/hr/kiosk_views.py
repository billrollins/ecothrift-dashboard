"""Time kiosk API.

Hosted `/api/hr/kiosk/*`: the signed-in host (staff JWT, `hr.kiosk:use`) runs
the tablet; every mutation takes the card token and acts as that person.

Public `/api/hr/clock/*`: AllowAny, no authentication at all. The card is the
only identity. Board is redacted. No pay edits.
"""
from __future__ import annotations

import secrets

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaff
from apps.hr.models import KioskEvent
from apps.hr import kiosk_service as svc

DEVICE_COOKIE = 'clock_device'
DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60
NOT_HERE = 'Not available here.'


def _generic(status_code: int) -> Response:
    return Response({'detail': svc.GENERIC_MESSAGE, 'code': 'card'}, status=status_code)


def _error(exc: svc.KioskError) -> Response:
    return Response({'detail': exc.detail, 'code': exc.code}, status=exc.status)


class _KioskBase(APIView):
    """Shared plumbing. Subclasses set `route`, `redacted`, `fail_limit`."""

    route = KioskEvent.ROUTE_KIOSK
    redacted = False
    fail_limit = svc.HOSTED_FAIL_LIMIT

    def ctx(self, request) -> svc.KioskContext:
        host = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        return svc.KioskContext(route=self.route, host=host, ip=svc.client_ip(request))

    def throttle_key(self, request) -> str:
        return f'kiosk:identify:{request.user.pk}'

    def gate_check(self, request) -> Response | None:
        """Public route hook: IP allowlist. None means proceed."""
        return None

    def finalize(self, request, response: Response) -> Response:
        return response

    def identify_or_fail(self, request):
        """Return (user, None) or (None, Response)."""
        key = self.throttle_key(request)
        if svc.is_locked(key):
            return None, _generic(status.HTTP_401_UNAUTHORIZED)
        user = svc.identify(str(request.data.get('token') or ''))
        if user is None:
            ctx = self.ctx(request)
            svc.log_event(ctx, 'identify_fail')
            if svc.note_identify_failure(key, limit=self.fail_limit):
                svc.log_event(ctx, 'cooldown', key=key, limit=self.fail_limit)
            return None, _generic(status.HTTP_401_UNAUTHORIZED)
        return user, None

    def _preview_response(self, request, user, *, log_ok: bool = False) -> Response:
        ctx = self.ctx(request)
        if log_ok:
            svc.log_event(ctx, 'identify_ok', subject=user)
        payload = svc.preview(user, redacted=self.redacted, ctx=ctx)
        return Response(payload)

    def _run(self, request, action):
        """Common mutation shape: identify, run `action(user, ctx)`, return fresh preview."""
        blocked = self.gate_check(request)
        if blocked is not None:
            return blocked
        user, failure = self.identify_or_fail(request)
        if failure is not None:
            return self.finalize(request, failure)
        ctx = self.ctx(request)
        try:
            result = action(user, ctx)
        except svc.KioskError as exc:
            return self.finalize(request, _error(exc))
        payload = svc.preview(user, redacted=self.redacted)
        if isinstance(result, dict):
            payload['result'] = result
        return self.finalize(request, Response(payload))


# ── Endpoints (route-agnostic bodies) ─────────────────────────────────────────

class _Board(_KioskBase):
    def get(self, request):
        blocked = self.gate_check(request)
        if blocked is not None:
            return blocked
        return self.finalize(request, Response(svc.build_board(redacted=self.redacted)))


class _Identify(_KioskBase):
    def post(self, request):
        blocked = self.gate_check(request)
        if blocked is not None:
            return blocked
        user, failure = self.identify_or_fail(request)
        if failure is not None:
            # Identify is the one call that answers 404 so the UI can tell "no card" from "bad request".
            failure.status_code = status.HTTP_404_NOT_FOUND
            return self.finalize(request, failure)
        return self.finalize(request, self._preview_response(request, user, log_ok=True))


class _ClockIn(_KioskBase):
    def post(self, request):
        shift = str(request.data.get('shift') or '')
        gate = request.data.get('gate') or {}
        if not isinstance(gate, dict):
            gate = {}

        def go(user, ctx):
            entry = svc.clock_in(user, shift=shift, gate=gate, ctx=ctx)
            return {'action': 'clock_in', 'at': entry.clock_in, 'shift': entry.shift}

        return self._run(request, go)


class _ClockOut(_KioskBase):
    def post(self, request):
        def go(user, ctx):
            entry = svc.clock_out(user, ctx=ctx)
            return {'action': 'clock_out', 'at': entry.clock_out, 'shift': entry.shift}

        return self._run(request, go)


class _Break(_KioskBase):
    def post(self, request):
        which = str(request.data.get('action') or '').strip()

        def go(user, ctx):
            if which == 'start':
                entry = svc.break_start(user, ctx=ctx)
                return {'action': 'break_start', 'at': entry.break_started_at, 'shift': entry.shift}
            if which == 'end':
                entry = svc.break_end(user, ctx=ctx)
                return {'action': 'break_end', 'at': entry.updated_at, 'shift': entry.shift}
            raise svc.KioskError('Break action must be start or end.', 400, 'action')

        return self._run(request, go)


class _FixStale(_KioskBase):
    def post(self, request):
        def go(user, ctx):
            entry = svc.fix_stale(user, ctx=ctx)
            return {'action': 'fix_stale', 'at': entry.clock_out, 'shift': entry.shift}

        return self._run(request, go)


class _SetShift(_KioskBase):
    def post(self, request):
        shift = str(request.data.get('shift') or '')

        def go(user, ctx):
            entry = svc.set_shift(user, shift=shift, ctx=ctx)
            return {'action': 'set_shift', 'at': entry.updated_at, 'shift': entry.shift}

        return self._run(request, go)


class _RequestEdit(_KioskBase):
    def post(self, request):
        kind = str(request.data.get('kind') or '')
        value = request.data.get('value')

        def go(user, ctx):
            req = svc.request_edit(user, kind=kind, value=value, ctx=ctx)
            return {'action': 'request_edit', 'kind': kind, 'request_id': req.pk}

        return self._run(request, go)


# ── Hosted (/api/hr/kiosk/*) ──────────────────────────────────────────────────

class _HostedMixin:
    permission_classes = [IsAuthenticated, IsStaff]
    route = KioskEvent.ROUTE_KIOSK
    redacted = False
    fail_limit = svc.HOSTED_FAIL_LIMIT


class KioskBoardView(_HostedMixin, _Board):
    pass


class KioskIdentifyView(_HostedMixin, _Identify):
    pass


class KioskClockInView(_HostedMixin, _ClockIn):
    pass


class KioskClockOutView(_HostedMixin, _ClockOut):
    pass


class KioskBreakView(_HostedMixin, _Break):
    pass


class KioskFixStaleView(_HostedMixin, _FixStale):
    pass


class KioskSetShiftView(_HostedMixin, _SetShift):
    pass


class KioskRequestEditView(_HostedMixin, _RequestEdit):
    pass


class KioskExitView(_HostedMixin, APIView):
    """Audit only; the host password check is /api/auth/verify-password/."""

    def post(self, request):
        svc.log_event(
            svc.KioskContext(route=KioskEvent.ROUTE_KIOSK, host=request.user, ip=svc.client_ip(request)),
            'exit',
        )
        return Response({'ok': True})


# ── Public (/api/hr/clock/*) ──────────────────────────────────────────────────

class _PublicMixin:
    authentication_classes: list = []
    permission_classes = [AllowAny]
    route = KioskEvent.ROUTE_CLOCK
    redacted = True
    fail_limit = svc.PUBLIC_FAIL_LIMIT

    def _device(self, request) -> str:
        existing = request.COOKIES.get(DEVICE_COOKIE) or ''
        if existing and len(existing) <= 32 and existing.isalnum():
            return existing
        fresh = secrets.token_hex(8)
        request._clock_new_device = fresh
        return fresh

    def throttle_key(self, request) -> str:
        return f'clock:identify:{self._device(request)}:{svc.client_ip(request)}'

    def gate_check(self, request):
        allowed = svc.public_allowed_ips()
        if allowed and svc.client_ip(request) not in allowed:
            return Response({'detail': NOT_HERE, 'code': 'ip'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def finalize(self, request, response: Response) -> Response:
        fresh = getattr(request, '_clock_new_device', None)
        if fresh is None and not request.COOKIES.get(DEVICE_COOKIE):
            fresh = self._device(request)
        if fresh:
            response.set_cookie(
                DEVICE_COOKIE, fresh, max_age=DEVICE_COOKIE_MAX_AGE,
                httponly=True, samesite='Lax', path='/api/hr/clock/',
            )
        return response


class ClockBoardView(_PublicMixin, _Board):
    pass


class ClockIdentifyView(_PublicMixin, _Identify):
    pass


class ClockClockInView(_PublicMixin, _ClockIn):
    pass


class ClockClockOutView(_PublicMixin, _ClockOut):
    pass


class ClockBreakView(_PublicMixin, _Break):
    pass


class ClockFixStaleView(_PublicMixin, _FixStale):
    pass
