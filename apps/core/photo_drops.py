"""Photo drawer API (Dash Updates #82): ``/api/core/photo-drops/``.

Every staff login has one drawer and sees only its own photos; that is enforced in the queryset, so
someone else's photo is a 404 for list, file, thumbnail, used and delete alike.

The one exception (owner 2026-11-25: "As owner/super when i choose from drawer. Allow me to select ... what user
drawer"): a superuser may pick FROM anyone's drawer. ``?owner=<user id>`` lists that drawer, ``owners/`` lists whose
drawers hold photos, and file, thumbnail and used answer for any photo. Adding, replacing and deleting stay the
drawer owner's own.
"""
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff

from .files import stream_s3
from .models import PhotoDrop
from .services import photo_drops


class PhotoDropSerializer(serializers.ModelSerializer):
    size = serializers.IntegerField(source='file.size', read_only=True)
    filename = serializers.CharField(source='file.filename', read_only=True)

    class Meta:
        model = PhotoDrop
        fields = ['id', 'created_at', 'used_at', 'used_where', 'width', 'height', 'size', 'filename']
        read_only_fields = fields


class PhotoDropUploadSerializer(serializers.Serializer):
    photo = serializers.ImageField()
    # A turned or cropped copy of this drop (mine): it takes the old one's place, time and Used mark.
    replaces = serializers.IntegerField(required=False, min_value=1)

    def validate_photo(self, value):
        if (getattr(value, 'size', 0) or 0) > photo_drops.MAX_UPLOAD_BYTES:
            raise serializers.ValidationError('Photo too large (max 20 MB).')
        return value


class PhotoDropUsedSerializer(serializers.Serializer):
    where = serializers.CharField(max_length=80, required=False, allow_blank=True, default='')


class PhotoDropViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = PhotoDropSerializer

    # What a superuser may do with a photo in someone else's drawer: look at it and use it. Never change or delete it.
    PICK_ACTIONS = ('file', 'thumb', 'used')

    def get_queryset(self):
        every = PhotoDrop.objects.select_related('file', 'thumbnail')
        if self.action in self.PICK_ACTIONS and self.request.user.is_superuser:
            return every
        return every.filter(owner=self.request.user)

    def list(self, request):
        photo_drops.purge_old_sometimes()
        whose = (request.query_params.get('owner') or '').strip()
        if whose and whose != str(request.user.pk):
            if not request.user.is_superuser or not whose.isdigit():
                return Response({'detail': 'Only the owner can open another drawer.'}, status=status.HTTP_403_FORBIDDEN)
            rows = PhotoDrop.objects.filter(owner_id=int(whose)).select_related('file', 'thumbnail')
            return Response(PhotoDropSerializer(rows, many=True).data)
        return Response(PhotoDropSerializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=['get'])
    def owners(self, request):
        """Whose drawers hold photos right now (superuser only), most photos first; mine is left out."""
        if not request.user.is_superuser:
            return Response({'detail': 'Only the owner can open another drawer.'}, status=status.HTTP_403_FORBIDDEN)
        from django.contrib.auth import get_user_model
        from django.db.models import Count

        people = (get_user_model().objects.exclude(pk=request.user.pk)
                  .annotate(photos=Count('photo_drops')).filter(photos__gt=0).order_by('-photos', 'first_name', 'pk'))
        return Response([
            {'id': u.pk, 'name': (u.full_name or '').strip() or u.email, 'photos': u.photos} for u in people
        ])

    def create(self, request):
        serializer = PhotoDropUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data['photo']
        upload.seek(0)
        replaces = serializer.validated_data.get('replaces')
        old = self.get_queryset().filter(pk=replaces).first() if replaces else None
        if replaces and old is None:
            return Response({'replaces': ['That photo is not in your drawer.']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if old is not None:
                drop = photo_drops.replace_drop(old, upload.read(), user=request.user)
            else:
                drop = photo_drops.save_drop(upload.read(), user=request.user)
        except photo_drops.PhotoDropError as exc:
            return Response({'photo': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PhotoDropSerializer(drop).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        photo_drops.delete_drop(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        return stream_s3(self.get_object().file)

    @action(detail=True, methods=['get'])
    def thumb(self, request, pk=None):
        drop = self.get_object()
        return stream_s3(drop.thumbnail or drop.file)

    @action(detail=True, methods=['post'])
    def used(self, request, pk=None):
        serializer = PhotoDropUsedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        drop = photo_drops.mark_used(self.get_object(), serializer.validated_data['where'])
        return Response(PhotoDropSerializer(drop).data)
