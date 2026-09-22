from rest_framework import serializers
from .models import (
    WorkLocation,
    AppSetting,
    AppSettingHistory,
    S3File,
    PrintServerRelease,
    EnhancementRequest,
    EnhancementRequestNote,
    AiAction,
    AiModel,
)
from apps.core.ai_config import settings_model


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

    def validate(self, attrs):
        key = attrs.get('key') or getattr(self.instance, 'key', '')
        if str(key).startswith('retail_qa.') and 'value' in attrs:
            from apps.routines.settings import (
                retail_qa_settings,
                validate_retail_qa_bundle,
                validate_retail_qa_value,
            )
            name = key[len('retail_qa.'):]
            try:
                attrs['value'] = validate_retail_qa_value(name, attrs['value'])
            except ValueError as exc:
                raise serializers.ValidationError({'value': str(exc)})
            trial = {**retail_qa_settings(), name: attrs['value']}
            errors = validate_retail_qa_bundle(trial)
            if errors:
                raise serializers.ValidationError({'value': errors[0]})
        return attrs


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


class AiModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiModel
        fields = [
            'id', 'slug', 'label', 'provider', 'modality', 'status', 'source',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'source', 'created_at', 'updated_at']

    def validate_slug(self, value):
        slug = str(value or '').strip()
        if slug.startswith('models/'):
            slug = slug[len('models/'):]
        if not slug:
            raise serializers.ValidationError('Model id is required.')
        if any(ch.isspace() for ch in slug) or '/' in slug:
            raise serializers.ValidationError('Model id cannot contain spaces or slashes.')
        # DRF's unique check ran on the raw value (before models/ was stripped); check again.
        clash = AiModel.objects.filter(slug=slug)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('That model id is already in the list.')
        return slug

    def validate(self, attrs):
        instance = self.instance
        provider = attrs.get('provider', getattr(instance, 'provider', None))
        modality = attrs.get('modality', getattr(instance, 'modality', AiModel.MODALITY_TEXT))
        if instance is not None and 'modality' in attrs and attrs['modality'] != instance.modality:
            raise serializers.ValidationError(
                {'modality': 'Type cannot change. Archive this model and add it again.'},
            )
        if modality == AiModel.MODALITY_IMAGE and provider != AiModel.PROVIDER_XAI:
            raise serializers.ValidationError(
                {'modality': 'Image models must be xAI. Label Studio only calls xAI for images.'},
            )
        return attrs


class AiActionSerializer(serializers.ModelSerializer):
    model = serializers.PrimaryKeyRelatedField(
        queryset=AiModel.objects.all(), allow_null=True, required=False,
    )
    model_slug = serializers.CharField(source='model.slug', read_only=True, default=None)
    env_model = serializers.SerializerMethodField()
    updated_by_name = serializers.CharField(
        source='updated_by.full_name', read_only=True, default=None,
    )

    class Meta:
        model = AiAction
        fields = [
            'purpose', 'label', 'modality', 'model', 'model_slug', 'effort', 'env_model',
            'updated_by_name', 'updated_at',
        ]
        read_only_fields = ['purpose', 'label', 'modality', 'updated_at']

    def get_env_model(self, obj):
        return settings_model(obj.purpose)

    def validate(self, attrs):
        instance = self.instance
        model = attrs['model'] if 'model' in attrs else getattr(instance, 'model', None)
        effort = attrs.get('effort', getattr(instance, 'effort', AiAction.EFFORT_OFF))
        modality = getattr(instance, 'modality', AiModel.MODALITY_TEXT)
        if model is not None:
            if model.status != AiModel.STATUS_ACTIVE:
                raise serializers.ValidationError({'model': 'That model is archived.'})
            if model.modality != modality:
                raise serializers.ValidationError({'model': f'This action needs a {modality} model.'})
        if modality == AiModel.MODALITY_IMAGE and effort != AiAction.EFFORT_OFF:
            raise serializers.ValidationError({'effort': 'Image actions have no effort setting.'})
        return attrs
