"""Serializers for Custom Label Studio (staff-only, Manager+)."""
from __future__ import annotations

from rest_framework import serializers

from .definition import DefinitionError, validate_definition
from .models import CustomLabel


def _media_payload(label: CustomLabel, attr: str):
    s3 = getattr(label, attr)
    if not s3:
        return None
    return {
        'id': s3.id,
        'filename': s3.filename,
        'size': s3.size,
        'url': f'/api/labels/labels/{label.pk}/media/{attr}/',
    }


class CustomLabelSerializer(serializers.ModelSerializer):
    background_file = serializers.SerializerMethodField()
    pdf = serializers.SerializerMethodField()

    class Meta:
        model = CustomLabel
        fields = [
            'id', 'name', 'slug', 'kind', 'width_in', 'height_in', 'definition',
            'background_file', 'pdf', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'background_file', 'pdf', 'is_active', 'created_at', 'updated_at',
        ]

    def get_background_file(self, obj):
        return _media_payload(obj, 'background')

    def get_pdf(self, obj):
        return _media_payload(obj, 'pdf_file')

    def validate(self, attrs):
        kind = attrs.get('kind') or (self.instance.kind if self.instance else None)
        if kind not in (CustomLabel.KIND_PDF, CustomLabel.KIND_TEMPLATE):
            raise serializers.ValidationError({'kind': 'kind must be "pdf" or "template".'})
        if self.instance and 'kind' in attrs and attrs['kind'] != self.instance.kind:
            raise serializers.ValidationError({'kind': 'kind cannot be changed after creation.'})

        if kind == CustomLabel.KIND_TEMPLATE:
            width = attrs.get('width_in', getattr(self.instance, 'width_in', None))
            height = attrs.get('height_in', getattr(self.instance, 'height_in', None))
            if not width or not height or width <= 0 or height <= 0:
                raise serializers.ValidationError(
                    {'width_in': 'Template labels require positive width_in and height_in.'}
                )
            definition = attrs.get('definition', getattr(self.instance, 'definition', None) or {})
            try:
                attrs['definition'] = validate_definition(definition)
            except DefinitionError as exc:
                raise serializers.ValidationError({'definition': str(exc)})
        else:
            # PDFs carry no template document.
            attrs['definition'] = {}
        return attrs
