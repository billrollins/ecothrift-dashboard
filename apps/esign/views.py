"""Three doors, each with its own permission (the host's route rules can trust them):

- owner (``/esign/templates|envelopes...``): the adapter's ``is_owner``;
- a signed-in party (``/esign/mine/...``): their own documents only;
- public (``/esign/public/...``): no login, the single-use link is the key.
"""
from __future__ import annotations

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from . import adapter, batches, placed, purge, services
from .models import AuditEvent, Batch, Envelope, Party, PurgeLog, Template, TemplateVersion, Upload


class IsOwner(BasePermission):
    """Who the host says the owner is (the adapter). Staff and anonymous are refused."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and adapter.get().is_owner(request.user))


OWNER = [IsAuthenticated, IsOwner]
SIGNED_IN = [IsAuthenticated]


class PublicThrottle(AnonRateThrottle):
    scope = 'esign_public'
    rate = '120/hour'


class PublicWriteThrottle(AnonRateThrottle):
    scope = 'esign_public_write'
    rate = '40/hour'


def _ip(request):
    return adapter.get().client_ip(request)


def _agent(request) -> str:
    return request.META.get('HTTP_USER_AGENT', '')


# -- Serializers (plain dicts: keeps the app free of host serializers) -------------


def version_json(v: TemplateVersion, *, full: bool = True) -> dict:
    out = {'id': v.pk, 'number': v.number, 'title': v.title, 'note': v.note, 'frozen': v.frozen,
           'created_at': v.created_at.isoformat(), 'template': v.template_id}
    if full:
        out.update(sections=v.sections, fields=v.fields, acknowledgments=v.acknowledgments)
    return out


def template_json(t: Template, *, versions: bool = False) -> dict:
    latest = t.latest
    out = {'id': t.pk, 'name': t.name, 'kind': t.kind, 'archived': t.archived, 'created_at': t.created_at.isoformat(),
           'latest': version_json(latest) if latest else None}
    if versions:
        out['versions'] = [version_json(v, full=False) for v in t.versions.order_by('-number')]
    return out


def event_json(e: AuditEvent) -> dict:
    return {'kind': e.kind, 'at': e.at.isoformat(), 'actor': e.actor, 'ip': e.ip, 'user_agent': e.user_agent, 'detail': e.detail}


def _iso(value):
    return value.isoformat() if value else None


def party_json(p: Party) -> dict:
    link = p.links.order_by('-created_at').first() if p.status == Party.READY else None
    link_state = None
    if link is not None:
        link_state = 'expired' if (link.revoked_at or link.expires_at <= timezone.now()) else 'open'
    return {'id': p.pk, 'order': p.order, 'name': p.name, 'email': p.email, 'title': p.title,
            'role_label': p.role_label, 'user_id': p.user_id, 'status': p.status, 'ready_at': _iso(p.ready_at),
            'signed_at': _iso(p.signed_at), 'link_state': link_state,
            'link_expires_at': _iso(link.expires_at) if link else None}


def envelope_json(e: Envelope, *, detail: bool = False) -> dict:
    services.refresh(e)
    parties = list(e.parties.order_by('order'))
    current = next((p for p in parties if p.status == Party.READY), None)
    tv = e.template_version
    out = {
        'id': e.pk, 'title': e.title, 'status': e.status, 'status_label': e.get_status_display(), 'source': e.source,
        'template': tv.template_id if tv else None, 'template_name': tv.template.name if tv else '',
        'kind': e.kind, 'version': tv.number if tv else None, 'page_count': e.page_count,
        'batch': e.batch_id, 'batch_name': e.batch.name if e.batch_id else '', 'imported_from': e.imported_from,
        'deleting': bool(e.delete_requested_at), 'delete_reason': e.delete_reason,
        'delete_requested_at': _iso(e.delete_requested_at), 'purge_after': _iso(e.purge_after),
        'parties': [party_json(p) for p in parties],
        'waiting_on': current.name if current else None,
        'signed_count': sum(1 for p in parties if p.status == Party.SIGNED), 'party_count': len(parties),
        'requires_w9': e.requires_w9, 'has_w9': e.uploads.filter(kind=Upload.KIND_W9).exists(),
        'end_date': e.end_date.isoformat() if e.end_date else None,
        'sent_at': _iso(e.sent_at), 'completed_at': _iso(e.completed_at), 'created_at': e.created_at.isoformat(),
        'has_pdf': bool(e.final_pdf_key), 'void_reason': e.void_reason,
        'attached_type': e.attached_type, 'attached_id': e.attached_id,
        'attached_label': adapter.get().attachment_label(e.attached_type, e.attached_id) if e.attached_type else '',
    }
    if detail:
        out.update(
            values=e.values, fields=tv.fields if tv else [], body_text=e.body_text, body_sha256=e.body_sha256,
            fingerprint=e.fingerprint, acknowledgments=e.acknowledgments or (tv.acknowledgments if tv else []),
            boxes=[placed.box_json(b) for b in e.placed.all()],
            final_pdf_sha256=e.final_pdf_sha256, events=[event_json(ev) for ev in e.events.all()],
        )
    return out


# -- Owner: templates -----------------------------------------------------------------


@api_view(['GET'])
@permission_classes(OWNER)
def meta(request):
    return Response({'kinds': adapter.get().kinds(), 'consent_text': services.CONSENT_TEXT,
                     'company': adapter.get().branding().get('company_name', ''),
                     'builtins': list(services.BUILTIN_FIELDS) + ['party_1_name', 'party_1_title', 'party_1_role']})


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def templates(request):
    if request.method == 'GET':
        rows = Template.objects.filter(archived=False).prefetch_related('versions')
        return Response([template_json(t) for t in rows])
    d = request.data
    t = services.create_template(name=d.get('name'), kind=d.get('kind'), title=d.get('title'), sections=d.get('sections'),
                                 fields=d.get('fields'), acknowledgments=d.get('acknowledgments'), by=request.user)
    return Response(template_json(t, versions=True), status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def template_detail(request, pk):
    t = get_object_or_404(Template, pk=pk)
    if request.method == 'GET':
        return Response(template_json(t, versions=True))
    d = request.data  # a save is always a NEW version
    if 'archived' in d and len(d) == 1:
        t.archived = bool(d.get('archived'))
        t.save(update_fields=['archived'])
        return Response(template_json(t, versions=True))
    services.save_version(t, title=d.get('title'), sections=d.get('sections'), fields=d.get('fields'), by=request.user,
                          note=d.get('note') or '', acknowledgments=d.get('acknowledgments'))
    return Response(template_json(t, versions=True), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes(OWNER)
def version_detail(request, pk):
    return Response(version_json(get_object_or_404(TemplateVersion, pk=pk)))


@api_view(['POST'])
@permission_classes(OWNER)
def preview(request):
    v = get_object_or_404(TemplateVersion, pk=request.data.get('version'))
    parties = request.data.get('parties') or []
    shown = []
    for p in parties if isinstance(parties, list) else []:
        if isinstance(p, dict):
            found = adapter.get().user_party(p['user_id']) if p.get('user_id') else None
            shown.append({**(found or {}), **{k: v for k, v in p.items() if v}})
    return Response({'text': services.preview(v, request.data.get('values') or {}, shown)})


# -- Owner: documents ------------------------------------------------------------------


def _envelope(pk) -> Envelope:
    return get_object_or_404(Envelope.objects.select_related('template_version__template', 'batch'), pk=pk)


def _pdf_response(data: bytes, filename: str, *, inline: bool = False) -> HttpResponse:
    response = HttpResponse(data, content_type='application/pdf')
    response['Content-Disposition'] = f'{"inline" if inline else "attachment"}; filename="{filename}"'
    response['Cache-Control'] = 'private, no-store'
    return response


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def envelopes(request):
    if request.method == 'GET':
        rows = Envelope.objects.select_related('template_version__template', 'batch').prefetch_related('parties', 'uploads')
        wanted = request.query_params.get('status')
        if wanted:
            rows = rows.filter(status__in=wanted.split(','))
        attached = request.query_params.get('attached')
        if attached and ':' in attached:
            kind, _, ident = attached.partition(':')
            rows = rows.filter(attached_type=kind, attached_id=ident)
        return Response([envelope_json(e) for e in rows])
    d = request.data
    version = get_object_or_404(TemplateVersion, pk=d.get('version'))
    e = services.create_envelope(version=version, parties=d.get('parties'), values=d.get('values') or {},
                                 requires_w9=bool(d.get('requires_w9')), by=request.user,
                                 attached_type=str(d.get('attached_type') or ''), attached_id=str(d.get('attached_id') or ''),
                                 title=str(d.get('title') or ''))
    return Response(envelope_json(e, detail=True), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes(OWNER)
@parser_classes([MultiPartParser, FormParser])
def envelope_pdf_create(request):
    """A new document from an uploaded PDF: the file, a title, a kind, the signers in order. Boxes come next."""
    d = request.data
    e = placed.create_pdf_envelope(uploaded=request.FILES.get('file'), title=d.get('title'), kind=d.get('kind'),
                                   parties=d.get('parties'), acknowledgments=d.get('acknowledgments'), by=request.user,
                                   attached_type=str(d.get('attached_type') or ''),
                                   attached_id=str(d.get('attached_id') or ''))
    return Response(envelope_json(_envelope(e.pk), detail=True), status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@permission_classes(OWNER)
@parser_classes([JSONParser])
def envelope_boxes(request, pk):
    placed.set_boxes(_envelope(pk), request.data.get('fields'), by=request.user)
    return Response(envelope_json(_envelope(pk), detail=True))


@api_view(['GET'])
@permission_classes(OWNER)
def envelope_source(request, pk):
    """The uploaded PDF as it was sent (or will be): for placing boxes and checking."""
    e = _envelope(pk)
    return _pdf_response(placed.source_bytes(e), f'document-{e.pk}-original.pdf', inline=True)


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_delete(request, pk):
    purge.request_delete(_envelope(pk), by=request.user, reason=request.data.get('reason') or '')
    return Response(envelope_json(_envelope(pk), detail=True))


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_restore(request, pk):
    purge.restore(_envelope(pk), by=request.user)
    return Response(envelope_json(_envelope(pk), detail=True))


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_purge(request, pk):
    """Purge now, without waiting: only one already asked to be deleted, and the owner confirms it on screen."""
    entry = purge.purge(_envelope(pk), by=request.user)
    return Response(purge.purge_log_json(entry))


@api_view(['GET'])
@permission_classes(OWNER)
def purge_log(request):
    return Response([purge.purge_log_json(p) for p in PurgeLog.objects.all()[:500]])


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def batch_list(request):
    """Documents sent to many people at once (a handbook acknowledgment for everyone)."""
    if request.method == 'GET':
        return Response([batches.coverage(b) for b in Batch.objects.select_related('template_version')])
    d = request.data
    version = get_object_or_404(TemplateVersion, pk=d.get('version'))
    batch = batches.send_to_many(version=version, name=d.get('name'), user_ids=d.get('people'), values=d.get('values'),
                                 by=request.user)
    return Response(batches.coverage(batch), status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def batch_detail(request, pk):
    """GET: who has signed and who hasn't. POST {people}: send it to more people."""
    batch = get_object_or_404(Batch.objects.select_related('template_version'), pk=pk)
    if request.method == 'POST':
        batches.add_people(batch, user_ids=request.data.get('people'), by=request.user)
    return Response(batches.coverage(batch))


@api_view(['GET'])
@permission_classes(OWNER)
def everyone(request):
    """Who "Send to everyone" can go to."""
    return Response(adapter.get().everyone())


@api_view(['GET', 'PATCH'])
@permission_classes(OWNER)
def envelope_detail(request, pk):
    e = _envelope(pk)
    if request.method == 'PATCH':
        d = request.data
        services.update_draft(e, parties=d.get('parties') if 'parties' in d else None, values=d.get('values'),
                              requires_w9=d.get('requires_w9') if 'requires_w9' in d else None,
                              title=d.get('title'), by=request.user)
        e = _envelope(pk)
    return Response(envelope_json(e, detail=True))


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_preview(request, pk):
    e = _envelope(pk)
    if e.source == Envelope.PDF:
        return Response({'text': '', 'frozen': e.status != Envelope.DRAFT})
    text = e.body_text or services.preview(e.template_version, e.values, list(e.parties.order_by('order')))
    return Response({'text': text, 'frozen': bool(e.body_text)})


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_send(request, pk):
    """Send a draft, or send the current party a new link. The link comes back to copy only when it was not
    emailed (no address, no mailbox, or the send failed): the sender never holds a link that went to the signer."""
    e = _envelope(pk)
    if e.status == Envelope.DRAFT:
        e, token, emailed = services.send(e, by=request.user, ip=_ip(request))
    else:
        e, token, emailed = services.resend(e, by=request.user)
    out = {**envelope_json(_envelope(pk), detail=True), 'emailed': emailed}
    if not emailed:
        out['link'] = services.sign_url(token)
    return Response(out)


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_notice(request, pk):
    services.record_notice(_envelope(pk), by=request.user)
    return Response(envelope_json(_envelope(pk), detail=True))


@api_view(['POST'])
@permission_classes(OWNER)
def envelope_void(request, pk):
    services.void(_envelope(pk), by=request.user, reason=request.data.get('reason') or '')
    return Response(envelope_json(_envelope(pk), detail=True))


@api_view(['GET'])
@permission_classes(SIGNED_IN)
def envelope_pdf(request, pk):
    """The signed PDF: owners, and anyone who signed it."""
    e = _envelope(pk)
    if not services.may_see(request.user, e):
        raise PermissionDenied('That document is not yours.')
    return _pdf_response(services.final_pdf_bytes(e), f'document-{e.pk}.pdf')


@api_view(['GET'])
@permission_classes(OWNER)
def envelope_upload(request, pk):
    """A signer's W-9, for the owner only."""
    upload = get_object_or_404(Upload, envelope_id=pk, kind=Upload.KIND_W9)
    response = HttpResponse(adapter.get().storage_read(upload.storage_key), content_type=upload.content_type)
    response['Content-Disposition'] = f'attachment; filename="{upload.filename}"'
    response['Cache-Control'] = 'private, no-store'
    return response


# -- A signed-in party: their own documents ----------------------------------------------


def _signing_state(party: Party) -> dict:
    e = party.envelope
    return {
        'ok': True, 'state': 'ok', 'party': party.pk, 'title': e.title, 'text': e.body_text, 'source': e.source,
        'page_count': e.page_count,
        # On an uploaded PDF: where this signer's name, date and signature will go.
        'boxes': [placed.box_json(b) for b in e.placed.filter(signer=party.order)] if e.source == Envelope.PDF else [],
        'signer_name': party.name, 'signer_title': party.title, 'role_label': party.role_label,
        'acknowledgments': e.acknowledgments or [], 'requires_w9': e.requires_w9,
        'has_w9': e.uploads.exists(), 'consent': e.consent_text or services.CONSENT_TEXT,
        'company': adapter.get().branding().get('company_name', ''), 'fingerprint': e.fingerprint,
        'others_after': e.parties.filter(order__gt=party.order).count(),
    }


@api_view(['GET'])
@permission_classes(SIGNED_IN)
def mine(request):
    """Documents I'm on: my turn now, waiting on others, and signed."""
    rows = Party.objects.filter(user=request.user).exclude(envelope__status=Envelope.DRAFT).select_related(
        'envelope__template_version__template').order_by('-envelope__sent_at')
    out = []
    for p in rows:
        e = p.envelope
        out.append({'party': p.pk, 'envelope': e.pk, 'title': e.title, 'status': e.status,
                    'status_label': e.get_status_display(), 'my_status': p.status,
                    'my_turn': p.status == Party.READY and e.status == Envelope.OUT,
                    'waiting_on': (services.current_party(e).name if e.status == Envelope.OUT and services.current_party(e) else None),
                    'sent_at': _iso(e.sent_at), 'signed_at': _iso(p.signed_at), 'completed_at': _iso(e.completed_at),
                    'has_pdf': bool(e.final_pdf_key)})
    return Response(out)


def _my_party(request, pk) -> Party:
    party = get_object_or_404(Party.objects.select_related('envelope'), pk=pk)
    if party.user_id != request.user.pk:
        raise PermissionDenied('This is not yours to sign.')
    return party


@api_view(['GET'])
@permission_classes(SIGNED_IN)
def mine_detail(request, pk):
    party = _my_party(request, pk)
    if party.envelope.status == Envelope.VOID:
        return Response({'ok': False, 'state': 'void', 'detail': services.LINK_MESSAGES['void']})
    if party.status == Party.SIGNED or party.envelope.status != Envelope.OUT:
        return Response({'ok': False, 'state': 'used', 'detail': 'You have already signed this.'})
    if party.status != Party.READY:
        waiting = services.current_party(party.envelope)
        return Response({'ok': False, 'state': 'waiting',
                         'detail': f'It is not your turn yet. Waiting on {waiting.name if waiting else "someone else"}.'})
    services.mark_opened(party, ip=_ip(request), user_agent=_agent(request), via='signed in')
    return Response(_signing_state(party))


def _source_while_signing(party: Party) -> HttpResponse:
    if party.status != Party.READY or party.envelope.status != Envelope.OUT:
        raise PermissionDenied('This is not open for signing.')
    return _pdf_response(placed.source_bytes(party.envelope), f'document-{party.envelope_id}.pdf', inline=True)


@api_view(['GET'])
@permission_classes(SIGNED_IN)
def mine_source(request, pk):
    """The uploaded PDF, for the signed-in party whose turn it is."""
    return _source_while_signing(_my_party(request, pk))


@api_view(['POST'])
@permission_classes(SIGNED_IN)
@parser_classes([JSONParser])
def mine_sign(request, pk):
    party = _my_party(request, pk)
    d = request.data
    e = services.sign_signed_in(party, user=request.user, name=d.get('name'), title=d.get('title'),
                                consent=d.get('consent'), acknowledgments=d.get('acknowledgments'),
                                signature=d.get('signature'), ip=_ip(request), user_agent=_agent(request))
    return Response({'ok': True, 'signed': True, 'title': e.title, 'complete': e.status == Envelope.SIGNED})


# -- Public: a signer's link ------------------------------------------------------------


def _gone(state):
    return Response({'ok': False, 'state': state, 'detail': services.LINK_MESSAGES[state]}, status=status.HTTP_200_OK)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicThrottle])
def public_document(request):
    link, state = services.lookup(request.query_params.get('t') or '')
    if link is None or state != services.LINK_OK:
        return _gone(state)
    services.mark_opened(link.party, ip=_ip(request), user_agent=_agent(request), via='link')
    return Response({**_signing_state(link.party), 'expires_at': link.expires_at.isoformat()})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicThrottle])
def public_source(request):
    """The uploaded PDF, while the link works."""
    link, state = services.lookup(request.query_params.get('t') or '')
    if link is None or state != services.LINK_OK:
        return _gone(state)
    return _source_while_signing(link.party)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicWriteThrottle])
@parser_classes([JSONParser])
def public_sign(request):
    d = request.data
    try:
        e = services.sign_by_link(d.get('t') or '', name=d.get('name'), title=d.get('title'), consent=d.get('consent'),
                                  acknowledgments=d.get('acknowledgments'), signature=d.get('signature'),
                                  ip=_ip(request), user_agent=_agent(request))
    except services.LinkError as exc:
        return _gone(exc.state)
    return Response({'ok': True, 'signed': True, 'title': e.title, 'complete': e.status == Envelope.SIGNED})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PublicWriteThrottle])
@parser_classes([MultiPartParser, FormParser])
def public_upload(request):
    try:
        services.add_upload(request.data.get('t') or '', uploaded=request.FILES.get('file'), ip=_ip(request))
    except services.LinkError as exc:
        return _gone(exc.state)
    return Response({'ok': True})  # nothing about the file comes back
