from rest_framework import serializers

from .models import EmailTemplate, MailMessage
from .sanitize import clean_email_html


class MailMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailMessage
        fields = [
            'id', 'graph_message_id', 'graph_conversation_id',
            'from_email', 'to_emails', 'subject', 'html_body', 'text_body',
            'received_at', 'is_read', 'classification', 'conversation',
            'attachment_names', 'created_at', 'updated_at',
        ]
        read_only_fields = fields


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ['id', 'key', 'name', 'subject', 'html_body']
        read_only_fields = fields


class MailReplySerializer(serializers.Serializer):
    html_body = serializers.CharField(trim_whitespace=False)

    def validate_html_body(self, value):
        cleaned = clean_email_html(value)
        if not cleaned.strip():
            raise serializers.ValidationError('Reply body is required.')
        return cleaned
