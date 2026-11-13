import re

from django.apps import apps as django_apps
from django.utils.text import slugify
from rest_framework import serializers

from .assets import sanitize_asset_upload
from .models import FloorPlan, FloorPlanAsset, FloorPlanElementKind, MapLayer, MapPin
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
    # One store (#130): a new plan goes to it when no location is sent.
    location = serializers.PrimaryKeyRelatedField(
        queryset=FloorPlan._meta.get_field('location').related_model.objects.all(), required=False,
    )
    # Pins on the plan, and when it last stopped being Current (null = never; set = a past version).
    pin_count = serializers.SerializerMethodField()
    last_current_end = serializers.SerializerMethodField()

    class Meta:
        model = FloorPlan
        fields = [
            'id', 'name', 'location', 'location_name', 'schema_version',
            'revision', 'is_current', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'pin_count', 'last_current_end',
        ]
        read_only_fields = ['is_current']
        # The one-Current-per-location constraint would make `location` required here; is_current is read-only and
        # the database keeps the rule.
        validators = []

    def get_pin_count(self, obj):
        value = getattr(obj, 'pin_count', None)
        return value if value is not None else obj.pins.count()

    def get_last_current_end(self, obj):
        if hasattr(obj, 'last_current_end'):
            return obj.last_current_end
        last = obj.current_periods.exclude(ended_at__isnull=True).order_by('-ended_at').first()
        return last.ended_at if last else None

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
        read_only_fields = ['revision', 'schema_version', 'is_current']

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
            'resizable', 'is_wall', 'is_system', 'sort_order', 'is_active',
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


class MapLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MapLayer
        fields = ['id', 'slug', 'name', 'description', 'color', 'ref_type', 'sort_order']


# A pin may sit a little outside the drawn plan (a sign on the outside wall), never far off it.
PIN_MARGIN = 240


class MapPinSerializer(serializers.ModelSerializer):
    """A pin on a plan layer. ``ref_type`` comes from the layer; ``ref_id`` is the thing it stands for."""
    layer_slug = serializers.CharField(source='layer.slug', read_only=True)

    class Meta:
        model = MapPin
        fields = [
            'id', 'plan', 'layer', 'layer_slug', 'x', 'y', 'name', 'note',
            'ref_type', 'ref_id', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['ref_type', 'created_at', 'updated_at']

    def validate_plan(self, plan):
        if not plan.is_active:
            raise serializers.ValidationError('That floor plan was deleted.')
        if self.instance is not None and plan.pk != self.instance.plan_id:
            raise serializers.ValidationError('A pin stays on its plan; drop a new pin instead.')
        return plan

    def validate_layer(self, layer):
        if not layer.is_active:
            raise serializers.ValidationError('That layer is turned off.')
        return layer

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Give the pin a name.')
        return value

    def validate(self, attrs):
        plan = attrs.get('plan') or getattr(self.instance, 'plan', None)
        layer = attrs.get('layer') or getattr(self.instance, 'layer', None)
        if plan is not None and not plan.is_current:
            # #130: pins go on the Current plan; a past version keeps its pins as history.
            raise serializers.ValidationError({'plan': f'Pins go on the Current plan. “{plan.name}” is not Current.'})
        if self.instance is not None and layer and layer.pk != self.instance.layer_id:
            raise serializers.ValidationError({'layer': 'A pin stays on its layer.'})
        if plan is not None:
            settings_ = (plan.data or {}).get('settings') or {}
            width = float(settings_.get('planWidth') or 0) or 100_000
            height = float(settings_.get('planHeight') or 0) or 100_000
            for key, limit in (('x', width), ('y', height)):
                if key in attrs and not (-PIN_MARGIN <= attrs[key] <= limit + PIN_MARGIN):
                    raise serializers.ValidationError({key: 'The pin is off the map.'})
        if layer is not None:
            attrs['ref_type'] = layer.ref_type
            if not layer.ref_type:
                attrs['ref_id'] = None
            elif self.instance is None or 'ref_id' in attrs:
                self._check_ref(layer.ref_type, attrs.get('ref_id'))
        return attrs

    @staticmethod
    def _check_ref(ref_type, ref_id):
        """A layer that points at records (``signage.sign``) needs a pin on a live one of them."""
        if ref_id is None:
            raise serializers.ValidationError({'ref_id': 'Pick what this pin stands for.'})
        try:
            model = django_apps.get_model(ref_type)
        except (LookupError, ValueError):
            raise serializers.ValidationError({'layer': f'This layer points at {ref_type}, which Dash does not know.'})
        rows = model._default_manager.filter(pk=ref_id)
        if any(f.name == 'is_active' for f in model._meta.fields):
            rows = rows.filter(is_active=True)
        if not rows.exists():
            raise serializers.ValidationError({'ref_id': 'That one is gone.'})
