from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomLabelViewSet

router = DefaultRouter()
router.register(r'labels', CustomLabelViewSet, basename='customlabel')

urlpatterns = [
    path('', include(router.urls)),
]
