"""
Add item: Misfit items from Find item (services/add_item.py). Same people as Processing check-in (staff).

GET  /api/inventory/add-item/find/?q=                      products for the box: identifiers, then words
GET  /api/inventory/add-item/price/?product=&title=&category=  a price from what it (or similar items) sold for
GET  /api/inventory/add-item/taxonomy/                     categories and their subcategories (the answer key)
POST /api/inventory/add-item/ai-fill/                      title (+ photo): the AI's draft of a new product
POST /api/inventory/add-item/check-in/                     JSON, or multipart with `payload` (JSON) + `photo`
"""
import json

from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.services import add_item
from apps.inventory.services.receiving_photos import ReceivingPhotoError
from apps.inventory.services.tag_retail import RetailCheckNeeded

MAX_PHOTO_BYTES = 25 * 1024 * 1024


def _photo(request):
    upload = request.FILES.get('photo')
    if upload is not None and upload.size > MAX_PHOTO_BYTES:
        raise add_item.AddItemError('That photo is over 25 MB.')
    return upload


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def add_item_find_view(request):
    return Response(add_item.find(str(request.query_params.get('q') or '')))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def add_item_price_view(request):
    raw = str(request.query_params.get('product') or '')
    return Response(add_item.suggest_price(
        product_id=int(raw) if raw.isdigit() else None,
        title=str(request.query_params.get('title') or '')[:300],
        category=str(request.query_params.get('category') or '')[:100],
    ))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def add_item_taxonomy_view(request):
    return Response({'categories': [{'name': name, 'subcategories': subs} for name, subs in add_item.taxonomy().items()]})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def add_item_ai_fill_view(request):
    try:
        upload = _photo(request)
        image = add_item.ai_image_block(upload.read()) if upload is not None else None
        return Response(add_item.ai_draft(str(request.data.get('title') or ''), image=image))
    except ReceivingPhotoError:
        return Response({'detail': 'That file is not a photo we can read.'}, status=status.HTTP_400_BAD_REQUEST)
    except add_item.AddItemError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def add_item_check_in_view(request):
    data = request.data
    if 'payload' in data:
        try:
            data = json.loads(data.get('payload') or '{}')
        except (TypeError, ValueError):
            return Response({'detail': 'payload must be JSON.'}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(data, dict):
        return Response({'detail': 'Send an object.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        result = add_item.check_in(request.user, dict(data), photo=_photo(request))
    except RetailCheckNeeded as e:
        return Response({'detail': str(e), **e.payload}, status=status.HTTP_409_CONFLICT)
    except ValueError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def restoration_request_settings_view(request):
    """The settings the Send-to-Restoration fields fill the as-is prices from (services/restoration_request.py)."""
    from apps.inventory.services.restoration_request import public_settings

    return Response(public_settings())
