from django.urls import path

from apps.storefront import views

urlpatterns = [
    path('stock.json', views.stock, name='storefront-stock'),
    path('home.json', views.home, name='storefront-home'),
    path('item/<int:pid>/', views.item, name='storefront-item'),
    path('photo/<int:pid>/', views.photo, name='storefront-photo'),
]
