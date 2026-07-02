from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FloorPlanAssetViewSet, FloorPlanViewSet

router = DefaultRouter()
router.register(r'plans', FloorPlanViewSet, basename='floorplan')
router.register(r'assets', FloorPlanAssetViewSet, basename='floorplan-asset')

urlpatterns = [
    path('', include(router.urls)),
]
