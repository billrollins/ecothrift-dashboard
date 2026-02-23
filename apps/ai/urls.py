from django.urls import path

from . import views

urlpatterns = [
    path('models/', views.ModelListView.as_view(), name='ai-models'),
    path('chat/', views.ChatProxyView.as_view(), name='ai-chat'),
]
