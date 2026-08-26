from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomerViewSet, capability_catalog_view

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'customers', CustomerViewSet, basename='customer')

urlpatterns = [
    path('capability-catalog/', capability_catalog_view, name='capability-catalog'),
    path('', include(router.urls)),
]
