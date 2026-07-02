from rest_framework import serializers

from .assets import sanitize_asset_upload
from .models import FloorPlan, FloorPlanAsset
from .validation import validate_plan_document


class FloorPlanListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views (excludes `data`)."""
    location_name = serializers.CharField(source='location.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FloorPlan
        fields = [
            'id', 'name', 'location', 'location_name', 'schema_version',
            'revision', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return None
        full = f'{user.first_name} {user.last_name}'.strip()
        return full or user.email


class FloorPlanSerializer(FloorPlanListSerializer):
    """Full serializer including the plan document."""

    class Meta(FloorPlanListSerializer.Meta):
        fields = FloorPlanListSerializer.Meta.fields + ['data']
        read_only_fields = ['revision', 'schema_version']

    def validate_data(self, value):
        validate_plan_document(value)
        return value


class FloorPlanAssetSerializer(serializers.ModelSerializer):
    """Read serializer for image assets. `data` is a sanitized data URI."""

    class Meta:
        model = FloorPlanAsset
        fields = ['id', 'name', 'location', 'data', 'content_type', 'created_at']
        read_only_fields = ['data', 'content_type', 'created_at']


class FloorPlanAssetUploadSerializer(serializers.Serializer):
    """Multipart upload: `file` plus optional `name` and `location`."""
    file = serializers.FileField()
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    location = serializers.PrimaryKeyRelatedField(
        queryset=FloorPlanAsset._meta.get_field('location').related_model.objects.all(),
        required=False,
        allow_null=True,
    )

    def create(self, validated_data):
        uploaded = validated_data['file']
        data_uri, content_type = sanitize_asset_upload(uploaded)
        name = (validated_data.get('name') or '').strip() or uploaded.name.rsplit('.', 1)[0][:200]
        return FloorPlanAsset.objects.create(
            name=name,
            location=validated_data.get('location'),
            data=data_uri,
            content_type=content_type,
            created_by=self.context['request'].user,
        )
