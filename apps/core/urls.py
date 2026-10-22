from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkLocationViewSet, AppSettingViewSet, S3FileViewSet,
    EnhancementRequestViewSet, AiActionViewSet, AiModelViewSet,
    app_version, print_server_version, print_server_releases,
    print_server_version_public,
    dev_log_config, dev_log_line,
    ApprovalRequestViewSet,
    app_errors, app_errors_seen, app_error_report,
    owner_scorecard,
    owner_needs_you,
    owner_ai_spend,
    owner_social,
)

router = DefaultRouter()
router.register(r'locations', WorkLocationViewSet, basename='worklocation')
router.register(r'settings', AppSettingViewSet, basename='appsetting')
router.register(r'files', S3FileViewSet, basename='s3file')
router.register(r'enhancement-requests', EnhancementRequestViewSet, basename='enhancementrequest')
router.register(r'ai/models', AiModelViewSet, basename='ai-model')
router.register(r'ai/actions', AiActionViewSet, basename='ai-action')
router.register(r'requests', ApprovalRequestViewSet, basename='approval-request')

urlpatterns = [
    path('', include(router.urls)),
    path('system/version/', app_version, name='app-version'),
    path('system/print-server-version/', print_server_version, name='print-server-version'),
    path('system/print-server-releases/', print_server_releases, name='print-server-releases'),
    path('system/print-server-version-public/', print_server_version_public, name='print-server-version-public'),
    path('dev-log/config/', dev_log_config, name='dev-log-config'),
    path('dev-log/line/', dev_log_line, name='dev-log-line'),
    path('errors/', app_errors, name='app-errors'),
    path('errors/seen/', app_errors_seen, name='app-errors-seen'),
    path('errors/report/', app_error_report, name='app-error-report'),
    path('owner/scorecard/', owner_scorecard, name='owner-scorecard'),
    path('owner/needs-you/', owner_needs_you, name='owner-needs-you'),
    path('owner/ai-spend/', owner_ai_spend, name='owner-ai-spend'),
    path('owner/social/', owner_social, name='owner-social'),
]
