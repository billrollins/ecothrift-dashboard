import re

from django.utils.text import slugify
from rest_framework import serializers

from .assets import sanitize_asset_upload
from .models import FloorPlan, FloorPlanAsset, FloorPlanElementKind
from .validation import validate_plan_document

HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')

# Sanity caps for element kind footprints (inches). Matches the plan
# dimension cap used by the editor.
MIN_KIND_DIM = 1
MAX_KIND_DIM = 12_000
MAX_CORNER_RADIUS = 60


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


class FloorPlanElementKindSerializer(serializers.ModelSerializer):
    """Element kind catalog entry.

    - `kind` is optional on create (auto-slugified from `label`, made unique
      with a numeric suffix) and immutable afterwards.
    - `is_system` is server-controlled (seed migration only).
    - `shape=circle` normalizes `corner_radius` to 0.
    """
    kind = serializers.SlugField(max_length=64, required=False)

    class Meta:
        model = FloorPlanElementKind
        fields = [
            'id', 'kind', 'label', 'category', 'default_w', 'default_h',
            'fill_color', 'default_image', 'shape', 'corner_radius',
            'resizable', 'is_system', 'sort_order', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['is_system', 'is_active', 'created_at', 'updated_at']

    def validate_fill_color(self, value):
        if not HEX_COLOR_RE.match(value or ''):
            raise serializers.ValidationError('Fill color must be a hex value like #7986cb.')
        return value.lower()

    def validate_label(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Label is required.')
        return value

    def validate_category(self, value):
        value = (value or '').strip()
        return value or 'Misc'

    def _validate_dim(self, value):
        if value is None or not (MIN_KIND_DIM <= value <= MAX_KIND_DIM):
            raise serializers.ValidationError(
                f'Must be between {MIN_KIND_DIM} and {MAX_KIND_DIM} inches.'
            )
        return value

    def validate_default_w(self, value):
        return self._validate_dim(value)

    def validate_default_h(self, value):
        return self._validate_dim(value)

    def validate_corner_radius(self, value):
        if value is None or value < 0 or value > MAX_CORNER_RADIUS:
            raise serializers.ValidationError(
                f'Corner radius must be between 0 and {MAX_CORNER_RADIUS} inches.'
            )
        return value

    def validate(self, attrs):
        if self.instance is not None and 'kind' in attrs and attrs['kind'] != self.instance.kind:
            raise serializers.ValidationError(
                {'kind': 'The kind slug is referenced by saved plans and cannot be changed.'}
            )
        shape = attrs.get('shape', getattr(self.instance, 'shape', FloorPlanElementKind.SHAPE_RECT))
        if shape == FloorPlanElementKind.SHAPE_CIRCLE:
            attrs['corner_radius'] = 0
        if self.instance is None:
            if attrs.get('kind'):
                if FloorPlanElementKind.objects.filter(kind=attrs['kind']).exists():
                    raise serializers.ValidationError(
                        {'kind': 'An element type with this slug already exists.'}
                    )
            else:
                attrs['kind'] = self._unique_slug(attrs.get('label', ''))
        return attrs

    def _unique_slug(self, label):
        base = slugify(label)[:56] or 'element'
        slug = base
        n = 2
        while FloorPlanElementKind.objects.filter(kind=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        return slug


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
