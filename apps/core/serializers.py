from rest_framework import serializers
from .models import (
    AiTier,
    WorkLocation,
    AppSetting,
    AppSettingHistory,
    S3File,
    PrintServerRelease,
    AiAction,
    AiModel,
    ApprovalRequest,
)
from apps.core.ai_config import EFFORT_VALUES, settings_model


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


class AiModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiModel
        fields = [
            'id', 'slug', 'label', 'provider', 'modality', 'status', 'source',
            'input_price', 'output_price', 'image_price', 'price_source', 'price_checked_at', 'price_flag', 'flag_input',
            'flag_output', 'aa_slug', 'aa_name', 'aa_intelligence', 'aa_task_cost', 'aa_speed', 'aa_checked_at',
            'release_date', 'tier_keys', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'source', 'price_source', 'price_checked_at', 'price_flag', 'flag_input',
                            'flag_output', 'aa_name', 'aa_intelligence', 'aa_task_cost', 'aa_speed', 'aa_checked_at',
                            'release_date', 'created_at', 'updated_at']

    tier_keys = serializers.SerializerMethodField()

    def get_tier_keys(self, obj):
        """The tiers this model is, e.g. ['fast']: the page marks them and warns before archiving."""
        return [t.key for t in obj.tiers.all()]

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
        if modality == AiModel.MODALITY_IMAGE and provider not in (
                AiModel.PROVIDER_XAI, AiModel.PROVIDER_OPENAI, AiModel.PROVIDER_GOOGLE):
            raise serializers.ValidationError(
                {'modality': 'Image models must be xAI, OpenAI or Google (the image calls Dash can make).'},
            )
        return attrs


class AiTierSerializer(serializers.ModelSerializer):
    model = serializers.PrimaryKeyRelatedField(queryset=AiModel.objects.all(), allow_null=True, required=False)
    model_slug = serializers.CharField(source='model.slug', read_only=True, default=None)
    env_model = serializers.SerializerMethodField()

    class Meta:
        model = AiTier
        fields = ['key', 'label', 'modality', 'model', 'model_slug', 'effort', 'env_model', 'updated_at']
        read_only_fields = ['key', 'label', 'modality', 'updated_at']

    def get_env_model(self, obj):
        return settings_model('LABEL_IMAGE' if obj.modality == AiModel.MODALITY_IMAGE else '')

    def validate(self, attrs):
        instance = self.instance
        model = attrs['model'] if 'model' in attrs else getattr(instance, 'model', None)
        effort = attrs.get('effort', getattr(instance, 'effort', 'off'))
        if model is not None:
            if model.status != AiModel.STATUS_ACTIVE:
                raise serializers.ValidationError({'model': 'That model is archived.'})
            if model.modality != instance.modality:
                raise serializers.ValidationError({'model': f'This tier needs a {instance.modality} model.'})
        if effort not in EFFORT_VALUES:
            raise serializers.ValidationError({'effort': 'Effort must be off, low, medium, high, or max.'})
        if instance.modality == AiModel.MODALITY_IMAGE and effort != 'off':
            raise serializers.ValidationError({'effort': 'Image models have no effort setting.'})
        return attrs


class AiActionSerializer(serializers.ModelSerializer):
    """Writes one action's tier and overrides (model, effort). The page reads rows from ``ai_actions.rows``."""

    model = serializers.PrimaryKeyRelatedField(
        queryset=AiModel.objects.all(), allow_null=True, required=False,
    )

    class Meta:
        model = AiAction
        fields = ['purpose', 'tier', 'model', 'effort']
        read_only_fields = ['purpose']

    def validate(self, attrs):
        instance = self.instance
        model = attrs['model'] if 'model' in attrs else getattr(instance, 'model', None)
        effort = attrs.get('effort', getattr(instance, 'effort', AiAction.EFFORT_TIER))
        tier = attrs.get('tier', getattr(instance, 'tier', AiTier.STANDARD))
        modality = getattr(instance, 'modality', AiModel.MODALITY_TEXT)
        if (tier == AiTier.IMAGE) != (modality == AiModel.MODALITY_IMAGE):
            raise serializers.ValidationError({'tier': f'This action needs a {modality} tier.'})
        if 'model' in attrs and model is not None:
            if model.status != AiModel.STATUS_ACTIVE:
                raise serializers.ValidationError({'model': 'That model is archived.'})
            if model.modality != modality:
                raise serializers.ValidationError({'model': f'This action needs a {modality} model.'})
        if effort not in ('',) + tuple(EFFORT_VALUES):
            raise serializers.ValidationError({'effort': 'Effort must be blank (the tier\'s), off, low, medium, high, or max.'})
        if modality == AiModel.MODALITY_IMAGE and effort not in ('', AiAction.EFFORT_OFF):
            raise serializers.ValidationError({'effort': 'Image actions have no effort setting.'})
        return attrs


class ApprovalRequestSerializer(serializers.ModelSerializer):
    """Superuser → Requests: a staged change, its preview, and how its apply is going."""

    kind_label = serializers.SerializerMethodField()
    can_undo = serializers.SerializerMethodField()
    stale = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = [
            'id', 'kind', 'kind_label', 'title', 'summary', 'preview', 'status', 'requested_by',
            'decided_by_name', 'decided_at', 'decision_note', 'started_at', 'heartbeat_at', 'finished_at',
            'progress', 'log', 'result', 'error', 'undone_at', 'can_undo', 'stale', 'created_at',
        ]

    def get_kind_label(self, obj) -> str:
        from .services.approval_requests import RequestError, get_kind

        try:
            return get_kind(obj.kind).label
        except RequestError:
            return obj.kind

    def get_can_undo(self, obj) -> bool:
        from .services.approval_requests import RequestError, get_kind

        try:
            return obj.status == obj.STATUS_APPLIED and get_kind(obj.kind).undo is not None
        except RequestError:
            return False

    def get_stale(self, obj) -> bool:
        from .services.approval_requests import is_stale

        return is_stale(obj)

    def get_decided_by_name(self, obj) -> str:
        return obj.decided_by.full_name if obj.decided_by_id else ''
