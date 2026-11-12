from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FloorPlanAssetViewSet,
    FloorPlanElementKindViewSet,
    FloorPlanViewSet,
    MapLayerViewSet,
    MapPinViewSet,
    store_map,
)

router = DefaultRouter()
router.register(r'plans', FloorPlanViewSet, basename='floorplan')
router.register(r'assets', FloorPlanAssetViewSet, basename='floorplan-asset')
router.register(r'element-kinds', FloorPlanElementKindViewSet, basename='floorplan-element-kind')
# The store map (#105): layers of pins on each location's Current plan.
router.register(r'layers', MapLayerViewSet, basename='floorplan-layer')
router.register(r'pins', MapPinViewSet, basename='floorplan-pin')

urlpatterns = [
    path('store-map/', store_map, name='floorplan-store-map'),
    path('', include(router.urls)),
]
