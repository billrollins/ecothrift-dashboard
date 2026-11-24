"""Photo projects API (owner 2026-11-24): ``/api/core/photo-projects/`` and ``/api/core/project-photos/``.

A project is seen by its creator, the people it is shared with, and owner-level logins (``visible_to``); anyone
else gets a 404. Only the creator or owner level may rename, share or delete a project; anyone who sees it may
add, edit and delete photos.
"""
from django.contrib.auth import get_user_model
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff

from .files import stream_s3
from .models import PhotoProject, ProjectPhoto
from .services import photo_projects as svc
from .services.photo_drops import MAX_UPLOAD_BYTES


def _name(user) -> str:
    if user is None:
        return ''
    full = f'{getattr(user, "first_name", "")} {getattr(user, "last_name", "")}'.strip()
    return full or getattr(user, 'email', '') or f'#{user.pk}'


class ProjectPhotoSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True, default='')
    item_title = serializers.CharField(source='item.title', read_only=True, default='')
    taken_by_name = serializers.SerializerMethodField()
    has_edit = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPhoto
        fields = ['id', 'project', 'scanned_code', 'item_sku', 'item_title', 'note', 'width', 'height',
                  'edit_kind', 'edit_status', 'edit_error', 'has_edit', 'taken_by_name', 'created_at']
        read_only_fields = fields

    def get_taken_by_name(self, obj):
        return _name(obj.taken_by)

    def get_has_edit(self, obj):
        return obj.edited_id is not None


class PhotoProjectSerializer(serializers.ModelSerializer):
    photo_count = serializers.IntegerField(read_only=True, default=0)
    created_by_name = serializers.SerializerMethodField()
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=get_user_model().objects.all(), required=False)
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = PhotoProject
        fields = ['id', 'name', 'description', 'created_by', 'created_by_name', 'shared_with', 'photo_count',
                  'can_manage', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_by_name', 'photo_count', 'can_manage', 'created_at']

    def get_created_by_name(self, obj):
        return _name(obj.created_by)

    def get_can_manage(self, obj):
        request = self.context.get('request')
        return bool(request and svc.can_manage(request.user, obj))


class PhotoUploadSerializer(serializers.Serializer):
    photo = serializers.ImageField()
    code = serializers.CharField(required=False, allow_blank=True, default='', max_length=80)
    note = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_photo(self, value):
        if (getattr(value, 'size', 0) or 0) > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError('Photo too large (max 20 MB).')
        return value


class PhotoProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = None
    serializer_class = PhotoProjectSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        from django.db.models import Count
        return svc.visible_to(self.request.user).select_related('created_by').prefetch_related('shared_with') \
            .annotate(photo_count=Count('photos', distinct=True))

    def list(self, request, *args, **kwargs):
        svc.purge_deleted_sometimes()
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        if not svc.can_manage(request.user, self.get_object()):
            return Response({'detail': 'Only the person who made this project (or the owner) can change it.'},
                            status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if not svc.can_manage(request.user, project):
            return Response({'detail': 'Only the person who made this project (or the owner) can delete it.'},
                            status=status.HTTP_403_FORBIDDEN)
        svc.delete_project(project)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post'])
    def photos(self, request, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            rows = project.photos.select_related('item', 'taken_by')
            return Response(ProjectPhotoSerializer(rows, many=True).data)
        ser = PhotoUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        upload = ser.validated_data['photo']
        upload.seek(0)
        try:
            photo = svc.save_photo(project, upload.read(), user=request.user,
                                   code=ser.validated_data['code'], note=ser.validated_data['note'])
        except svc.PhotoError as exc:
            return Response({'photo': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ProjectPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def people(self, request):
        users = get_user_model().objects.filter(is_active=True, groups__name__in=['Employee', 'Manager', 'Admin'])
        users = users.distinct().order_by('first_name', 'last_name')
        return Response([{'id': u.pk, 'name': _name(u)} for u in users])

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        item = svc.find_item(request.query_params.get('code', ''))
        if item is None:
            return Response({'found': False})
        return Response({'found': True, 'sku': item.sku, 'title': item.title})


class ProjectPhotoViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsStaff]
    serializer_class = ProjectPhotoSerializer
    parser_classes = [JSONParser]

    def get_queryset(self):
        return ProjectPhoto.objects.filter(project__in=svc.visible_to(self.request.user)) \
            .select_related('file', 'thumbnail', 'edited', 'edited_thumbnail', 'item', 'taken_by')

    def retrieve(self, request, pk=None):
        return Response(ProjectPhotoSerializer(self.get_object()).data)

    def partial_update(self, request, pk=None):
        photo = self.get_object()
        photo.note = str(request.data.get('note', photo.note) or '')
        photo.save(update_fields=['note'])
        return Response(ProjectPhotoSerializer(photo).data)

    def destroy(self, request, pk=None):
        svc.delete_photo(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def edit(self, request, pk=None):
        try:
            photo = svc.start_edit(self.get_object(), str(request.data.get('kind', '')))
        except svc.PhotoError as exc:
            return Response({'kind': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ProjectPhotoSerializer(photo).data)

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        return stream_s3(self.get_object().file)

    @action(detail=True, methods=['get'])
    def thumb(self, request, pk=None):
        photo = self.get_object()
        return stream_s3(photo.thumbnail or photo.file)

    @action(detail=True, methods=['get'], url_path='edited')
    def edited_file(self, request, pk=None):
        photo = self.get_object()
        if not photo.edited_id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return stream_s3(photo.edited)

    @action(detail=True, methods=['get'], url_path='edited-thumb')
    def edited_thumb(self, request, pk=None):
        photo = self.get_object()
        if not photo.edited_id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return stream_s3(photo.edited_thumbnail or photo.edited)
