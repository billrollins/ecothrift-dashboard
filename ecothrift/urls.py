"""
URL configuration for ecothrift project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView, RedirectView
from django.conf import settings

# Django contrib.admin must not use /admin/ — React SPA routes live at /admin/* (settings, users, etc.).
urlpatterns = [
    path('db-admin/', admin.site.urls),
    re_path(
        r'^admin/?$',
        RedirectView.as_view(url='/db-admin/', permanent=False),
        name='legacy_django_admin_root_redirect',
    ),
    path('api/auth/', include('apps.accounts.auth_urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/core/', include('apps.core.urls')),
    path('api/hr/', include('apps.hr.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/pos/', include('apps.pos.urls')),
    path('api/consignment/', include('apps.consignment.urls')),
    path('api/ai/', include('apps.ai.urls')),
    path('api/buying/', include('apps.buying.urls')),
]

# Serve the React SPA for all non-API routes in production
if not settings.DEBUG:
    urlpatterns += [
        re_path(r'^(?!api/|db-admin/|static/|assets/).*$',
                TemplateView.as_view(template_name='index.html'),
                name='spa-fallback'),
    ]
