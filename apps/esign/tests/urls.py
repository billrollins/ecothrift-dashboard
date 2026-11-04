"""The package's own URLs, mounted at /esign/ for its tests (hosts mount them where they like)."""
from django.urls import include, path

urlpatterns = [path('esign/', include('apps.esign.urls'))]
