from django.urls import path
from .views import (
    login_view, refresh_view, logout_view, me_view, change_password_view,
    forgot_password_view, reset_password_view,
    magic_link_request_view, magic_link_consume_view,
)

urlpatterns = [
    path('login/', login_view, name='auth-login'),
    path('refresh/', refresh_view, name='auth-refresh'),
    path('logout/', logout_view, name='auth-logout'),
    path('me/', me_view, name='auth-me'),
    path('change-password/', change_password_view, name='auth-change-password'),
    path('forgot-password/', forgot_password_view, name='auth-forgot-password'),
    path('reset-password/', reset_password_view, name='auth-reset-password'),
    path('magic-link/request/', magic_link_request_view, name='auth-magic-link-request'),
    path('magic-link/consume/', magic_link_consume_view, name='auth-magic-link-consume'),
]
