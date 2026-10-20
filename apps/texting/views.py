"""Texting webhooks. Twilio posts a customer's reply here (the toll-free number's "A message comes in" webhook):
STOP puts the number on the stop list, HELP answers the submitted help text (``service.handle_inbound``).

Twilio signs each post with the account's auth token (``TWILIO_AUTH_TOKEN``). With the token set, a post without a good
signature is refused. Without it, STOP and HELP still work (stopping is always safe) but START is ignored: only a signed
post may take a number off the stop list.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from xml.sax.saxutils import escape

from decouple import config
from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.texting import service

EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _token() -> str:
    return str(config('TWILIO_AUTH_TOKEN', default='') or '').strip()


def signature_ok(request) -> bool:
    """Twilio's X-Twilio-Signature: base64 HMAC-SHA1 of the public URL plus the sorted form fields, keyed with the
    auth token. False when there is no token to check with."""
    token = _token()
    given = request.META.get('HTTP_X_TWILIO_SIGNATURE', '')
    if not token or not given:
        return False
    url = f'https://{request.get_host()}{request.get_full_path()}'
    signed = url + ''.join(f'{key}{request.POST.get(key, "")}' for key in sorted(request.POST.keys()))
    digest = base64.b64encode(hmac.new(token.encode(), signed.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(digest, given)


def _twiml(reply: str | None) -> HttpResponse:
    body = EMPTY if not reply else f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(reply)}</Message></Response>'
    return HttpResponse(body, content_type='text/xml')


@csrf_exempt
@require_POST
def inbound(request):
    verified = signature_ok(request)
    if _token() and not verified:
        return HttpResponseForbidden('Bad signature.')
    phone = service.digits(request.POST.get('From', ''))
    if not phone:
        return _twiml(None)
    return _twiml(service.handle_inbound(phone, request.POST.get('Body', ''), verified=verified))
