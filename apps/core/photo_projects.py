"""Photo projects API (owner 2026-11-24): ``/api/core/photo-projects/``, ``/api/core/project-photos/`` and, for the
photo editor's versions (Dash #209), ``/api/core/photo-versions/``.

A project is seen by its creator, the people it is shared with, and owner-level logins (``visible_to``); anyone
else gets a 404. Only the creator or owner level may rename, share or delete a project; anyone who sees it may
add, edit and delete photos and versions.
"""
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff

from .files import stream_s3
from .models import PhotoProject, ProjectPhoto, ProjectPhotoVersion
from .services import photo_projects as svc
from .services.photo_drops import MAX_UPLOAD_BYTES


def _item_title(item) -> str:
    product = getattr(item, 'product', None) if item is not None else None
    return (getattr(product, 'title', '') or '') if product is not None else ''


def _name(user) -> str:
    if user is None:
        return ''
    full = f'{getattr(user, "first_name", "")} {getattr(user, "last_name", "")}'.strip()
    return full or getattr(user, 'email', '') or f'#{user.pk}'


class PhotoVersionSerializer(serializers.ModelSerializer):
    made_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPhotoVersion
        fields = ['id', 'photo', 'made_from', 'kind', 'action', 'caption', 'width', 'height', 'see_through', 'status',
                  'error', 'made_by_name', 'made_at']
        read_only_fields = fields

    def get_made_by_name(self, obj):
        return _name(obj.made_by)


class ProjectPhotoSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True, default='')
    item_title = serializers.SerializerMethodField()
    taken_by_name = serializers.SerializerMethodField()
    versions = PhotoVersionSerializer(many=True, read_only=True)
    # The version the project grid shows (see ``svc.main_of``); null = Raw.
    main = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPhoto
        fields = ['id', 'project', 'scanned_code', 'item_sku', 'item_title', 'note', 'width', 'height',
                  'versions', 'main', 'taken_by_name', 'created_at']
        read_only_fields = fields

    def get_item_title(self, obj):
        return _item_title(obj.item)

    def get_taken_by_name(self, obj):
        return _name(obj.taken_by)

    def get_main(self, obj):
        main = svc.main_of(obj)
        return main.pk if main is not None else None


def _with_versions(qs):
    return qs.prefetch_related(Prefetch('versions', queryset=ProjectPhotoVersion.objects.select_related('made_by')))


class VersionUploadSerializer(serializers.Serializer):
    file = serializers.ImageField()
    made_from = serializers.IntegerField(required=False, allow_null=True, default=None)
    caption = serializers.CharField(required=False, allow_blank=True, default='', max_length=80)

    def validate_file(self, value):
        if (getattr(value, 'size', 0) or 0) > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError('Picture too large (max 20 MB).')
        return value


class AiRunSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=sorted(svc.AI_ACTIONS))
    made_from = serializers.IntegerField(required=False, allow_null=True, default=None)
    color = serializers.CharField(required=False, allow_blank=True, default='', max_length=7)
    words = serializers.CharField(required=False, allow_blank=True, default='', max_length=svc.MAX_WORDS)


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
            svc.expire_stale(ProjectPhotoVersion.objects.filter(photo__project=project))
            rows = _with_versions(project.photos.select_related('item__product', 'taken_by'))
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
        return Response({'found': True, 'sku': item.sku, 'title': _item_title(item)})


class ProjectPhotoViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsStaff]
    serializer_class = ProjectPhotoSerializer
    parser_classes = [JSONParser]

    def get_queryset(self):
        return _with_versions(ProjectPhoto.objects.filter(project__in=svc.visible_to(self.request.user))
                              .select_related('file', 'thumbnail', 'edited', 'edited_thumbnail', 'item__product',
                                              'taken_by'))

    def _fresh(self, photo):
        """The photo as the editor sees it now (versions re-read after a change)."""
        return ProjectPhotoSerializer(self.get_queryset().get(pk=photo.pk)).data

    def _source(self, photo, raw_id):
        """The version a run starts from: None for Raw, else that photo's version (PhotoError when not found)."""
        if raw_id in (None, ''):
            return None
        try:
            hit = photo.versions.filter(pk=int(raw_id)).first()
        except (TypeError, ValueError):
            hit = None
        if hit is None:
            raise svc.PhotoError('That version is not there any more.')
        return hit

    def retrieve(self, request, pk=None):
        photo = self.get_object()
        if svc.expire_stale(photo.versions.all()):
            return Response(self._fresh(photo))
        return Response(ProjectPhotoSerializer(photo).data)

    def partial_update(self, request, pk=None):
        photo = self.get_object()
        photo.note = str(request.data.get('note', photo.note) or '')
        photo.save(update_fields=['note'])
        return Response(ProjectPhotoSerializer(photo).data)

    def destroy(self, request, pk=None):
        svc.delete_photo(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def versions(self, request, pk=None):
        """Keep a picture drawn by the Edit tab as a new version (multipart: file, made_from, caption)."""
        photo = self.get_object()
        ser = VersionUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        upload = ser.validated_data['file']
        upload.seek(0)
        try:
            version = svc.save_edit(photo, upload.read(), user=request.user,
                                    made_from=self._source(photo, ser.validated_data['made_from']),
                                    caption=ser.validated_data['caption'])
        except svc.PhotoError as exc:
            return Response({'file': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PhotoVersionSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def ai(self, request, pk=None):
        """Start one AI run (action, made_from, color, words); it shows as a working version at once."""
        photo = self.get_object()
        ser = AiRunSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            version = svc.start_ai(photo, data['action'], user=request.user,
                                   made_from=self._source(photo, data['made_from']), color=data['color'],
                                   words=data['words'])
        except svc.PhotoError as exc:
            return Response({'action': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PhotoVersionSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def main(self, request, pk=None):
        """Star a version as Main (``version``: its id, or null for Raw)."""
        photo = self.get_object()
        try:
            version = self._source(photo, request.data.get('version'))
            if version is not None and (version.status != ProjectPhotoVersion.STATUS_DONE or not version.file_id):
                raise svc.PhotoError('That version has no picture yet.')
        except svc.PhotoError as exc:
            return Response({'version': [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        svc.set_main(photo, version)
        return Response(self._fresh(photo))

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        return stream_s3(self.get_object().file)

    @action(detail=True, methods=['get'])
    def thumb(self, request, pk=None):
        photo = self.get_object()
        return stream_s3(photo.thumbnail or photo.file)


class PhotoVersionViewSet(viewsets.GenericViewSet):
    """One version: its picture, delete (files too), Run again for a failed AI run."""

    permission_classes = [IsAuthenticated, IsStaff]
    serializer_class = PhotoVersionSerializer
    parser_classes = [JSONParser]

    def get_queryset(self):
        return ProjectPhotoVersion.objects.filter(photo__project__in=svc.visible_to(self.request.user)) \
            .select_related('file', 'thumbnail', 'made_by')

    def retrieve(self, request, pk=None):
        return Response(PhotoVersionSerializer(self.get_object()).data)

    def destroy(self, request, pk=None):
        svc.delete_version(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        version = self.get_object()
        if not version.file_id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return stream_s3(version.file)

    @action(detail=True, methods=['get'])
    def thumb(self, request, pk=None):
        version = self.get_object()
        if not version.file_id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return stream_s3(version.thumbnail or version.file)

    @action(detail=True, methods=['post'])
    def again(self, request, pk=None):
        try:
            version = svc.run_again(self.get_object())
        except svc.PhotoError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PhotoVersionSerializer(version).data)
