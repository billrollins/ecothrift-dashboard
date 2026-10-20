from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomerViewSet, LoginMergeViewSet, capability_catalog_view, pay_levels_view

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'customers', CustomerViewSet, basename='customer')
# Owner 2026-10-15: merge a customer login into a staff login (superuser).
router.register(r'login-merge', LoginMergeViewSet, basename='login-merge')

urlpatterns = [
    path('capability-catalog/', capability_catalog_view, name='capability-catalog'),
    path('pay-levels/', pay_levels_view, name='pay-levels'),
    path('', include(router.urls)),
]
