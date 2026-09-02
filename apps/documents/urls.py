from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DocumentRecipientViewSet, DocumentViewSet

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'recipients', DocumentRecipientViewSet, basename='documentrecipient')

urlpatterns = [
    path('', include(router.urls)),
]
