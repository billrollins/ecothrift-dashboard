from rest_framework import serializers
from .models import (
    WorkLocation,
    AppSetting,
    S3File,
    PrintServerRelease,
    EnhancementRequest,
    EnhancementRequestNote,
)


class WorkLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkLocation
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class AppSettingSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.full_name', read_only=True, default=None)

    class Meta:
        model = AppSetting
        fields = ['id', 'key', 'value', 'description', 'updated_by', 'updated_by_name', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class S3FileSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)

    class Meta:
        model = S3File
        fields = ['id', 'key', 'filename', 'size', 'content_type', 'uploaded_by', 'uploaded_at', 'url']
        read_only_fields = ['id', 'uploaded_at', 'url']


class PrintServerReleaseSerializer(serializers.ModelSerializer):
    s3_file_info = S3FileSerializer(source='s3_file', read_only=True)

    class Meta:
        model = PrintServerRelease
        fields = [
            'id', 'version', 's3_file', 's3_file_info',
            'release_notes', 'is_current', 'released_by', 'released_at',
        ]
        read_only_fields = ['id', 'released_at']


def _can_own(user, request_row: EnhancementRequest) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return request_row.submitted_by_id == getattr(user, 'pk', None)


class EnhancementRequestNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True, default=None)

    class Meta:
        model = EnhancementRequestNote
        fields = ['id', 'body', 'author', 'author_name', 'created_at']
        read_only_fields = fields


class EnhancementRequestSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(
        source='submitted_by.full_name', read_only=True, default=None,
    )
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.full_name', read_only=True, default=None,
    )
    notes = EnhancementRequestNoteSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_note = serializers.SerializerMethodField()

    class Meta:
        model = EnhancementRequest
        fields = [
            'id',
            'area',
            'body',
            'submitted_by',
            'submitted_by_name',
            'status',
            'priority',
            'target_date',
            'reviewed_by',
            'reviewed_by_name',
            'reviewed_at',
            'notes',
            'can_edit',
            'can_note',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def _actor(self):
        request = self.context.get('request')
        return getattr(request, 'user', None) if request is not None else None

    def get_can_edit(self, obj):
        return _can_own(self._actor(), obj)

    def get_can_note(self, obj):
        return _can_own(self._actor(), obj)


class EnhancementRequestWriteSerializer(serializers.Serializer):
    area = serializers.ChoiceField(choices=EnhancementRequest.AREA_CHOICES)
    body = serializers.CharField(max_length=4000)

    def validate_body(self, value):
        text = str(value or '').strip()
        if not text:
            raise serializers.ValidationError('Say what you want.')
        return text


class EnhancementRequestTriageSerializer(serializers.Serializer):
    priority = serializers.ChoiceField(
        choices=EnhancementRequest.PRIORITY_CHOICES, required=False,
    )
    status = serializers.ChoiceField(
        choices=EnhancementRequest.STATUS_CHOICES, required=False,
    )
    target_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('Set a priority, status, or target date.')
        return attrs


class EnhancementRequestNoteWriteSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)

    def validate_body(self, value):
        text = str(value or '').strip()
        if not text:
            raise serializers.ValidationError('Write a note.')
        return text
