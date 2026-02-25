import json
from pathlib import Path

from django.conf import settings
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from .models import WorkLocation, AppSetting, S3File, PrintServerRelease
from .serializers import (
    WorkLocationSerializer, AppSettingSerializer,
    S3FileSerializer, PrintServerReleaseSerializer,
)


class WorkLocationViewSet(viewsets.ModelViewSet):
    queryset = WorkLocation.objects.all()
    serializer_class = WorkLocationSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    search_fields = ['name']


class AppSettingViewSet(viewsets.ModelViewSet):
    queryset = AppSetting.objects.all()
    serializer_class = AppSettingSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    lookup_field = 'key'

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class S3FileViewSet(viewsets.ModelViewSet):
    queryset = S3File.objects.all()
    serializer_class = S3FileSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def app_version(request):
    """Return the application version from .ai/version.json."""
    version_file = Path(settings.BASE_DIR) / '.ai' / 'version.json'
    try:
        data = json.loads(version_file.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        data = {'version': 'unknown', 'build_date': None, 'description': ''}
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def print_server_version(request):
    """Return the latest print server release info."""
    release = PrintServerRelease.objects.filter(is_current=True).select_related('s3_file').first()
    if not release:
        return Response({'available': False})

    data = PrintServerReleaseSerializer(release).data
    data['available'] = True
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def print_server_releases(request):
    """List all print server releases."""
    releases = PrintServerRelease.objects.select_related('s3_file').all()
    serializer = PrintServerReleaseSerializer(releases, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def print_server_version_public(request):
    """Public (no auth) endpoint — returns current print server version for the /manage page."""
    release = PrintServerRelease.objects.filter(is_current=True).select_related('s3_file').first()
    if not release:
        return Response({'available': False})
    data = PrintServerReleaseSerializer(release).data
    data['available'] = True
    # Flat download_url so the print server /manage page can access it directly
    data['download_url'] = release.s3_file.url if release.s3_file else None
    return Response(data)


