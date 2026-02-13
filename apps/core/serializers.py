from rest_framework import serializers
from .models import WorkLocation, AppSetting, S3File, PrintServerRelease


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
