from django.urls import path
from .views import (
    login_view, refresh_view, logout_view, me_view, capabilities_view, change_password_view,
    forgot_password_view, reset_password_view,
    magic_link_request_view, magic_link_consume_view,
    customer_lookup_view, customer_register_view, customer_set_password_view,
    customer_reset_password_view, customer_resend_verification_view,
)

urlpatterns = [
    path('login/', login_view, name='auth-login'),
    path('refresh/', refresh_view, name='auth-refresh'),
    path('logout/', logout_view, name='auth-logout'),
    path('me/', me_view, name='auth-me'),
    path('capabilities/', capabilities_view, name='auth-capabilities'),
    path('change-password/', change_password_view, name='auth-change-password'),
    path('forgot-password/', forgot_password_view, name='auth-forgot-password'),
    path('reset-password/', reset_password_view, name='auth-reset-password'),
    path('magic-link/request/', magic_link_request_view, name='auth-magic-link-request'),
    path('magic-link/consume/', magic_link_consume_view, name='auth-magic-link-consume'),
    path('customer/lookup/', customer_lookup_view, name='auth-customer-lookup'),
    path('customer/register/', customer_register_view, name='auth-customer-register'),
    path('customer/set-password/', customer_set_password_view, name='auth-customer-set-password'),
    path('customer/reset-password/', customer_reset_password_view, name='auth-customer-reset-password'),
    path(
        'customer/resend-verification/',
        customer_resend_verification_view,
        name='auth-customer-resend-verification',
    ),
]
