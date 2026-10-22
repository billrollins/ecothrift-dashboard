"""The B-Stock dispute page: ``/dispute/<token>/`` (no sign-in; the link is the key). See services/bstock_disputes.py."""

from __future__ import annotations

from django.http import Http404, HttpResponse, HttpResponseRedirect, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

from apps.inventory.models import BStockDispute, BStockDisputeEvent, ReceivingAttachment
from apps.inventory.services import bstock_disputes as svc


def _dispute(token: str) -> BStockDispute:
    dispute = BStockDispute.objects.select_related('purchase_order').filter(token=token).first()
    if dispute is None:
        raise Http404('No such dispute.')
    return dispute


def _link(request, dispute: BStockDispute) -> str:
    return request.build_absolute_uri(f'/dispute/{dispute.token}/')


def _private(response: HttpResponse) -> HttpResponse:
    response['X-Robots-Tag'] = 'noindex, nofollow'
    response['Cache-Control'] = 'private, no-store'
    response['Referrer-Policy'] = 'no-referrer'
    return response


@require_GET
def dispute_page(request, token: str):
    dispute = _dispute(token)
    payload = svc.dispute_payload(dispute)
    photos = svc.dispute_photos(dispute.purchase_order)
    svc.log_event(dispute, request, BStockDisputeEvent.KIND_VIEW)
    pallets: dict[int, list[dict]] = {}
    for p in photos:
        if p['kind'] == 'pallet_side':
            pallets.setdefault(p['pallet_number'] or 0, []).append(p)
    context = {
        'dispute': dispute,
        'p': payload,
        'documents': [p for p in photos if p['kind'] == 'bol'],
        'truck_photos': [p for p in photos if p['kind'] == 'truck'],
        'pallet_groups': [{'number': n, 'photos': ph, 'caption': ph[0]['caption'].rsplit(' - ', 1)[0]}
                          for n, ph in sorted(pallets.items())],
        'from_q': '?from=dash' if request.GET.get('from') == 'dash' else '',
        'status_label': dict(BStockDispute.STATUS_CHOICES).get(dispute.status, dispute.status),
    }
    return _private(render(request, 'inventory/bstock_dispute.html', context))


@require_GET
def dispute_photo(request, token: str, attachment_id: int):
    dispute = _dispute(token)
    att = (
        ReceivingAttachment.objects.select_related('s3_file')
        .filter(pk=attachment_id, receiving__purchase_order=dispute.purchase_order)
        .first()
    )
    if att is None or not att.s3_file_id or not att.s3_file.url:
        raise Http404('No such photo.')
    svc.log_event(dispute, request, BStockDisputeEvent.KIND_PHOTO, f'{att.kind} {att.pallet_number or ""} {att.side}'.strip())
    return _private(HttpResponseRedirect(att.s3_file.url))


@require_GET
def dispute_xlsx(request, token: str):
    dispute = _dispute(token)
    payload = svc.dispute_payload(dispute)
    svc.log_event(dispute, request, BStockDisputeEvent.KIND_XLSX)
    data = svc.workbook_bytes(dispute, payload, _link(request, dispute))
    resp = HttpResponse(data, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = f'attachment; filename="{payload["order"]["order_number"]}-dispute.xlsx"'
    return _private(resp)


@require_GET
def dispute_csv(request, token: str):
    dispute = _dispute(token)
    payload = svc.dispute_payload(dispute)
    svc.log_event(dispute, request, BStockDisputeEvent.KIND_CSV)
    resp = HttpResponse(svc.items_csv(payload), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="{payload["order"]["order_number"]}-items-affected.csv"'
    return _private(resp)


@require_GET
def dispute_zip(request, token: str):
    dispute = _dispute(token)
    payload = svc.dispute_payload(dispute)
    svc.log_event(dispute, request, BStockDisputeEvent.KIND_ZIP)
    resp = StreamingHttpResponse(
        svc.photos_zip_stream(dispute, payload, _link(request, dispute)), content_type='application/zip',
    )
    resp['Content-Disposition'] = f'attachment; filename="{payload["order"]["order_number"]}-dispute.zip"'
    return _private(resp)
