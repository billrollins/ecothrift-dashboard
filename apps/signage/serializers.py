from rest_framework import serializers

from .models import Sign


class SignSerializer(serializers.ModelSerializer):
    """A store sign. ``pins`` = spots on the Current store maps (filled by the view); the PDF is its own endpoint."""
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    pdf_name = serializers.SerializerMethodField()
    pdf_size = serializers.SerializerMethodField()
    pins = serializers.SerializerMethodField()

    class Meta:
        model = Sign
        fields = [
            'id', 'name', 'status', 'status_label', 'copies_up', 'note',
            'pdf_name', 'pdf_size', 'pins', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_pdf_name(self, obj):
        return obj.pdf.filename if obj.pdf_id else None

    def get_pdf_size(self, obj):
        return obj.pdf.size if obj.pdf_id else None

    def get_pins(self, obj):
        return (self.context.get('pin_counts') or {}).get(obj.id, 0)

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Give the sign a name.')
        return value

    def validate_copies_up(self, value):
        if value > 500:
            raise serializers.ValidationError('That is more copies than the store has walls.')
        return value
