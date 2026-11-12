from django.db import transaction
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.core.files import save_upload, stream_s3, validate_pdf
from apps.floorplan.models import MapPin

from .models import SIGN_REF_TYPE, Sign
from .serializers import SignSerializer


def current_pin_counts(sign_ids=None):
    """Spots per sign on the Current store maps (pins on other plans are history, not where a sign hangs)."""
    qs = MapPin.objects.filter(ref_type=SIGN_REF_TYPE, plan__is_current=True, plan__is_active=True)
    if sign_ids is not None:
        qs = qs.filter(ref_id__in=sign_ids)
    return dict(qs.values('ref_id').annotate(n=Count('id')).values_list('ref_id', 'n'))


class SignViewSet(viewsets.ModelViewSet):
    """Store signs (#106). All staff read the list and open the PDFs; managers add, edit, mark off and remove.

    - ``GET signs/?status=to_make|printed|up``.
    - ``GET signs/{id}/pdf/`` streams the PDF (``?download=1`` as a file); ``POST`` a multipart ``file`` to set or
      replace it; ``DELETE`` takes it off. PDFs live in the shared file store (``core.S3File``).
    - Delete hides the sign and drops its pins from the store map.
    - Renaming a sign renames its pins.
    """
    lookup_value_regex = r'\d+'
    serializer_class = SignSerializer
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve') or (self.action == 'pdf' and self.request.method == 'GET'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = Sign.objects.filter(is_active=True).select_related('pdf')
        wanted = self.request.query_params.get('status')
        if wanted in dict(Sign.STATUS_CHOICES):
            qs = qs.filter(status=wanted)
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action == 'list':
            context['pin_counts'] = current_pin_counts()
        elif self.kwargs.get('pk', '').isdigit():
            context['pin_counts'] = current_pin_counts([int(self.kwargs['pk'])])
        return context

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        old_name = serializer.instance.name
        sign = serializer.save()
        if sign.name != old_name:
            MapPin.objects.filter(ref_type=SIGN_REF_TYPE, ref_id=sign.id).update(name=sign.name)

    def destroy(self, request, *args, **kwargs):
        sign = self.get_object()
        with transaction.atomic():
            MapPin.objects.filter(ref_type=SIGN_REF_TYPE, ref_id=sign.id).delete()
            sign.is_active = False
            sign.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='pdf')
    def pdf(self, request, pk=None):
        sign = self.get_object()
        if request.method == 'GET':
            if not sign.pdf_id:
                return Response({'detail': 'This sign has no PDF yet.'}, status=status.HTTP_404_NOT_FOUND)
            return stream_s3(sign.pdf, as_attachment=request.query_params.get('download') == '1')
        if request.method == 'DELETE':
            sign.pdf = None
            sign.save(update_fields=['pdf', 'updated_at'])
            return Response(self.get_serializer(sign).data)
        uploaded = request.FILES.get('file')
        problem = validate_pdf(uploaded)
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        sign.pdf = save_upload(uploaded, user=request.user, key_prefix='signage')
        sign.save(update_fields=['pdf', 'updated_at'])
        return Response(self.get_serializer(sign).data)
