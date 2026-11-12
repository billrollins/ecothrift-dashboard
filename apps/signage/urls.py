from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SignViewSet

router = DefaultRouter()
router.register(r'signs', SignViewSet, basename='signage-sign')

urlpatterns = [
    path('', include(router.urls)),
]
