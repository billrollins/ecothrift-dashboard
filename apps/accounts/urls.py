from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomerViewSet, LoginMergeViewSet, pay_levels_view
from . import access_views
from . import messages_views as msg
from . import sign_in_views

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
    # People → Permissions (Dash Update #53).
    path('access/', access_views.access_page_view, name='access-page'),
    path('access/layer/', access_views.access_layer_view, name='access-layer'),
    path('access/level/', access_views.access_level_view, name='access-level'),
    path('access/history/', access_views.access_history_view, name='access-history'),
    path('pay-levels/', pay_levels_view, name='pay-levels'),
    # Cannot sign in (#121): locked out / no password, Unlock, reset links.
    path('sign-in-trouble/', sign_in_views.sign_in_trouble_view, name='sign-in-trouble'),
    path('sign-in-trouble/<int:pk>/unlock/', sign_in_views.unlock_view, name='sign-in-trouble-unlock'),
    path('sign-in-trouble/<int:pk>/email-link/', sign_in_views.email_link_view, name='sign-in-trouble-email'),
    path('sign-in-trouble/<int:pk>/link/', sign_in_views.set_link_view, name='sign-in-trouble-link'),
    path('', include(router.urls)),
]
