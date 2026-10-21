from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomerViewSet, LoginMergeViewSet, capability_catalog_view, pay_levels_view
from . import messages_views as msg

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'customers', CustomerViewSet, basename='customer')
# Owner 2026-10-15: merge a customer login into a staff login (superuser).
router.register(r'login-merge', LoginMergeViewSet, basename='login-merge')

urlpatterns = [
    # Staff messages (owner 2026-10-21): never email or text.
    path('messages/', msg.threads_view, name='staff-messages'),
    path('messages/unread/', msg.unread_view, name='staff-messages-unread'),
    path('messages/audiences/', msg.audiences_view, name='staff-messages-audiences'),
    path('messages/<int:thread_id>/', msg.thread_view, name='staff-message-thread'),
    path('messages/<int:thread_id>/reply/', msg.reply_view, name='staff-message-reply'),
    path('messages/secret/<int:message_id>/show/', msg.show_secret_view, name='staff-message-show-secret'),
    path('capability-catalog/', capability_catalog_view, name='capability-catalog'),
    path('pay-levels/', pay_levels_view, name='pay-levels'),
    path('', include(router.urls)),
]
