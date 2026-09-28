from django.urls import path

from apps.qa import views

urlpatterns = [
    path('latest/', views.latest),
    path('history/<str:check_id>/', views.history),
    path('run/', views.run_now),
]
