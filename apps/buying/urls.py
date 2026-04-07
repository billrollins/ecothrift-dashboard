from django.urls import path

from apps.buying import views

urlpatterns = [
    path('token/', views.receive_bstock_token, name='buying_bstock_token'),
]
