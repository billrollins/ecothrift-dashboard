from rest_framework import serializers

from .models import EmailTemplate


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ['id', 'key', 'name', 'subject', 'html_body']
        read_only_fields = fields
