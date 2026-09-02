from rest_framework import serializers

from .models import (
    Document,
    DocumentAssignment,
    DocumentField,
    DocumentRecipient,
)


class DocumentFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentField
        fields = [
            'id', 'page', 'x_pct', 'y_pct', 'w_pct', 'h_pct',
            'kind', 'label', 'required', 'order',
        ]
        read_only_fields = ['id']


class DocumentSerializer(serializers.ModelSerializer):
    fields = DocumentFieldSerializer(many=True, read_only=True)
    assigned_count = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'page_count', 'mode', 'is_active',
            'fields', 'assigned_count', 'completed_count', 'has_file',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'page_count', 'fields', 'assigned_count', 'completed_count',
            'has_file', 'created_at', 'updated_at',
        ]

    def get_has_file(self, obj):
        return bool(obj.file_id)

    def get_assigned_count(self, obj):
        value = getattr(obj, 'assigned_count', None)
        if value is not None:
            return value
        return DocumentRecipient.objects.filter(assignment__document=obj).count()

    def get_completed_count(self, obj):
        value = getattr(obj, 'completed_count', None)
        if value is not None:
            return value
        return DocumentRecipient.objects.filter(
            assignment__document=obj,
            status=DocumentRecipient.STATUS_COMPLETED,
        ).count()


class DocumentAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentAssignment
        fields = [
            'id', 'document', 'audience', 'assigned_user', 'assigned_role',
            'assigned_department', 'due_at', 'message', 'created_at',
        ]
        read_only_fields = ['id', 'document', 'created_at']


class DocumentRecipientSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source='assignment.document.title', read_only=True)
    description = serializers.CharField(source='assignment.document.description', read_only=True)
    mode = serializers.CharField(source='assignment.document.mode', read_only=True)
    document = serializers.IntegerField(source='assignment.document_id', read_only=True)
    due_at = serializers.DateTimeField(source='assignment.due_at', read_only=True)
    message = serializers.CharField(source='assignment.message', read_only=True)
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    fields = DocumentFieldSerializer(source='assignment.document.fields', many=True, read_only=True)
    page_count = serializers.IntegerField(source='assignment.document.page_count', read_only=True)
    href = serializers.SerializerMethodField()

    class Meta:
        model = DocumentRecipient
        fields = [
            'id', 'document', 'title', 'description', 'mode', 'status', 'due_at',
            'message', 'user', 'user_name', 'opened_at', 'completed_at',
            'page_count', 'fields', 'href',
        ]
        read_only_fields = fields

    def get_href(self, obj):
        return f'/documents/{obj.pk}/sign'
