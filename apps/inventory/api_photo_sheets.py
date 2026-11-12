"""
Photo sheets (Dash Update #95): a letter-size sheet of photos with the full title, for items in a box
(services/photo_sheets.py).

GET   /api/inventory/photo-sheets/?q=                 the newest sheets (the Photo sheets page)
POST  /api/inventory/photo-sheets/                    a new sheet {"item"? | "product"?, "title", "brand", "facts",
                                                      "layout", "orientation", "photos" (each with its crop: "zoom",
                                                      "x", "y"), "show_price", "show_item_number", "contrast",
                                                      "labels", "typed"}
GET   /api/inventory/photo-sheets/start/?item=|product=|code=  the saved sheet of this item or product (or the item
                                                      number typed), and where a new one starts
GET   /api/inventory/photo-sheets/<id>/               one sheet
PATCH /api/inventory/photo-sheets/<id>/               save changes
POST  /api/inventory/photo-sheets/<id>/printed/       count one print
POST  /api/inventory/photo-sheets/photos/             one photo (multipart "photo"); returns {"file", "width", "height"}
POST  /api/inventory/photo-sheets/photos/link/        a picture link pasted or dragged in {"url"}; fetched and saved
GET   /api/inventory/photo-sheets/photos/<file>/      a sheet photo
POST  /api/inventory/photo-sheets/ai/                 "Clean up with AI" (#108): every word and label, from the
                                                      sheet, the product, the manifest row, the item, its events and
                                                      the pictures; "typed" names the boxes a person typed (nothing
                                                      saved)
"""
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee
from apps.core.files import stream_s3
from apps.core.services.photo_drops import MAX_UPLOAD_BYTES
from apps.inventory.models import PhotoSheet
from apps.inventory.services import photo_sheets

STAFF = [IsAuthenticated, IsEmployee]


def _bad(exc: Exception) -> Response:
    return Response({'detail': str(exc), 'code': 'BAD_REQUEST'}, status=400)


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def photo_sheet_list_view(request):
    if request.method == 'GET':
        return Response({'results': photo_sheets.recent(request.query_params.get('q') or '')})
    try:
        sheet = photo_sheets.create(request.data, user=request.user)
    except photo_sheets.PhotoSheetError as exc:
        return _bad(exc)
    return Response(photo_sheets.serialize(sheet), status=201)


@api_view(['GET'])
@permission_classes(STAFF)
def photo_sheet_start_view(request):
    q = request.query_params
    try:
        return Response(photo_sheets.start(
            item_id=_int(q.get('item')), product_id=_int(q.get('product')), code=q.get('code') or '',
        ))
    except photo_sheets.PhotoSheetError as exc:
        return _bad(exc)


@api_view(['GET', 'PATCH'])
@permission_classes(STAFF)
def photo_sheet_detail_view(request, pk):
    sheet = get_object_or_404(PhotoSheet.objects.select_related('item', 'product', 'updated_by'), pk=pk)
    if request.method == 'PATCH':
        try:
            sheet = photo_sheets.update(sheet, request.data, user=request.user)
        except photo_sheets.PhotoSheetError as exc:
            return _bad(exc)
    return Response(photo_sheets.serialize(sheet))


@api_view(['POST'])
@permission_classes(STAFF)
def photo_sheet_printed_view(request, pk):
    sheet = get_object_or_404(PhotoSheet.objects.select_related('item', 'product', 'updated_by'), pk=pk)
    return Response(photo_sheets.serialize(photo_sheets.mark_printed(sheet, user=request.user)))


@api_view(['POST'])
@permission_classes(STAFF)
@parser_classes([MultiPartParser, FormParser])
def photo_sheet_photo_upload_view(request):
    upload = request.FILES.get('photo')
    if upload is None:
        return Response({'detail': 'Add a photo.', 'code': 'BAD_REQUEST'}, status=400)
    if (upload.size or 0) > MAX_UPLOAD_BYTES:
        return Response({'detail': 'Photo too large (max 20 MB).', 'code': 'BAD_REQUEST'}, status=400)
    try:
        return Response(photo_sheets.save_photo(upload.read(), user=request.user), status=201)
    except photo_sheets.PhotoSheetError as exc:
        return _bad(exc)


@api_view(['POST'])
@permission_classes(STAFF)
@parser_classes([JSONParser])
def photo_sheet_photo_link_view(request):
    try:
        return Response(photo_sheets.fetch_photo(str(request.data.get('url') or ''), user=request.user), status=201)
    except photo_sheets.PhotoSheetError as exc:
        return _bad(exc)


@api_view(['GET'])
@permission_classes(STAFF)
def photo_sheet_photo_view(request, file_id):
    photo = photo_sheets.sheet_photo(file_id)
    if photo is None:
        return Response({'detail': 'Photo not found.', 'code': 'NOT_FOUND'}, status=404)
    return stream_s3(photo)


@api_view(['POST'])
@permission_classes(STAFF)
@parser_classes([JSONParser])
def photo_sheet_ai_view(request):
    try:
        return Response(photo_sheets.ai_draft(request.data))
    except photo_sheets.PhotoSheetError as exc:
        return _bad(exc)
