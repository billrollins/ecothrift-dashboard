"""Photo drawer API (Dash Updates #82): ``/api/core/photo-drops/``.

Every staff login has one drawer and sees only its own photos; that is enforced in the queryset, so
someone else's photo is a 404 for list, file, thumbnail, used and delete alike.
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

    def get_queryset(self):
        return PhotoDrop.objects.filter(owner=self.request.user).select_related('file', 'thumbnail')

    def list(self, request):
        photo_drops.purge_old_sometimes()
        return Response(PhotoDropSerializer(self.get_queryset(), many=True).data)

    def create(self, request):
        serializer = PhotoDropUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data['photo']
        upload.seek(0)
        try:
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
