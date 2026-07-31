from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmailTemplateViewSet, GeneralMailMessageViewSet, sync_now

router = DefaultRouter()
router.register(r'messages', GeneralMailMessageViewSet, basename='mailbox-message')
router.register(r'templates', EmailTemplateViewSet, basename='mailbox-template')

urlpatterns = [
    path('sync/', sync_now, name='mailbox-sync'),
    path('', include(router.urls)),
]
