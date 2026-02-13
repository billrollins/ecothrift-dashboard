from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomerViewSet, admin_reset_password_view

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'customers', CustomerViewSet, basename='customer')

urlpatterns = [
    path('users/<int:user_id>/reset-password/', admin_reset_password_view, name='admin-reset-password'),
    path('', include(router.urls)),
]
