"""Wi-Fi time clock pilot endpoints (D23). The logic is in ``wifi_clock``.

- ``GET  phones/``     helper, ``X-Device-Token``: the registered phones (user id + Wi-Fi address), nothing else.
- ``POST heartbeat/``  helper, ``X-Device-Token``: ``{"seen": {"<user id>": true|false}}``. Only ids, never addresses.
- ``GET|POST answer/<token>/``  the Yes / No buttons in the emails. GET shows a confirm button (mail scanners open
  links), POST records the answer.
- ``POST stage-setup/`` owner or coder token: stages ``hr.wifi_clock_pilot`` on Superuser → Requests. The body
  carries the phone's address, so it never goes on a command line or into a log.
"""
from __future__ import annotations

from html import escape

from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.dash_fixes import IsOwnerOrCoder
from apps.hr import wifi_clock
from apps.hr.models import WifiPilotEvent


def _device(request):
    return wifi_clock.device_for(request.META.get('HTTP_X_DEVICE_TOKEN') or '')


class WifiPhonesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        if _device(request) is None:
            return Response({'detail': 'Unknown device.'}, status=403)
        return Response({
            'interval': wifi_clock.INTERVAL_SECONDS,
            'phones': [{'id': user.pk, 'mac': mac} for user, mac in wifi_clock.registered_phones()],
        })


class WifiHeartbeatView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        device = _device(request)
        if device is None:
            return Response({'detail': 'Unknown device.'}, status=403)
        seen = request.data.get('seen') if isinstance(request.data, dict) else None
        if not isinstance(seen, dict):
            return Response({'detail': 'Send {"seen": {"<id>": true|false}}.'}, status=400)
        return Response({'ok': True, 'processed': wifi_clock.heartbeat(device, seen)})


class WifiStageSetupView(APIView):
    permission_classes = [IsOwnerOrCoder]

    def post(self, request):
        from apps.core.services.approval_requests import RequestError, stage
        params = request.data if isinstance(request.data, dict) else {}
        try:
            row = stage('hr.wifi_clock_pilot', title='Wi-Fi clock pilot: phone, helper and pilot schedule',
                        params=dict(params), requested_by='claude')
        except RequestError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response({'id': row.pk, 'counts': row.preview.get('counts'), 'changes': row.preview.get('changes')})


_QUESTION = {
    WifiPilotEvent.KIND_BREAK: {'yes': 'Yes, it was a break', 'no': 'No, it was not a break'},
    WifiPilotEvent.KIND_LEFT: {'yes': 'Yes, clock me out then', 'no': 'No, I did not leave then'},
}


def _page(title: str, body: str) -> HttpResponse:
    return HttpResponse(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,'
        f'initial-scale=1"><title>{escape(title)}</title></head><body style="font-family:Arial,sans-serif;'
        f'max-width:480px;margin:40px auto;padding:0 16px;font-size:18px;color:#222">{body}</body></html>'
    )


@csrf_exempt
def wifi_answer_view(request, token: str):
    parsed = wifi_clock.read_answer_token(token)
    event = WifiPilotEvent.objects.filter(pk=parsed[0]).first() if parsed else None
    if event is None or event.kind not in _QUESTION:
        return HttpResponseBadRequest('This link is not valid any more.')
    answer = parsed[1]
    built = wifi_clock.compose(event)
    question = built[0] if built else ''
    label = _QUESTION[event.kind][answer]
    if request.method == 'POST':
        wifi_clock.record_answer(event, answer)
        return _page('Saved', f'<p>{escape(question)}</p><p><b>Saved: {escape(label)}.</b></p>'
                              f'<p style="color:#777;font-size:14px">{escape(wifi_clock.SHADOW_LINE)}</p>')
    return _page('Confirm', (
        f'<p>{escape(question)}</p><form method="post"><button type="submit" style="font-size:18px;padding:14px 28px;'
        f'border:0;border-radius:8px;background:#2e7d32;color:#fff">{escape(label)}</button></form>'
    ))
