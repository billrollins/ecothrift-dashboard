from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin

from .models import CURRENT_SCHEMA_VERSION, FloorPlan, FloorPlanAsset, FloorPlanElementKind
from .services import purge_orphan_assets
from .serializers import (
    FloorPlanAssetSerializer,
    FloorPlanAssetUploadSerializer,
    FloorPlanElementKindSerializer,
    FloorPlanListSerializer,
    FloorPlanSerializer,
)


class FloorPlanViewSet(viewsets.ModelViewSet):
    """CRUD for floorplans.

    - All staff can view; Manager/Admin can create/edit/delete.
    - Updates use optimistic locking: the client must send the `revision` it
      loaded. A stale revision returns 409 with the current revision so the
      client can offer overwrite/reload.
    - Delete is a soft delete (`is_active=False`).
    """
    lookup_value_regex = r'\d+'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = FloorPlan.objects.filter(is_active=True).select_related('location', 'created_by')
        location_id = self.request.query_params.get('location')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return FloorPlanListSerializer
        return FloorPlanSerializer

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            schema_version=CURRENT_SCHEMA_VERSION,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()

        # Optimistic lock: only enforced when the payload touches plan content.
        if 'data' in request.data:
            client_revision = request.data.get('revision')
            if client_revision is None:
                return Response(
                    {
                        'detail': 'revision is required when saving plan data.',
                        'code': 'revision_required',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if int(client_revision) != instance.revision:
                return Response(
                    {
                        'detail': (
                            'This plan was modified by someone else since you '
                            'opened it.'
                        ),
                        'code': 'revision_conflict',
                        'current_revision': instance.revision,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        if 'data' in request.data:
            serializer.save(revision=instance.revision + 1)
            # References are current after a content save - sweep unused images.
            purge_orphan_assets()
        else:
            serializer.save()
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FloorPlanElementKindViewSet(viewsets.ModelViewSet):
    """Element type catalog for the editor palette.

    - All staff can list/retrieve (the palette).
    - Only Super Admin (`is_superuser`) can create/edit/delete.
    - System (seeded) kinds are editable but not deletable; the `kind` slug is
      immutable for every row because saved plans reference it.
    - Delete is a soft delete (`is_active=False`).
    """
    lookup_value_regex = r'\d+'
    serializer_class = FloorPlanElementKindSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        return FloorPlanElementKind.objects.filter(is_active=True)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        purge_orphan_assets()

    def perform_update(self, serializer):
        serializer.save()
        # Replacing a kind's default image can orphan the previous one.
        purge_orphan_assets()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_system:
            return Response(
                {'detail': 'Built-in element types cannot be deleted.', 'code': 'system_kind'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        purge_orphan_assets()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FloorPlanAssetViewSet(viewsets.ModelViewSet):
    """Image asset library for floorplan elements.

    - All staff can list; Manager/Admin can upload/rename/delete.
    - Upload is multipart (`file`, optional `name`/`location`); files are
      sanitized server-side and stored as data URIs (see assets.py).
    - `?location=<id>` returns location-scoped assets plus shared ones.
    - Delete is a soft delete (`is_active=False`).
    """
    lookup_value_regex = r'\d+'
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = FloorPlanAssetSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = FloorPlanAsset.objects.filter(is_active=True)
        location_id = self.request.query_params.get('location')
        if location_id:
            qs = qs.filter(Q(location_id=location_id) | Q(location__isnull=True))
        return qs

    def create(self, request, *args, **kwargs):
        upload = FloorPlanAssetUploadSerializer(data=request.data, context={'request': request})
        upload.is_valid(raise_exception=True)
        asset = upload.save()
        return Response(
            FloorPlanAssetSerializer(asset).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        # Hard-delete immediately when nothing references it (soft-deleted
        # rows are exempt from the upload grace window).
        purge_orphan_assets()
        return Response(status=status.HTTP_204_NO_CONTENT)
