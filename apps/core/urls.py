from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkLocationViewSet, AppSettingViewSet, S3FileViewSet,
    app_version, print_server_version, print_server_releases,
    print_server_version_public,
)

router = DefaultRouter()
router.register(r'locations', WorkLocationViewSet, basename='worklocation')
router.register(r'settings', AppSettingViewSet, basename='appsetting')
router.register(r'files', S3FileViewSet, basename='s3file')

urlpatterns = [
    path('', include(router.urls)),
    path('system/version/', app_version, name='app-version'),
    path('system/print-server-version/', print_server_version, name='print-server-version'),
    path('system/print-server-releases/', print_server_releases, name='print-server-releases'),
    path('system/print-server-version-public/', print_server_version_public, name='print-server-version-public'),
]
