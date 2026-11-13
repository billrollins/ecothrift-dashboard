from django.db import transaction
from django.db.models import Count, Max, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin

from apps.core.models import WorkLocation

from . import versions
from .models import (
    CURRENT_SCHEMA_VERSION, FloorPlan, FloorPlanAsset, FloorPlanCurrentPeriod, FloorPlanElementKind, MapLayer, MapPin,
)
from .ai import FloorplanAIError, generate_kind_svg, propose_adjustment
from .services import purge_orphan_assets
from .serializers import (
    FloorPlanAssetSerializer,
    FloorPlanAssetUploadSerializer,
    FloorPlanElementKindSerializer,
    FloorPlanListSerializer,
    FloorPlanSerializer,
    MapLayerSerializer,
    MapPinSerializer,
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
        if self.action in ('make_current', 'unset_current', 'current_preview'):
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = FloorPlan.objects.filter(is_active=True).select_related('location', 'created_by')
        if self.action == 'list':
            # For the cards: pins on the plan, and when it last stopped being Current (a past version).
            qs = qs.annotate(
                pin_count=Count('pins', distinct=True),
                last_current_end=Max('current_periods__ended_at'),
            ).order_by('-updated_at')
        location_id = self.request.query_params.get('location')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return FloorPlanListSerializer
        return FloorPlanSerializer

    def perform_create(self, serializer):
        # One store (#130): a new plan belongs to it unless a location is given.
        location = serializer.validated_data.get('location') or WorkLocation.the_store()
        if location is None:
            raise ValidationError({'location': 'Add the store first (POS store setup).'})
        serializer.save(
            created_by=self.request.user,
            schema_version=CURRENT_SCHEMA_VERSION,
            location=location,
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
        # A deleted plan is never the store map; its pins stay with it (they come back if it is restored).
        instance.is_current = False
        with transaction.atomic():
            instance.save(update_fields=['is_active', 'is_current', 'updated_at'])
            versions.end_current_on_delete(instance, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='current-preview')
    def current_preview(self, request, pk=None):
        """Superuser: what Make current would do (which plan the pins come from, the sizes, whether to line up)."""
        return Response(versions.preview(self.get_object()))

    @action(detail=True, methods=['post'], url_path='make-current')
    def make_current(self, request, pk=None):
        """Superuser (#105, #130): this plan becomes the store's Current plan (the store map).

        The plan that was Current stays as a past version with its pins. This plan gets a copy of those pins when it
        has none; when its size differs, the body must carry the owner's alignment ``{transform: {scale, dx, dy}}``
        (409 ``align_required`` otherwise). Always answers with ``message``: what it did.
        """
        plan = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        try:
            transform = versions.parse_transform(body.get('transform'))
            result = versions.make_current(plan, request.user, transform)
        except versions.BadTransform as exc:
            return Response({'detail': str(exc), 'code': 'bad_transform'}, status=status.HTTP_400_BAD_REQUEST)
        except versions.AlignRequired:
            return Response(
                {
                    'detail': 'This plan is a different size from the one the pins are on. Line the pins up first.',
                    'code': 'align_required',
                    'preview': versions.preview(plan),
                },
                status=status.HTTP_409_CONFLICT,
            )
        plan.refresh_from_db()
        return Response({**FloorPlanListSerializer(plan).data, **result})

    @action(detail=True, methods=['post'], url_path='unset-current')
    def unset_current(self, request, pk=None):
        """Superuser (#130): this plan stops being Current. Its pins stay on it. Always answers with ``message``."""
        plan = self.get_object()
        result = versions.unset_current(plan, request.user)
        plan.refresh_from_db()
        return Response({**FloorPlanListSerializer(plan).data, **result})

    @action(detail=True, methods=['post'], url_path='ai-adjust')
    def ai_adjust(self, request, pk=None):
        """Manager+ via get_permissions. Proposes new active layers; saves nothing."""
        plan = self.get_object()
        data = request.data if isinstance(request.data, dict) else {}
        try:
            result = propose_adjustment(
                plan=plan,
                instruction=data.get('instruction'),
                document=data.get('document'),
                model=data.get('model'),
                effort=data.get('effort'),
            )
        except FloorplanAIError as exc:
            return Response({'detail': str(exc)}, status=exc.status)
        return Response(result)


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

    @action(detail=False, methods=['post'], url_path='generate-svg')
    def generate_svg(self, request):
        """Super Admin via get_permissions. Returns a sanitized SVG preview; saves nothing."""
        data = request.data if isinstance(request.data, dict) else {}
        try:
            result = generate_kind_svg(
                label=data.get('label'),
                width=data.get('width'),
                depth=data.get('depth'),
                category=data.get('category'),
                fill_color=data.get('fill_color'),
                notes=data.get('notes'),
                model=data.get('model'),
                effort=data.get('effort'),
            )
        except FloorplanAIError as exc:
            return Response({'detail': str(exc)}, status=exc.status)
        return Response(result)


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


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def store_map(request):
    """The store map (#105, #130): the store's Current plan with its layers and pins, in one read for any staff login.

    ``?plan=<id>`` shows a past version instead (a plan that was Current once), with the pins it kept. ``plan`` is
    null when no plan is Current. ``versions`` lists every stretch a plan was Current, newest first, for a picker;
    ``is_history`` is true when the plan shown is not the Current one (read-only).
    """
    plans = FloorPlan.objects.filter(is_active=True).select_related('location', 'created_by')
    store = WorkLocation.the_store()
    current = plans.filter(is_current=True)
    # One store (Bill, 2026-11-13). Until the extra locations are folded in, the store's own Current plan wins.
    plan = (current.filter(location=store).first() if store else None) or current.order_by('id').first()
    asked = request.query_params.get('plan', '')
    if asked.isdigit():
        picked = plans.filter(pk=int(asked)).filter(Q(is_current=True) | Q(current_periods__isnull=False)).first()
        if picked is None:
            return Response({'detail': 'That plan was never Current.'}, status=status.HTTP_404_NOT_FOUND)
        plan = picked
    layers = MapLayer.objects.filter(is_active=True)
    pins = (
        MapPin.objects.filter(plan=plan, layer__is_active=True).select_related('layer')
        if plan else MapPin.objects.none()
    )
    periods = (
        FloorPlanCurrentPeriod.objects.filter(plan__is_active=True)
        .select_related('plan').annotate(pin_count=Count('plan__pins', distinct=True))
        .order_by('-started_at', '-id')  # Meta.ordering is dropped once there is a GROUP BY
    )
    return Response({
        'plan': FloorPlanSerializer(plan).data if plan else None,
        'is_history': bool(plan and not plan.is_current),
        'layers': MapLayerSerializer(layers, many=True).data,
        'pins': MapPinSerializer(pins, many=True).data,
        'versions': [
            {
                'id': p.id, 'plan_id': p.plan_id, 'plan_name': p.plan.name, 'started_at': p.started_at,
                'ended_at': p.ended_at, 'is_current': p.plan.is_current and p.ended_at is None,
                'pin_count': p.pin_count,
            }
            for p in periods
        ],
    })


class MapLayerViewSet(viewsets.ReadOnlyModelViewSet):
    """The layers of the store map. Read-only here; new layers come by a seed migration or the Django admin."""
    serializer_class = MapLayerSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated, IsStaff]
    queryset = MapLayer.objects.filter(is_active=True)


class MapPinViewSet(viewsets.ModelViewSet):
    """Pins on a plan's layers (#105). All staff read; Manager/Admin place, edit, move and remove them.

    Filters: ``?plan=``, ``?layer=`` (id or slug), ``?ref_type=`` with ``?ref_id=`` (the pins of one sign).
    Delete is a hard delete: a pin is only a spot on the map.
    """
    lookup_value_regex = r'\d+'
    serializer_class = MapPinSerializer
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = MapPin.objects.filter(plan__is_active=True).select_related('layer')
        params = self.request.query_params
        if params.get('plan', '').isdigit():
            qs = qs.filter(plan_id=int(params['plan']))
        layer = params.get('layer', '')
        if layer:
            qs = qs.filter(layer_id=int(layer)) if layer.isdigit() else qs.filter(layer__slug=layer)
        if params.get('ref_type'):
            qs = qs.filter(ref_type=params['ref_type'])
        if params.get('ref_id', '').isdigit():
            qs = qs.filter(ref_id=int(params['ref_id']))
        if params.get('ref_type') and not params.get('plan'):
            # A sign's spots are the ones on the Current plan; past versions keep their own copies (#130).
            qs = qs.filter(plan__is_current=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        pin = self.get_object()
        if not pin.plan.is_current:
            return Response(
                {'detail': 'This pin is on a past version of the floor plan; it is kept as history.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
