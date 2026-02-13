"""
URL configuration for ecothrift project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.auth_urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/core/', include('apps.core.urls')),
    path('api/hr/', include('apps.hr.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/pos/', include('apps.pos.urls')),
    path('api/consignment/', include('apps.consignment.urls')),
]

# Serve the React SPA for all non-API routes in production
if not settings.DEBUG:
    urlpatterns += [
        re_path(r'^(?!api/|admin/|static/).*$',
                TemplateView.as_view(template_name='index.html'),
                name='spa-fallback'),
    ]
